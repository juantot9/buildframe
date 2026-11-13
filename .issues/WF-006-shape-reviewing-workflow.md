---
id: WF-006
title: "Shape the Reviewing workflow"
status: closed
labels:
  - wayfinder:prototype
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-002, WF-003, WF-004, WF-018, WF-019, WF-020]
created: 2026-07-14
assets:
  - "git branch prototype/reviewing-workflow at 83e6286"
  - "apps/tui/prototypes/reviewing-workflow/ on that branch"
---

## Amendment (2026-09-08)

[Reframe Reviewing around the current repository](./WF-225-reframe-reviewing-around-the-current-repository.md) and its confirmed child map reshape the Reviewing lifecycle this issue shaped. The diff-first comparison basis, durable reviews, and immutable snapshots remain; superseded for Reviewing are: the Annotation taxonomy of separate Questions/Notes/Change Requests/Concrete Replacements (one message type now; intent lives in the words and the Harness's action), the grouped `Submit review` Batch and `Finish review` ceremony (already removed; one ordinary Ask), and anchored-draft composition (a message is composed at a location and sent). Planning keeps the original semantics. Historical code is viewed at saved review points; a future apply-a-tree-leaf action is parked in [Apply a review tree leaf to current files](./WF-229-apply-a-review-tree-leaf-to-current-files.md).

## Question

What end-to-end Reviewing lifecycle—from choosing a change set and navigating evidence through anchored feedback, grouped submission, harness response, re-review, resolution, and exit—feels precise and trustworthy without becoming slower than ordinary code review?

## Blocked by

- [Learn from Plannotator’s artifact-review loop](./WF-002-learn-from-plannotator.md)
- [Establish Claude Code’s integration envelope](./WF-003-establish-claude-code-integration-envelope.md)
- [Establish Pi’s integration envelope](./WF-004-establish-pi-integration-envelope.md)
- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md)
- [Probe Pi’s attached-session guarantees](./WF-019-probe-pi-attached-guarantees.md)
- [Probe Claude Code’s attached Plan and Review paths](./WF-020-probe-claude-attached-paths.md)

## Resolution comment

Reviewing is one durable, diff-first lifecycle over immutable **Review Snapshots**. Entry resolves the current checkout against an explicit locally available comparison basis—offering a remembered local target ref where one exists and asking for an exact selection otherwise—then shows the exact comparison, selected files, and supporting context. Choosing it immediately captures the snapshot without another confirmation. A change to a resolved comparison input or selected review-context source makes that Snapshot stale; unrelated workspace changes outside its scope do not. Changes never refresh the displayed diff or move Anchors automatically.

Annotations remain local editable drafts while the human navigates evidence. Their explicit intent carries authority: Questions and Notes are discussion-only, while Change Requests and Concrete Replacements authorize only their bounded anchored scope. An unambiguous `Submit review` action is its own Consent Boundary; one compact composed gate appears only for mutation authority, sensitive disclosure, Capability Downgrade, destination change, unresolved activity, or another material ambiguity. The action or gate names the exact Snapshot, destination, finding scope, mutation-authorizing count, and any material capability limitation before freezing the drafts as an immutable **Review Batch**.

The handoff is capability-honest rather than artificially uniform. Attached Pi may receive a batch directly, but Neoflow waits for observed start and final settlement rather than trusting submission return; a question-only batch requires the verified request-scoped registered read-tool gate. Attached Claude Code prepares the batch and shows the user-invoked `/neoflow:review` path; correlated hooks—not a Neoflow button pretending the command ran—begin and settle its invocation. Claude has no host push or foreground cancellation, and discussion-only intent must not be presented as mechanically enforced read-only policy. Neither harness may silently receive a batch in another session or checkout.

Harness settlement appends only its own lifecycle evidence; it never mutates the Commitment Receipt or Batch, marks a finding addressed, or proves a correct patch. If a resolved comparison input or selected review-context source changed, Neoflow preserves the reviewed Snapshot and marks it stale. Explicit refresh captures a successor Review Snapshot only when the captured inputs or content differ; an unchanged refresh reuses the existing Snapshot. A successor presents Re-anchor Mapping candidates for human confirmation. Every submitted finding remains in the re-review queue until the human marks it addressed, still open, or dismissed.

One neutral `Finish review` action creates a durable **Review Result** against the exact current snapshot. The Reviewing owner derives no recorded findings when none exist; the user is never asked to assert “no findings,” and no LGTM turn reaches the harness. Recorded findings require final human dispositions before ordinary finish. The user may instead choose an explicit `Finish with unresolved findings` action that shows and preserves the unresolved count. Escape, navigation, and process exit leave the Review active rather than implying completion.

Cancellation durably archives the Review without deleting snapshots, drafts, batches, findings, or receipts and does not depend on stopping Harness execution. During an active Pi Invocation, Neoflow may also record a Direct Request interruption intent; attached Claude Code instead directs the user to pursue interruption in Claude. Only correlated Terminal Evidence may establish that the Invocation was interrupted. Missing terminal evidence, disconnect, session or workspace change, or ambiguous interruption leaves the Invocation active or unresolved as the evidence permits, retains the Batch and queue, and never triggers automatic resend.

Validated visual behavior prototype: `apps/tui/prototypes/reviewing-workflow/` on branch `prototype/reviewing-workflow`, commit `83e6286`.

### Post-dogfood amendment — direct Questions, visible Responses, and retained Reviews (2026-08-03)

Repeated real use rejected the staged `save Draft → commit Batch → commit Handoff → inspect Pi elsewhere → record disposition → finish` interaction even though every underlying semantic record was truthful. The user expects one direct Question interaction, the answer in Neoflow, and no product-mediated judgment about whether the answer resolved anything. This is contradictory evidence against the lifecycle itself, not visual polish.

`Ask Pi` is now one Consent Boundary. From an exact Anchor, one action atomically commits the Question, singleton Question Batch, destination-scoped Handoff, Commitment Receipt, frozen Capability Snapshot, Invocation basis, and command result before dispatch. Batch and Handoff remain durable truth but are hidden mechanics rather than user staging buttons. A Capability with a complete correlated answer contract may produce one immutable Review Response, which Neoflow renders directly beneath the Question; surrounding Harness transcript remains excluded. Terminal settlement alone creates no Response, and a Response creates no disposition.

Discussion-only Questions require no answered/open/dismissed judgment. The developer may ask another Question, navigate away, or start another Review without Neoflow asking whether anything was resolved. Reviewing has no Finish action, Review Pass, no-findings outcome, or Review Result. Escape remains non-semantic navigation. Starting another Review atomically makes it Current and makes the former Current Review Previous; this changes only ordinary continuation, never completes, cancels, archives, deletes, or judges the former Review. Previous Reviews retain exact Snapshots, Questions, Responses, Handoffs, and evidence for later inspection. Historical Results and dispositions already committed by dogfood remain readable facts but do not govern the amended interaction.
