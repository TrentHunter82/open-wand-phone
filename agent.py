#!/usr/bin/env python3
"""OPEN WAND - Tier 1 phone bridge agent.

Serves the phone PWA over HTTPS on one port, accepts one WebSocket
client, and injects mouse/keyboard input on Windows via SendInput.

Run:  python agent.py [--port 8443] [--absolute] [--no-qr] [--verbose]
      python agent.py --new-token      # rotate the session token
"""

import argparse
import asyncio
import ctypes
import errno
import ipaddress
import json
import math
import secrets
import socket
import ssl
import sys
import time
from ctypes import wintypes
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aiohttp import WSMsgType, web

VERSION = "1.2"

HERE = Path(__file__).resolve().parent
WWW = HERE / "www"
CERT_FILE = HERE / "wand-cert.pem"
KEY_FILE = HERE / "wand-key.pem"
TOKEN_FILE = HERE / "wand-token.txt"

# A single frame can never move the cursor further than this. One bad
# or hostile frame must not throw the pointer across the desktop.
MAX_DELTA_PX = 4000.0
MAX_WHEEL_NOTCH = 20.0
MAX_KEYSPEC_LEN = 40

# ---------------------------------------------------------------- Windows

user32 = ctypes.WinDLL("user32", use_last_error=True)

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000

KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008

MAPVK_VK_TO_VSC = 0

SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79

ERROR_ACCESS_DENIED = 5

ULONG_PTR = ctypes.c_size_t


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _INPUTUNION)]


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


def set_dpi_aware():
    """Opt in to per-monitor DPI awareness so virtual-screen metrics are real pixels."""
    try:
        # PER_MONITOR_AWARE_V2; Windows 10 1703 and newer.
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except Exception:
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            user32.SetProcessDPIAware()
        except Exception:
            pass


def virtual_rect():
    """Virtual desktop rect in real pixels: (x, y, w, h)."""
    return (
        user32.GetSystemMetrics(SM_XVIRTUALSCREEN),
        user32.GetSystemMetrics(SM_YVIRTUALSCREEN),
        user32.GetSystemMetrics(SM_CXVIRTUALSCREEN) or 1920,
        user32.GetSystemMetrics(SM_CYVIRTUALSCREEN) or 1080,
    )


def cursor_pos():
    p = POINT()
    user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def monitor_rects():
    """Enumerate real display bounds, including negative desktop coordinates."""
    monitors = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HANDLE,
                                      wintypes.HDC, ctypes.POINTER(wintypes.RECT),
                                      wintypes.LPARAM)

    @callback_type
    def collect(handle, hdc, rect, data):
        r = rect.contents
        monitors.append({"x": r.left, "y": r.top,
                         "w": r.right - r.left, "h": r.bottom - r.top})
        return True

    if not user32.EnumDisplayMonitors(None, None, collect, 0):
        raise ctypes.WinError(ctypes.get_last_error())
    return sorted(monitors, key=lambda r: (r["x"], r["y"]))


def cursor_report():
    x, y = cursor_pos()
    vx, vy, w, h = virtual_rect()
    return {"t": "cursor", "x": x, "y": y,
            "desktop": {"x": vx, "y": vy, "w": w, "h": h},
            "monitors": monitor_rects()}


def _send(inp):
    """Send one INPUT. Returns the count SendInput accepted (0 = blocked)."""
    return user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def _mouse_input(dx=0, dy=0, flags=0, data=0):
    inp = INPUT(type=INPUT_MOUSE)
    inp.u.mi = MOUSEINPUT(dx=dx, dy=dy, mouseData=data & 0xFFFFFFFF,
                          dwFlags=flags, time=0, dwExtraInfo=0)
    return inp


def _key_input(scan, vk, extended, keyup):
    flags = KEYEVENTF_KEYUP if keyup else 0
    inp = INPUT(type=INPUT_KEYBOARD)
    if scan:
        # Scancode injection: low-level hooks (the owner's dictation app)
        # are pickier about virtual-key-only injection.
        flags |= KEYEVENTF_SCANCODE
        if extended:
            flags |= KEYEVENTF_EXTENDEDKEY
        inp.u.ki = KEYBDINPUT(wVk=0, wScan=scan, dwFlags=flags, time=0, dwExtraInfo=0)
    else:
        inp.u.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=flags, time=0, dwExtraInfo=0)
    return inp


