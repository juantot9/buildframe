---
id: WF-092
title: "Prove Live Changes integration and human acceptance"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-091]
created: 2026-08-09
---

## Question

Does the complete P16B path preserve truth, bounds, atomicity, compatibility, and responsiveness under integration faults and fresh human use?

## Blocked by

- [Continue a frozen range Review into Live Changes](./WF-091-continue-frozen-range-to-live-changes.md)

## Acceptance evidence

- Canonical verification and all four v1 risk probes pass under the declared Node version.
- End-to-end faults cover unchanged reuse, successor creation, source races, missed/duplicate hints, restart, post-commit/pre-effect death, no replay, exact historical navigation, whole-file Anchors, and frozen-range continuation.
- Existing immutable-Current Reviews remain readable and no canonical serializer rewrites stored digests.
- A fresh human pass accepts Live Changes, Versions, historical Question navigation, composer blocking, and continuation; the compact record names build, environment, scenario, outcome, and confusion without sensitive content.
- Any learning-gate condition returns to its owning child rather than weakening the accepted semantics.

## Progress (2026-08-09)

The automated integration gate is green on Node 26.5.1. `pnpm v1:verify` passes all 103 tests, dependency firewall, typecheck, isolated-declaration builds, and build smoke. All four compiled risk probes pass: Authoritative State, Local Runtime, reviewed Pi 0.80.6 Adapter, and end-to-end dogfood. `git diff --check` is clean.

A new compatibility regression installs a pre-lineage immutable Current index, opens it through Workspace Home and Versions, and proves the immutable Snapshot payload/content bytes and State version remain exactly unchanged after reads. The existing integration scenarios jointly cover unchanged Ask reuse, successor creation, source races with no effect, duplicate/missed hint recovery, whole-file Anchors, exact historical navigation, restart, post-commit/pre-effect death, no replay, and frozen-range continuation.

The first Local Runtime risk run observed one launch-storm rejection that did not reproduce in the package run or four immediate standalone repetitions. Its early-assertion cleanup could leave storm controllers live and mask the original failure with a recursive-remove race; the probe now aborts every storm controller in `finally` and prints the complete closed result set on any future rejection, without retrying or weakening the assertion. The compiled probe passes after that correction.

The first fresh human pass found: Live Changes/Versions functioned, with visual redesign explicitly deferred to later work; historical Question navigation did not work; the changed-composer case could not start because the acceptance fixture had no Pi Attachment; continuation remained untested. The failed cases returned to their owning Modules rather than weakening the gate.

The Question failure exposed two real coordinate defects. Application omitted the selected Live row pair from Ask, so durable Questions lacked direct historical presentation coordinates. When coordinates are present, Live and immutable Snapshot row identities differ by generation; Workspace now verifies the Live row coordinate but persists the equivalent immutable Snapshot row identity, while the renderer maps that identity back to the visible Live row only when appropriate. For existing coordinate-free Questions, a bounded owner-side `review.question-location` lookup resolves the exact immutable file and Diff row on demand; the TUI no longer guesses or scans durable records itself. Clicking an anchored Question now has a real cross-file regression that enters its immutable Version.

The no-Attachment case exposed a fixture/ordering problem rather than a semantic dependency: ephemeral composition and target-change detection do not require Pi availability. The composer now opens without an Attachment, checks target generation before reporting attachment availability, preserves text, and commits no effect. Attachment inspection remains mandatory at actual Ask submission. A dedicated no-Attachment scenario proves `TARGET CHANGED`, preserved text, generation-first blocking, zero State movement, explicit reselection, and later truthful Attachment unavailability.

After these corrections, `pnpm v1:verify` passes all 104 tests and all four compiled risk probes pass again on Node 26.5.1. The acceptance fixture was reset with a deliberately coordinate-free historical Question and no Attachment so the exact failed paths can be retried. The remaining human items are that retry and frozen-range continuation. Do not close this issue or WF-079 from automated evidence alone.

## Progress (2026-08-10)

Second fresh human pass on commit `83ecf75`, Node 26.5.1, against the reset acceptance fixture (coordinate-free historical Question, no Pi Attachment). The acceptor chose deferral for both presentation findings, so the semantics are accepted and the learning gate did not fire.

