"""macOS input using Quartz events, in logical desktop coordinates.

Key names identify physical keys on a US keyboard, as with the Windows backend.
Quartz is imported lazily so the backend can be tested without a Mac.
"""
import asyncio
import math
import time


def quartz():
    try:
        import Quartz
    except ImportError as exc:
        raise SystemExit("Mac dependencies are missing. Run bash start-mac.command.") from exc
    return Quartz


def set_dpi_aware():
    # Quartz cursor and display bounds both use logical points, including Retina.
    pass


def monitor_rects():
    q = quartz()
    error, displays, count = q.CGGetActiveDisplayList(128, None, None)
    if error or not count:
        raise RuntimeError("macOS could not enumerate active displays")
    result = []
    for display in displays[:count]:
        r = q.CGDisplayBounds(display)
        result.append(dict(x=r.origin.x, y=r.origin.y,
                           w=r.size.width, h=r.size.height))
    return sorted(result, key=lambda r: (r['x'], r['y']))


def virtual_rect():
    displays = monitor_rects()
    x = min(r['x'] for r in displays)
    y = min(r['y'] for r in displays)
    return (x, y, max(r['x'] + r['w'] for r in displays) - x,
            max(r['y'] + r['h'] for r in displays) - y)


def cursor_pos():
    q = quartz()
    p = q.CGEventGetLocation(q.CGEventCreate(None))
    return p.x, p.y


# Explicit map avoids depending on character order or the current keyboard layout.
KEY_CODES = {
    'a':0, 's':1, 'd':2, 'f':3, 'h':4, 'g':5, 'z':6, 'x':7,
    'c':8, 'v':9, 'b':11, 'q':12, 'w':13, 'e':14, 'r':15,
    'y':16, 't':17, '1':18, '2':19, '3':20, '4':21, '6':22,
    '5':23, 'equals':24, '9':25, '7':26, 'minus':27, '8':28,
    '0':29, 'rbracket':30, 'o':31, 'u':32, 'lbracket':33,
    'i':34, 'p':35, 'enter':36, 'return':36, 'l':37, 'j':38,
    'quote':39, 'k':40, 'semicolon':41, 'backslash':42,
    'comma':43, 'slash':44, 'n':45, 'm':46, 'period':47,
    'tab':48, 'space':49, 'backtick':50, 'backspace':51,
    'esc':53, 'escape':53, 'cmd':55, 'meta':55, 'win':55,
    'shift':56, 'capslock':57, 'alt':58, 'ctrl':59, 'control':59,
    'home':115, 'pageup':116, 'delete':117, 'end':119,
    'pagedown':121, 'left':123, 'right':124, 'down':125, 'up':126,
}
KEY_CODES.update(dict(zip(('f%d' % n for n in range(1, 21)),
                         (122,120,99,118,96,97,98,100,101,109,
                          103,111,105,107,113,106,64,79,80,90))))
MODIFIERS = {55:'kCGEventFlagMaskCommand', 56:'kCGEventFlagMaskShift',
             58:'kCGEventFlagMaskAlternate', 59:'kCGEventFlagMaskControl',
             57:'kCGEventFlagMaskAlphaShift'}


def parse_combo(spec):
    parts = str(spec).strip().lower().split('+')
    if not 1 <= len(parts) <= 4 or any(p.strip() not in KEY_CODES for p in parts):
        return None
    # Modifiers must precede regular keys even if the user types c+cmd.
    codes = list(dict.fromkeys(KEY_CODES[p.strip()] for p in parts))
    return sorted(codes, key=lambda code: code not in MODIFIERS)


def clamp_delta(value, limit):
    try:
        value = float(value)
    except (ValueError, TypeError):
        return 0.0
    return max(-limit, min(limit, value)) if math.isfinite(value) else 0.0


