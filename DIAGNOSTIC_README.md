# ALX Oracle — temporary Telegram Mobile diagnostic version

This is a temporary diagnostic build. It does not contain a bug fix and does not change SceneController, Oracle selection, scene timings, or the typewriter algorithm. The only code changes are a conditional overlay activated by `diag=1` and observation callbacks at existing `TYPE START`, `TYPE COMPLETE`, and `TYPE ABORT` points.

## GitHub upload

Upload the contents of this directory to a temporary branch or temporary repository. Do not overwrite the production branch until the diagnostic run is complete. GitHub Pages must serve the branch/repository.

## Telegram launch URL

Open the published page in Telegram Mobile with:

`https://YOUR-PAGES-URL/?debug=1&nofx=1&diag=1`

The overlay is disabled unless `diag=1` is present. It stays on top of the app and refreshes automatically.

## Test sequence

Open the URL in Telegram Mobile. Leave the overlay visible. Start the Oracle once and wait until the visual duplicate appears. Without starting another scene, read or copy the report using `COPY DIAGNOSTICS`. Repeat for runs 1–3 if desired, copying each report separately.

The report includes `[ALX RUNTIME]` fields, `[ALX DOM]` counts, `[ALX TYPE]` active operations and IDs, `[ALX SCREEN]` properties, and `[ALX RESULT]` flags. The copy button uses the browser clipboard; if Telegram rejects clipboard access, select the report text manually.

Remove this diagnostic branch/files after the investigation. This package is not a permanent fix.
