# ALX Oracle — temporary Telegram Mobile A/B diagnostic build

This build is temporary and is not a bug fix. It preserves the existing scene, timings, Oracle selection, `typeText()` implementation, and architecture. It adds only an overlay, type-operation observation callbacks, and isolated query-parameter experiments.

Upload the contents to a temporary GitHub branch/repository served by GitHub Pages. Do not overwrite production. For every test, use a fresh app launch and enable exactly one mode.

## URLs

Normal diagnostic control:

`https://YOUR-PAGES-URL/?debug=1&diag=1`

Plain-text test, bypasses `typeText()` and creates no `.ch` only for PHRASE:

`https://YOUR-PAGES-URL/?debug=1&diag=1&plain=1`

Transition test:

`https://YOUR-PAGES-URL/?debug=1&diag=1&notransition=1`

Screen compositing test:

`https://YOUR-PAGES-URL/?debug=1&diag=1&nocomposite=1`

Sweep test:

`https://YOUR-PAGES-URL/?debug=1&diag=1&nosweep=1`

Pseudo-element test:

`https://YOUR-PAGES-URL/?debug=1&diag=1&nopseudo=1`

## Procedure

Run each URL separately on the same iPhone Telegram Mobile WebView. Start the Oracle once. When the phrase appears and the visual result is clear, record `SINGLE` or `DUPLICATE` in the table. Use `COPY DIAGNOSTICS` before starting another scene. Do not combine query flags.

| TEST | RESULT |
|---|---|
| NORMAL | SINGLE / DUPLICATE |
| PLAIN_TEXT | SINGLE / DUPLICATE |
| NO_TRANSITION | SINGLE / DUPLICATE |
| NO_COMPOSITE | SINGLE / DUPLICATE |
| NO_SWEEP | SINGLE / DUPLICATE |
| NO_PSEUDO | SINGLE / DUPLICATE |

The overlay reports Telegram runtime, DOM counts, typeText operation IDs, screen class/opacity/filter/transform/transition/animation, active diagnostic mode, and clipboard copy status. Linux Chromium output is only a control check and is not valid for the mobile acceptance criteria.

After collecting the table, remove this temporary branch/files. Do not apply a permanent fix from these tests alone.
