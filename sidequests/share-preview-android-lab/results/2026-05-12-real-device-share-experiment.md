# Real Device Share Experiment

Date: 2026-05-12

Device: `5HWCA6EIOZIBIFR8`

App under test: `com.chokowa.sharepreviewlab`

## Scope

This pass used the isolated Android lab app, not the production app.

Two kinds of tests were run:

- direct ADB `ACTION_SEND` tests for stable baseline coverage
- real Chrome share-sheet tests for source-app behavior

The PC Share Preview Lab API was reached from the device through:

```text
adb reverse tcp:4177 tcp:4177
```

## Artifacts

Direct ADB share:

- `direct-share-summary-20260512-135642.csv`
- `direct-*-intent-20260512-135642.json`
- `direct-*-result-20260512-135642.json`

Chrome real share:

- `chrome-share-summary.csv`
- `chrome-github-intent.json`
- `chrome-github-result.json`
- `chrome-youtube-intent.json`
- `chrome-youtube-result.json`
- `chrome-zenn-intent.json`
- `chrome-zenn-result.json`
- `chrome-amazon-intent.json`
- `chrome-amazon-result.json`

## Direct ADB Share Results

Representative URLs:

- GitHub repository
- YouTube URL
- X/Twitter post
- Instagram root
- Amazon JP root
- Zenn root
- npm package
- direct image URL

Aggregate:

| Runner | OK | Partial | Failed | Title | Image | Favicon | Avg ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| `current-style-baseline` | 4 | 3 | 1 | 7 | 4 | 7 | 810 |
| `link-preview-js` | 4 | 4 | 0 | 5 | 5 | 8 | 491 |
| `openlink` | 3 | 4 | 1 | 4 | 3 | 7 | 341 |
| `intent-only` | 0 | 8 | 0 | 8 | 0 | 8 | 0 |

Notes:

- Direct ADB share only passes synthetic `EXTRA_TEXT` and `EXTRA_TITLE`.
- It does not represent actual browser/app metadata behavior.
- It is still useful for validating the Android lab app's receive flow and runner bridge.

## Chrome Real Share Results

Representative Chrome shares:

- GitHub repository
- YouTube URL
- Zenn root
- Amazon JP root

Aggregate:

| Runner | OK | Partial | Failed | Title | Image | Avg ms |
|---|---:|---:|---:|---:|---:|---:|
| `current-style-baseline` | 3 | 1 | 0 | 4 | 3 | 308 |
| `link-preview-js` | 3 | 1 | 0 | 3 | 3 | 317 |
| `openlink` | 3 | 1 | 0 | 3 | 3 | 290 |
| `intent-only` | 0 | 4 | 0 | 4 | 0 | 0 |

## Important Source-App Finding

Chrome shared more than just the URL.

For GitHub, Chrome provided:

- `android.intent.extra.TEXT`: URL
- `android.intent.extra.TITLE`: page title
- `android.intent.extra.SUBJECT`: page title
- `org.chromium.chrome.extra.TASK_ID`
- `org.chromium.chrome.browser.share_origin`
- `ClipData` URI:
  `content://com.android.chrome.FileProvider/images/screenshot/...png`

This means production should not ignore `ClipData` for text shares. Chrome can provide a screenshot/thumbnail URI even when MIME type is `text/plain`.

## X App Real Share Result

The user opened an X post on the real device and shared it into `Share Preview Lab`.

Received Intent:

- `action`: `android.intent.action.SEND`
- `type`: `text/plain`
- `android.intent.extra.TEXT`: `https://x.com/i/status/2053977730807734644`
- `ClipData.text`: `https://x.com/i/status/2053977730807734644`
- no `EXTRA_TITLE`
- no `EXTRA_SUBJECT`
- no `ClipData` image URI

Runner results:

| Runner | Status | Title | Image | Favicon | ms |
|---|---|---|---:|---:|---:|
| `intent-only` | partial | `x.com` | no | yes | 0 |
| `current-style-baseline` | partial | `x.com` | no | yes | 2207 |
| `link-preview-js` | partial | empty | yes | yes | 2040 |
| `openlink` | partial | empty | no | yes | 1518 |

Interpretation:

- X app sharing is URL-only in this sample.
- Because the source app does not provide a title or screenshot URI, X depends more heavily on network preview.
- `link-preview-js` was the only runner that recovered an image for this X URL.
- `current-style-baseline` recovered a better site label/title fallback, but no image.
- This reinforces the likely production shape: save immediately from Intent URL, then enrich preview asynchronously.

## Instagram App Real Share Result

The user opened an Instagram reel on the real device and shared it into `Share Preview Lab`.

Received Intent:

- `action`: `android.intent.action.SEND`
- `type`: `text/plain`
- `android.intent.extra.TEXT`: `https://www.instagram.com/reel/DXtIr8-E9OZ/?igsh=MWZsZDN1NzdmbnZ6dg==`
- `ClipData.text`: `https://www.instagram.com/reel/DXtIr8-E9OZ/?igsh=MWZsZDN1NzdmbnZ6dg==`
- no `EXTRA_TITLE`
- no `EXTRA_SUBJECT`
- no `ClipData` image URI

Runner results:

| Runner | Status | Title | Description | Image | Favicon | ms |
|---|---|---|---:|---:|---:|---:|
| `intent-only` | partial | `instagram.com` | no | no | yes | 0 |
| `current-style-baseline` | partial | `Instagram` | yes | no | yes | 365 |
| `link-preview-js` | ok | `Instagram` | no | yes | yes | 264 |
| `openlink` | partial | `Instagram` | no | no | yes | 234 |