# ---------------------------------------------------------------- key names

KEY_VK = {}
for _i in range(1, 25):
    KEY_VK["f%d" % _i] = 0x6F + _i          # f1 = 0x70 ... f24 = 0x87
for _c in "abcdefghijklmnopqrstuvwxyz":
    KEY_VK[_c] = ord(_c.upper())
for _c in "0123456789":
    KEY_VK[_c] = ord(_c)
KEY_VK.update({
    "ctrl": 0x11, "control": 0x11, "alt": 0x12, "shift": 0x10,
    "win": 0x5B, "cmd": 0x5B, "meta": 0x5B,
    "esc": 0x1B, "escape": 0x1B, "tab": 0x09, "space": 0x20,
    "enter": 0x0D, "return": 0x0D, "backspace": 0x08,
    "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
    "home": 0x24, "end": 0x23, "pageup": 0x21, "pagedown": 0x22,
    "insert": 0x2D, "delete": 0x2E,
    "printscreen": 0x2C, "capslock": 0x14,
    "minus": 0xBD, "equals": 0xBB, "comma": 0xBC, "period": 0xBE,
    "slash": 0xBF, "backslash": 0xDC, "semicolon": 0xBA, "quote": 0xDE,
    "backtick": 0xC0, "lbracket": 0xDB, "rbracket": 0xDD,
})

# Keys that need the extended-key flag with scancode injection.
EXTENDED_VK = {0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
               0x2C, 0x2D, 0x2E, 0x5B, 0x5C, 0xA3, 0xA5}

_combo_cache = {}


def parse_combo(spec):
    """Turn 'ctrl+alt+f8' into [(scan, vk, extended), ...] in press order, or None."""
    if spec in _combo_cache:
        return _combo_cache[spec]
    out = None
    parts = [p.strip().lower() for p in str(spec).split("+") if p.strip()]
    if 1 <= len(parts) <= 4:
        vks = [KEY_VK.get(p) for p in parts]
        if all(v is not None for v in vks):
            out = [(user32.MapVirtualKeyW(vk, MAPVK_VK_TO_VSC), vk, vk in EXTENDED_VK)
                   for vk in vks]
    if len(_combo_cache) > 64:
        _combo_cache.clear()
    _combo_cache[spec] = out
    return out


BUTTON_FLAGS = {
    ("l", 1): MOUSEEVENTF_LEFTDOWN,
    ("l", 0): MOUSEEVENTF_LEFTUP,
    ("r", 1): MOUSEEVENTF_RIGHTDOWN,
    ("r", 0): MOUSEEVENTF_RIGHTUP,
}


def clamp_delta(v, cap):
    """Reject NaN and infinity, then clamp. A bad frame must stay harmless."""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(v):
        return 0.0
    return max(-cap, min(cap, v))


# ---------------------------------------------------------------- injection

