# open-wand-phone

Turn an iPhone into a gyro air-mouse and hotkey pad for a Windows PC.
The phone needs only Safari. The PC runs one Python agent.

## Requirements

- Windows 11 PC
- Python 3.11 or newer
- iPhone with iOS 17 or newer
- The PC and the phone on the same Wi-Fi LAN

## Setup (PC)

Easy way: double-click **`start.bat`**.

- The first run installs the dependencies.
- The window shows the QR code. Keep the window open.
- To stop: close the window, or double-click `start.bat` again.
- To add agent options, edit the `WAND_ARGS` line at the top of
  `start.bat`. Example: `set "WAND_ARGS=--absolute"`.

Manual way:

1. Open a terminal in this folder.
2. Run: `pip install -r requirements.txt`
3. Run: `python agent.py`

If Windows Firewall asks, allow access on **private** networks.

The agent prints a QR code and a URL. The URL contains a session token
(`?k=...`). The agent stores that token in `wand-token.txt` and reuses
it, so **the same link keeps working after a restart**. Scan the QR
once. Use `--new-token` to make a new one.

Flags:

- `--port 8443` — change the HTTPS port.
- `--absolute` — place the pointer directly. See "Pointer mode" below.
- `--new-token` — make a new token. Old phone links stop working.
- `--no-qr` — do not print the QR code.
- `--verbose` — log frame rates, injection counts, and blocked events.

## Connect the iPhone

1. Scan the QR code with the iPhone camera. Safari opens the URL.
2. Safari shows "This Connection Is Not Private". Do these steps:
   1. Tap **Show Details**.
   2. Tap **Visit This Website**.
   3. Tap **Visit Website** to confirm.
3. Tap the big **START** button.
4. Tap **Allow** when Safari asks for motion access.

The certificate is self-signed. The tap-through is expected. The
WebSocket connection uses the same exception.

Use a normal Safari tab. Do not add the page to the Home Screen.
Standalone mode does not work well with self-signed certificates.

Keep the tab. The token survives an agent restart, so the same tab
reconnects by itself. If the token changes, the page shows an amber
bar that tells you to scan the new QR code.

## Use

### Arrange controls and appearance

The remote now uses an Escaíllón-inspired graphite surface: raised soft keys,
recessed clutch and scroll controls, and a red legend while a control is held.
Connection status uses a neutral light and text.

Tap **Layout** at the top of the remote to arrange it. Drag the clutch, scroll
strip, each mouse/dictation/precision button, and each shortcut independently.
Pull the bright lower-right corner handle to resize a control. The clutch and
scroll strip resize in both directions; main buttons keep their proportions.
Minimum sizes keep targets usable. Movement snaps to screen edges, control
edges and centers, and 10 px spacing. On release, overlapping controls move
to the nearest available position. If no position fits, that change is reverted.
Mouse and keyboard input is paused while editing; dragging or resizing a control
never clicks the PC or starts F8 dictation. Position and size both save with Done.

**Done** saves on this phone; **Cancel** discards the current edits. **Reset**
previews the default arrangement, then Done saves it (Cancel keeps your old
arrangement). Portrait and landscape save independently. Rotating or leaving
Safari while editing discards unfinished edits. Saved locations scale with the
visible area and stay within its bounds. Calibration temporarily uses its own
clutch layout and restores your arrangement afterward. Button assignments and
motion tuning remain separate from layout; the existing clutch-height setting
still controls its size.

- **Grip:** hold the phone like a TV remote, in portrait, with the top
  edge toward the screen. The cursor follows where the top edge points,
  like a laser pointer. Roll of the grip does not matter.
- **Clutch zone (large middle area):** touch and hold to move the
  cursor. Lift the thumb to stop. This works like lifting a mouse.
- **Tap to click:** a quick, still tap in the clutch zone sends a left
  click. Aim, lift, tap. Two taps = double-click. Turn it off in the
  drawer if you prefer the L button only.
- **Tap-hold to drag:** tap once, then touch the clutch zone again and
  keep the thumb down. The left button latches after about 170 ms. The
  zone turns purple and reads DRAG. Move the wand to drag. Lift the
  thumb to drop. This needs no second hand and no L button.
