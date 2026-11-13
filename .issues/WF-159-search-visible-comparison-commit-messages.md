---
id: WF-159
title: "Search visible comparison commit messages"
status: closed
labels:
  - wayfinder:task
parent: WF-158
assignee: juanan
blocked_by: []
created: 2026-08-31
---

## Question

How should the private Reviewing Application let `/` search the messages already present in its bounded comparison projection, while clearly distinguishing exploratory search from an intentional exact revision outside that window?

## Acceptance evidence

- Disclose the existing projection truth on the ordinary comparison surface: when `ReviewCommitGraphView.truncated` is true, say that the newest 500 commits reachable from HEAD are shown, `/` searches only those shown messages, and no fetch occurs. `G` remains the oldest shown commit, never a claim about repository history.
- Reassign `/` from exact revision entry to one ephemeral, in-place comparison-message search over only the commit rows already held in the current `ReviewCommitGraphView`. Match case-insensitive substrings of projected commit subjects in exact projected order. Load no additional history, traverse no off-window commit, add no Workspace read/Interface/projection field, and do not persist a query.
- Search opens with the current projected commit selected and an empty query. Typing, paste, cursor editing, Backspace/Delete, Ctrl+U, and spaces remain search-owned under a normalized 256-byte limit. Up/Down cycles only matching rows; Page Up/Down remains bounded within matches; pointer clicks select one visible result without preview or activation. Empty and no-match states remain explicit and bounded.
- Keep search selection provisional. Enter closes search, selects that existing projected commit, and requests the existing comparison preview at most once when selection changed; it never starts a Review or changes State. Esc cancels and restores the exact prior commit, merge-parent choice, and preview without a read. The fixed three-row preview and one-row ordinary action strip do not move across search open, query, selection, no-match, cancellation, or acceptance.
- Move the existing exact local hash/branch/tag input to direct key `r`. Its validation, existing comparison-preview read, range/commit mode, diagnostics, merge-parent behavior, and ability to inspect an intentional revision outside the newest-500 projection remain unchanged. `n` retains the existing HEAD~N range of 1–500.
- Update the selected WF-158 discovery structure rather than adding another help system: the adaptive strip exposes `/` search, the read-only lookup lists `/` message search and `r` exact revision, and contextual search/revision inputs retain their own instructions and Space/Esc/Enter ownership. `?`, Home/commit click-selection-only behavior, and Enter-only workflow activation remain unchanged.
- Extend owner-local real-Workspace/OpenTUI scenarios to prove 510 commits still project exactly 500 with `truncated: true`; search finds first/middle/last shown subjects at 132x50 and 80x24; an omitted subject is not found; input and pointer movement emit no read; Enter emits at most the existing one preview read and zero commands; Esc/no-match preserve selection and preview; `r` still resolves an exact omitted commit; State/Git/working bytes remain unchanged; true-color and no-color/ASCII frames remain complete.
- Verify on Node 26.5.1 with pnpm 11.20.0 through focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check`. Then rebuild the disposable WF-158 Scenario C executable and obtain a genuine human verdict on bounded scope, message search, exact revision discovery, command presentation, and perceived loading before closing WF-159 or WF-158.

## Authority

- Human-selected scope and paused acceptance: [Present a compact contextual action lookup](./WF-158-present-compact-contextual-action-lookup.md)
- Bounded graph geometry: [Keep bounded comparison preview visible](./WF-155-keep-bounded-comparison-preview-visible.md)
- Existing projection owner: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)
- Human gate: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)

## Seam decision

The Workspace already supplies exactly the bounded facts required for this search: commit identity, subject, decoration, parents, order, and `truncated`. Keep filtering, provisional search selection, key ownership, and geometry inside the private Reviewing Application model/view seam. The existing Workspace comparison-preview Interface remains the only route for an accepted shown result or an intentional exact revision. This preserves Module depth instead of exporting a second commit-search Interface for 500 already-owned rows.

## Constraints

- Do not search all reachable history, add Git `--grep`, paging, lazy fetch, cache, a time horizon, a second graph request, new projection fields, or an off-window message read. The accepted exploratory scope is exactly the newest-500 projection already displayed.
- Do not remove exact hash/branch/tag comparison, reinterpret `r` outside comparison mode, widen HEAD~N beyond 500, or make a search-result click preview/start anything.
- Do not create a generic search, input, command-registry, modal, or renderer abstraction; do not add a dependency or package Interface.
- Do not change comparison command fields, State transitions, durable bytes, diagnostics, Git checkout, target safety, historical detail, moved-HEAD continuation, header/latency work, P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Outcome (2026-08-31)

Production commit `06a2d207bf3ff647ab2995d8a774920bc93530e1` keeps commit-message discovery wholly inside the private Reviewing Application seam. `/` now filters case-insensitive subjects already present in the bounded projection; search selection, cycling, paging, pointer movement, cancellation, and empty/no-match presentation remain ephemeral; Enter delegates once to the existing selected-commit preview path. `r` owns the unchanged exact local hash/branch/tag input. The ordinary comparison view truthfully says when the newest 500 commits are shown and identifies `G` as oldest shown. No Workspace read, Git operation, projection field, durable fact, command, dependency, or package Interface changed.

Owner-local real-Workspace/OpenTUI evidence uses 510 zero-padded sanitized commits and proves exactly 500 projected commits with `truncated: true`. First, middle, last, case-insensitive, and omitted-window queries behave within that projection at 132x50 and 80x24; Up/Down, Page Up/Down, paste, and pointer selection issue no preview read; Esc and no-match preserve the prior preview; accepted changed selection issues exactly one existing preview read and zero commands; `r` resolves one exact omitted commit. Fixed preview/strip geometry, true-color, no-color/ASCII output, State version, Git HEAD/order, and working bytes remain unchanged.

Application typecheck and all 27 Application tests pass. Canonical verification passes 26 files / 148 tests, all four compiled State/Runtime/Pi/dogfood risk probes pass, and `git diff --check` passes on Node 26.5.1 with pnpm 11.20.0. The first canonical command let a nested package script resolve the Homebrew/Corepack launcher and ended before tests in its package-manager retry code; prepending the required pnpm 11.20.0 launcher directory removed that invocation error, after which the complete gate passed without a waiver.

The actual acceptor reran the built commit in Warp Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64 release `25.6.0`, Node 26.5.1, true color, at 155x50 against a fresh sanitized 510-commit fixture. They accepted the corrected interaction with “I like it,” reported that loading “felt good,” and reported no new confusion. They also made performance a standing expectation for every interaction rather than a one-time benchmark. Bounded postinspection found State version 2, two Reviews, exactly 500 projected commits with `truncated: true`, 510 Git commits, one working-status row, and unchanged Git/working-byte digest. The executable, runtime, and socket retired with no residual process.
