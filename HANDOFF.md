# HANDOFF — open-wand-phone (OPEN WAND · Tier 1 phone bridge)

**For:** Claude Code, greenfield implementation
**Owner:** Trent
**Target:** Windows 11 host + iPhone (iOS 17+), same Wi-Fi LAN
**Ship bar:** working cursor tonight; tuned daily-driver this week

---

## 1. Mission

Turn an iPhone into a room-scale gyro air-mouse + hotkey pad for a Windows PC, with **zero installs on the phone** (Safari only) and one small Python agent on the PC. This is the interim/companion build for a hardware wand project ("OPEN WAND REV B"); the motion-feel pipeline defined here will later be ported verbatim to ESP32 firmware, so implement the math exactly as specified, with constants exposed for live tuning.

Hard platform fact that shapes the design: **iOS cannot act as a Bluetooth HID peripheral.** The phone therefore streams motion over the LAN to a PC agent, and the agent injects real input via `SendInput`. Do not attempt any Bluetooth path.

## 2. Repo layout

```
open-wand-phone/
├── agent.py          # single-file Python 3.11+ agent (serve + inject)
├── www/
│   └── index.html    # single-file PWA (HTML+CSS+JS inline)
├── requirements.txt  # aiohttp, qrcode, cryptography
└── README.md         # you write this: setup, cert tap-through, usage
```

Two source files total. Resist the urge to split modules; hackability > architecture here.

## 3. Agent spec (`agent.py`)

Single asyncio process, **one HTTPS port (default 8443)** serving both static files and a WebSocket upgrade at `/ws`. Use `aiohttp`.

1. **TLS, non-negotiable.** iOS Safari only exposes `DeviceMotionEvent` in a secure context, so plain HTTP is dead on arrival. On first run, generate a self-signed cert (via `cryptography`) valid for the machine's LAN IP + `localhost`, cache it next to the script, reuse thereafter.
2. **LAN IP autodetect:** UDP-connect a socket to `8.8.8.8` (no packets sent) and read `getsockname()`. Bind to that interface.
3. **Session token:** generate a short random token per run. The served URL is `https://<lan-ip>:8443/?k=<token>`; the WS handshake must present the same `k` query param or be closed immediately. Cheap defense so nothing else on the LAN can drive the cursor.
4. **QR code:** print the full URL as an ASCII QR in the terminal (`qrcode` lib, `print_ascii(invert=True)`), plus the URL in plain text.
5. **WebSocket server:**
   - Single active client: a new authenticated connection replaces the old one (close the old).
   - On connect, send a hello frame (see §5) carrying the host's **virtual-screen metrics** so the phone can compute sensitivity.
   - Consume input frames (§5) and inject via `SendInput`.