- **Scroll strip:** the tall bar beside the clutch zone. Drag it up or
  down with one finger to scroll. It sits on the right by default, and
  it moves to the left with the left-hand layout. Turn it off in the
  drawer to give the clutch zone the full width.
- **One-hand layout:** the round pads sit on the bottom edge, under the
  thumb. The primary click (L) is nearest a right thumb and has the
  biggest target. Check **Left-hand buttons** in the drawer to mirror
  the row and move the scroll strip.
- **Haptics:** the phone ticks on clutch engage/release, button
  presses, MIC stop, and each scroll notch. Needs iOS 17.4 or newer
  and **Settings → Sounds & Haptics → System Haptics** on. Toggle in
  the drawer.

  **How it works, and why it took four tries.** The tick comes from
  `<input type="checkbox" switch>`. iOS plays it only when a **real
  touch** activates the switch. A JavaScript `click()` never plays it,
  whether the switch is hidden or visible. Tests on an iPhone 12 mini
  settled this: a touch on a visible switch ticked, a touch on a label
  wrapping a hidden switch ticked, and every code-driven click was
  silent.

  So each control is a `<label>` that holds its own hidden switch. Your
  own touch on the clutch zone, the strip or a pad activates that
  switch and plays the tick. Keep these rules in any change:

  1. The control must be a `<label>`, not a `<button>`. A button inside
     a label swallows the activation.
  2. The switch must render at its natural 51x31. The generic checkbox
     rule shrinks it to 20x20, and Safari then draws a plain checkbox
     with no tick.
  3. Nothing may clip it, and no code may call `preventDefault` on
     `touchstart`. `pointerdown` and `pointerup` are safe.

  **The tick cannot land at press. Settled by measurement. Do not
  retry it.** Six experiments ran on an iPhone 12 mini, iOS 18, in
  Safari:

  | Test | Result |
  |---|---|
  | Touch a visible switch | ticks, on lift |
  | Touch a label over a hidden switch | ticks, on lift |
  | `input.click()` from script | silent |
  | `label.click()` from a click handler | silent |
  | `label.click()` from `pointerdown`, live touch | **silent** |
  | `label.click()` from `touchstart`, live touch | **silent** |
  | Press and hold a touchable switch under the thumb | silent until lift |
  | The same, with the clutch zone's own `preventDefault` calls | silent until lift |
  | Drag a switch slowly across its travel | **ticks mid-gesture** |

  Two facts come out of that. The tick follows the switch *travelling*,
  and a resting thumb never moves it far enough. And a script click
  cannot fire it at all, on this build. WebKit forwarded a script click
  on a label as a trusted click until a fix dated 2026-05-20 closed it;
  this phone has that fix.

  No other haptic route exists either: `navigator.vibrate` is not
  implemented in Safari, and every other control that plays a haptic
  needs visible UI on screen.

  The second of two rapid taps does not tick either, because the
  double-tap guard suppresses that click on purpose. Scroll detents do
  not tick, because a drag has no click.

  **What stands in for a press tick.** Press and release are fed on
  different channels, the way a mechanical key does it.

  - **Press:** a green flash along the top edge of the screen. It sits
    there because your thumb covers whatever it presses. The pressed
    state also snaps in with no transition and decays out over 200 ms,
    so the visual never lags the finger.
  - **Press, optional:** a 12 ms click through the speaker. Turn on
    **Click sound on press** in the drawer. It is off by default for two
    honest reasons: the ringer switch mutes it, and Bluetooth audio
    delays it by enough to read as an echo. The page uses the `ambient`
    audio session, so it mixes with your music instead of pausing it.
  - **Release:** the Taptic tick, as before.

  The HAPTICS section of the drawer keeps one plain switch as a
  reference, plus a readout of the switch support and the iOS version.
- **Two-finger scroll:** the older way. It is **off by default** now.
  A second finger on the clutch zone is how Safari decides you asked
  it to zoom the page, and that setting sticks. The scroll strip does
  the same job with one finger. Turn it back on under SCROLL if you
  want it. Direction is natural; flip it with **Invert scroll**.
- **L / R:** press and hold for a mouse button. Hold L and move to drag.
- **MIC:** hold-to-talk. Hold = F8 held down = CM7 Dictation records
  from the PC microphone. Release = F8 up = CM7 transcribes and pastes
  at the cursor. The agent releases F8 on any disconnect, so CM7 can
  not get stuck in record mode.
