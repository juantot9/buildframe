---
id: WF-047
title: "Choose the first dogfoodable vertical slice"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: JuanAn Aranda Triana
blocked_by: [WF-043, WF-044, WF-045, WF-046]
created: 2026-07-17
assets: []
---

## Question

Given the validated Module, runtime, persistence, Harness, TUI, and Editor seams, which narrow end-to-end Planning or Reviewing slice should become the first real dogfood path, what minimum shared spine must it exercise, what legacy code should disappear with it, and what observed workflow evidence determines whether to continue, revise the architecture, or amend the product blueprint?

## Blocked by

- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)
- [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md)
- [Validate the TUI implementation foundation](./WF-045-validate-tui-foundation.md)
- [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md)

## Resolution comment

Choose a narrow, standalone **Reviewing** slice as Neoflow’s first real dogfood path. Its primary route starts with `Review current changes`, creates one Review whose workspace-wide Change Set binds the exact current `HEAD` commit to the effective working state, and captures one immutable Review Snapshot containing staged, unstaged, and non-ignored untracked changes. Alternate refs, path scopes, index-only comparisons, Implementation Baselines, and other comparison forms remain outside this first slice.

The required end-to-end path is:

1. Start or reopen the retained Review from a minimal Home surface.
2. Navigate the Snapshot’s complete changed-file manifest and bounded immutable textual evidence in a keyboard-first unified diff.
3. Create one or more Question Annotation Drafts against exact old-side or new-side diff lines.
4. Commit those Questions as one immutable Review Batch and Direct Workflow Handoff to one compatible available attached Pi session for the same Workspace Identity.
5. Durably commit the Batch, Handoff, Commitment Receipt, Capability Snapshot, Invocation basis, and command result before any Pi effect; then record correlated start and terminal evidence independently.
6. Have the human mark each Question answered, still open, or dismissed. Pi settlement never creates a disposition.
7. Create a Review Result through one neutral `Finish review` action only after every Question is answered or dismissed. A still-open Question blocks ordinary finish. When no Questions were recorded, the Reviewing owner derives a no-recorded-findings Result locally without contacting Pi; the user is not asked to assert “no findings.” Escape or process exit remains non-semantic. An exact current-change inspection with zero changed files creates no Review, Snapshot, or Result and does not qualify as the no-recorded-findings dogfood case.

Post-dogfood, the launcher retains `Review current changes` as its one primary action and exposes `Review other changes` secondarily. This pulls forward only the local commit-comparison slice needed to avoid a historical-review dead end. One bounded commit browser shows history reachable from `HEAD`; Commit mode reviews one selected commit, Range mode uses the selected commit as the start to `HEAD`, `n` jumps to a first-parent start, and local hash/ref search reaches a specific commit. Preview is metadata-only and debounced; full exact capture starts only after the user confirms. Exact local endpoint resolution, immutable Snapshot capture, no fetch, no checkout mutation, dirty-working-state exclusion, and explicit merge-parent selection remain mandatory. P19 still owns the complete endpoint, scope, index, merge-base, special-file, and scale matrix.

This first Batch surface is discussion-only. It supports no Notes, Change Requests, Concrete Replacements, file-level findings, multi-line Anchors, mutation authority, or automatic inference from prose. Submission fails closed when the Pi Attachment, Workspace Identity, Handoff-specific Capability, or Availability evidence is missing. It provides no Mock, Claude, Manual Handoff, destination substitution, or automatic fallback.

A Snapshot is reverified before Batch commitment and Review completion. Relevant movement marks it stale and blocks those actions; this slice does not yet create a successor Snapshot or re-anchor drafts. Proven `rejected`, `failed`, `interrupted`, and `unresolved` Harness outcomes remain durable beside the untouched Batch and Questions. No outcome triggers automatic retry, and Explicit Resubmission is deferred rather than implemented without its duplicate-execution rules.

### Minimum shared spine

This is production-shaped architectural dogfood, not another UI prototype. It must use the selected launcher-connected per-workspace runtime, exclusive Workspace Writer, generation-switched `node:sqlite` Authoritative Workflow State, stable command identities, atomic semantic transitions, typed Workspace commands, scoped same-version projections, bounded Workspace Evidence reads, and post-commit Harness effects. The TUI cannot call Git, SQLite, IPC, or Pi directly or reconstruct workflow policy.