class Injector:
    def __init__(self, stats, absolute=False, verbose=False):
        self.q = quartz()
        if not self.q.CGPreflightPostEventAccess():
            self.q.CGRequestPostEventAccess()
            if not self.q.CGPreflightPostEventAccess():
                raise SystemExit("Allow Terminal (or the Python launcher shown) in System Settings > "
                                 "Privacy & Security > Accessibility, then restart OPEN WAND.")
        self.stats, self.verbose = stats, verbose
        self.absolute = True  # Quartz movement places the pointer directly in both modes.
        self.blocked_at = 0.0
        self.held, self.keys_down, self.key_refs = set(), {}, {}
        self.carry_x = self.carry_y = self.carry_w = 0.0

    def _flags(self):
        flags = 0
        for key, name in MODIFIERS.items():
            if self.key_refs.get(key, 0):
                flags |= getattr(self.q, name)
        return flags

    def _emit(self, event):
        if event is None or not self.q.CGPreflightPostEventAccess():
            self.stats.blocked += 1
            self.blocked_at = time.monotonic()
            return False
        self.q.CGEventSetFlags(event, self._flags())
        self.q.CGEventPost(self.q.kCGHIDEventTap, event)
        self.stats.injections += 1
        return True

    def move(self, dx, dy):
        tx, ty = clamp_delta(dx, 4000) + self.carry_x, clamp_delta(dy, 4000) + self.carry_y
        ix, iy = int(tx), int(ty)
        self.carry_x, self.carry_y = tx - ix, ty - iy
        if not (ix or iy):
            return
        x, y = cursor_pos()
        target = (x + ix, y + iy)
        # Clamp to an actual display, not a gap in a multi-monitor bounding box.
        candidates = [(min(max(target[0], r['x']), r['x'] + r['w'] - 1),
                       min(max(target[1], r['y']), r['y'] + r['h'] - 1))
                      for r in monitor_rects()]
        point = min(candidates, key=lambda p: math.hypot(p[0]-target[0], p[1]-target[1]))
        q = self.q
        kind, button = q.kCGEventMouseMoved, q.kCGMouseButtonLeft
        if 'l' in self.held:
            kind = q.kCGEventLeftMouseDragged
        elif 'r' in self.held:
            kind, button = q.kCGEventRightMouseDragged, q.kCGMouseButtonRight
        self._emit(q.CGEventCreateMouseEvent(None, kind, point, button))

    def button(self, btn, state):
        if btn not in ('l', 'r') or state not in (0, 1):
            return
        q = self.q
        kind = getattr(q, 'kCGEvent%sMouse%s' % ('Left' if btn == 'l' else 'Right', 'Down' if state else 'Up'))
        button = q.kCGMouseButtonLeft if btn == 'l' else q.kCGMouseButtonRight
        self._emit(q.CGEventCreateMouseEvent(None, kind, cursor_pos(), button))
        if state:
            self.held.add(btn)
        else:
            self.held.discard(btn)

    def wheel(self, value):
        total = clamp_delta(value, 20) * 40 + self.carry_w
        delta = int(total)
        self.carry_w = total - delta
        if delta:
            self._emit(self.q.CGEventCreateScrollWheelEvent(None, self.q.kCGScrollEventUnitPixel, 1, delta))

    def key(self, spec, state):
        spec = str(spec)[:40].strip().lower()
        if state:
            if spec in self.keys_down:
                return
            codes = parse_combo(spec)
            if codes is None:
                if self.verbose:
                    print('[key] unsupported Mac shortcut: %r' % spec)
                return
            self.keys_down[spec] = codes
            for code in codes:
                self.key_refs[code] = self.key_refs.get(code, 0) + 1
                if self.key_refs[code] == 1:
                    self._emit(self.q.CGEventCreateKeyboardEvent(None, code, True))
        else:
            for code in reversed(self.keys_down.pop(spec, [])):
                self.key_refs[code] -= 1
                if not self.key_refs[code]:
                    del self.key_refs[code]
                    self._emit(self.q.CGEventCreateKeyboardEvent(None, code, False))

    async def tap(self, spec):
        self.key(spec, 1)
        try:
            await asyncio.sleep(0.08)
        finally:
            self.key(spec, 0)

    def release_all(self):
        for btn in list(self.held):
            self.button(btn, 0)
        for spec in list(self.keys_down):
            self.key(spec, 0)
