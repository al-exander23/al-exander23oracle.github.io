# ALX Oracle — absolute screen/body probe

Temporary probe only. It does not change Oracle logic, renderer logic, SceneController, typeText, timings, data, or mix selection. When a probe parameter is present, `screenprobe.js` sets a guard before `app.js` and app bootstrap is skipped.

Upload the **contents of this archive** directly into the GitHub Pages repository root. The root must contain `index.html` and `js/screenprobe.js`.

| Test | URL | Expected DOM |
|---|---|---|
| A — SCREEN ONLY | `?screenprobe=1` | `#screen` → `#alx-screen-probe` → `TEST` |
| B — SCREEN + ORB REMOVED | `?screenprobe=1&orbprobe=1` | body → `#alx-screen-probe-host` → `TEST` |
| C — BODY ONLY | `?bodyprobe=1` | body → `#alx-body-probe` → `TEST` |

For each URL on iPhone Telegram Mobile: open once, reload/open once if needed, and report only `SINGLE` or `DUPLICATE`. No diagnostic panel is intentionally added. Do not use `diag=1` for these probes.

| Test | Result |
|---|---|
| A — `?screenprobe=1` | SINGLE / DUPLICATE |
| B — `?screenprobe=1&orbprobe=1` | SINGLE / DUPLICATE |
| C — `?bodyprobe=1` | SINGLE / DUPLICATE |

Do not call this fixed. Do not make a permanent change from these probes alone.
