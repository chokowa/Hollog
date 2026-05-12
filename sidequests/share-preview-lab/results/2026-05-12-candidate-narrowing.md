# Share Preview Lab Candidate Narrowing

Date: 2026-05-12

## Scope

This pass narrows preview-strategy candidates using the isolated Share Preview Lab only.

It does not validate Android share-sheet behavior. Real-device validation is still required before declaring a final winner for production.

## Artifacts

- Raw base corpus: `results/corpus-sequential-20260512-134235.json`
- Base summary: `results/corpus-sequential-summary-20260512-134235.csv`
- Raw extra corpus: `results/extra-sequential-20260512-134346.json`
- Extra summary: `results/extra-sequential-summary-20260512-134346.csv`
- Raw top-2 stability check: `results/stability-top2-20260512-134442.json`
- Top-2 stability summary: `results/stability-top2-summary-20260512-134442.csv`

## Method

- 20 total URLs were tested.
- All runners used sequential execution to reduce cross-runner interference.
- Timeout was 10 seconds per runner.
- Intent fields were empty, so this measures URL-to-preview ability only.
- Stability check re-ran 6 difficult URLs 3 times against the top 2 candidates.

## Aggregate Results

| Runner | OK | Partial | Fallback | Failed | Timeout | Title | Image | Favicon | Avg ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `link-preview-js` | 14 | 5 | 0 | 1 | 0 | 16 | 15 | 19 | 389 |
| `current-style-baseline` | 13 | 5 | 0 | 2 | 0 | 18 | 13 | 18 | 497 |
| `openlink` | 11 | 7 | 0 | 2 | 0 | 15 | 11 | 18 | 306 |
| `intent-only` | 0 | 0 | 20 | 0 | 0 | 20 | 0 | 20 | 0 |

## Observations

- `link-preview-js` produced the highest image count and the best overall OK count.
- `current-style-baseline` produced more titles and handled direct image URLs better.
- `current-style-baseline` was notably faster for YouTube because it uses oEmbed directly.
- `link-preview-js` was faster on GitHub-style pages and many normal pages.
- `openlink` was fastest among network runners, but it returned fewer images and fewer titles.
- `intent-only` is not a preview winner candidate, but it remains valuable as the zero-network fallback.
- npm returned bot/challenge behavior: `current-style-baseline` got HTTP 403, while `link-preview-js` returned `Just a moment...`. That is not a good preview and should be treated as a soft failure in future scoring.
- Reddit returned verification-page metadata for all network runners. That should also be treated as a degraded/soft-failure case.
- X/Twitter remains weak for meaningful titles. `link-preview-js` got an image where the baseline did not, but its title was empty in this run.

## Stability Check

Top 2 candidates were re-run 3 times on:

- GitHub
- YouTube
- X/Twitter
- npm
- Reddit
- invalid domain

Result status and title variants were stable across the 3 passes. The largest variation was timing:

- `current-style-baseline` X/Twitter ranged from about 1.9s to 5.2s.
- `link-preview-js` X/Twitter ranged from about 1.2s to 2.6s.
- `link-preview-js` YouTube stayed around 1.0s to 1.2s.
- `current-style-baseline` YouTube stayed around 170ms to 180ms.

## Candidate Decision

Current shortlist:

1. `link-preview-js`
2. `current-style-baseline`

Current rejection as primary:

- `openlink`: keep as a useful comparison runner, but do not make it the primary candidate right now because preview completeness is weaker.
- `intent-only`: keep as fallback only.

## Preliminary Recommendation

If choosing a free OSS library as the primary engine, `link-preview-js` is the current leading candidate.

If optimizing purely for this app's current behavior and domain-specific control, `current-style-baseline` remains very competitive and should not be discarded.

The likely production shape is:

- primary engine: `link-preview-js` or a small server/worker wrapper around it
- app-owned fallback: current-style domain-specific fixes for YouTube, Instagram, Amazon, direct images, bad titles, and domain/favicon fallback
- hard rule: preview failure must never block saving

## Required Next Checks

- Add soft-failure detection for titles like `Just a moment...`, `Please wait for verification`, and generic host-only titles.
- Test real Android share-sheet inputs from Chrome, Firefox, YouTube, X, Instagram, and Amazon.
- Test the final candidate on real device before production integration.
- If using `link-preview-js` in production, verify the intended runtime because this lab uses `tsx` to run it cleanly under the local Node version.
