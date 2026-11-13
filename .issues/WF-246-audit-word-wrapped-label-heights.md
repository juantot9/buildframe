---
id: WF-246
title: "Audit word-wrapped labels for implicit one-row heights"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

The WF-233 fix (a wrapped label without an explicit height renders one row and clips the rest) is confirmed to have no remaining instances: every `wrap: 'word'` label in the Reviewing view carries a height, and the two row-counted heights are computed from display-cell wrapping. The audit result is recorded instead of a speculative layout change.

## Finding

WF-233 found the one-row default clipping multiline labels in `messagePreviewOverlay` and the fix sized the material box from wrapped content. The earlier handoffs left an optional sweep open: grep for other `wrap: 'word'` labels without an explicit height. The view has four word-wrapped labels: the home-launcher and configuration descriptions (fixed `height: 2`), the preview body (`height: bodyRows` from `wrapDisplayCellRows`), and the preview material (`height: materialRows` from the same helper). The fixed two-row descriptions fit within two wrapped rows at the documented 80×24 and 100×28 sizes; the remaining wrapped text in the view uses one label per computed row rather than wrap mode.

## Interface

No interface changes. The record fixes the audit method (`wrap: 'word'` sites and their heights) so a future regression is caught by the same grep.

## Acceptance

- [x] Every `wrap: 'word'` label in the Reviewing view is enumerated with its height source.
- [x] The two computed heights derive from the same display-cell wrapping used for rendering.
- [x] The two fixed two-row descriptions fit at the documented test sizes.
- [x] No source change is claimed where none was needed.

## Resolution

The sweep found no label without an explicit height. `wrappedDiffRowHeight`/`wrapDisplayCellRows` cover the dynamic bodies; the two fixed-height descriptions are bounded at supported widths. No code change.

## Completion evidence (2026-09-16)

- Grep on `apps/neoflow/src` and `packages/*/src` returns four `wrap: 'word'` sites, all in `apps/neoflow/src/reviewingView.ts`: `homeLauncher` (`height: 2`), `messagePreviewOverlay` body (`height: bodyRows` from `wrapDisplayCellRows`), `messagePreviewOverlay` material (`height: materialRows`), and `configurationOverlay` (`height: 2`).
- The longest configuration description is 75 characters plus two leading spaces; at the documented 80-column width the overlay's content width is 68 cells, so it wraps to two rows. Below ~50 columns the fixed two-row height could clip, which is below the documented 80×24 minimum.
