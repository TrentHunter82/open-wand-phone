# Open Wand phone remote

Use an iPhone as an air mouse, shortcut pad, and dictation trigger for a Windows PC or Mac. The phone runs the controls in Safari. A small Python program on the computer receives movements and button presses over your local network.

[Download the latest project](https://github.com/TrentHunter82/open-wand-phone/archive/refs/heads/main.zip) · [Set up dictation](docs/DICTATION.md) · [Developer notes](HANDOFF.md)

## What you need

- An iPhone with iOS 17 or newer and Safari.
- A Windows 11 PC or a Mac running macOS 13 or newer.
- Python 3.11 or newer on the computer.
- Both devices on the same local network. A wired computer and a Wi-Fi phone can work together when the network allows devices to communicate.
- For voice typing, a separate desktop dictation app configured for F8. Its microphone records your voice.

## Start on Windows

1. Download the project using the link above, or **Code > Download ZIP** on GitHub. Extract the ZIP and open the extracted folder.
2. Install Python from [python.org](https://www.python.org/downloads/). Open a new terminal and check `python --version`. It must report 3.11 or newer. If you used a traditional Python installer, enable its **Add Python to PATH** option. See the [official Windows installation guide](https://docs.python.org/3/using/windows.html).
3. Double-click **start.bat**. The first run installs the required Python packages, then shows a QR code and connection link.
4. If Windows Firewall asks, allow the app on your private home network.
5. Keep the launcher window open and [connect your iPhone](#connect-your-iphone).

Close the launcher window to stop. Double-clicking `start.bat` while an agent is running also stops it. Double-click again to start it.

The Windows launcher enables absolute pointer mode to avoid Windows mouse acceleration. To change agent options, edit the `WAND_ARGS` line in `start.bat`.

For a manual start, open a terminal in the extracted folder and run these commands.

```powershell
python -m pip install -r requirements.txt
python agent.py --absolute
```

## Start on Mac

1. Download and extract the same project, then install Python 3.11 or newer from [python.org](https://www.python.org/downloads/macos/).
2. Open Terminal, type `cd ` including the space, drag the extracted project folder into the Terminal window, and press Return.
3. Run the Mac launcher.

   ```sh
   bash start-mac.command
   ```

4. Allow the Terminal app or Python process named by macOS under **System Settings > Privacy & Security > Accessibility**, then run the launcher again. Apple's [Accessibility permission guide](https://support.apple.com/guide/mac-help/mh43185/mac) explains this permission.
5. Allow local-network or incoming-network access if macOS prompts for it.
6. Keep Terminal open and scan the QR code shown on the Mac. Press **Control+C** in Terminal to stop the agent.

The launcher creates `.venv-mac` and installs its dependencies on first use. Run the same command each time you want to start it. The Mac has its own connection link and QR code.

The Mac implementation supports Retina displays, multiple monitors, held-button dragging, scrolling, F8, and shared modifiers such as Shift. Built-in Copy, Paste, Undo, and Redo use Command automatically. Custom macros use the literal keys you enter, such as `cmd+c` on Mac and `ctrl+c` on Windows.

Mac input is covered by automated tests with simulated Quartz events. A live MacBook hardware check is still pending. Mac key names use physical US keyboard positions. F1–F20 are mapped. F21–F24, Insert, and Print Screen are unsupported.

## Connect your iPhone

1. Scan the computer's QR code with the iPhone Camera and open the link in Safari.
2. This project creates its own HTTPS certificate. For your own computer's connection, tap **Show Details > Visit This Website**, then confirm **Visit Website** when Safari displays its certificate warning. The exact wording can vary by iOS version.
3. Tap **START**, then **Allow** when Safari asks for motion access.
4. Hold **Move** and move your hand. Release it to stop the cursor.

Use a regular Safari tab and keep it in the foreground. The launcher window must remain open on the computer. Keep the tab or bookmark its link. The connection token persists across agent restarts, so that link can reconnect later.

## Set up voice typing

Open **Menu > Dictation setup** on the phone for the three-step walkthrough, or read the [full dictation guide](docs/DICTATION.md). Configure your desktop dictation app to record while **F8 is held**, transcribe when F8 is released, and insert the text into the focused app.

First test F8 on the computer keyboard. Then focus a text field and hold the phone's **Mic** bubble while speaking. Release it to finish.

If you already use **CM7 Dictation**, its default F8 hold/release behavior matches the Mic bubble. Open its desktop shortcut, keep the widget running, and follow the [CM7 quick check](docs/DICTATION.md#already-using-cm7-dictation).

The phone sends F8 down and F8 up. The desktop dictation app handles recording, transcription, and text insertion. Its own settings determine whether transcription runs locally or uses a service such as a Whisper API.

## Main controls

| Control | How it works |
| --- | --- |
| **Move** | Hold the large pad and move your hand to move the cursor. Release to stop. This is the startup mode. |
| **Left Click** | Tap for one click. Hold for about 160 ms to engage movement and drag with one finger, then release to drop. A higher Touch guard setting can delay movement further. |
| **Motion play/pause button** | Turn continuous motion on, or return to hold-to-move. Opening menus, editing, leaving the page, and disconnecting return to hold-to-move. |
| **Mic** | Hold F8 while touched and release F8 when lifted. Match the desktop dictation app's shortcut mode to this behavior. |
| **Right Click** | Tap or hold the smaller circle inside Mic. |
| **Scroll** | Hold to open the up/down thumb control. Slide up or down, farther for faster. An off-center hold keeps scrolling. Return to the center to pause or release to close. The pointer stays still throughout. |
| **Rim shortcuts** | Tap a word to send its shortcut immediately. Slide away to cancel a pending tap. **Next** shows more shortcuts when the current page is full. |
| **Backspace** | Tap to delete once. Hold to repeat after a short pause, then release or slide away to stop. |
| **Shift** | Hold normally, or hold for one second to lock it. Tap Shift or the **Shift locked** indicator to release. A dial macro containing only `shift` gets the same behavior. |

Keyboard users can Tab to a dial control and hold Space or Enter. On Scroll, hold Space or Enter and use Up/Down to choose direction. Hold Shift with an arrow for full speed. Release the arrow to pause. Release Space/Enter or press Escape to close.

Shift is released when menus open, motion is paused, the page loses focus, or the connection closes. Its lock state is temporary.

## Make the layout comfortable

Open **Menu > Edit layout**. Drag a circle to move it and drag its light handle to resize it. You can move the large wheel, Left Click, Mic, Right Click, Scroll, and the Motion button. Drag rim shortcuts onto one another to reorder them. Computer input is paused while editing.

Tap **Sizes & actions**, the **☷** button between Cancel and Save, for sliders and action assignments. **Function selector thickness** makes the outside shortcut ring wider or narrower. **Click bubble assignment** controls the small click bubble and inherits an older large-pad assignment when loading an existing grip.

Tap **Back to dial** to preview, then **Save** to keep your edits. **Cancel** restores the previous grip. Rotating the phone or leaving the page cancels unfinished edits. In unusually tight layouts, Click and Scroll can use nearby clear space beside the wheel.

**Menu > Saved grips** supports up to eight named presets. Each preset stores its own portrait and landscape geometry. Layouts, shortcuts, macros, and appearance settings save in this phone's browser. Clearing its website data removes them. They do not sync between browsers or computers.

### Shortcuts and macros

Open **Menu > Shortcuts & macros > Create macro button**. Enter a name and comma-separated shortcuts, such as `ctrl+a, ctrl+c` on Windows or `cmd+a, cmd+c` on Mac. Enable **Show on rim** and save.

You can create up to 32 macros with up to 12 shortcuts each. Each shortcut is held for 80 ms, released, and followed by a 120 ms pause. Macros target the focused computer app. They cannot wait for windows to open or type free-form text. Use **Edit layout > Sizes & actions** to arrange their rim buttons.

A new manual press interrupts an active sequence. Closing the panel, opening an editor, hiding the page, pausing, or disconnecting cancels it and releases held keys. Already-sent steps remain applied.

### Appearance and feedback

**Menu > Under the glass** offers Liquid, Smoke, and Still glass. Touches and hand movements animate the liquid or smoke. The scroll pad shows engraved marks while scrolling. The phone's Reduce Motion preference freezes decorative animation. Unsupported WebGL falls back to static glass.

**Ring haptics** requests vibration where the browser supports it. Safari can suppress it. **Ring tick sound** adds an optional audible response. The ringer switch and Bluetooth audio can affect sound.

## Adjust movement and scroll speed

Open **Menu > Settings & calibration**. Changes apply immediately and save on the phone.

| Setting | Effect |
| --- | --- |
| **Reach** | Higher values slow pointer motion. Default 135 degrees across the full virtual desktop. |
| **Curve** | Higher values create more difference between small movements and fast flicks. Default 1.0. |
| **min_cutoff** | Lower values smooth resting motion more, with more lag. Default 4.0 Hz. |
| **beta** | Higher values open the motion filter sooner as your hand moves faster. |
| **Deadzone** | Ignore small hand tremors. Default 2.5 degrees per second. |
| **Touch guard** | Wait after pressing a control to absorb thumb movement. Default 130 ms. The Left Click bubble also has a minimum 160 ms hold before it enables motion. |
| **Scroll sensitivity** | Lower numbers scroll faster. Range 2–18, default 9. The maximum ranges from 24 to 72 notches per second. |
| **Invert scroll** | Reverse scrolling independently of pointer direction. |
| **Point with** | Choose the phone's top edge or its back as the pointing direction. |
| **Invert X / Y** | Reverse either pointer axis. |

Reach covers the entire virtual desktop. A wide multi-monitor desktop can need a higher Reach value for comfortable control of one display. **Copy constants** exports the current settings as JSON.

Some internal settings still support the earlier pad interface and calibration pad. The current dial uses its own saved geometry and direct button gestures.

### Calibrate your reach

Open **Settings & calibration > Calibrate reach**.

1. Choose the projected display.
2. Hold still for the drift measurement.
3. Mark your comfortable left and right aim, then repeat.
4. Use the calibration hold-to-move pad to move the cursor yourself to the display's left and right edges twice. The phone reports when the cursor reaches them.
5. Adjust Slower/Faster if needed, repeat the edge checks, and tap **Apply reach** when comfortable.

Cancel discards the trial. **Undo calibration** restores the previous reach and calibration settings. The cursor moves only under your control. Disconnecting, changing display layout, stale feedback, or leaving Safari cancels the trial.

### Pointer mode

`start.bat` enables **absolute** movement on Windows, avoiding Windows mouse acceleration. A manual `python agent.py` start uses relative movement unless you add `--absolute`. For relative movement, turn off **Enhance pointer precision** in Windows mouse settings for more predictable reach.

Mac movement places the cursor directly using Quartz. Retina and external displays use the Mac's logical desktop coordinates. The physical mouse can still reposition the cursor.

## Updating

Stop the agent, pull the latest `main` or replace your extracted project with a fresh download, then start it again. Refresh the existing Safari tab.

For a ZIP replacement, keep your local `wand-token.txt`, `wand-cert.pem`, and `wand-key.pem` together in the updated project folder if you want the same connection link. Keep those files private. A changed computer IP address can still require rescanning the QR code and accepting a refreshed certificate.

Phone layouts stay in Safari's website data for that address. Using a different computer or connection address can use a different set of saved browser settings.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| **No movement** | Check Connected, allow motion access, and hold Move. The cursor also moves while holding Left Click after its brief delay. |
| **Mic does nothing** | Test F8 on the computer first, then follow the [dictation checks](docs/DICTATION.md#when-something-doesnt-work). |
| **Mac blocks input** | Allow the Terminal or Python process under Accessibility and restart the launcher. |
| **Windows blocks input** | Try a normal, non-elevated app window. An elevated target may require running the agent as administrator. |
| **Phone cannot connect** | Confirm the computer launcher is running and both devices can reach each other. Guest Wi-Fi and client isolation can block local connections. |
| **Link is out of date** | Scan the current QR code. A new token invalidates the old link. |
| **Another device took control** | Close extra remote tabs. The server accepts one active client. Tap the banner to take control back. |
| **Page looks zoomed** | Use Safari's page controls to set 100%, or use Settings > Reset page size / Reload the page. |
| **Wrong movement direction** | Check Point with and Invert X / Y. |
| **Scroll is too slow** | Lower Scroll sensitivity, then slide farther from the pop-up's center. |
| **New network or computer IP** | Restart the agent, scan its new QR code, and accept its certificate. |
| **Held input seems stuck** | Close the remote tab or restart the agent. Disconnecting releases held keys and buttons. |
| **Port 8443 is busy** | Stop the other agent, or start with `--port 8444`. |

## Security and privacy

The agent listens on the computer's LAN address and localhost. Its control connection requires the random token in the full URL. Someone who can reach the computer and has that token can send mouse and keyboard input while the agent runs.

Keep the full URL, QR code, `wand-token.txt`, and `wand-key.pem` private. Hide the address bar and QR code in public recordings. Publishing this source code does not publish locally generated credentials. Keep the agent on a trusted local network.

To invalidate a shared link, stop the running agent and start it with a new token.

```sh
python agent.py --new-token
```

On Mac, use `bash start-mac.command --new-token`. On Windows, add `--new-token` to `WAND_ARGS` for one launch, then remove it so later restarts keep the replacement link.

The phone's Mic button sends a keyboard shortcut. Audio collection, transcription, service credentials, and audio retention belong to your chosen desktop dictation app. See its privacy settings before using sensitive speech.

## Developer checks

Run the front-end checks with Node.js.

```sh
node --test tests/*.test.cjs
```

With the Python requirements installed, run the server and input tests.

```sh
python -m unittest discover -s tests -p "test_*.py" -v
```

On Mac, use `.venv-mac/bin/python` after running the launcher. Native input tests replace injection with stubs. Browser checks use a simulated connection. Physical iPhone haptics and Mac hardware behavior need device checks.

For a desktop motion demo, append `&sim=1` to the computer's printed connection URL, tap START, then hold Move or Left Click. The synthetic motion goes through the real receiver and can move its computer's cursor.

See [HANDOFF.md](HANDOFF.md) for modules, protocol, storage, and maintenance details.