class Injector:
    """SendInput wrapper. Keeps a float carry per axis so sub-pixel deltas add up."""

    def __init__(self, stats, absolute=False, verbose=False):
        self.carry_x = 0.0
        self.carry_y = 0.0
        self.carry_w = 0.0
        self.held = set()
        self.keys_down = {}
        self.stats = stats
        self.absolute = absolute
        self.verbose = verbose
        self.pos = None          # float cursor position, absolute mode
        self.last_inject = None  # last integer position we commanded
        self.blocked_at = 0.0
        self._last_block_log = 0.0

    # -- result accounting -------------------------------------------------

    def _emit(self, inp):
        if _send(inp):
            self.stats.injections += 1
            return True
        err = ctypes.get_last_error()
        self.stats.blocked += 1
        now = time.monotonic()
        self.blocked_at = now
        if now - self._last_block_log > 5.0:
            self._last_block_log = now
            if err == ERROR_ACCESS_DENIED:
                print("[input] Windows blocked the input. An elevated window holds "
                      "the focus. Run the agent as administrator to reach it.")
            else:
                print("[input] SendInput refused the event (error %d)." % err)
        return False

    # -- mouse -------------------------------------------------------------

    def move(self, dx, dy):
        dx = clamp_delta(dx, MAX_DELTA_PX)
        dy = clamp_delta(dy, MAX_DELTA_PX)
        if self.absolute:
            self._move_absolute(dx, dy)
            return
        tx = dx + self.carry_x
        ty = dy + self.carry_y
        ix = int(tx)
        iy = int(ty)
        self.carry_x = tx - ix
        self.carry_y = ty - iy
        if ix or iy:
            self._emit(_mouse_input(dx=ix, dy=iy, flags=MOUSEEVENTF_MOVE))

    def _move_absolute(self, dx, dy):
        """Integrate in agent space and place the pointer. Skips OS acceleration."""
        vx, vy, vw, vh = virtual_rect()
        cx, cy = cursor_pos()
        # Resync when anything else moved the pointer: the real mouse, a
        # window snap, an app that warps the cursor. 2 px covers our own
        # rounding through the 0-65535 absolute grid.
        if (self.pos is None or self.last_inject is None
                or abs(cx - self.last_inject[0]) > 2
                or abs(cy - self.last_inject[1]) > 2):
            self.pos = [float(cx), float(cy)]
        self.pos[0] = min(max(self.pos[0] + dx, vx), vx + vw - 1)
        self.pos[1] = min(max(self.pos[1] + dy, vy), vy + vh - 1)
        ix = int(round(self.pos[0]))
        iy = int(round(self.pos[1]))
        if self.last_inject == (ix, iy):
            return
        nx = int(round((ix - vx) * 65535 / max(1, vw - 1)))
        ny = int(round((iy - vy) * 65535 / max(1, vh - 1)))
        flags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
        if self._emit(_mouse_input(dx=nx, dy=ny, flags=flags)):
            self.last_inject = (ix, iy)

    def button(self, btn, state):
        flag = BUTTON_FLAGS.get((btn, state))
        if flag is None:
            return
        if state:
            self.held.add(btn)
        else:
            self.held.discard(btn)
        self._emit(_mouse_input(flags=flag))

    def wheel(self, v):
        v = clamp_delta(v, MAX_WHEEL_NOTCH)
        total = v * 120 + self.carry_w
        delta = int(total)
        self.carry_w = total - delta
        if delta:
            self._emit(_mouse_input(flags=MOUSEEVENTF_WHEEL, data=delta))

    # -- keyboard ----------------------------------------------------------

    def key(self, spec, state):
        """Hold a key or a combo. Down and up are separate, driven by the phone."""
        spec = str(spec)[:MAX_KEYSPEC_LEN].strip().lower()
        if state:
            if spec in self.keys_down:
                return
            combo = parse_combo(spec)
            if combo is None:
                if self.verbose:
                    print("[key] unknown key spec: %r" % spec)
                return
            for scan, vk, ext in combo:
                self._emit(_key_input(scan, vk, ext, keyup=False))
            self.keys_down[spec] = combo
        else:
            combo = self.keys_down.pop(spec, None)
            if combo is None:
                return
            for scan, vk, ext in reversed(combo):
                self._emit(_key_input(scan, vk, ext, keyup=True))

    async def tap(self, spec):
        self.key(spec, 1)
        await asyncio.sleep(0.08)  # human-length press; slow key pollers miss shorter taps
        self.key(spec, 0)

    def release_all(self):
        for btn in list(self.held):
            self.button(btn, 0)
        for spec in list(self.keys_down):
            self.key(spec, 0)


# ---------------------------------------------------------------- network id