- Historical Question navigation: clicking the coordinate-free fixture Question now enters its exact immutable Version (`VERSION 1/1`, `Immutable Snapshot`, `review.txt`) — accepted. Confusion: the full-screen transition appears suddenly and makes the screen jump. Deferred directive: historical navigation should open a navigable bounded dialog/modal instead of replacing the reading surface; this aligns with the accepted visual language reserving fully bounded surfaces for focused reading.
- Changed-composer without Pi Attachment: external modification during composition surfaced `TARGET CHANGED` with generation-first blocking and preserved text — accepted. Confusion: the changed-target message adds cognitive weight while the user is already reading code. Deferred directive: convey target-change blocking with less cognitive weight.

Both directives are inputs to the deferred Live Changes/Versions visual and interaction redesign; the P16E quality gate, which includes fresh human semantic and UX acceptance, is the enforcing downstream gate.

The continuation retry did not exercise the moved-HEAD choice. The first external “move” was a reflog-confirmed no-op reset to `HEAD`, so `C` truthfully took the unchanged-HEAD direct path and retained the range as Previous supporting context. Later real commits occurred after that continuation, when the fixed range was no longer the Current Review; continuation is intentionally available only from a Current fixed Review. Automated evidence still covers both moved-HEAD choices, but it does not substitute for the remaining human pass.

Additional deferred interaction directives from this pass:

- Keep the code-reading surface clean: do not add a persistent `HEAD MOVED`/continuation line. `C` should open a focused dialog/modal that explains what changed, why the unavoidable basis choice exists, and the effect of each option in user language; do not burden the user with internal command/action context.
- A successful continuation should update the Review in place rather than visibly navigate Home and back.
- Commit navigation should not reload parent/commit/changed-file regions in a way that makes focus and keyboard controls jump; commits should be clickable with the same affordance as Home.
- The command bar should present a stable, intentional set of every available command except those deliberately discoverable under `?`; per-pane visibility needs analysis so useful commands do not appear and disappear unexpectedly.
- One-line continuation notices and the continuation lifecycle were too easy to miss. The product should keep the user focused on viewing code in the chosen form and asking Questions, exposing only necessary decisions with clear context.

Frozen-range continuation (saved-endpoint choice starts nothing, current-HEAD choice starts a new Current Review) remains untested by the acceptor, so this issue and WF-079 stay open.

## Progress (2026-08-12)

The final fresh continuation pass ran the dogfood build at `5ce7a1b` (production code unchanged from `83ecf75`) on Node 26.5.1 through the real Local Runtime, using the Terminal theme and the prepared acceptance fixture. Workspace inspection before launch proved one Current fixed range with saved endpoint `e43cb6e…`, current HEAD `af93cfe…`, `headMoved: true`, and one direct unblocked current-HEAD action.

The acceptor exercised both choices. Saved endpoint started no Review; current HEAD started exactly one new Current Review. Durable inspection proves Reviews increased only from 10 to 11, the new Current Review `rev_509…` links to source range `rev_f111…`, that range remains the newest Previous Review with its exact `rsn_8ab…` Snapshot identity and zero Questions unchanged, and Git HEAD remains `af93cfe…`. The command ledger accounts for every State version: v22 was Local Runtime disconnect evidence, v23 Pi availability evidence, v24 the sole `review.comparison.continued-live` transition, and v25 shutdown evidence. No saved-endpoint command or Review transition exists.

Confusion: the continuation dialog's background is transparent under the Terminal theme, so Diff text bleeds through and harms legibility. This joins the already-deferred dialog/modal redesign directives; it does not change the accepted continuation semantics. An earlier long-lived session did not make choice mode clear. A new production-IPC regression at `113d0e6` starts the range through the live Application, moves HEAD while it remains open, receives the same-State fallback refresh over Local Runtime, and enters mandatory choice mode; the anomaly did not reproduce across that exact Interface route.

On `113d0e6`, `pnpm v1:verify` passes the dependency firewall, all 105 tests, typecheck, builds, and build smoke. All four compiled risk probes pass again: Authoritative State, Local Runtime, reviewed Pi 0.80.6 Adapter, and end-to-end dogfood. `git diff --check` is clean; the unrelated local `package.json` package-manager bump remains excluded.

## Resolution comment

Yes. The complete P16B path preserves immutable Snapshot and Anchor truth, bounded owner-side reads, atomic successor and continuation transitions, compatibility with pre-lineage Reviews, no replay, and responsive same-State Live Changes verification. Automated faults and final human use accept historical Question navigation, generation-first composer blocking, and both frozen-range continuation outcomes. Presentation and interaction findings are preserved as explicit inputs to the deferred Live Changes/Versions redesign and remain subject to P16E's fresh UX gate; no accepted semantic rule was weakened to accommodate them.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- P16B and P16E evidence in [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
