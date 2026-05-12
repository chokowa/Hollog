# Share Preview Lab

This is an isolated sidequest app for comparing link preview strategies without touching the production BocchiSNS/Hollog app.

## Goal

Choose one winning preview strategy for the production app using repeatable evidence:

- the same URL is sent to every runner
- every runner can be executed alone
- raw output, normalized output, timing, status, and error phase are recorded separately
- the browser UI only displays results and should not decide whether a runner succeeded

## Run

```bash
cd sidequests/share-preview-lab
npm install
npm start
```

Open `http://localhost:4177`.

## Runners

- `intent-only`: lower-bound behavior based on share/intent text only.
- `current-style-baseline`: small standalone approximation of the current app's native HTTP + metadata parsing approach.
- `link-preview-js`: OSS package runner.
- `openlink`: OSS package runner.

## Validation Plan

Use this lab in two passes:

1. Browser/Codex pass: URL input and corpus batch tests. This compares URL-to-preview ability.
2. Android real-device pass: share sheet behavior and final winner verification. This is required before production integration.

Do not treat a horizontal comparison failure as a library failure until the same URL is also tested with that runner alone.