def get_lan_ip():
    """Best guess at the address the phone must dial."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packet is sent for UDP connect
        return s.getsockname()[0]
    except OSError:
        pass
    finally:
        s.close()
    # No default route. Take the first non-loopback address of this host.
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                print("[net] no default route; using host address %s" % ip)
                return ip
    except OSError:
        pass
    print("[net] WARNING: no LAN address found. The agent serves 127.0.0.1 only.")
    print("[net] The phone cannot reach the agent. Connect the PC to Wi-Fi.")
    return "127.0.0.1"


def ensure_token(rotate=False):
    """Reuse the stored token, so an old phone tab still works after a restart."""
    if not rotate and TOKEN_FILE.exists():
        try:
            tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
            if tok:
                return tok
        except OSError:
            pass
    tok = secrets.token_urlsafe(6)
    try:
        TOKEN_FILE.write_text(tok, encoding="utf-8")
    except OSError as e:
        print("[token] cannot store the token (%s); it changes on each run" % e)
    return tok


# ---------------------------------------------------------------- TLS cert

def ensure_cert(lan_ip):
    """Create (or reuse) a self-signed cert valid for the LAN IP + localhost."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    if CERT_FILE.exists() and KEY_FILE.exists():
        try:
            cert = x509.load_pem_x509_certificate(CERT_FILE.read_bytes())
            san = cert.extensions.get_extension_for_class(
                x509.SubjectAlternativeName).value
            ips = [str(i) for i in san.get_values_for_type(x509.IPAddress)]
            not_after = getattr(cert, "not_valid_after_utc", None)
            if not_after is None:
                not_after = cert.not_valid_after.replace(tzinfo=timezone.utc)
            if lan_ip in ips and not_after > datetime.now(timezone.utc) + timedelta(days=1):
                return
            print("[cert] cached cert is stale or lacks %s; regenerating" % lan_ip)
        except Exception as e:
            print("[cert] cached cert unreadable (%s); regenerating" % e)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "open-wand-phone")])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=820))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                x509.IPAddress(ipaddress.ip_address(lan_ip)),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    KEY_FILE.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ))
    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print("[cert] new self-signed cert written")


# ---------------------------------------------------------------- server

class Stats:
    def __init__(self):
        self.frames = 0
        self.injections = 0
        self.blocked = 0


class State:
    def __init__(self):
        self.client = None


def make_app(token, injector, stats, verbose):
    state = State()
    app = web.Application()

    async def index(request):
        return web.FileResponse(WWW / "index.html",
                                headers={"Cache-Control": "no-store"})

    async def favicon(request):
        return web.Response(status=204)

    async def auth(request):
        """Lets the phone tell a stale token apart from a dead network."""
        ok = request.query.get("k") == token
        return web.json_response({"ok": ok}, status=200 if ok else 403,
                                 headers={"Cache-Control": "no-store"})

    async def ws_handler(request):
        if request.query.get("k") != token:
            print("[ws] rejected %s: stale or missing token" % request.remote)
            raise web.HTTPForbidden(text="bad token")
        ws = web.WebSocketResponse(heartbeat=10)
        await ws.prepare(request)

        prev = state.client
        state.client = ws
        if prev is not None and not prev.closed:
            await prev.close(code=4000, message=b"replaced")
        injector.release_all()

        peer = request.remote
        print("[ws] client connected: %s" % peer)
        _, _, w, h = virtual_rect()
        await ws.send_json({"t": "hello", "w": w, "h": h,
                            "abs": bool(injector.absolute), "ver": VERSION,
                            "cursor_feedback": True})

        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    f = json.loads(msg.data)
                    t = f.get("t")
                    if t == "m":
                        injector.move(f.get("dx"), f.get("dy"))
                        stats.frames += 1
                    elif t == "b":
                        injector.button(str(f["btn"]), int(f["s"]))
                    elif t == "k":
                        spec = f.get("key", "f8")
                        s = f.get("s")
                        if s is None:  # legacy tap frame
                            asyncio.get_running_loop().create_task(injector.tap(spec))
                        else:
                            injector.key(spec, int(s))
                    elif t == "w":
                        injector.wheel(f.get("v"))
                    elif t == "p":
                        pass
                    elif t == "cursor":
                        # Read-only and requested only during calibration.
                        await ws.send_json(cursor_report())
                    else:
                        if verbose:
                            print("[ws] unknown frame type: %r" % t)
                except Exception as e:
                    if verbose:
                        print("[ws] bad frame: %s" % e)
        finally:
            if state.client is ws:
                state.client = None
                injector.release_all()
            print("[ws] client disconnected: %s" % peer)
        return ws

    async def blocked_notifier(_app):
        """Tell the phone when Windows refuses our input, so it can show it."""
        was = False
        while True:
            await asyncio.sleep(0.5)
            now_blocked = (injector.blocked_at > 0
                           and time.monotonic() - injector.blocked_at < 2.0)
            if now_blocked == was:
                continue
            was = now_blocked
            client = state.client
            if client is not None and not client.closed:
                try:
                    await client.send_json({"t": "stat",
                                            "blocked": 1 if now_blocked else 0})
                except Exception:
                    pass

    async def on_start(app_):
        app_["notifier"] = asyncio.create_task(blocked_notifier(app_))

    async def on_stop(app_):
        task = app_.get("notifier")
        if task:
            task.cancel()

    app.on_startup.append(on_start)
    app.on_cleanup.append(on_stop)
    app.router.add_get("/", index)
    app.router.add_get("/index.html", index)
    app.router.add_get("/favicon.ico", favicon)
    app.router.add_get("/auth", auth)
    app.router.add_get("/ws", ws_handler)
    return app


