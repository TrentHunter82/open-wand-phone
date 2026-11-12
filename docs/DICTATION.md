# Set up dictation with the Mic bubble

The goal is to click a text field, hold **Mic** while speaking, and release it to insert your words.

Open Wand sends **F8 down** when you press Mic and **F8 up** when you release it. A desktop dictation app listens for that shortcut, records through the computer's microphone, transcribes your speech, and inserts the result. Your phone continues to provide the remote controls.

## Already using CM7 Dictation?

CM7 Dictation uses the matching behavior by default. Hold F8 to record, then release F8 to transcribe and paste at the cursor.

1. Open your **CM7 Dictation** desktop shortcut and keep its widget running.
2. Click inside a blank document and test one sentence with the computer's F8 key.
3. Start Open Wand, connect the phone, and hold **Mic** for the same recording action.

Keep CM7's dictation hotkey at `f8` and automatic pasting enabled. A custom `--hotkey` or `--no-paste` option changes those defaults. Its optional F9 read-aloud feature has a separate shortcut. CM7's microphone, transcription backend, and service credentials are configured in CM7.

These steps assume CM7 is already installed. For other dictation apps, continue with the general setup below.

## 1. Get one sentence working on the computer

Open your existing desktop dictation app. If you are choosing one, check that it supports all three of these features before following the rest of this guide.

- A global **F8** shortcut that works while another app is focused.
- **Hold to record** or **push-to-talk**, with transcription starting on release.
- Automatic insertion into the focused text field, or copying the result to the clipboard.

The desktop app can use local speech recognition or a cloud transcription service. Follow that app's own installation and account instructions. Enter any service credentials in its desktop settings.

In the dictation app's settings, choose your computer's microphone or headset and set the recording shortcut to **F8**. Select hold-to-record mode. If the app offers automatic text insertion, enable it.

Open Notepad on Windows or a new TextEdit document on Mac and click inside it. Hold F8 on the computer keyboard, say “This is my first voice typing test,” and release F8. Wait for the text to appear.

**Once that sentence appears, the desktop dictation setup is ready.** Keep that app running.

If your dictation app only supports a toggle shortcut, use one F8 tap to start and another to stop. The phone can send those taps, but holding and releasing Mic will follow the app's toggle behavior instead of push-to-talk.

## 2. Connect the phone

Start Open Wand using the [Windows or Mac instructions](../README.md#start-on-windows), scan the computer's QR code, tap START in Safari, and allow motion access.

Check that the phone says **Connected**. Click the same test document using the physical mouse or the phone's Left Click bubble.

## 3. Try the Mic bubble

1. Keep the phone still and press and hold **Mic**.
2. Say a short sentence toward the computer's microphone or your connected headset.
3. Lift your finger and wait for transcription to finish.
4. Check that the sentence appears at the text cursor.

The smaller Right Click circle inside Mic has its own input. Press the visible Mic area when recording.

If your app copies the result instead of inserting it, tap **Paste** on the rim after transcription finishes. Open Wand's built-in Paste uses Ctrl+V on Windows and Command+V on Mac.

## Windows setup notes

- In Windows microphone privacy settings, allow microphone access and access for desktop apps. Microsoft's [microphone permission guide](https://support.microsoft.com/windows/turn-on-app-permissions-for-your-microphone-in-windows-94991183-f69d-b4cf-4679-c98ca45f577a) covers the relevant controls.
- Confirm the dictation app's selected microphone responds while you speak.
- Use the app's global shortcut setting. A shortcut that only works while its own window is focused cannot provide voice typing into another app.
- Test in a normal Notepad window first. Elevated applications can block input from programs running without administrator privileges.

## Mac setup notes

- Allow your **dictation app** to use the microphone under **System Settings > Privacy & Security > Microphone**.
- Allow the Terminal or Python process running **Open Wand** under **Accessibility**. Your dictation app may also need its own Accessibility permission to insert text. Follow the prompts for the app that needs access. Apple's [Accessibility guide](https://support.apple.com/guide/mac-help/mh43185/mac) explains these permissions.
- On a physical Mac keyboard, you may need Fn/Globe with F8 to send a function key instead of a media command. The phone sends the F8 function key directly. Apple's [function-key guide](https://support.apple.com/102439) explains the keyboard setting.
- Use Mac shortcuts in custom macros, for example `cmd+v`. The built-in Copy, Paste, Undo, and Redo buttons choose Command automatically.

## When something doesn't work

Work down this list so each check isolates one part of the setup.

| What happens | Check next |
| --- | --- |
| Physical F8 does not start recording | Open the dictation app and check its global shortcut, recording mode, selected microphone, and permissions. |
| Physical F8 records but no text appears | Check the desktop app's transcription status and auto-insert setting. For a cloud service, check its account, connectivity, and any error it reports. |
| Text is on the clipboard | Click the destination field and use Paste, or enable automatic insertion in the dictation app. |
| Keyboard F8 works but phone Mic does nothing | Confirm Connected, press the Mic area outside Right Click, and check whether the dictation app accepts shortcuts from other input software. |
| Pressing and releasing Mic keeps recording | The desktop app may be in toggle mode. Choose hold-to-record, or tap Mic again to stop. |
| Text goes into the wrong place | Click the intended text field before recording. The active desktop app receives insertion. |
| Speech is faint or missing | Check which microphone the desktop app selected and speak toward it. The phone sends the shortcut while the desktop app records. |
| Mac receives a media command during the keyboard test | Try Fn/Globe+F8 on the physical keyboard. |
| Recording continues after a connection loss | Open Wand releases held input when the connection closes. Also check the dictation app's recording mode and stop button. |

## Using dictation every day

Keep the desktop dictation app and Open Wand launcher running. Open the saved Safari connection link, focus a text field, and hold Mic to speak. Release and wait for the text before moving to another field.

Your desktop dictation app controls audio processing, storage, and any transcription charges. Local-model apps and cloud services can handle recordings differently. Check the chosen app's privacy and retention settings for sensitive speech.

Keep the Open Wand connection link and QR code private. The link's access token controls the computer while the receiver is running. Service API keys belong in the desktop dictation app and should never be placed in a screenshot, shared macro, or GitHub file.
