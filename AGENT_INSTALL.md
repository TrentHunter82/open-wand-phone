# Install guide for AI agents

This file is for an AI coding agent that a person asked to install Open Wand. A person who installs by hand can follow [README.md](README.md) instead.

Open Wand has two parts. A Python program (the **agent** in the README; this file calls it the **receiver** to avoid confusion with you) runs on the computer and injects mouse and keyboard input. A web page runs in Safari on an iPhone and sends movement and button presses to the receiver over the local network.

## Who does what

Some steps need the person. Do not try to work around them.

| You can do | The person must do |
| --- | --- |
| Check the OS, Python, and network | Grant macOS Accessibility or answer a Windows Firewall prompt |
| Clone the repository and install the Python packages | Scan the QR code and accept the certificate warning in Safari |
| Run the tests | Tap START and allow motion access on the phone |
| Start the receiver in a terminal the person can see | Choose, install, and sign in to a dictation app |
| Detect a VPN and pick the right `--host` address | Do the calibration with the phone in hand |
| Explain each phone step and wait for the result | Decide whether to keep or rotate the connection link |

Rules for the whole install:

- Ask before you install Python, a dictation app, or any system package. Report what you would install and why.
- Do not change VPN, firewall, or system security settings. Tell the person what to change.
- The connection URL contains a token that controls the computer. Show it only in the person's own terminal or chat. Do not put it in a commit, an issue, a log you upload, or a request to another service.
- Never commit `wand-token.txt`, `wand-cert.pem`, or `wand-key.pem`. They are in `.gitignore`.
- Do not enter credentials or API keys for the person's dictation service. The person enters them in that app.

## 1. Preflight

Check these and report each result before you install.