Interpretation:

- Instagram app sharing is also URL-only in this sample.
- The shared URL includes a tracking-like `igsh` query parameter, so URL canonicalization should be considered before saving/displaying.
- `link-preview-js` was the only runner that produced a complete enough preview with image.
- `current-style-baseline` was useful for description/fallback text, but no image.
- Instagram further strengthens `link-preview-js` as the current winner candidate.

## Amazon App Real Share Result

The user opened an Amazon product on the real device and shared it into `Share Preview Lab`.

Received Intent:

- `action`: `android.intent.action.SEND`
- `type`: `text/plain`
- custom `imgUrl`: `https://m.media-amazon.com/images/I/51sGjUw1z5L._SS210_.jpg`
- custom `url`: `https://amzn.asia/d/0hAUgSyl`
- `android.intent.extra.SUBJECT`: `Amazonでご覧ください`
- `android.intent.extra.TITLE`: `Amazonでご覧ください`
- `android.intent.extra.TEXT`: product title plus `https://amzn.asia/d/0hAUgSyl`
- `ClipData.text`: product title plus `https://amzn.asia/d/0hAUgSyl`

Important extraction issue:

- The current lab extracted `imgUrl` first and treated the image URL as the preview target.
- This is useful evidence, not a library failure.
- Production should prefer explicit product/page URL fields over image URL fields when choosing the canonical saved URL.
- Image URLs from extras should be preserved as preview-image candidates, not saved as the shared post URL.

Runner results for the lab-extracted image URL:

| Runner | Status | Title | Description | Image | Favicon | ms |
|---|---|---|---:|---:|---:|---:|
| `intent-only` | partial | `Amazonでご覧ください` | yes | no | yes | 0 |
| `current-style-baseline` | ok | `51sGjUw1z5L._SS210_.jpg` | no | yes | yes | 597 |
| `link-preview-js` | partial | empty | no | no | yes | 116 |
| `openlink` | partial | empty | no | no | yes | 44 |

Runner results for the correct product URL `https://amzn.asia/d/0hAUgSyl`:

| Runner | Status | Title | Description | Image | Favicon | ms |
|---|---|---|---:|---:|---:|---:|
| `intent-only` | partial | `Amazonでご覧ください` | yes | no | yes | 0 |
| `current-style-baseline` | ok | Amazon product title | yes | yes | yes | 2663 |
| `link-preview-js` | ok | Amazon product title | yes | yes | yes | 2305 |
| `openlink` | partial | Amazon product title | yes | no | yes | 2338 |

Interpretation:

- Amazon is the strongest case for an Intent pre-pass.
- Amazon provides the product URL, image URL, and fallback text directly.
- With the correct product URL, both `current-style-baseline` and `link-preview-js` produced good previews.
- `link-preview-js` remains the broader winner candidate because it also performed best on Instagram and X image recovery.
- Production should combine source-app metadata with network enrichment instead of treating network preview as the only source of truth.

## YouTube App Real Share Result

The user opened a YouTube video on the real device and shared it into `Share Preview Lab`.

Received Intent:

- `action`: `android.intent.action.SEND`
- `type`: `text/plain`
- `android.intent.extra.SUBJECT`: `300人捕食したのにいまだ捕獲されていない伝説の人喰いワニ「ギュスターブ」【自然】`
- `android.intent.extra.TEXT`: `https://youtube.com/watch?v=bdqKeHiHcb0`
- `ClipData.text`: `https://youtube.com/watch?v=bdqKeHiHcb0`
- no `EXTRA_TITLE`
- no `ClipData` image URI

Runner results:

| Runner | Status | Title | Description | Image | Favicon | ms |
|---|---|---|---:|---:|---:|---:|
| `intent-only` | partial | `youtube.com` | no | no | yes | 0 |
| `current-style-baseline` | ok | YouTube video title | yes | yes | yes | 177 |
| `link-preview-js` | ok | YouTube video title | yes | yes | yes | 1416 |
| `openlink` | ok | YouTube video title | yes | yes | yes | 972 |

Interpretation:

- YouTube is a strong happy path: all network runners produced a good preview.
- `current-style-baseline` was fastest because it has a YouTube-specific path.
- `link-preview-js` also succeeded and remains safer as the broad default across services.
- The source app provides useful `EXTRA_SUBJECT`; production should treat `SUBJECT` as a title candidate when `EXTRA_TITLE` is missing.
- The lab bridge currently does not use `SUBJECT` for `intent-only`, which explains why `intent-only` only showed `youtube.com`.

## Candidate Impact

The overall candidate ranking did not change:

1. `link-preview-js`
2. `current-style-baseline`
3. `openlink`
4. `intent-only` as fallback only

But the real Chrome tests increased the value of a production-side Intent/ClipData pre-pass:

- Use `EXTRA_TITLE` / `EXTRA_SUBJECT` immediately as a fast title.
- Extract URL from `EXTRA_TEXT`.
- Inspect `ClipData` even for `text/plain`.
- If `ClipData` contains a readable image URI, treat it as a possible preview image fallback.
- Still run network preview in the background to improve or replace the card.

## Current Recommendation

Use this shape for eventual production implementation:

- immediate card: Intent title + URL + possible Chrome ClipData image
- primary network candidate: `link-preview-js` style runner or server wrapper
- app-owned fallback: current-style domain-specific rules
- hard rule: preview failure never blocks saving

## Remaining Real-Device Checks

Still needed before final winner:

- Firefox/Chrome Beta share if desired
- image share where `ACTION_SEND` uses `image/*`
- app cold-start and repeated-share behavior
