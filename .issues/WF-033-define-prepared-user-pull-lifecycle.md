---
id: WF-033
title: "Define prepared User Pull lifecycle"
status: closed
labels:
  - wayfinder:grilling
parent: WF-001
assignee: JuanAn Aranda Triana
blocked_by: [WF-017]
created: 2026-07-16
assets: []
---

## Question

What durable states and evidence govern a v1 User Pull from exact Handoff preparation through one atomic Harness claim and correlated start—including user withdrawal before pull, duplicate or late commands, cancellation races, Attachment Identity or capability change, bridge or TUI loss, restart, expiry, no-start, and resubmission—so Neoflow can distinguish proof that execution never began from an unresolved possibility without calling local preparation Harness rejection or interruption?

## Blocked by

- [Test the blueprint for completeness](./WF-017-test-blueprint-completeness.md)

## Resolution comment

Treat a User Pull Preparation and its later Invocation as separate durable lifecycles. Preparation is local authority for one future retrieval; an Invocation exists only after one exact harness command atomically claims that authority.

Preparing a User Pull durably commits one exact Workflow Handoff, Commitment Receipt, and one-use Preparation before exposing the harness action. The Preparation references the immutable payload, Attachment Identity, frozen Capability Snapshot, consent scope, route prerequisites, and an opaque one-use claim handle without duplicating sensitive content. Its durable lifecycle is `prepared` followed by exactly one terminal disposition: `claimed`, `withdrawn`, or `expired`. Current route Availability is a separate projection: a transiently unreachable bridge can make an open Preparation unclaimable without pretending it ended. Preparation creates no Invocation and proves no harness activity, but an open Preparation reserves the Attachment Identity’s single-flight slot because it can still authorize work at any moment.

The displayed harness action must identify that exact Preparation, never resolve an unqualified command to whichever Handoff happens to be newest. A reviewed Adapter may first durably arm one command occurrence using its session, prompt, and canonical-workspace identity, as Claude Code requires; arming is correlation evidence only and neither consumes the Preparation nor creates an Invocation. The Workspace Writer then accepts at most one claim by atomically revalidating the one-use handle, exact Attachment Identity and checkout, immutable Handoff payload, frozen contract, current ability to honor that contract, protocol deadline, and single-flight invariant; marking the Preparation claimed; binding the exact command occurrence; and creating one Invocation in `awaiting start`. The exact payload may leave Neoflow only after that Durable Commit succeeds, so recovery can never expose a payload while retaining an apparently unclaimed Preparation.

A claim proves that Neoflow accepted one correlated harness request and authorized the payload response. It does not prove that the response reached the Harness, that the Harness accepted a turn, or that model or tool execution began. A duplicate callback for the same command occurrence is idempotent and resolves to the existing claim; a fresh command occurrence using the consumed handle receives no payload and creates no second Invocation. Unknown handles, mismatched sessions or checkouts, resolver calls outside their protocol window, and commands arriving after withdrawal or expiry fail closed with the exact reason. They do not fall through to another open Preparation and are not Harness rejection or interruption.

Withdrawal is available only while the Preparation remains open. It is a fluid durable local action, and Workflow Cancellation atomically withdraws an open Preparation as part of ending active work. Withdrawal and claim are serialized by the Workspace Writer: if withdrawal commits first, every later claim is refused and no Invocation existed; if claim commits first, withdrawal is too late and the resulting Invocation must be handled through Workflow Cancellation and the declared Interruption Route. Neither action rewrites the immutable Handoff or Commitment Receipt.

Expiry before claim is likewise terminal and records the exact semantic reason and evidence. V1 does not invent an arbitrary age-based timeout: elapsed time alone does not end consent. Expiry occurs only at a disclosed route deadline or when a required invariant is durably disproved—for example explicit switch or detachment, replacement or loss of the bound session or checkout, or inability of the current reviewed Adapter to honor the frozen Capability Snapshot. A merely transient bridge or TUI outage leaves the Preparation open but unavailable until the same identity and contract are revalidated. A stronger later Capability does not upgrade the frozen contract; an incompatible one cannot silently downgrade it. Once identity loss or incompatibility is established, reattachment cannot revive the old Preparation.

Correlated start is a later durable fact against the Invocation. For Claude Code Review, the matching `UserPromptSubmit` must carry the same session, prompt, and canonical workspace armed and bound at claim; it establishes the Capability’s declared harness-turn start, not model progress, tool use, or semantic success. Duplicate start evidence is idempotent. A matching Terminal Evidence event may establish a terminal outcome even if a separate start callback was missed only where the frozen Evidence Profile declares that terminal correlation independently sufficient.

After claim, absence of start evidence is never proof of no start. The Invocation remains `awaiting start` only through the frozen Capability’s bounded claim-to-start observation window. A correlated no-start fact may then establish `rejected`, presented to the user as **Did not start** unless the Harness explicitly reported rejection. Claude Code’s v1 User Pull profile has no such post-claim no-start proof: failure to observe `UserPromptSubmit`, a cancellation attempt, claim-response ambiguity, bridge or Workspace Writer loss, Attachment Identity change, or expiry of the observation window therefore makes the Invocation `unresolved`. Preparation expiry is never reused for this state.

Loss and restart preserve the same boundary. Closing or losing a TUI client has no lifecycle effect while the Workspace Writer and bridge can still serve the committed Preparation. A bridge that cannot reach authority must return no payload; a missing plugin makes the Capability unavailable rather than manufacturing a claim. After Workspace Writer restart, an open Preparation may return to available only after exact identity and contract revalidation. Recovery observes either an unclaimed Preparation or a durably claimed one—never an in-between state. A claimed Invocation that lacked an already durable terminal outcome becomes unresolved after restart unless its frozen Capability provides verified reconciliation or replay; Claude Code provides neither. Nothing is automatically resent.

After claim, Workflow Cancellation archives the Workflow but cannot revoke payload already authorized or prove external interruption. A user action in the Harness records interruption intent only. `interrupted` requires trustworthy correlated Terminal Evidence after start; if Ctrl+C, session loss, or a cancellation race yields no such evidence, the Invocation remains unresolved. A natural terminal event that wins the race is recorded according to that evidence rather than rewritten as cancellation.

Repeated preparation while the same Preparation is open is idempotent. A Preparation withdrawn or expired before claim may be explicitly prepared again, after fresh inspection and any required consent, with a new Commitment Receipt and one-use handle; because the durable history proves no claim occurred, this is not duplicate-risk resubmission. A claimed Invocation with correlated proof that it did not start may likewise be retried deliberately without an unresolved-activity warning, while preserving both attempts. If a claimed Invocation lacks a trustworthy outcome, only Explicit Resubmission may authorize another attempt: its composed gate names the prior Invocation, destination, last trustworthy evidence, and duplicate-execution risk, and for User Pull it creates a fresh Preparation whose later claim creates the new Invocation. A trustworthy terminal outcome leaves any further attempt to the owning Workflow’s explicit policy. Automatic retry, replay, token reuse, migration to a new Attachment, and inference from a missing event are forbidden.

The interaction language follows those evidence boundaries: **Ready to pull**, **Withdrawn**, and **Expired** describe Preparation; **Claimed—waiting to start**, **Active**, **Did not start**, terminal outcomes, and **Outcome unknown** describe Invocation. The strongest pre-claim statement is that this exact Neoflow User Pull never produced an Invocation or released its Handoff payload; it cannot prove the user did not independently perform equivalent work outside Neoflow.