6. **Input injection (ctypes, user32 `SendInput`):**
   - Mouse move: `MOUSEEVENTF_MOVE` with relative `dx, dy` (integers; accumulate fractional remainders on the agent so sub-pixel deltas aren't lost — keep a float carry per axis).
   - Buttons: `MOUSEEVENTF_LEFTDOWN/LEFTUP/RIGHTDOWN/RIGHTUP` mapped 1:1 from button frames. Down and up are **separate events** driven by the phone (press-and-hold must produce a drag).
   - Scroll (stretch, see §9): `MOUSEEVENTF_WHEEL`, `wheelDelta = round(v * 120)`.
   - F8: `KEYBDINPUT` using **scancode injection** — `wScan = MapVirtualKeyW(VK_F8=0x77, MAPVK_VK_TO_VSC)`, flags `KEYEVENTF_SCANCODE`, key-down then key-up ~30 ms apart. Scancode (not just VK) matters: the owner's Whisper voice-typing app listens for a global F8 hotkey and low-level hooks are pickier about VK-only injection.
7. **Known Windows caveat (document in README, don't solve):** relative injected moves pass through "Enhance pointer precision" (OS acceleration). Recommend disabling it for 1:1 feel. An `--absolute` mode is a stretch goal (§9), not required.
8. **CLI flags:** `--port`, `--no-qr`, `--verbose` (log frame rates + injection counts).

## 4. PWA spec (`www/index.html`)

One file, no build step, no external CDNs (must work with no internet). Dark UI, big touch targets, landscape and portrait both usable.

**Layout (top → bottom):**
- Status strip: connection state, packets/sec, MIC indicator (cosmetic toggle state), settings gear.
- Button row: `L` (press-and-hold = mouse button held), `R` (same), `MIC/F8` (tap = one F8 keypress — the owner's Whisper is bound to F8 as a **toggle**, so a single tap per state change; do not implement push-to-talk), `½` precision (hold = half gain).
- **Clutch zone:** the bottom ~60% of the screen. Touch down = clutch engaged (cursor live), lift = disengaged. This is the soul of the device.

**Startup flow:** page loads → big START button → tap handler calls `DeviceMotionEvent.requestPermission()` (**must be inside the user gesture**), requests a Screen Wake Lock, opens the WebSocket with the `k` token from the query string.

**Motion pipeline — implement exactly this, per frame (`devicemotion`, ~60 Hz on iOS):**

Inputs: `rotationRate` (**degrees/sec on iOS** — convert to rad/s immediately) and `accelerationIncludingGravity` (m/s²).

```
ĝ  = lowpass(normalize(accelerationIncludingGravity), τ≈200ms)   // gravity unit vec, device frame
ω  = rotationRate in rad/s, device frame (α→Z, β→X, γ→Y axes)

// De-roll: express hand rotation in a gravity-referenced frame so
// "left is left" regardless of how the phone is gripped.
yaw_rate   = dot(ω, ĝ)                       // rotation about world-vertical
e_x        = normalize(X_dev − dot(X_dev, ĝ)·ĝ)   // device X orthogonalized vs gravity
pitch_rate = dot(ω, e_x)

// Clutch gate: all of the below only while clutch is touched; on
// engage, reset filter state (fresh start, like lifting a mouse).

// 1€ filter, per axis (standard formulation):
alpha(fc, dt) = 1 / (1 + 1/(2π·fc·dt))
d_hat  = lerp(d_hat, raw_rate, alpha(d_cutoff, dt))
fc     = min_cutoff + beta·|d_hat|
rate_f = lerp(prev, raw_rate, alpha(fc, dt))
// defaults: min_cutoff=1.0 Hz, beta=0.007, d_cutoff=1.0 Hz

// Sensitivity anchor ("reach"): degrees of yaw for one full screen width.
k = screen_w_px / deg2rad(reach_deg)          // screen_w_px from agent hello
// default reach_deg = 25, slider range 10–60

// Gain curve + precision:
v      = rate_f · k · dt                      // px this frame
dx_out = sign(v) · |v|^1.30 · (precision_held ? 0.5 : 1.0)
// (curve exponent slider 1.0–1.6, default 1.3)
```

Send `dx_out, dy_out` floats; the agent handles integer rounding with carry. Sign conventions: rotating the phone left/up moves the cursor left/up — provide invert-X / invert-Y toggles in settings because grip orientation varies.

**Settings drawer:** sliders for reach (deg/screen), curve exponent, min_cutoff, beta; invert toggles; all persisted to `localStorage`; a "copy constants" button that puts the current values on the clipboard as a JSON blob (these get pasted into ESP32 firmware later).

**Networking:** send motion frames only while clutched (~60 Hz); 2 Hz heartbeat otherwise. Auto-reconnect with exponential backoff (Safari kills the socket when the tab backgrounds); re-request wake lock on `visibilitychange`.

**Dev mode:** `?sim=1` replaces sensor input with a slow figure-eight synthetic motion so the whole path is testable in desktop Chrome without a phone.

## 5. Wire protocol (JSON text frames, one object per frame)

| Dir | Frame | Meaning |
|---|---|---|
| agent→phone | `{"t":"hello","w":<virtual px>,"h":<virtual px>}` | on connect; screen metrics for sensitivity |
| phone→agent | `{"t":"m","dx":f,"dy":f}` | filtered motion delta, px (float) |
| phone→agent | `{"t":"b","btn":"l"\|"r","s":1\|0}` | button down/up |
| phone→agent | `{"t":"k","key":"f8"}` | single F8 tap (down+up on agent) |
| phone→agent | `{"t":"w","v":f}` | scroll notches (stretch) |
| phone→agent | `{"t":"p"}` | heartbeat |

Unknown frame types: log and ignore. No acks; WS ping/pong for liveness.

## 6. iOS gotchas (pre-paid tuition — read before coding)

1. `DeviceMotionEvent` requires **HTTPS** and `requestPermission()` **inside a user gesture**. Both, always.
2. Self-signed cert flow on iPhone: open URL → "This Connection Is Not Private" → Show Details → **Visit This Website**. The `wss://` connection to the same origin inherits the exception. Put these exact steps in the README.
3. `rotationRate` is **deg/s on iOS** (spec says deg/s; some Android builds ship rad/s — convert defensively by magnitude heuristic if you want, but iOS is the target).
4. Event rate caps at ~60 Hz; don't chase 100.
5. `navigator.vibrate` is a no-op on iOS Safari — no haptics, don't try.
6. Screen Wake Lock API needs iOS 16.4+; it silently drops when backgrounded — re-acquire on `visibilitychange`.
7. Kill every default gesture on the control surface: `touch-action: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`, `viewport-fit=cover`, and `preventDefault()` in pointer handlers — otherwise long-press callouts, double-tap zoom, and rubber-banding will fight the clutch.
8. Use Pointer Events (`pointerdown/up/cancel`), and treat `pointercancel` as clutch-release and button-release (incoming call, edge swipe, etc. must never leave a mouse button stuck down). Same on WS disconnect: agent releases any held buttons.
9. Prefer running in a Safari tab over Add-to-Home-Screen standalone mode; standalone + self-signed certs is flaky.

## 7. Acceptance criteria

1. `python agent.py` prints a QR; iPhone scans it, taps through the cert, taps START, grants motion — **cursor moves while a thumb rests in the clutch zone**, still when lifted.
2. With hand at rest and clutch held, cursor is **visually dead-still** (filter working); a fast flick traverses ~the whole screen (default reach ≈ 25°).
3. Press-hold `L`, move, release → **drag** works (window drag, text selection).
4. Tapping `MIC/F8` toggles the owner's Whisper dictation exactly like pressing F8 on the keyboard (scancode injection verified).
5. Settings changes take effect live and survive a reload.
6. Phone sleep → wake → auto-reconnect within 3 s; stale connection replaced; no stuck buttons after any disconnect.
7. Motion-to-cursor latency subjectively tight on LAN (target ≤ ~40 ms; log frame timing under `--verbose`).
8. `?sim=1` demo works in desktop Chrome with no phone attached.

## 8. Out of scope (do not build)

Audio streaming from the phone; any Bluetooth/BLE path; native iOS app; multi-client support; internet/WAN access; TURN/STUN/WebRTC; Mac/Linux agents (Windows only for now).

## 9. Stretch goals (only after §7 passes)

- Two-finger vertical drag in the clutch zone → scroll wheel frames.
- `--absolute` agent mode: on clutch-engage snapshot `GetCursorPos`, integrate deltas in agent space, inject `MOUSEEVENTF_ABSOLUTE|MOVE` against the virtual desktop rect (`SM_XVIRTUALSCREEN` family) — sidesteps Windows pointer acceleration.
- A fifth assignable pad (default: `Ctrl+Alt+F8`) for a future second hotkey.
- Simple on-page trace view (sparkline of raw vs filtered rate) for tuning.

## 10. Definition of done

All of §7 demonstrated, README covers setup + cert tap-through + the Enhance-Pointer-Precision note, and the settings drawer's "copy constants" emits a JSON blob of the live-tuned values — that blob is the artifact this whole build exists to produce.