- **½:** hold for half-speed precision movement.
- **Hotkey pads:** up to three assignable pads, side by side above the
  main row. **Enter** is there by default. Hold one to hold its combo;
  release it to release the combo. Set them in the drawer, and hide the
  row with **Show the hotkey pads**.
- **Gear icon:** open the tuning drawer.

### Undo, Redo, and macros

Tap **More** beside the three hotkey pads to open **Undo**, **Redo**, and
up to three named macros. The panel has a **Back to pointer** button;
the main clutch and scroll area retain their existing height.
Your saved Enter, Backspace, Space, and other pad assignments are preserved.

In **Settings → More actions**, choose the Redo shortcut your PC app uses:
Ctrl+Y (default) or Ctrl+Shift+Z. Undo sends Ctrl+Z.
Give each macro a name and a comma-separated sequence of shortcuts, for
example **Copy all** with `ctrl+a, ctrl+c`. Leave its steps blank to hide it.
Settings save when you leave a field; invalid sequences are marked red and
are not saved. Macros support up to 12 shortcuts using the same key names
as the hotkey pads. Each shortcut is held for 80 ms, released, then followed
by a 120 ms pause. They target the focused PC app and do not wait for dialogs
or windows to load. They do not support arbitrary text or scripts.

Only one action runs at a time. Leaving the panel, hiding the page, or
disconnecting cancels the remaining steps; actions never resume on reconnect.
Already-sent steps are not undone. “Sent” reports transmission, not confirmation
that the PC app performed the action. F8 hold-to-talk works as before.

Developer checks: `node --test tests/*.test.cjs` validates shortcut migration,
macro execution, calibration measurements, edge detection, and cancellation.
On Windows with requirements installed, `python -m unittest discover -s tests
-p "test_*.py" -v` checks authenticated cursor reporting and monitor enumeration
without injecting mouse or keyboard input.

## Status strip

- **Green dot + "connected":** the phone drives the PC.
- **ABS:** the agent runs in absolute pointer mode.
- **SIM:** the page runs the synthetic motion demo.
- **BLOCKED:** Windows refused the injected input. See Troubleshooting.
- **pps:** motion frames sent per second. About 60 while you move.

## Calibration

**Calibrate reach** in Settings learns your comfortable wrist range. It
never moves the cursor automatically. Restart the PC agent after updating
and reload your existing Safari tab to enable cursor feedback.

1. **Choose the display.** Pick the projected screen by its resolution and
   desktop coordinates. The display currently containing the cursor is selected
   initially. Displays to the left or above the primary can have negative coordinates.
2. **Hold still for two seconds.** Measures sensor drift for the range measurement.
3. **Mark your comfortable left aim, then right aim.** Aim with a comfortable
   wrist position, mark left, sweep right, hold steady, and mark right. The
   cursor stays where it is. Repeat once; inconsistent sweeps must be repeated.
4. **Try it with the normal clutch and scroll strip.** The proposed reach is
   temporary. Move the cursor yourself to the selected display's left edge,
   lift to re-aim, then sweep right. The phone reports the actual cursor reaching
   or crossing each edge, including boundaries shared with another display.
   Repeat once. Click and drag gestures are paused during this trial.
5. **Adjust and apply.** Slower/Faster lets you refine the trial speed and resets
   the edge checks. After two successful passes, tap **Apply reach** if it feels
   comfortable, or Cancel to keep the old settings.

The agent reports cursor position at the phone's request, about ten times per
second during calibration. Stale feedback, a disconnect, a display-layout
change, leaving Safari, or Cancel stops the trial without saving. No canceled
measurement or cursor command resumes later. The cursor remains wherever you
moved it during the trial.

Reach is stored in degrees per full desktop width, so the comfortable angle
is scaled by desktop width divided by the selected display width. The slider
supports up to 1080 degrees to accommodate wide multi-monitor desktops.
This calibrates sensitivity for the chosen display; it does not confine the
cursor to that display. All existing filter, deadzone, touch-guard, scroll,
vertical direction, and F8 settings remain unchanged. **Undo calibration**
restores the previous reach, horizontal direction, and calibration width.