1. **OS.** Windows 11, or macOS 13 or newer. Other systems are not supported; `agent.py` exits.
2. **Python.** 3.11 or newer. Use `python3 --version` on Mac and `python --version` on Windows.
3. **Git.** If Git is missing, download and extract <https://github.com/TrentHunter82/open-wand-phone/archive/refs/heads/main.zip> instead.
4. **Existing copy.** If the folder already exists, go to [Update](#8-update).
5. **Port.** The receiver uses TCP 8443. If another process listens there, plan to use `--port 8444`.
6. **Local address and VPN.** Find the computer's private LAN address (usually `192.168.x.x` or `10.x.x.x`). Then check which address the receiver would pick:

   ```sh
   python3 -c 'import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(("8.8.8.8",80));print(s.getsockname()[0])'
   ```

   On Windows use `python` and the same code. If the printed address is not the LAN address, a VPN or tunnel owns the default route (common signs: a `utun`, `tun`, or `wg` interface, or an address in `172.16.x.x` or `100.64.x.x`–`100.127.x.x`). Plan to start the receiver with `--host <LAN address>`. See [VPN and address problems](#vpn-and-address-problems).
7. **Phone.** Ask the person to confirm an iPhone with iOS 17 or newer, on the same network as the computer. Guest Wi-Fi and client isolation block the connection.

## 2. Install

Clone into a folder the person will keep, for example their home folder.

```sh
git clone https://github.com/TrentHunter82/open-wand-phone.git
cd open-wand-phone
```

**Mac.** Use the same virtual environment that `start-mac.command` expects, so the launcher does not install a second time.

```sh
python3 -m venv .venv-mac
.venv-mac/bin/python -m pip install -r requirements.txt
.venv-mac/bin/python -c 'import aiohttp, qrcode, cryptography, Quartz; print("imports ok")'
```

**Windows.** `start.bat` installs into the active Python. Do the same.

```powershell
python -m pip install -r requirements.txt
python -c "import aiohttp, qrcode, cryptography; print('imports ok')"
```

## 3. Verify

Run the Python tests. They replace input injection with stubs, so they do not move the cursor.

```sh
.venv-mac/bin/python -m unittest discover -s tests -p "test_*.py"
```

On Windows use `python` in place of `.venv-mac/bin/python`. Some tests skip on each platform; that is expected. Failures are not.

If Node.js is installed, also run the front-end tests. Do not install Node.js only for this.

```sh
node --test tests/*.test.cjs
```

## 4. Start the receiver

The receiver must keep running and the person must see its QR code. Start it in a visible terminal that stays open, not as a hidden background process. If you cannot open a terminal for the person, give them the command to run.

**Mac**

```sh
bash start-mac.command
```

With a VPN, or any time the wrong address appears:

```sh
bash start-mac.command --host 192.168.1.20
```

On the first start macOS can block input. The receiver then exits with a message that names **System Settings > Privacy & Security > Accessibility**. Ask the person to enable the terminal app or Python process that macOS lists there, then start the receiver again. The permission belongs to the app that launched the receiver, so start it from the app the person will use every day.

**Windows**

Run the receiver directly. `start.bat` is made for a double-click: it stops a running receiver when run a second time and waits for a key at the end, which can hang an automated shell.

```powershell
python agent.py --absolute
```

Add `--host <LAN address>` when needed. For the person's daily use, tell them to double-click `start.bat`; put a permanent `--host` into its `WAND_ARGS` line if they need one. If Windows Firewall asks, the person allows access on private networks.

**Check the start**

Read the receiver's output and confirm all of these.

- A line `URL: https://<address>:8443/?k=<token>` appears, and `<address>` is the LAN address from preflight.
- A QR code appears below it.
- No `[net] cannot bind` or `Port 8443 is busy` message appears.

Options: `--host IP`, `--port N`, `--absolute`, `--new-token`, `--no-qr`, `--verbose`.

## 5. Connect the iPhone

Give the person these steps one at a time and wait for each result.

1. Scan the QR code with the iPhone Camera and open the link in Safari. Use a regular Safari tab.
2. Safari warns about the certificate, because the receiver makes its own. Tap **Show Details > Visit This Website**, then **Visit Website**. The wording varies by iOS version.
3. Tap **START**, then **Allow** for motion access.
4. Check that the page says **Connected**.
5. Hold **Move** and move the hand. The computer cursor moves. Release to stop.

Tell the person to bookmark the tab. The token persists across restarts, so the same link reconnects later.

If the phone cannot open the link, do not guess. Check, in order: the receiver still runs; the URL address is the LAN address; the phone is on the same network and not on cellular data or guest Wi-Fi; the phone's own VPN is off; a firewall on the computer allows incoming connections to Python.

## 6. Set up dictation

Dictation is optional. Ask whether the person wants it before you start.

Open Wand does not record or transcribe audio. The phone's **Mic** bubble sends **F8 down** on press and **F8 up** on release. A separate desktop dictation app must listen for F8, record from the computer's microphone, and insert the text. The full guide is [docs/DICTATION.md](docs/DICTATION.md).

1. Ask which dictation app the person uses. If they have none, list the three requirements and let them choose and install one: a global F8 shortcut, hold-to-record (push-to-talk), and automatic insertion into the focused text field.
2. In that app, the person sets the shortcut to **F8**, the mode to **hold to record**, and automatic insertion to on. With **CM7 Dictation**, the defaults already match.
3. **Test on the keyboard first.** The person opens Notepad or TextEdit, clicks in it, holds F8 on the physical keyboard, says one sentence, and releases. The text must appear. On a Mac keyboard this can need Fn/Globe+F8.
4. Do not continue until step 3 works. If it fails, the problem is in the dictation app, its microphone permission, or its service account, not in Open Wand.
5. **Test on the phone.** With the phone connected and the same document focused, the person holds **Mic**, speaks toward the computer's microphone, and releases. The same text appears.

Common results:

- Text lands on the clipboard only: the person taps **Paste** on the rim, or enables automatic insertion.
- Recording does not stop on release: the app is in toggle mode. Switch it to hold-to-record.
- Keyboard F8 works and Mic does not: check **Connected**, and that the press is on Mic and not on the smaller **Right Click** circle inside it.

**Menu > Dictation setup** on the phone shows the same three steps.

## 7. Calibrate and tune

Do this with the person, after the cursor moves. All of it happens on the phone under **Menu > Settings & calibration**. Changes apply at once and save in that phone's browser.

**Calibrate reach first.** Open **Settings & calibration > Calibrate reach** and have the person follow the on-screen steps:

1. Choose the display to aim at.
2. Hold still for the drift measurement.
3. Mark a comfortable left and right aim, twice.
4. Use the calibration pad to move the cursor to the display's left and right edges, twice.
5. Adjust Slower/Faster, repeat the edge check, and tap **Apply reach**.

**Undo calibration** restores the earlier values. The trial cancels if the phone disconnects, the display layout changes, or Safari leaves the foreground.

**Then tune by symptom.** Change one setting at a time and ask the person to try it.

| Symptom | Setting to change |
| --- | --- |
| Cursor too fast or too slow | **Reach**. Higher is slower. Default 135 degrees across the whole virtual desktop. |
| Several monitors, one feels cramped | Raise **Reach**, or calibrate to the one display. |
| Cursor shakes at rest | Lower **min_cutoff** (default 4.0 Hz), or raise **Deadzone** (default 2.5 deg/s). |
| Cursor lags behind the hand | Raise **min_cutoff** or **beta**. |
| Cursor jumps when a button is pressed | Raise **Touch guard** (default 130 ms). |
| Small moves fine, flicks too weak (or the reverse) | **Curve** (default 1.0). |
| Left/right or up/down reversed | **Invert X / Y**, and check **Point with** (top edge or back of the phone). |
| Scroll too slow or too fast | **Scroll sensitivity**. Lower is faster. Range 2–18, default 9. |
| Scroll direction reversed | **Invert scroll**. |

**Pointer mode.** On Mac the cursor is always placed directly. On Windows, `--absolute` (the `start.bat` default) avoids mouse acceleration. Without it, tell the person to turn off **Enhance pointer precision** in Windows mouse settings.

**Layout, shortcuts, and look.** Offer these; they are optional.

- **Menu > Edit layout**: drag circles to move them, drag the light handle to resize, then **Save**.
- **Menu > Saved grips**: up to eight named presets.
- **Menu > Shortcuts & macros > Create macro button**: comma-separated shortcuts, such as `cmd+a, cmd+c` on Mac or `ctrl+a, ctrl+c` on Windows.
- **Menu > Skin**: Graphite, Titanium, Silver / Graphite, or Original glass.

Settings live in Safari's website data for the receiver's address. A different address or a cleared browser starts from defaults. **Copy constants** exports the tuning as JSON if the person wants a backup.

## 8. Update

```sh
git pull --ff-only
```

- If only files under `www/`, `tests/`, or the documents changed, the running receiver already serves the new files. The person reloads the Safari tab.
- If `agent.py`, `input_macos.py`, `input_windows.py`, a launcher, or `requirements.txt` changed, stop the receiver, install the requirements again, and start it again.

Keep `wand-token.txt`, `wand-cert.pem`, and `wand-key.pem` in place so the saved link still works. Do not discard local changes without asking.

## VPN and address problems

The receiver finds its address from the route to the internet. A VPN on the computer can make that the VPN's address, which the phone cannot reach. The URL, QR code, certificate, and listening socket then all use the wrong address.

Fix it with `--host` and the computer's LAN address. Nothing in the VPN needs to change, because traffic between two devices on the same subnet normally stays off the tunnel.

- Pick the interface the phone can reach. A computer with both wired and Wi-Fi connections has two LAN addresses; either works if both are on the phone's network.
- A LAN address from DHCP can change. If the link stops working after a reboot or network change, check the address again and restart with the new one. The person then rescans the QR code and accepts the new certificate.
- If the VPN blocks all local traffic ("block LAN access", "lockdown", or full-tunnel without local exceptions), `--host` is not enough. Tell the person that the VPN needs a local-network exception. Do not change it yourself.
- A VPN on the **phone** can block the connection in the same way.

## Other problems

| Output or symptom | Action |
| --- | --- |
| `Port 8443 is busy` | Another receiver runs. Stop it, or start with `--port 8444`. |
| Mac exits with the Accessibility message | The person grants Accessibility to the launching app, then you start again. |
| `[net] WARNING: no LAN address found` | The computer has no network. Connect it, or pass `--host`. |
| Phone shows the banner about another device | Only one client is active. The person closes other tabs or taps the banner. |
| Link stopped working after `--new-token` | Expected. The person scans the new QR code. |
| Held key or button seems stuck | The person closes the Safari tab, or you restart the receiver. Disconnecting releases all input. |
| Windows input ignored in one app | The target app is elevated. Test in a normal window first. |

More cases are in the [README troubleshooting table](README.md#troubleshooting).

## Stop and remove

- Stop: Control+C in the receiver's terminal, or close the window.
- Invalidate a shared link: start once with `--new-token`.
- Remove: stop the receiver and delete the project folder. On Mac, the person can also remove the Accessibility entry. Phone settings stay in Safari's website data until the person clears them.

## Report to the person

When you finish, state plainly:

1. Where the project folder is and which commit is installed.
2. The exact command that starts the receiver, with `--host` if you used it and why.
3. The test results, and any test you did not run.
4. Which steps the person confirmed on the phone: connected, cursor moves, dictation, calibration.
5. Anything still open, such as a permission not yet granted.
6. A reminder to keep the connection link and QR code private.
