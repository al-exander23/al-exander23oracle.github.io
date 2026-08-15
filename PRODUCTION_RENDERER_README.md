# ALX Oracle — minimal PHRASE/REVEAL production renderer

This package changes only the visual PHRASE/REVEAL renderer and its text-layer CSS. It does not change `oracle.js`, `mixes.js`, data, Oracle selection, SceneController state transitions, `typeText()` implementation, or timings.

PHRASE now clears `#screenContent`, creates exactly one `.oracle-phrase`, assigns `textContent`, inserts it, and asserts one child/one phrase. REVEAL now clears `#screenContent`, creates exactly one `.mix-name`, assigns `mix.name`, inserts it, and asserts one child/one mix name. No renderer call uses `typeText()` or creates `.ch`.

The existing diagnostic overlay remains available for observation, but no new diagnostic modes were added in this stage.

Acceptance status at build time:

| Environment | 10 consecutive runs | Status |
|---|---:|---|
| iPhone Telegram Mobile | not executed by Manus | NOT TESTED |
| Desktop Chrome | not executed as the requested 10-run acceptance suite | NOT TESTED |

Do not call this `Fixed` until the user confirms 10/10 iPhone and 10/10 Chrome runs.
