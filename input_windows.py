"""Windows input backend; isolated from the portable web server."""
import asyncio
import ctypes
import math
import time
from ctypes import wintypes

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
        self.key_refs = {}
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
                key = (scan, vk, ext)
                self.key_refs[key] = self.key_refs.get(key, 0) + 1
                if self.key_refs[key] == 1:
                    self._emit(_key_input(scan, vk, ext, keyup=False))
            self.keys_down[spec] = combo
        else:
            combo = self.keys_down.pop(spec, None)
            if combo is None:
                return
            for scan, vk, ext in reversed(combo):
                key = (scan, vk, ext)
                self.key_refs[key] -= 1
                if not self.key_refs[key]:
                    del self.key_refs[key]
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