Build the slice only in the new projection-driven `pi-tui` application. Its Review workspace has changed-files, selected-diff, and Questions regions over one semantic region tree. `/` opens one read-only Search over the complete immutable Review Snapshot: case-insensitive file-path matches and added/deleted text matches return bounded result windows, disclose files whose changed text is unavailable, show a live bounded immutable-Diff preview for the selected result as the query or selection changes, and navigate to the exact file and Diff row without consulting current working bytes. It renders one bounded file/window at a time while preserving exact record and old/new line identity. Every Reviewing pane cycles at its edges: Files, Diff rows, and Questions move first↔last, and Search results do the same. Crossing a bounded window loads the exact wrapped target rather than stopping at an edge or merely selecting the first item in the destination page. Diff inspection switches locally with `v` between inline and side-by-side presentations without changing Snapshot or Anchor meaning. Code rows wrap by default with blank continuation gutters; `w` toggles no-wrap mode, where Shift+Left/Right scrolls code while line gutters remain fixed. The Files pane is toggleable with `s`. Files visibility and both preferred side-pane widths save immediately in versioned portable User Configuration outside the repository; viewport clamping affects only the rendered width, while focus, selection, and scroll remain ephemeral. In multi-pane layouts, Files owns its right border and Questions owns its left border: focused `Ctrl+h` moves that border left and focused `Ctrl+l` moves it right, and the center Diff receives or yields the bounded width. Immutable Snapshot navigation must not recapture the whole current workspace merely to render another saved file: the source Evidence identity remains a private fast-verification hint, concurrent same-Snapshot checks coalesce, and exact command-time verification still blocks stale commitment or completion. Wide terminals show all three regions; an 80×24 linear arrangement keeps the workflow keyboard-complete and preserves selection through reflow. No-color output and ASCII-safe chrome are required. Mouse interaction and configurable panes remain deferred.

The first slice is fully usable without Neovim. Editor Companion commands, markers, navigation, Artifact Buffer fallback, and TUI return flow remain a later vertical expansion rather than a hidden dependency. Closing either the TUI or runtime must not discard semantic progress: Home can reopen the retained Snapshot, Questions, Batch, Invocation evidence, dispositions, and Result without promising restoration of ephemeral focus or scroll state.

### Legacy cutover

Keep the repository buildable while constructing the path, but make dogfood readiness a hard cutover rather than maintaining two product architectures. After validated private mechanics and still-relevant tests have been transplanted behind the new Modules, remove the legacy `apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, and one-shot `nvim/` integration. Legacy Chat, Plan, Changes, Review, Mock, live-diff queue, mutable receipt, generic Harness, and shared-grab-bag behavior do not survive as compatibility paths. The first dogfood executable may expose Reviewing alone while later v1 slices are implemented.

### Learning gate

Require three real Review Passes over Neoflow changes before expanding the path: one neutrally finished with no recorded findings, one finished after a real Pi Question and manual disposition, and one reopened after TUI or runtime restart. Scenarios may overlap. Separately induce relevant Snapshot staleness and a non-normal Pi outcome and verify explicit blocking, durable retention, and no replay.

Continue when those scenarios reach truthful Review Results without data loss, legacy fallback, approximate Anchors, optimistic Harness claims, or confusion between terminal outcome and human disposition. Return to architecture work before adding features if dogfood forces the TUI to reconstruct workflow or Harness rules, splits one user action across independently committed transitions, permits effects before Durable Commit, requires whole-workspace or unbounded diff reads, produces mixed-version frames, cannot reconstruct from Authoritative Workflow State, or leaks Git, SQLite, IPC, or native Pi details through the Workspace Interface.

Amend the product blueprint only when repeated real use shows that a correctly implemented settled semantic rule—not omitted first-slice scope, an implementation defect, or an Interface violation—makes Reviewing misleading or impractical. Any amendment must cite the contradictory observations and explicitly change the authoritative lifecycle or domain language; implementation may not silently reinterpret immutable Snapshots, human disposition, Review Passes, Review Results, or another settled distinction.

No product term changed, and this decision adds no new ticket. It makes the existing verification, migration, packaging, and execution-planning questions precise enough to proceed.

### Post-dogfood amendment — replace staged completion with direct retained Q&A (2026-08-03)

The original steps 3–7 and three-Result learning gate are superseded by repeated contradictory human evidence. The corrected first value path is: navigate one immutable Snapshot; write one exact anchored Question; invoke one `Ask Pi` action that atomically commits its Question, singleton Batch, Handoff, Receipt, Capability Snapshot, and Invocation before dispatch; capture a complete correlated answer only under an explicit Result contract; and render that immutable Review Response directly in Neoflow. There is no user-visible Batch/Handoff staging, Question disposition, Finish action, no-findings outcome, or Review Result. The developer continues asking or leaves without Neoflow soliciting closure.

Starting another Review changes the Current Review pointer while retaining the former Review as Previous. Escape remains navigation only. The corrected human gate requires one responsive real-Pi Ask/Response shown in Neoflow, follow-up questioning without resolution ceremony, Current→Previous navigation and restart reconstruction, persistent salient Snapshot-staleness blocking, and one non-normal Pi outcome with no fabricated Response or replay. Historical dogfood Results remain valid retained records but are not acceptance evidence for the amended interaction.