Absolute pointer mode gives the most predictable result (already enabled in
start.bat). Relative-mode Windows acceleration and your existing curve,
filtering, and deadzone can affect feel, which is why the live trial is required.
Synthetic demo mode cannot calibrate a real wrist range.

## Tuning

All sliders apply immediately and persist on the phone.

Note: Reach spans the FULL virtual desktop. With three monitors,
7680 px wide, reach 60 means only 20 degrees per monitor. Raise the
reach for a calmer cursor.

The defaults are the owner's tuned daily-driver values.

- **Reach:** degrees of wrist swing for the full desktop width.
  Higher = slower. Default 135.
- **Curve exponent:** higher = more difference between slow precise
  moves and fast flicks. 1.0 = linear. Default 1.0. The curve is
  shaped at a 60 Hz reference and then scaled by the real frame time,
  so the feel stays the same if the sensor rate changes.
- **min_cutoff:** LOWER = steadier at rest, but laggier slow moves.
  Default 4.0 (light smoothing; the deadzone handles the tremor).
- **beta:** Hz added to the filter cutoff for every 100 deg/s of hand
  speed. Higher = the filter opens sooner on fast moves.

  **This was broken until 2026-08-21.** The code fed the speed term in
  rad/s while the slider range was chosen for deg/s, so it was 57 times
  too small. Across the whole old slider, a 400 deg/s flick moved the
  cutoff from 4.000 Hz to 4.349 Hz, and the time to reach 90 percent of
  a flick did not change at all. The filter was a fixed 4 Hz lowpass and
  the deadzone was doing all the work.

  Stored values convert to the same behaviour, so nothing changed on the
  day of the fix. That lands near zero. Try 3 to 6 for what the setting
  was always meant to do. The export key is now
  `beta_hz_per_100dps`, with `beta_formula` beside it.
- **Deadzone:** filtered rates below this speed (deg/s) do nothing.
  Raise it until a resting hand holds the cursor dead-still. Default
  2.5.
- **Show trace:** plots the yaw rate live. Dim = raw, bright =
  filtered, grey band = the deadzone. Hold the clutch, keep the hand
  still, and raise the deadzone until the bright line sits inside the
  band. The trace runs only while the drawer is open.
- **Touch guard:** absorbs the twitch from the thumb itself. After
  touch-down, motion is ignored for this many ms. On lift, the motion
  sent in the last window is undone, so the cursor lands where you
  aimed. Default 130. Raise it if taps still shove the cursor; set 0
  to disable.
- **Scroll:** pixels of drag for one wheel notch. This sets the speed
  of the scroll strip and of the two-finger drag. Lower = faster.
  Default 30.
- **Clutch height:** the share of the free space the clutch zone takes.
  Default 55%. The rest of the space sits above it, so the pads stay on
  the bottom edge, under the thumb. Set 100% for the old full-height
  clutch zone.
- **Scroll strip:** show or hide the one-finger scroll bar. Default on.
- **Two-finger scroll:** the old two-finger gesture. Default off.
- **Reset page size / Reload the page:** in the LAYOUT section. Use
  them if the page changes size.
- **Tap-hold to drag:** turn the drag latch on or off. Default on. The
  second touch must start within 320 ms of the tap, and you must hold
  it for 170 ms.
- **Point with:** the pointing axis. **Top edge** = hold the phone like
  a remote (default). **Back** = hold the phone upright, screen toward
  you, and aim the back camera at the screen.
- **Invert X / Y:** flip an axis to taste.
- **Hotkey pads:** three fields, one per pad. Leave a field empty to
  drop that pad. Each takes up to four key names, joined by `+`. Names:
  ctrl,
  alt, shift, win, f1-f24, a-z, 0-9, esc, tab, space, enter,
  backspace, delete, insert, home, end, pageup, pagedown, up, down,
  left, right, and the punctuation names (minus, equals, comma,
  period, slash, backslash, semicolon, quote, backtick, lbracket,
  rbracket). The field turns red on an unknown name and does not save.

**Copy constants** puts the live values on the clipboard as a JSON
blob. Paste that blob into the ESP32 firmware later. This blob is the
main artifact of the build. `curve_ref_hz` tells the firmware which
rate the curve exponent was tuned at.

## Pointer mode (important)

