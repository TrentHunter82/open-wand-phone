# Maintainer handoff

This file describes the current Open Wand phone remote. Start with [README.md](README.md) for installation and [docs/DICTATION.md](docs/DICTATION.md) for voice typing.

## Project layout

| File | Responsibility |
| --- | --- |
| `agent.py` | HTTPS server, authentication, one active WebSocket client, cursor feedback, explicit asset routes, and platform selection. |
| `input_windows.py` | Windows SendInput mouse and keyboard injection, absolute/relative movement, fractional wheel carry, and shared-key ownership. |
| `input_macos.py` | Quartz mouse and keyboard injection, Accessibility checks, logical display coordinates, shared modifiers, and cursor feedback. |
| `www/index.html` | Sensor pipeline, connection lifecycle, settings, calibration, macros, the earlier pad components, and `window.wandBridge`. |
| `www/dial-model.js` | Browser-independent normalization, geometry, bubble placement, contiguous rim sections, paging, and finger-scroll response. |
| `www/dial.js` | Main dial rendering, touch/keyboard input, layout editor, presets, scroll pop-up, Shift feedback, and dictation setup dialog. |
| `www/dial.css` | Dial surfaces, measured-label presentation, editor, pop-up, and setup-dialog styling. |
| `www/dial-glass.js` | Skin selection, motion-responsive metal and glass WebGL materials, and a static fallback. |
| `start.bat` | Windows launcher with dependency installation, start/stop behavior, and absolute pointer mode enabled. |
| `start-mac.command` | Mac launcher with a local virtual environment and dependency installation. |
| `requirements.txt` | Python packages, including Quartz/PyObjC only on macOS. |
| `layout-default.json` | Default geometry for the earlier pad interface. Current dial presets save in the phone browser. |
| `tests/` | Node tests and Python server/native-input tests. |

There is no front-end build step or external CDN dependency. Serve the tracked `www` files through the Python agent.

## Current interaction model

- The large **Move** pad enables cursor motion only while held. Continuous motion starts off.
- The play/pause control toggles continuous motion. Pausing, menus, editing, page hiding, and disconnecting release input and turn continuous motion off.
- The **Left Click** bubble sends button down immediately and button up on release. Holding it for at least 160 ms also enables movement for one-finger dragging. A higher configured touch guard can extend that settling period. A quick tap produces a click.
- Left Click has independent position/size settings. Its action uses the saved `outer` assignment field from earlier dial versions.
- Mic holds **F8**. Right Click is nested inside Mic. The desktop dictation app records, transcribes, and inserts text.
- **Menu > Dictation setup** opens a focused, three-step help dialog. It releases held input, pauses cursor motion, and links to the full guide without forwarding the connection URL.
- Rim shortcuts run independently of the Move pad. Backspace starts on press and repeats after 425 ms, every 70 ms, until released or canceled.
- Shift is momentary until held for one second, then stays locked. A subsequent press unlocks it. Shift-only dial macros share this behavior. A visible indicator can also release Shift.
- Scroll opens a held vertical thumb control and fades the rest of the dial. Finger offset sets a continuous scroll rate, with a center dead zone and immediate stop at neutral or release. Gyro movement cannot move the cursor during scrolling.
- Layout editing supports direct dragging and resize handles for each circle plus movement of the continuous-motion button. Rim keys can be reordered on the dial. Save commits a draft and Cancel restores it.

Nested circles have separate hit targets. Scroll and Click placement prefer open space inside the large pad, with nearby clear space available for tight custom layouts. Text measurement and clipping keep labels within their available surfaces.

## Input lifecycle

`window.wandBridge` connects the dial to the existing connection and motion pipeline.

- Native key/button `press(action)` returns an idempotent release function. It retains its original socket for releases.
- `tap(action)` completes a short press or runs a shortcut sequence.
- `holdMotion(delayMs)` returns a release function for an independent movement contact. Readiness timestamps allow quick clicks to finish before movement begins. Multiple contacts share movement until the last eligible contact releases.
- `motion(on)` controls continuous movement. `scrolling(on)` freezes cursor motion while the scroll controller owns the gesture.
- `stop(true)` additionally clears temporary Shift state. Ordinary shortcut taps preserve a previously locked Shift.
- The UI owns pointer capture, pointer/keyboard contact maps, and release on cancellation. Menus, editors, help, page hiding, blur, and disconnection must not leave input active.

Both native backends retain per-shortcut key ownership and per-key references. Releasing a shortcut containing Shift must preserve a separately held Shift until its final owner releases it. The receiver also releases input when a client is replaced or disconnects.

Macro sequences have their own cancellation state. They retain the initiating socket, release modifiers between steps, and never replay after reconnecting.

## Motion and scroll

The sensor pipeline uses gravity to interpret hand rotation relative to the selected pointing axis, applies a one-euro filter, dead zone, touch guard, reach scaling, and a frame-rate-adjusted curve.

The live motion gate includes the calibration clutch, the earlier drag path, continuous motion, and eligible dial movement contacts. Keep the scroll gate ahead of cursor output. Reset filters when reengaging movement so re-aiming does not create a jump.

`motionScrollDeg` is the persisted sensitivity field for the current finger-scroll controller. Its name is retained for saved settings compatibility. Lower values are faster. Values are clamped to 2–18. Scroll output is capped at 24–72 notches per second, with per-frame time capped to 50 ms. A suspended scroll loop recenters instead of replaying the previous command.

