---
id: WF-231
title: "Make Review open and Message send feel immediate"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
created: 2026-09-14
---

## Outcome

Opening the Current Review from Home and sending a Message from the composer both acknowledge the user's action immediately. The durable commitment still happens before any directive and no guarantee is weakened; what changes is that the surface stops waiting for the complete round trip before showing that the action was taken. Target: feedback within one frame, settled state within today's latency or better.

## Findings (2026-09-14, production socket runtime + real Pi 0.85.1 attachment)

Measured with Node against the built packages, 10 changed files × 200 lines, runtime process over the real socket:

| Phase | Time |
| --- | --- |
| `workspace.home` read | ~1 ms |
| `review.current-changes.start` (Home Enter) | ~320 ms |
| review bundle reads (7 parallel calls, as the app) | ~260 ms |
| `review.live-diff` window | ~105 ms |
| `harness.review-message.inspect-default` (Enter) | ~660 ms |
| `review.message.commit` (send) | ~750 ms |
| post-send refresh reads | ~1 ms |

Two structural causes:

- `#commitReviewMessage` re-runs the complete `#prepareReviewMessageInspection` (harness index, review index, basis record, current-changes capture, context capture, context verify, settled capture, state read) even though the inspection just ran against the same state version. The commit therefore pays a second full revalidation before the durable write.
- The app waits for the command result *and* the projection refresh before rendering the new message or the review, so perceived latency is the sum of the phases rather than the durable commit alone.

## Interface

- Optimistic local acknowledgement owned by the Reviewing application model: a pending outgoing Message entry appears immediately with a truthful pending state and reconciles with the durable projection or a rejection notice. It is visibly non-authoritative and never claims the Message was saved or sent.
- The equivalent for Home: pressing Enter paints the review shell immediately (header, panes, and the already-known live manifest when available) and fills in the rest as the bundle arrives, with the existing loading labels kept truthful.
- Commitment keeps its current semantics: exact inspection identity, atomic durable write, then one directive. Only redundant re-preparation work is removed, replaced by a targeted revalidation of the facts the inspection already proved (state version, source digest, destination identity and compatibility, exact material digest).

## Module seam

Optimistic display state stays in `reviewingModel.ts`; the workspace and Harness Interaction contracts do not learn about provisional UI entries. If targeted commit revalidation needs a narrower seam, it stays package-private inside Harness Interaction over the existing prepared-inspection facts. No new Workspace method, no weakening of the single-flight, exact-material, or no-replay rules.

## Acceptance

- [x] Enter in the composer shows the outgoing Message entry in the Messages pane within one rendered frame, before the command result; it reconciles to the durable Message or to a rejection notice with the draft preserved.
- [x] Enter on Home shows the review shell immediately; the Files/Diff/Messages panes fill in without an intermediate blank or misleading state.
- [x] A commit against an unchanged inspection no longer repeats the full preparation; measured inspect+commit drops materially while revalidation still fails closed on any movement (source, destination, state version, capability, availability).
- [x] Exact outgoing bytes, atomic commitment, one directive, idempotent replay, and the no-replay guarantee are unchanged; the existing Harness/fault suites still pass.
- [x] Focused application/Workspace suites, canonical verification, compiled risk probes, dogfood, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Optimism never becomes a second source of truth: provisional entries are never persisted, never dispatched, and never reported as saved.
- Do not trade safety for latency: no skipped revalidation of the exact destination, source, or material; no dispatch before durability.
- Keep the runtime and Workspace contracts intact; this is an application-feedback and internal-revalidation change first.

## Resolution (settled 2026-09-14)

"Immediate" means truthful local acknowledgement within one rendered frame. There is no arbitrary durable-round-trip SLA: the measured round trip must improve materially, but durability, exact revalidation, and directive ordering remain the controlling constraints.

Home paints a pending Current Review shell immediately. It does not present mutable working state as though it were the immutable Snapshot; Files, Diff, and Messages remain explicitly pending until one same-version Review bundle arrives.

Message submission likewise adds one application-local outgoing entry immediately. Its state distinguishes inspection, required confirmation, durable commitment awaiting projection, rejection, and unknown outcome. The entry is never persisted or dispatched by the application and never claims durability before the Workspace result proves it.

## Resolution status

**Confirmed by the owner (2026-09-14).** One-frame feedback is the product requirement; no 500 ms durability budget was added, and the pending Home shell is preferred over an early mutable working-state view.

## Completion evidence (2026-09-14)

- The Reviewing model now owns two application-local acknowledgement states in `apps/neoflow/src/reviewingModel.ts`: `PendingReviewShell` and `ProvisionalReviewMessage`. The same keypress that starts or opens a Review paints the pending shell (`beginPendingReviewShell`) and the same keypress that submits a Message paints one local outgoing entry (`requestMessageInspection('submit')` / `commitInspectedMessage`) before any read or command. The entry is never persisted, never dispatched, and never claims durability: its status is `inspecting`, `awaiting-confirmation`, `committing`, `saved-awaiting-projection`, `rejected`, or `outcome-unknown`. Rejection preserves the draft, unknown outcome says "do not replay", and settlement clears it when the matching durable projection arrives.
- The pending shell renders truthful labels only: `OPENING / PENDING`, "Snapshot evidence is pending; no source or Message projection is shown as settled yet", and a side pane stating `Projection pending`; no mutable working state is presented as the immutable Snapshot. `applyHome` completes the pending open and moves to the Review route, `failReviewOpen` restores Home only when an uncommitted optimistic open cannot materialize, and `applyReview` clears the shell when one same-version bundle arrives.
- `#commitReviewMessage` no longer re-runs `#prepareReviewMessageInspection`. It calls `#revalidatePreparedReviewMessageInspection`, which reuses the bounded prepared-inspection cache (keyed by exact inspection identity, pruned whenever the authoritative state version advances) and revalidates only mutable facts before mutation: state version and expected version, review-index currency, attachment availability plus compatibility identity and destination, live manifest `sha256`, exact outgoing material identity, exact source re-verification (`workspace.context.verify`) for live-origin targets, a fresh `workspace.current-changes.capture` for the commitment-time repository state, and `#snapshots.verify` on the retained capture witness. Any movement returns `inspection-changed` before the write; a cache miss keeps the complete fail-closed preparation path.
- Measured in the focused Workspace scenario (`commits a message against an unchanged file in a clean checkout`): full inspection 428–480 ms and cached commit 289–351 ms across three runs, where the original commit re-ran the complete preparation (recorded probe: ~660 ms inspect, ~750 ms commit on the production socket runtime). Commit is now ≈ 0.7× the full inspection instead of ≈ 1.1×.
- Application scenario coverage asserts the pending shell is painted before `execute` starts and shows no settled retention, that the local entry and `Checking` status appear less than 50 ms after Enter and before any directive or inspection result, that exactly one inspection read precedes the durable Message, and that the durable `#1` Message replaces the local entry. The existing gate, source-race, interruption, idempotent-replay, and post-commit-crash scenarios pass unchanged.
- Verification on Node 26.5.1: the complete Vitest suite passes (41 files, 354 tests); all package and test typechecks; clean direct builds of all four packages; build smoke; the compiled state/runtime/Pi risk probes; the compiled dogfood fault probe (updated only where the refined Messages pane replaced the removed detail-card wording); formatting; the dependency firewall; and `git diff --check` all pass with unrelated repository-health work unstaged.
