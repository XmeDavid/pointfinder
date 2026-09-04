# tauri-plugin-pointfinder-nfc

NDEF URL tag support for the PointFinder mobile app. Local plugin, not published.

The plugin is generic: it reads and writes URL tags and returns the URL plus raw
records. Turning a URL into a base id and token happens in shared TypeScript.

## Behaviour by platform

| | Android | iOS |
|---|---|---|
| `startListening` | Arms reader mode while the activity is resumed. Any tap emits a `tag` event. | No-op. The OS reads URL tags in the background and opens the app via universal link. |
| `scan` | Shows the plugin's own bottom sheet (pulsing ring, message, Cancel) and resolves with the next tag read. Cancel, back, or tap outside rejects with `cancelled`. | Opens the system NFC sheet. Polls ISO 14443 and ISO 15693. |
| `write` | Shows the same sheet, writes on the next tap, re-reads to verify, flips the sheet to a check or a short reason. Runs on the reader-mode thread with a 250 ms presence check. | Opens the sheet, writes, re-reads to verify. |
| Cold start by tag | Buffered from the launch intent, returned by `consumePendingTag`. | Arrives as a universal link through the deep-link plugin. |

Errors reject with a short code first: `unavailable`, `disabled`, `cancelled`,
`timeout`, `tagLost`, `invalid`, `notWritable`, `tooLarge`, `verifyMismatch`,
`readFailed: ...`, `writeFailed: ...`. The TypeScript API wraps them in `NfcError`
with a `code` field.

`message`, `successMessage`, and `cancelLabel` drive the sheet text on both
platforms, so the app passes localised strings. Error reasons on the Android
sheet are short English defaults keyed by the rejection code; the app shows
its own localised error after the promise rejects.

## App-side requirements

Android manifest (in the app, not the plugin): an `NDEF_DISCOVERED` intent filter
for `https://pointfinder.pt/tag/` and `https://pointfinder.ch/tag/` so a tap can
launch the app when it is not running.

iOS: `com.apple.developer.nfc.readersession.formats` = `TAG` in the entitlements
and `NFCReaderUsageDescription` in Info.plist. Associated domains for both hosts.

## Desktop

Every call reports `unavailable`. Mock the tag flow on the JS side for desktop development.
