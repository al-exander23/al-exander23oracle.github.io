# ALX Oracle — temporary ghost-layer forensic build

This is a temporary diagnostic build only. It does not apply a CSS/JS fix, change typeText timing, change SceneController decisions, or disable effects in the normal mode. The overlay is active only with `diag=1`.

## Required iPhone tests

Use one fresh Telegram Mobile launch per URL. Do not combine flags. Keep the overlay visible. When the visual duplicate is visible, use `COPY DIAGNOSTICS` and record the visible result as `SINGLE` or `DUPLICATE`.

| HYPOTHESIS | URL | RESULT | CONCLUSION |
|---|---|---|---|
| A/B/C/D/E/F/G | `?debug=1&diag=1&ghost=1` | SINGLE / DUPLICATE | fill after test |
| H | `?debug=1&diag=1&ghost=1&label=1` | SINGLE / DUPLICATE | fill after test |
| I | `?debug=1&diag=1&ghost=1&isolate=1` | SINGLE / DUPLICATE | fill after test |

The overlay reports the full point stack from `elementFromPoint()`/`elementsFromPoint()` at phrase center, first/second line, left edge, and right edge; duplicate screen/orb counts; visible text elements outside the diagnostic panel; bounding rectangles; computed style and background/mask fields; canvas/SVG/iframe/shadowRoot presence; and T0/T1/T2/T3 snapshots.

## Critical REMOVE PHRASE test

Run `?debug=1&diag=1&ghost=1`. Start one scene and wait until the duplicate is visibly present. Press `REMOVE PHRASE` without starting a new scene. If the second visible text remains after `#screenContent.replaceChildren()`, record that result exactly; do not interpret it as a root cause yet. Press `COPY DIAGNOSTICS` afterward.

## Label test

Run `?debug=1&diag=1&ghost=1&label=1`. Every visible text-bearing application element receives a temporary red outline and a small label. The diagnostic overlay and labels are excluded from the reported visible-text list. If the user sees two texts but only one has a red outline, report that observation.

## Final result format

| HYPOTHESIS | TEST | RESULT | CONCLUSION |
|---|---|---|---|
| A | elementFromPoint stack | ... | ... |
| B | duplicate screen count | ... | ... |
| C | visible text list | ... | ... |
| D | ghost mode / geometry | ... | ... |
| E | background/mask | ... | ... |
| F | canvas/SVG/iframe/shadowRoot | ... | ... |
| G | T0/T1/T2/T3 | ... | ... |
| H | label=1 | ... | ... |
| I | isolate=1 | ... | ... |
| J | REMOVE PHRASE | ... | ... |

`PERMANENT FIX: NOT YET` until a mechanism is experimentally confirmed.
