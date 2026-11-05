#!/usr/bin/env python3
"""OPEN WAND - Tier 1 phone bridge agent.

Serves the phone PWA over HTTPS on one port, accepts one WebSocket
client, and injects mouse/keyboard input on Windows or macOS.

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
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aiohttp import WSMsgType, web

VERSION = "1.4"

HERE = Path(__file__).resolve().parent
WWW = HERE / "www"
CERT_FILE = HERE / "wand-cert.pem"
KEY_FILE = HERE / "wand-key.pem"
TOKEN_FILE = HERE / "wand-token.txt"
LAYOUT_FILE = HERE / "layout-default.json"   # control arrangement every phone starts with

# Load only the native input implementation for this computer.
if sys.platform == "win32":
    from input_windows import Injector, set_dpi_aware, virtual_rect, cursor_pos, monitor_rects
elif sys.platform == "darwin":
    from input_macos import Injector, set_dpi_aware, virtual_rect, cursor_pos, monitor_rects
else:
    raise SystemExit("OPEN WAND supports Windows and macOS.")


def cursor_report():
    x, y = cursor_pos()
    vx, vy, w, h = virtual_rect()
    return {"t": "cursor", "x": x, "y": y,
            "desktop": {"x": vx, "y": vy, "w": w, "h": h},
            "monitors": monitor_rects()}


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


CLOSE_TEXT = {
    1000: "the phone closed it",
    1001: "the phone left the page",
    1005: "the phone closed it, no code",
    1006: "the link dropped, no close frame",
    4000: "replaced by a newer connection",
}


def close_reason(ws):
    """One short phrase that says who ended the socket, for the log."""
    code = ws.close_code
    text = CLOSE_TEXT.get(code, "close code %s" % code)
    exc = ws.exception()
    if exc is not None:
        text += "; %s" % exc
    return text


def load_default_layout():
    """The saved default arrangement, or {} when there is none yet."""
    try:
        return clean_layout(json.loads(LAYOUT_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return {}


def clean_layout(value):
    """Keep only portrait/landscape maps of finite x, y, w, h numbers."""
    out = {}
    if not isinstance(value, dict):
        return out
    for orient in ("portrait", "landscape"):
        items = value.get(orient)
        if not isinstance(items, dict):
            continue
        keep = {}
        for key, p in items.items():
            if not (isinstance(key, str) and isinstance(p, dict)):
                continue
            nums = {}
            for name in ("x", "y", "w", "h"):
                v = p.get(name)
                if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
                    nums[name] = v
            if "x" in nums and "y" in nums:
                keep[key] = nums
        out[orient] = keep
    return out


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

        peer = request.remote
        prev = state.client
        state.client = ws
        if prev is not None and not prev.closed:
            # A second tab or device took over. Say so, or the log reads
            # like a flapping link.
            print("[ws] %s replaces the previous client (another tab or device)" % peer)
            await prev.close(code=4000, message=b"replaced")
        injector.release_all()

        print("[ws] client connected: %s" % peer)
        _, _, w, h = virtual_rect()
        await ws.send_json({"t": "hello", "w": w, "h": h,
                            "abs": bool(injector.absolute), "ver": VERSION,
                            "cursor_feedback": True, "platform": sys.platform,
                            "layout": load_default_layout()})

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
                    elif t == "layout":
                        # The phone asks to make its arrangement the default
                        # for every phone that loads the page from now on.
                        layout = clean_layout(f.get("v"))
                        LAYOUT_FILE.write_text(json.dumps(layout, indent=2) + "\n",
                                               encoding="utf-8")
                        print("[layout] default arrangement saved to %s" % LAYOUT_FILE.name)
                        await ws.send_json({"t": "layout_saved", "layout": layout})
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
            print("[ws] client disconnected: %s (%s)" % (peer, close_reason(ws)))
        return ws

    async def blocked_notifier(_app):
        """Tell the phone when the operating system refuses our input, so it can show it."""
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
    async def dial_asset(request):
        return web.FileResponse(WWW / request.path.lstrip("/"),
                                headers={"Cache-Control": "no-store"})
    for asset in ("dial.css", "dial-model.js", "dial-glass.js", "dial.js"):
        app.router.add_get("/" + asset, dial_asset)
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
    mode = "absolute (no OS acceleration)" if injector.absolute else "relative"
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
    if sys.platform not in ("win32", "darwin"):
        sys.exit("OPEN WAND supports Windows and macOS.")
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
