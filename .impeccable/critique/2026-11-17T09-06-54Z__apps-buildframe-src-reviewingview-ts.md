---
target: new TUI commit-while-answering elements
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/Users/juanan/Desktop/repos/neoflow/apps/buildframe/src/reviewingView.ts"
target_fingerprint: "sha256:d3d6fe350b611ae4078e31b28e18f0556b99168f9dace86f8d9b4fdfaf97ffdf"
target_path: /Users/juanan/Desktop/repos/neoflow/apps/buildframe/src/reviewingView.ts
timestamp: 2026-11-17T09-06-54Z
slug: apps-buildframe-src-reviewingview-ts
---
# Critique: commit-while-answering TUI elements (dual-agent)

Score 24/40 (Acceptable). H1 2, H2 3, H3 3, H4 2, H5 2, H6 2, H7 3, H8 2, H9 3, H10 2.

Detector: exit 0; 4 advisory design-system-color flags (reviewingView.ts:146/172/175/205), all documented alternate-theme tokens, false positives, none in changed lines.

## Priority issues
- [P1] Commit notice never shows: same-Review reload (setLoading) clears notice; commitsBefore suppresses re-say. Keep outcome/commit notice across same-identity reload; compute against pre-reload history; assert status line in test.
- [P1] Any HEAD move called "committed" (reset/checkout/rebase). Record ancestry + commit count; "committed" only for descendants ("3 commits, newest X"), else "HEAD moved to X".
- [P1] Two "last commit"s: History "◆ start · last commit" (old base) vs Diff "since last commit" (new HEAD). Name hashes once a step carries a commit.
- [P1] ASCII "*" = connection, start, commit, code-changed. Use "@" for commit/start mark on Review screens; align global map.
- [P2] 12-char hash clipped to 8 in card at 100 cols, 3-row History note, commit sentence truncated from status at 80-100 cols. 7-char hash in notes/rail; drop History note when card shows it; lead step description with the commit.

## Minor
- Commit-only: Diff offers "[ shows what changed" but [ opens "before #1"; gates disagree.
- Diff title and sentence both say "no changes".
- Commit named hash+subject in Diff/description, hash-only in notes.
- History #1 row lacks ◆ while rail has it.

## Questions
- Should "now" keep showing the absorbed step instead of going empty?
- Subject first, hash second?
- Should a backward/sideways HEAD move read as Brass caution?
