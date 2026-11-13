---
id: WF-235
title: "Retire disconnected Harness attachments and explain a refused Message"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

A restarted or exited Harness session stops being a candidate for new Messages, so the default route keeps working with the one attached session the operator is actually using. A Message that genuinely cannot pick a destination states why in human words instead of echoing a raw reason code.

## Finding

While testing WF-234, sending a Message failed with `Message unavailable: attachment-selection-required.` The owner's persisted index held three attachments from three Pi launches; only the newest was `available`, and the two older ones were `blocked / disconnected`. The Workspace runtime map that backs the default inspection was never pruned when a bridge disconnected, so every ended Pi session stayed "live and capable" for the lifetime of the Neoflow process. From the second Pi launch in one Neoflow process onward, the default route always saw two or more capable attachments and refused every Message, and the Reviewing surface had no way to select between them.

## Interface

An attachment whose recorded availability is `blocked / disconnected` is excluded from the default-route candidate set, and the three default inspections (Message, Ask, Handoff) share one candidate definition. The runtime adapter entry itself is deliberately retained: a queued disconnect observation from an older runtime generation can arrive after a newer connection established, so deleting on that observation would wrongly strand a reconnected session. A genuinely ambiguous refusal keeps the existing reason code, but the Reviewing status line explains it in a sentence; raw reason codes stay in the provisional card detail.

## Module seam

Candidate selection stays inside Harness Interaction: the runtime adapter map never becomes durable state, no record or command changes, and the explicit `attachmentIdentity` inspection and commit contracts are untouched. The friendlier notice is presentation only in the Reviewing model.

## Acceptance

- [x] A disconnected attachment stops counting as a live candidate for default Message, Ask, and Handoff inspections.
- [x] With one disconnected and one connected capable attachment, the default Message inspection resolves to the connected attachment without a selection step.
- [x] Two connected capable attachments still report `attachment-selection-required`, and a reconnected session becomes a candidate again on its next observation.
- [x] A refused Message states the situation in human words; unknown reasons keep the existing diagnostic.
- [x] Focused Harness Interaction and application scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

The runtime adapter map is a process-local cache, not durable truth: the attachment index already records `blocked / disconnected` when the bridge drops, so default-route candidacy follows that durable availability instead of the cache. Choosing among several *connected* sessions stays an explicit human decision rather than a silent guess, but the refusal now explains itself because the owner cannot otherwise tell why a Message was not sent.

## Completion evidence (2026-09-15)

- The three default inspections now build their candidate list from one shared pair of helpers: attachments with a matching live adapter and, for capability, the direct `submit-review-batch` Handoff. `blocked / disconnected` attachments are excluded before capability is considered, and blocked-but-connected attachments still surface their truthful availability reason on the explicit preparation path.
- The Reviewing model maps the unavailable inspection reasons to sentences: a second attached session, an exited session, an unknown or busy Harness, and an unsupported capability each say what to do; unrecognized reasons keep `Message unavailable: <reason>.` and the provisional card keeps the raw reason code.
- Harness Interaction scenarios cover the disconnected route on both the Ask and Message inspections, including the reconnect direction: the remaining session answers while the other is disconnected, genuine ambiguity returns when both are connected, and both disconnected reads as `attachment-not-live`.
- Verification on Node 26.5.1: the 41-file/357-test suite, lint, format, dependency firewall, typechecks, clean builds, build smoke, the compiled dogfood fault probe (whose queued-evidence reconnect flow caught an earlier eager-retirement attempt), and `git diff --check` pass with unrelated repository-health work unstaged.
