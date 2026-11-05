# open-wand-phone

Turn an iPhone into a gyro air-mouse and hotkey pad for a Windows PC or Mac.
The phone needs only Safari. The computer runs one Python agent.

## Requirements

- Windows 11 PC or Mac running macOS 13 or newer
- Python 3.11 or newer
- iPhone with iOS 17 or newer
- The computer and the phone on the same Wi-Fi LAN

## Setup (Windows)

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

## Setup (Mac)

1. Download this repository from GitHub using **Code → Download ZIP**, and unzip it,
   or clone it with Git. Keep all the files together.
2. Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/macos/).
3. Open Terminal in the extracted project folder and run:

   ```sh
   bash start-mac.command
   ```

   The launcher creates a local Python environment and installs dependencies on
   its first run. Use the same command for subsequent starts. Keep Terminal open;
   press **Control+C** to stop. Optional arguments go after the command.
4. Allow Terminal (or the Python launcher named by macOS) in **System Settings →
   Privacy & Security → Accessibility**, then run the launcher again. If macOS
   asks for local-network or incoming-network access, allow it so the iPhone can connect.
5. Scan the QR code on the Mac and follow the iPhone connection steps below.
   The Windows link controls the Windows computer; the Mac has its own link.

The Mac backend uses [Quartz through PyObjC](https://pyobjc.readthedocs.io/en/latest/apinotes/Quartz.html)
and checks Apple's [input-posting permission](https://developer.apple.com/documentation/coregraphics/cgpreflightposteventaccess%28%29).
No screen recording is required. Mouse movement, held-button dragging, scrolling,
and calibration use the Mac's logical desktop coordinates, including Retina and
external displays. Movement places the pointer directly; `--absolute` is accepted
but is already the Mac behavior.

**Copy, Paste, Undo, and Redo automatically use Command on Mac.** Custom hotkeys
and macros remain literal: use `cmd+c` or `cmd+a, cmd+c` for Mac shortcuts, and
`ctrl` when you actually want Control. `alt` means Option; `win` and `meta` are
aliases for Command. The Windows redo preference does not override Mac's
Command+Shift+Z. The microphone still holds **F8**, so keep your Mac dictation
app running with that binding.

Mac key names describe physical US keyboard positions. Non-US layouts can produce
different punctuation/letters. F1–F20 are supported; F21–F24, Insert, and Print
Screen have no mapping and are ignored as a complete shortcut. Use macOS shortcut
combinations for screenshots instead.

The Mac backend has automated tests with simulated Quartz events. It still needs
a first hardware check on a Mac: connect, move and scroll, hold L to drag, test
copy/paste and F8 dictation, then disconnect while holding a button to confirm release.

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

The main interface is a graphite rotary dial. Left Click has the largest touch
surface; Mic is the large inner circle; Right Click is the smaller circle inside
Mic. Only the innermost surface under your finger receives a press.

- **Motion button (pause/play icon in the control dock):** after START and the first connection, the cursor follows
  your hand without a held move button. Tap Motion to pause, reposition your
  hand, then resume. Resuming resets the motion filter to prevent a jump.
  Disconnecting, leaving the page, editing, or opening menus pauses motion;
  reconnecting does not silently resume it. Tap Motion to resume.
- **Left Click:** tap anywhere on its broad surface to click. Hold while moving
  your hand to drag, then release to drop. Motion must be enabled to move the
  cursor. The nested Mic and Right Click regions have their own separate inputs.
- **Mic:** hold to send F8, release to stop your existing dictation workflow.
- **Right Click:** tap or hold the smaller nested circle.
- **Rim shortcut buttons:** tap Enter, Space, Backspace, Copy, Paste, Undo,
  Redo or a macro to run it immediately. The large pad stays Left Click by
  default; these buttons never change its assignment. If the list is long or
  the screen is short, **Next** cycles through the remaining shortcut pages.
  Dragging off a shortcut cancels it. Keyboard users can Tab to a button and
  press Enter or Space.
- **Scroll:** select Scroll, then rotate the broad outer surface. No mouse button
  is pressed, and pointer movement pauses while the scroll gesture is active.
  Mic and Right Click still work. Click returns the surface to its own assignment (Left Click by default).
  Scroll speed and inversion use the settings drawer.
- **Menu:** saved grips, Edit layout, Shortcuts & macros, and Settings & calibration.
  The old title and bottom navigation are removed. Click/Scroll and Motion have
  compact controls; existing wheel sizes and positions are retained.
  Shortcuts & macros contains Copy/Paste/Undo/Redo and up to 32 macros.
  Built-in shortcuts automatically use Command on Mac. Literal custom shortcuts
  keep their configured modifiers. A macro runs on a completed tap; canceling
  the gesture never starts it. Only one macro sequence runs at a time.

### Glass materials

**Menu > Under the glass** switches between Liquid, Smoke, and Still glass.
Liquid has a moving waterline, refracted highlights, and touch ripples; phone tilt
adds a damped slosh using the motion permission already granted at Start. Smoke
uses flowing silver-blue wisps. Holding the Mic gives its material a warm tint.
These are decorative effects: they cannot send input or change saved grip geometry.
The material choice saves separately from layouts and macros.

Animation runs at up to 30 frames per second with a capped pixel budget and adaptive
resolution. It pauses behind menus, while editing, and when the page is hidden.
The phone's Reduce Motion setting freezes animated materials. If WebGL is unavailable
or lost, the controls retain their static glass lighting and remain usable.

### Ring feedback

Menu has independent **Ring haptics** and **Ring tick sound** options. Each
rim shortcut press produces a short visual pulse. Vibration is requested where the
browser supports it; a native WebKit switch is also tried during an active user
gesture when vibration is unavailable. This is best effort: newer Safari versions
can suppress scripted switch haptics, and automated tests cannot confirm physical
vibration. Optional tick sound supplies audible feedback without enabling sounds
for every main-button press. Feedback choices save with the phone settings.

### Customize and save your grip

Tap **Menu > Edit layout**. Drag the large wheel, Mic circle, or Right Click circle to position
it; drag its light resize handle to change its size. All computer input is paused
while editing. The circles remain nested and the small button stays on screen.
Drag Click/Scroll and Motion by their dotted handles or directly by their bodies;
they move independently, and moving them does not move the wheels. You can also
drag rim keys onto one another to reorder them right on the dial. Save layout
keeps all these changes; Cancel restores the previous grip.

**Sizes & actions** provides independent size and position sliders, positions for
both control widgets, a grip name, independent assignments for all three circle
surfaces, and the rim shortcut list. Drag action rows or use the up/down arrows to reorder them. Remove
unwanted actions or add any available shortcut or macro. **Large pad assignment** defaults to
Left Click and can be customized independently of the rim keys. **Back to dial** returns
to the preview; **Save layout** commits the whole edit, and **Cancel** discards it.
**Function selector thickness** adjusts the width of the rim shortcut band.
It starts wider for easier thumb access and saves separately for each orientation.
Labels fit their surfaces, wrap or shorten long action names, and avoid the nested
circles and floating controls. Full action names remain available to screen readers.
The floating controls stay clear of each other and the header. Rim buttons use the
available arc without covering controls; additional actions remain reachable with Next.

**Menu > Saved grips** opens saved presets. Save a copy to create another grip, then edit
and rename it. Up to eight presets are supported. Each preset keeps separate
portrait and landscape positions and sizes. These presets, action choices, and
macro definitions are saved in this phone browser and survive reloads. Clearing
website data removes them. They are not synced between computers or browsers.
The earlier pad layout remains stored separately; it does not override the dial.

Changing orientation or leaving the page while editing cancels unfinished edits.
Saved positions adapt to the visible viewport. A short, separate hold-to-move pad
still appears inside calibration so reach measurements remain controlled.

### Macros

In **Menu > Shortcuts & macros > Create macro button**, enter a name and a comma-separated sequence,
for example `ctrl+a, ctrl+c` on Windows or `cmd+a, cmd+c` on Mac. Check **Show on
rim** to add it to the rim shortcuts, then **Save macro**. That panel also lets you edit,
run, delete, pin or unpin macros. Edit > Sizes & actions controls their dial order.
Existing macros and hotkey assignments are retained.

Macros support up to 12 shortcuts. Each shortcut is held for 80 ms, released,
then followed by a 120 ms pause. They target the focused computer app; they do
not wait for dialogs and cannot run arbitrary scripts or type free-form text.
A new rim shortcut or manual press interrupts an earlier sequence safely.
Closing the panel, pausing motion, opening an editor, hiding the page or losing
the connection cancels any active sequence and releases held input. Already-sent
steps are not undone, and canceled sequences never replay on reconnection.

Developer checks: `node --test tests/*.test.cjs` tests dial settings, geometry,
keyboard/mouse releases, macros, motion gating, and calibration. With Python
requirements installed, `python -m unittest discover -s tests -p "test_*.py" -v`
checks the server, assets and native backends without injecting real input.
Browser checks use a simulated receiver; a real iPhone remains the final check
for hand comfort and motion feel.

## Connection status

The header reports the connection. Operating-system input blocks and stale links
appear in the warning banner. Settings > About reports agent version and pointer
mode. Motion is always paused after a lost connection, even if the link reconnects.

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
4. **Try it with the calibration hold-to-move pad.** The proposed reach is
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
Notices like these clear themselves after six seconds, or tap one to dismiss
it. Warnings about a stale link, blocked input, or another copy of the page
stay until the problem is gone.

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
- **The status flips between "connected" and "offline" about twice a
  second, and the cursor cuts in and out:** two copies of the page are
  open on the phone, for example two Safari tabs, or a tab plus a Home
  Screen copy. The agent allows one client, so each copy replaces the
  other, and the replaced one reconnects 400 ms later. The agent log
  shows `replaces the previous client` on every line. Close every copy
  but one, then pull the tab down to reload it. A replaced copy now
  shows "Another tab or device took control" and waits; tap the bar
  to take the PC back.
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
