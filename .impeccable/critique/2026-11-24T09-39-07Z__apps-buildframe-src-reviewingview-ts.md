---
target: WF-321 B batch 1 changes
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/juanan/Desktop/repos/neoflow/apps/buildframe/src/reviewingView.ts"
target_fingerprint: "sha256:846b0aa038b6526dd1f579116b51db7650e31e71b7a374a0acd1c8fdf84a7254"
target_path: /Users/juanan/Desktop/repos/neoflow/apps/buildframe/src/reviewingView.ts
timestamp: 2026-11-24T09-39-07Z
slug: apps-buildframe-src-reviewingview-ts
---
Method: design review only (detector not applicable: terminal UI; `impeccable detect` read the source and returned [])

Scope: WF-321 B batch 1 (uncommitted), judged against the 2026-11-23 capture and DESIGN.md.

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Past step lost Brass in the Diff title detail (fixed in-run) |
| 2 | Match System / Real World | 3 | unchanged |
| 3 | User Control and Freedom | 3 | unchanged |
| 4 | Consistency and Standards | 3 | Titles now follow the type scale; the strip no longer puts a wash behind one word; DESIGN.md not yet updated |
| 5 | Error Prevention | 3 | unchanged |
| 6 | Recognition Rather Than Recall | 3 | unchanged |
| 7 | Flexibility and Efficiency | 3 | unchanged |
| 8 | Aesthetic and Minimalist Design | 3 | Answer no longer printed twice; half the accent on title rows |
| 9 | Error Recovery | 3 | unchanged |
| 10 | Help and Documentation | 2 | unchanged |
| **Total** | | **29/40** | Good (was 27/40) |

Priority issues:
- [P1] Past step: `PAST · …` in the Diff title detail fell from Brass to Pewter. Fixed in this run: a tone override now holds across the detail.
- [P2] The always-reserved Message mark column takes 3 cells from the code on every file, against "The Code Keeps the Room". Fix: make it 2 cells (`●1` then the +/- column, no spacer).
- [P2] DESIGN.md is out of date for the ASCII focus marker (blank, not `|`), the strip's `▌`/`>` and the always-reserved column. Fix: update DESIGN.md in the same commit.
- [P3] Proposal 9 is half done: the answer is one tone, but `↳` lost its Sage and the card title is still all Sage. Fix: spans for the `↳` row; draw the card title inside the card so only the badge takes Sage.

Minor: "Say it once" now covers more cards; if the anchored line scrolls out of the Diff, the answer is shown nowhere in full (existing behaviour, now wider). Requiring the anchor row to be in the visible window would close it.
