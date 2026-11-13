---
id: WF-227
title: "Implement the diff-first Reviewing view"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-226]
created: 2026-09-08
---

## Outcome

The everyday Reviewing surface is the validated diff-first layout: a files panel (with the `f` Changed ↔ All toggle; unchanged files viewable and questionable), a diff versus the explicit basis in the middle, and a Discussions panel on the right with one navigable message list and a detail pane. Messages from other review points stay visible but de-emphasized; opening one moves the whole review to its origin point. A floating, centered review picker — styled after pi's `/tree` selector, not a center-panel mode — switches between review points, every point presented in the same layout. The visual chrome follows the existing product: the `QUIET_GRAPHITE`-class semantic theme, default pane widths (34 files / 40 discussions), `▌ Title FOCUSED` headings, rounded bordered panes on `surface`, and the `Question composer · file:line` box. The prototype on branch `prototype/wf-225-repository-now` (commit `9c9b90d`) records the validated interaction; it is not production code and is rewritten properly in this child.

## Interface

Render and interact through the WF-226 projections and commands; the view invents no records, no diff algorithm, and no message semantics. Keyboard model from the prototype: `Tab` panel focus, `j/k` movement, `Enter` jump/open, `a` compose, `f` scope toggle, `t` picker, `F3` What-will-be-shared preview while composing, `Esc` close, and pointer support consistent with the existing Reviewing view. The What-will-be-shared preview shows exact outgoing bytes and characters with no token estimates; opening it saves and sends nothing and is never a required step before asking.

## Module seam

The app view layer composes Workspace projections, Reviewing commands, and the Harness Interaction inspection projection. It must not read Workspace internals, page manifests, or construct Handoff payloads; semantic intent stays in named commands.

## Acceptance

- [x] Three panes with product chrome render at default and narrow widths; the files panel shows Changed/All with markers and per-file message counts; the diff is versus the explicit basis.
- [x] The floating picker opens over the review, lists review points with active markers and tree depth, and switches the whole review without changing the layout or checking anything out.
- [x] Other-point messages are visible and de-emphasized; selecting and opening one moves the review to its origin point and shows the origin's saved source.
- [x] Composing works from a diff line or a selected file (including unchanged files at `file:1`); `F3` shows the exact outgoing message and size and is optional.
- [x] Keyboard and pointer interactions survive restart state rules; no silent checkout, snapshot mutation, or automatic refresh.
- [x] Focused app suites, canonical verification, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with unrelated work unstaged.

## Constraints

- Consumes WF-226 records and WF-228's inspection projection; implements no outgoing-message semantics itself.
- The prototype's fixtures, reducer, and keyboard choices are reference material, not code to promote.
- Settle and commit this child's own pre-implementation Resolution before code.

## Resolution (settled 2026-09-08)

### Evolution, not replacement

The existing Reviewing view (`apps/neoflow/src/reviewingView.ts` and its model/application/scroll/highlight companions) already has files and questions panes, a diff, product chrome, scroll, and pointer support. This child **evolves that view in place** toward the validated diff-first interaction; no parallel new view, no second Reviewing surface, no prototype promotion. The prototype remains a reference for behavior, not code.

### What changes

1. **One message type everywhere**: the Question/Note/Change-Request compose paths and Q/R presentation collapse into the single message composer (`a` at a diff line, or on a selected file including unchanged files at `file:1`); the discussions panel shows one list (`#n file:line`), with other-point messages de-emphasized (marked and labelled with their origin basis).
2. **Opening an old message moves the review** to its origin basis and shows that basis's saved source; the review returns the same way it navigates today.
3. **Floating review picker**: `t` opens a centered `position: 'absolute'` overlay (the pattern the view already uses) listing the live basis, Git commits, saved points, and change-event nodes from WF-226's tree projection, with `●`/`○` active markers and tree depth. The diff-basis machinery stays: the diff is versus the explicit basis, and the picker changes which basis the review is on.
4. **Composer**: the existing composer box is retitled to the validated form (`Question composer · file:line`), single message, no quote-range selection; `F3`/preview shows WF-228's What-will-be-shared (exact bytes/characters, destination label, limitation lines) and stays optional.
5. **Clean checkouts and unchanged files**: the view's empty-diff states become ordinary states; the files panel's `f` toggle gains the All-files list.
6. **Keyboard/pointer model** from the prototype (`Tab`, `j/k`, `Enter`, `a`, `f`, `t`, `Esc`, `x`) is layered onto the existing key handling without breaking existing navigation rules.

### What does not change

Review Snapshots, refresh/pinning, Review coverage, Current/Previous Review transitions, scroll/highlight machinery, Accessible/presentation modes, and the no-replay/no-watcher invariants. Existing historical Questions/Responses of old Reviews stay readable.

### Open point — confirm evolve-in-place — settled (2026-09-08)

The user agreed. WF-227 evolves the existing Reviewing view in place; no parallel arrangement, no setting.

## Resolution status

**Settled and user-confirmed (2026-09-08).** The evolution scope, deltas, and untouched-list above are the committed pre-implementation basis. Implementation follows WF-226 and WF-228, whose records and contract this view consumes.

## Completion evidence (2026-09-14)

- The production view now presents one diff-first layout across Live Changes, saved Versions, captured Git review points, and change-event points. Its navigable file tree supports Changed/All scope, unchanged-file content, syntax highlighting, pointer selection, and persistent user-owned pane geometry.
- Files, Diff, Messages, and Message detail use model-owned pane-local scrolling with bounded projection traversal, selection reveal, oversized-row continuation, overlay scrollbars, and frame-coalesced rendering. Wide, balanced, linear, no-color, ASCII, and narrow-terminal presentations remain bounded.
- A real two-terminal session through Pi `0.85.1` sent and captured responses for live and saved-origin Messages. Opening an other-point Message moved the whole view to its immutable source; capturing and opening an uncaptured Git point never checked out the repository. Changed `HEAD` and dirty working bytes remained untouched, and an unchanged file was viewable and composable at line 1.
- The complete Vitest suite passes (40 files, 344 tests), including 17 application Reviewing scenarios and 25 Workspace Reviewing scenarios. All package and test typechecks, clean direct builds, build smoke, the end-to-end dogfood fault probe, formatting, dependency firewall, lint, and `git diff --check` pass on Node `26.5.1`; lint reports warnings only.
