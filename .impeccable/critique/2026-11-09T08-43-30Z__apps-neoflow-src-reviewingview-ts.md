---
target: Home screen (main view selector)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:ca6880cbca039e82d8113332818d112a69fdf1fa4377c5ecd91da46823326f83"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-09T08-43-30Z
slug: apps-neoflow-src-reviewingview-ts
---
Method: dual-agent (A: design review from 80 rendered frames · B: detector + contrast + frame checks)
Scope: Home only (launcher, commit picker, Previous Reviews). Not comparable to earlier Reviewing-screen scores.

## Design health: 24/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | "Inspecting…" said twice in picker |
| 2 | Match real world | 3 | "Review a commit or range" opens "Review other changes"; "Range to HEAD" jargon |
| 3 | User control | 3 | j wraps silently from last enabled choice |
| 4 | Consistency | 1 | No panes/title row/surface; picker jumps top-left; washes stop at label end |
| 5 | Error prevention | 2 | Green "Enter starts this Review" on 0 changed files |
| 6 | Recognition | 2 | Tab, n, r, g/G only in `?` |
| 7 | Flexibility | 2 | No direct launcher letters |
| 8 | Minimalist | 2 | Neoflow ×2; "Review…changes" ×3; "Previous Review(s)" ×5 |
| 9 | Error recovery | 3 | Empty comparison has no way on |
| 10 | Help | 3 | `?` covers title at 70 columns |

## Design specificity
Generic centred splash; the Review screen's Quiet Ledger language (header, history row, panes, `▌ Title FOCUSED`) is absent. Detector: 4 design-system-color advisories in non-default themes, none on Home. Contrast: all pass except muted on accentSoft (3.83/3.85, Graphite/Carbon) on history meta line (known gap).

## Priority issues
- [P1] Home ignores the product's layout: render header + history-style strip + one bordered `▌ Home FOCUSED` pane, top-anchored; picker and Previous Reviews reuse the pane.
- [P1] Selection differs from Review: full-row wash, bold Frost Text, accent on `›` only; one-row history items.
- [P1] Picker hides controls and misuses Sage: mode as label, `[Tab] commit/range` and `[/] search` in footer, preview in Frost/Pewter, 0 files in Pewter with a way on.
- [P2] Mid-word cuts at 70 columns and lost hanging indent: word wrap with indent.
- [P2] Repetition: drop wordmark and duplicate titles; pane title carries count.

## Persona red flags
Power user: no direct keys; invisible picker keys; double-spaced commit list. First-timer: "Range to HEAD"; green Enter on empty commit; silent wrap.

## Minor
ASCII collisions (`*` ×4, `-` for ◷ and separator, ◷→`*` vs `-`); mixed hash lengths; "[j/k] select" vs "[j/k] Review"; `[q]` dropped at 70 columns in picker; HOME source word unused.

## Questions
- Home as the Review layout with no Review open?
- Real Diff preview in the picker?