**Relative mode (default).** The agent sends relative moves. Windows
passes them through the **Enhance pointer precision** setting, which
distorts the 1:1 feel. On this PC, with that setting on, a 40 px frame
moved the cursor 302 px. Turn it off:

1. Open **Settings → Bluetooth & devices → Mouse**.
2. Open **Additional mouse settings**.
3. Open the **Pointer Options** tab.
4. Clear **Enhance pointer precision**.
5. Click **OK**.

**Absolute mode (`--absolute`).** The agent tracks the pointer itself
and places it directly on the virtual desktop. Windows acceleration
never touches it, so reach is exact whatever the mouse settings say. A
40 px frame moves 40 px.

Pick absolute if you want an exact laser-pointer feel and you do not
play games that read raw mouse input. **Re-tune the reach after you
switch.** Absolute mode removes the acceleration boost, so the cursor
feels slower at first. Lower the reach until it feels right.

The agent resyncs to the real pointer whenever anything else moves it,
so the physical mouse keeps working at the same time.

## Test without a phone (sim mode)

Open the printed URL in desktop Chrome and add `&sim=1`. Accept the
certificate warning (`Advanced → Proceed`). Tap START, then hold the
mouse button in the clutch zone. A synthetic figure-eight motion moves
the cursor. This tests the full path: page → WebSocket → agent →
SendInput.

## Troubleshooting

- **No cursor motion:** check that the clutch zone shows "MOVING"
  (green) while touched, and that the status dot is green.
- **BLOCKED chip and an amber bar:** Windows refused the input. An
  elevated window (a UAC prompt, Task Manager, some games) holds the
  focus, and a normal process can not reach it. Run the agent as
  administrator, or click a normal window first.
- **Amber bar, "This link is out of date":** the token changed. Scan
  the new QR code on the PC.
- **The pads are hidden behind Safari's toolbar:** the page now sizes
  itself to the visible box, so the toolbar cannot cover it. If the
  pads still feel tight, lower **Clutch height** in the drawer.
- **The page got too big for the screen:** Safari has two kinds of
  zoom, and the amber bar names which one.
  1. **Pinch zoom.** The bar reports the scale and shows a **Fit to
     screen** button. Tap it. It resets the scale, and it reloads the
     page if that fails. A two-finger pinch out also works.
  2. **Page zoom.** The bar reports a percentage above 100%. This one
     comes from Safari's own menu, and only Safari can clear it. Tap
     **aA** at the address bar, then set the zoom to 100%.

  The page now refuses every gesture that makes Safari zoom: the second
  tap of a double tap, and any two-finger gesture on the control
  surface. The hotkey field is 16 px, so a tap on it does not zoom
  either. The drawer stays pinchable, and the LAYOUT section holds
  **Reset page size** and **Reload the page**, so there is always a way
  back.

  If the size changed by itself during normal use, that was a second
  finger on the control surface. The clutch zone plus a pad is two
  fingers, and so is the old two-finger scroll. Safari read that as a
  pinch and changed its per-site page zoom, which sticks. Both paths
  are blocked now, and the two-finger scroll is off by default.
- **Motion permission denied:** in Safari, tap **aA → Website
  Settings**, allow **Motion & Orientation**, then reload.
- **Phone slept and does not reconnect:** the page reconnects with
  backoff within about 3 s after wake. If not, pull the tab to reload.
- **Cursor moves in wrong direction:** use the Invert X / Invert Y
  toggles in the tuning drawer.
- **New LAN IP (different network):** the agent detects the IP on each
  run and regenerates the certificate when needed. Re-scan the QR and
  tap through the certificate warning again.
- **Stuck mouse button:** the agent releases all held buttons and keys
  on any disconnect. Reconnect or restart the agent.
- **"Port 8443 is busy":** another agent is already running. Close its
  window, or start this one with `--port 8444`.

## Security notes

- The agent binds to the LAN IP and localhost only.
- The WebSocket requires the session token.
- The token lives in `wand-token.txt` next to the script, in plain
  text, and it persists across restarts. Anyone with the full URL can
  control the cursor while the agent runs. Do not share the QR code.
  Run `python agent.py --new-token` to invalidate old links.
- The phone can send any key combo the hotkey pad holds. Treat the
  token like a password.
