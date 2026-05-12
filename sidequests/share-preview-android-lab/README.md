# Share Preview Android Lab

Small native Android lab app for real-device share-sheet testing.

This app is intentionally separate from the production app:

- application id: `com.chokowa.sharepreviewlab`
- package: `com.chokowa.sharepreviewlab`
- no production source files are imported

## What It Tests

- Raw Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE` payloads
- `EXTRA_TEXT`, `EXTRA_TITLE`, `EXTRA_SUBJECT`, `EXTRA_HTML_TEXT`, `EXTRA_STREAM`
- `ClipData` text and URI values
- URL extraction from incoming share data
- Optional comparison against the PC Share Preview Lab API through `adb reverse`

## PC Lab Bridge

When the PC Share Preview Lab is running on port `4177`, run:

```bash
adb reverse tcp:4177 tcp:4177
```

The Android lab app can then call:

```text
http://127.0.0.1:4177/api/run
```

## Build / Install

From the repo root:

```bash
android\gradlew.bat -p sidequests\share-preview-android-lab assembleDebug
adb install -r sidequests\share-preview-android-lab\app\build\outputs\apk\debug\app-debug.apk
```