The decorative material pipeline is isolated from control input. Graphite, Titanium, and Silver / Graphite reflect analytic studio area lights using raised-face normals, chamfers, Fresnel reflectance, directional brushing, and hand-responsive contact shadows. This is a lightweight simulated environment, not a camera feed or a full 3D scene. Metal surfaces with active WebGL disable the redundant SVG shadow filters to avoid compositing artifacts; static fallbacks retain their shadows. Original glass retains Liquid, Smoke, and Still choices. The renderer pauses behind menus, editing, help, and hidden pages. Reduce Motion and missing WebGL use static rendering.

All skins render rim labels with SVG textPath on the actual ring radius. `DialModel.rimTextArc` accepts measured ascent/descent for the displayed word and offsets the baseline to center the glyph bodies across the band. Clockwise glyph tops face outward, so that baseline moves inward; reversing the text direction reverses the offset. Rim measurements and rendered type both use weight 500. Text uses the safe rim-slot allowance, shrinking or ellipsizing long names rather than stretching glyphs. Metal labels add two subpixel text layers for recessed lettering, avoiding shadow filters. Paths live in each shortcut group so edit-mode dragging moves the face and text together. Full action names remain in accessible labels and titles.

Metal lighting uses wider chamfers with narrow polished highlights, stronger moving area-light reflections, radial brushed texture, and deeper contact shadows. The assembly also casts a soft shadow onto the background. Edge antialiasing follows canvas resolution so small buttons remain smooth at different phone densities. These changes are decorative and never write grip geometry or input settings.

Metal ring sections use the existing safe label positions and fill the arc between adjacent labels with adjoining annular sectors. The full section is the hit target. Original glass retains its separate rim keys. Both share paging, reordering, shortcut input, and label fitting.

## Persistence

| Storage | Contents |
| --- | --- |
| `wand.settings.v1` | Pointer tuning, feedback, hotkeys, and up to 32 macros. |
| `wand.dial.v1` | Up to eight grips, separate orientation geometry, assignments, hidden actions, and rim order. |
| `wand.appearance.v1` | Skin plus retained Liquid, Smoke, or Still glass material choice. |
| `wand.precalib.v1` | Previous calibration values for Undo calibration. |
| `wand.layout.v1` | Earlier pad layout, kept independently of the current dial. |

Normalize old and malformed stored data before use. Preserve user tuning and action identities during migrations. Layout editing should modify a draft and commit only on Save. Saved browser data belongs to that browser origin and does not sync to another computer.

A missing or invalid skin defaults to Graphite. An older appearance object containing only `material` retains that glass choice so it is available when Original glass is selected. Skin changes do not write dial geometry or macro settings.

The local `wand-token.txt`, `wand-cert.pem`, and `wand-key.pem` are generated at runtime and ignored by Git. The token persists across restarts. `--new-token` replaces it and invalidates earlier links. Never include real credentials, control links, or QR screenshots in commits.

## Server protocol

The HTTPS agent defaults to port 8443 and binds to the detected LAN address plus localhost. The phone connects to `/ws?k=<token>`. `/auth` lets it distinguish a stale token from a network failure. One authenticated client owns the receiver at a time.

| Direction | Frame | Meaning |
| --- | --- | --- |
| Server to phone | `{t:'hello',w,h,platform,ver,abs,cursor_feedback,layout}` | Desktop dimensions, platform, capabilities, and default pad layout. |
| Phone to server | `{t:'m',dx,dy}` | Relative motion deltas interpreted by the chosen native backend. |
| Phone to server | `{t:'b',btn:'l' or 'r',s:1 or 0}` | Mouse button down/up. |
| Phone to server | `{t:'k',key:'f8',s:1 or 0}` | Key or combo down/up. A missing `s` invokes the older tap form. |
| Phone to server | `{t:'w',v}` | Wheel notches. |
| Phone to server | `{t:'p'}` | Heartbeat. |
| Phone to server | `{t:'cursor'}` | Request current cursor and monitor geometry during calibration. |
| Server to phone | `{t:'cursor',x,y,desktop,monitors}` | Read-only cursor feedback. |
| Phone to server | `{t:'layout',v}` | Save the earlier pad layout as the server default. |
| Server to phone | `{t:'layout_saved',layout}` | Acknowledge that save. |
| Server to phone | `{t:'stat',blocked:1 or 0}` | Native input permission/blocking status. |

The server explicitly serves the index and four dial assets with `Cache-Control: no-store`. Keep credentials outside all served routes.

## Dictation integration

Open Wand sends F8 as native keyboard input. It does not collect audio or call a transcription service. The desktop dictation app must handle the global shortcut, microphone, recording mode, transcription, and insertion. A push-to-talk app records on F8 down and finishes on F8 up. A toggle-based app can use two separate Mic taps.

The dictation guide also covers an existing CM7 Dictation installation. Its default F8 recording and release-to-insert behavior matches the phone. CM7 runs as a separate desktop application with its own configuration.

Built-in editing shortcuts choose Ctrl on Windows and Command on Mac. User macros remain literal. Mac uses physical US key positions, supports F1–F20, and rejects unsupported complete combos.

## Validation

```sh
node --test tests/*.test.cjs
python -m unittest discover -s tests -p "test_*.py" -v
```

Install the Python requirements first. On Mac, use `.venv-mac/bin/python` after running the launcher. Windows-specific tests skip on other platforms. Native tests stub input injection. Server tests use a local test server.

For browser checks, use a simulated WebSocket so no real computer receives input. Useful flows include short/held Left Click, independent Move release, scroll cancellation, locked Shift plus other shortcuts, edit/save/reload, old grip migration, clean labels, and small portrait/landscape sizes. Verify help opens with input released and keyboard focus stays within its dialog.

The `?sim=1` mode generates sensor motion and can drive a real receiver, so a static preview with a simulated connection is the appropriate place for automated browser checks.

Physical iPhone comfort, haptics, audio behavior, and MacBook hardware input still need live device checks. Keep that limitation visible in user documentation.
