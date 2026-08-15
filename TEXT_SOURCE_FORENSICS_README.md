# ALX Oracle — ordinary text-source forensic build

Run the normal Oracle with `?debug=1&diag=1`. Do not use `screenprobe` parameters. This build does not change the Oracle decision, scene timing, CSS, renderer output, or typeText behavior; it only records DOM/text sources and lifecycle events in the temporary overlay.

At PHRASE and REVEAL, use `COPY DIAGNOSTICS`. The report includes every visible text-bearing element with innerText/textContent, tag/id/class, child count, computed display/visibility/opacity/z-index, and bounding rect; pseudo-element content; backgrounds/masks; canvas/SVG/iframe/shadowRoot; point stacks; snapshots; render counters; sceneId/requestId/timestamps; and type operation events.

When the visual duplicate is visible, press `HIDE PHRASE` without starting a new scene. Record whether both texts disappear, one remains, or nothing changes. Do not press `REMOVE PHRASE` before recording the hide result.

| Required result | Value |
|---|---|
| SECOND TEXT SOURCE | fill from evidence only |
| renderOraclePhrase calls | fill from TRACE_renderOraclePhrase |
| renderOrbText calls | fill from TRACE_renderOrbText |
| typeText calls | fill from TYPE events |
| sceneId/requestId | fill from lifecycle events |
| HIDE PHRASE result | A / B / C |

No permanent fix is included in this package.
