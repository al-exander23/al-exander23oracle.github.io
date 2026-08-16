# ALX Oracle — v1.5 stable fail-safe forensic diagnostic

This archive is based on committed production baseline `981c6078cf92e71ec70de05c6f4a0a369e75547d` (`v1.2.5`). It contains no renderer rewrite and no permanent fix. The only changes are a passive diagnostic script, read-only callbacks at existing trace points, and its script tag in `index.html`.

The ordinary URL remains ordinary Oracle. The diagnostic overlay exists only when both `debug=1` and `diag=1` are present. The script has a top-level `try/catch`, does not use `MutationObserver`, does not await initialization, does not fetch data, does not replace production DOM, does not change production styles/classes, and does not intercept scene input. It creates only its own fixed overlay outside `.stage`.

Use `?debug=1&diag=1`. At the moment the duplicate is visible, press `HIDE PHRASE` and record whether the duplicate disappears, remains, or changes. Then press `COPY DIAGNOSTICS`. Do not press `REMOVE PHRASE` until the hide result is recorded.

## Local status

| Check | Status | Note |
|---|---|---|
| Clean baseline commit | PASS | `981c6078cf92e71ec70de05c6f4a0a369e75547d` |
| JavaScript syntax | PASS | `diagnostic.js`, `app.js`, `scene.js`, `ui.js`, `effects.js` |
| No MutationObserver | PASS | static check |
| Ordinary URL has no overlay | PASS | local browser smoke check |
| `debug=1&diag=1` shows overlay | PASS | local browser smoke check |
| Intentional diagnostic failure does not block Oracle | PASS | `diagthrow=1` self-test |
| Five sequential local launches | NOT TESTED | browser context reset during long run |
| iPhone Telegram Mobile | NOT TESTED | required acceptance environment |

The local browser is not an iPhone Telegram Mobile substitute. No statement that the original duplicate is fixed is made.