async def stats_loop(stats):
    prev_f = prev_i = prev_b = 0
    while True:
        await asyncio.sleep(2)
        df = stats.frames - prev_f
        di = stats.injections - prev_i
        db = stats.blocked - prev_b
        prev_f, prev_i, prev_b = stats.frames, stats.injections, stats.blocked
        if df or di:
            line = "[stats] %.0f frames/s in, %.0f injections/s out" % (df / 2, di / 2)
            if db:
                line += ", %d blocked" % db
            print(line)


def print_qr(url):
    """Draw the QR, and never let a console encoding kill the agent."""
    import qrcode
    qr = qrcode.QRCode(border=2)
    qr.add_data(url)
    try:
        qr.print_ascii(invert=True)
        return
    except UnicodeEncodeError:
        pass
    # The console code page cannot encode the block characters. Switch it
    # to UTF-8 and try once more.
    try:
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        sys.stdout.reconfigure(encoding="utf-8")
        qr.print_ascii(invert=True)
        return
    except Exception:
        pass
    print("[qr] This console cannot draw the QR code. Type the URL above")
    print("[qr] into Safari by hand, or run with --no-qr to hide this.")


async def main_async(args):
    set_dpi_aware()
    lan_ip = get_lan_ip()
    ensure_cert(lan_ip)
    token = ensure_token(rotate=args.new_token)
    url = "https://%s:%d/?k=%s" % (lan_ip, args.port, token)

    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(CERT_FILE, KEY_FILE)

    stats = Stats()
    injector = Injector(stats, absolute=args.absolute, verbose=args.verbose)
    app = make_app(token, injector, stats, args.verbose)

    runner = web.AppRunner(app)
    await runner.setup()
    hosts = [lan_ip] if lan_ip == "127.0.0.1" else [lan_ip, "127.0.0.1"]
    for host in hosts:
        try:
            await web.TCPSite(runner, host, args.port, ssl_context=ssl_ctx).start()
        except OSError as e:
            if host == lan_ip and e.errno in (errno.EADDRINUSE, 10048):
                await runner.cleanup()
                sys.exit("\n[net] Port %d is busy. Another agent is probably already "
                         "running.\n[net] Close that window, or start this one with "
                         "--port 8444." % args.port)
            print("[net] cannot bind %s:%d: %s" % (host, args.port, e))
            if host == lan_ip:
                raise

    _, _, vw, vh = virtual_rect()
    mode = "absolute (no OS acceleration)" if args.absolute else "relative"
    print()
    print("OPEN WAND phone bridge %s" % VERSION)
    print("  URL: %s" % url)
    print("  (sim mode on desktop: %s&sim=1)" % url)
    print("  desktop: %d x %d px   pointer: %s" % (vw, vh, mode))
    print()
    if not args.no_qr:
        try:
            print_qr(url)
        except Exception as e:
            print("[qr] cannot draw the QR code (%s); use the URL above" % e)
    print("Scan the QR with the iPhone camera. Accept the certificate warning.")
    print("The link stays valid after a restart. Use --new-token to rotate it.")
    print("Ctrl+C stops the agent.")
    print()

    if args.verbose:
        asyncio.get_running_loop().create_task(stats_loop(stats))

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        injector.release_all()
        await runner.cleanup()


def main():
    if sys.platform != "win32":
        sys.exit("This agent injects input with the Windows SendInput API. Run it on Windows.")
    p = argparse.ArgumentParser(description="OPEN WAND phone bridge agent")
    p.add_argument("--port", type=int, default=8443)
    p.add_argument("--absolute", action="store_true",
                   help="place the pointer directly; skips Windows pointer acceleration")
    p.add_argument("--new-token", action="store_true",
                   help="rotate the session token; old phone links stop working")
    p.add_argument("--no-qr", action="store_true", help="do not print the QR code")
    p.add_argument("--verbose", action="store_true", help="log frame and injection rates")
    args = p.parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\n[exit] stopped")


if __name__ == "__main__":
    main()
