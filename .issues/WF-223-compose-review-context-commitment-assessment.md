---
id: WF-223
title: "Compose Review context commitment assessment"
status: closed
labels:
  - wayfinder:task
parent: WF-216
assignee: juanan
blocked_by: [WF-228]
created: 2026-09-07
---

> **Superseded in part (2026-11-06):** sensitive-disclosure checks were removed by [Send to the Harness as written](./WF-266-send-to-the-harness-as-written.md). Material sent to a Harness is never scanned or gated for secrets.

## Re-scoped (2026-09-08; replanned 2026-09-14)

This child survives the WF-225 replan but now assesses only the exact one-message material defined by [Define the outgoing review message contract](./WF-228-define-the-outgoing-review-message-contract.md): user text plus a `file:line` Live Repository Reference, with exact labelled historical lines only for a saved-origin message. The former supporting-context package, disclosure-delta, route-representation, and Context Budget Evidence scope is superseded. Ordinary messages keep one Ask action and no mandatory preview or second consent step.

## Outcome

One internal Commitment Policy Module assesses an exact Review Message commitment as `direct`, `gate`, or `blocked`. An ordinary exact message to the selected reviewed Direct destination is direct. Actual sensitive outgoing material or possible overlap with a prior unresolved Invocation produces one composed gate with separately identifiable requirements. Missing or changed source, destination, Capability, availability, representation, or exact assessment evidence remains blocked with no allow-anyway path.

## Interface

Define one package-private pure assessment Interface over structured proposal identity, exact destination, actual outgoing occurrences, advisory sensitivity evidence, unresolved activity, prior exact acknowledgments, and blocker facts. It returns one closed ordered assessment; it does not read State, render, commit, or perform an effect.

Harness Interaction gathers those facts, exposes the bounded assessment through `harness.review-message.inspect-default`, and accepts only the exact acknowledgment-requirement identities returned by that inspection. One Durable Commit writes any newly accepted acknowledgments, the exact outgoing material, Commitment Receipt, Handoff, Capability Snapshot, Invocation, Review Message records, and command result before the existing one-shot directive. The application renders at most one composed gate.

## Module seam

Commitment Policy owns classification and requirement composition but no State and no Workspace method. Harness Interaction owns evidence gathering, exact destination and disclosure construction, acknowledgment lookup, transaction/effect ordering, and recovery. Reviewing owns the Message and origin basis. Workspace Evidence supplies source facts without learning consent policy. The application renders returned semantics without reclassifying content.

## Acceptance

- [x] Ordinary current- and saved-origin Messages assess `direct` and still send through one action; opening What-will-be-shared remains optional.
- [x] Only material Neoflow actually sends is assessed: exact user text and path/location, plus exact saved-origin lines when present. Bounded provenance, credential-like locator, and versioned advisory content markers are visible; marker absence never claims safety.
- [x] Multiple sensitive occurrences and unresolved-Invocation overlap compose into one ordered gate with distinct exact requirements rather than stacked prompts or one opaque Boolean.
- [x] A Sensitive Disclosure Acknowledgment remains sufficient only for the same outgoing material, origin, destination, and sensitivity evidence. Changed bytes, location, origin, destination, or detector evidence requires a new acknowledgment; unresolved-activity acceptance never becomes standing trust.
- [x] Missing or changed source, unknown or invalid destination/Capability/availability, active single-flight work, unrepresentable material, and incoherent assessment evidence remain non-overridable blockers.
- [x] Inspection and acknowledgment races reject before commit; failed durability performs no directive; post-commit loss preserves the exact assessment and acknowledgments with no replay; command recovery returns the original result.
- [x] Focused Policy/Harness/application/fault suites, canonical verification, compiled risk probes, dependency/package seams, dogfood, and `git diff --check` pass with unrelated work unstaged.

## Constraints

- Do not scan ambient workspace content or a current source line that is merely named for later Harness reading. Only bytes Neoflow proposes to disclose and their exact source provenance participate.
- Detection is bounded, local, deterministic, versioned, and advisory. It may mark risk; it never certifies unmarked material as safe.
- Do not reintroduce supporting-context transmission, disclosure deltas, token estimates, route choice, Capability Downgrade, Manual Handoff, or a staged Review Batch flow.
- Known WF-228 limitations stay visible but need no acknowledgment by themselves. A new Message is not exceptional merely because its bytes differ from an earlier Message.
- No acknowledgment may weaken target revalidation, the registered-tool gate, exact outgoing bytes, atomic pre-effect commitment, or no-replay behavior.

## Resolution (settled 2026-09-14 from WF-011, WF-225, and WF-228)

### Exact assessment basis

The proposal is one fully composed WF-228 outgoing message, its Review and origin basis, the exact selected Direct Attachment, the frozen compatible Capability facts, and current activity on that Attachment. The policy sees structured facts, never a generic context bag. The inspection identity continues to bind all source, destination, representation, and assessment inputs so any movement forces reinspection.

Current-source bytes used only to verify a Live Repository Reference are not disclosure and are not sensitivity-scanned. The exact path/location is disclosure and is assessed. For a saved-origin message, the exact historical line is disclosure and is assessed. User-authored message text is also assessed because explicit authorship does not make accidental credential disclosure impossible. Raw correlation, State, checkout, and Attachment identifiers remain local and create no warning unless a future route actually discloses them.

### Closed direct, gate, and blocked meanings

`direct` means the exact proposal has no unaccepted exceptional requirement and every prerequisite is valid. The visible Send action is its Consent Boundary; preview is optional.

`gate` means the proposal is otherwise valid but has one or more sensitive outgoing occurrences or would start different work while an earlier Invocation on the same Attachment is unresolved. Every fact appears in one ordered composed gate. Confirming accepts exactly the listed requirement identities and performs the ordinary commit; cancelling returns to the editor and writes nothing.

`blocked` wins over `gate`. Invalid or unavailable source, identity, Capability, availability, representation, active single-flight Invocation, malformed policy input, or any other fact needed for a truthful commitment has no allow-anyway path. Destination movement is not itself a warning: it invalidates the inspection and requires the newly visible destination to be inspected again.

### Sensitivity evidence

Sensitive occurrences retain their exact role (`message-text`, `location`, or `saved-source`), occurrence identity, marker categories, and marker source. Source provenance may mark ignored, outside-checkout, or unsaved material if a future admissible message occurrence carries it. A versioned local detector marks only the exact outgoing path/text bytes with bounded credential-locator and high-signal secret-content categories. Several markers on one occurrence remain inspectable without copying the matched secret into policy records or UI. Absence of a marker means only “not marked by this evidence,” never safe.

WF-228 currently cannot represent unsaved editor or outside-checkout message targets, so those remain unavailable rather than gaining a new path through this child. Likewise, ordinary current file contents are left to Harness-owned reads and cannot trigger a Neoflow disclosure gate when Neoflow sends only their location.

### Exact acknowledgments and one gate

Each sensitive requirement binds the complete outgoing-material digest and representation, Review/origin occurrence, exact Attachment Identity, occurrence role and identity, marker categories and evidence version. A prior durable acknowledgment suppresses another prompt only when every bound fact matches; the warning remains visible. Any changed body, path/line, saved quote, origin, destination, or detector evidence creates a different requirement.

Each unresolved-activity requirement additionally binds the exact prior Invocation and this inspected proposal generation. It is accepted only as part of this new commitment and never becomes reusable standing permission. Multiple sensitive and unresolved facts remain separate requirement records but are accepted through one gate and one action.

The commit command carries the exact ordered set of accepted requirement identities. Missing, extra, reordered, stale, or malformed acceptance rejects before State mutation. Newly accepted requirements are immutable records referenced by the Commitment Receipt and written atomically with the Handoff; idempotent command recovery returns the same committed identities and never performs another directive.

### Interaction and recovery

Submitting a direct inspection commits immediately as today. Submitting a gated inspection opens one compact destination-and-scope preflight; Enter accurately says that it sends and acknowledges, while Escape returns to the unchanged Message editor. F3 exposes exact outgoing bytes, size, limitations, sensitivity evidence, and assessment without committing or accepting anything.

Failure before the Durable Commit writes no acknowledgment and sends nothing. Failure after the commit preserves the Message, exact disclosure, accepted requirements, receipt, and unresolved lifecycle truth; it never replays automatically. The Adapter receives the same already-committed outgoing bytes as WF-228 and no policy metadata to reinterpret or enrich.

## Resolution status

**Settled from already confirmed contracts (2026-09-14).** WF-011 already requires one composed gate for sensitive disclosure and unresolved activity, while WF-225/WF-228 already require one ordinary small-message action, exact outgoing bytes, optional preview, and no supporting-context package. This Resolution reconciles those decisions without introducing a new product choice and is the committed pre-implementation basis.

## Completion evidence (2026-09-14)

- One package-private pure Commitment Policy Module (`packages/workspace/src/harness-interaction/commitmentPolicy.ts`) assesses one composed proposal as `direct`, `gate`, or non-overridable `blocked` from structured facts only: exact outgoing bytes, role-ordered occurrences (`message-text`, `location`, saved-origin `saved-source`), destination fingerprint, representation, active/unresolved Invocation identities, and durable exact acknowledgments. It owns no State, reads nothing, and never certifies unmarked material safe.
- `harness.review-message.inspect-default` now returns the bounded `commitment` assessment; `review.message.commit` carries the exact ordered accepted requirement identities and rejects missing, extra, reordered, stale, or malformed acceptance with `commitment-requirements-not-acknowledged` before any mutation. Newly accepted requirements commit atomically as immutable `harness.commitment-acknowledgement` records, are referenced by the Commitment Receipt and Handoff, and are re-validated by exact payload equality on reuse. An acknowledgment suppresses another prompt only while bytes, role, origin, destination, and marker evidence all match; it is never standing trust. Adapters still receive only the exact committed bytes with no policy metadata.
- The Reviewing application renders one composed gate (destination, exact sensitive occurrences with marker labels and acknowledgment state, unresolved prior Invocations, size/digest) on submit when the assessment is `gate`; Enter sends and acknowledges, Escape returns to the unchanged editor, and F3 shows the exact bytes plus a compact `direct`/`gate` assessment line without committing. Ordinary messages keep the single action with optional preview.
- Verification on Node 26.5.1: the complete Vitest suite passes (41 files, 354 tests), including new fast policy tests (7), two Workspace scenario tests (sensitive gate with durable exact acknowledgment and reuse; unresolved-Invocation gate without standing trust), and one application scenario test (composed gate, cancel-preserves-draft, in-gate F3 preview, explicit confirmation, exact dispatched bytes). All package and test typechecks, clean direct builds of all four packages, build smoke, the four compiled risk probes, the end-to-end dogfood fault probe, formatting, dependency firewall, and `git diff --check` pass. Lint reports the existing warning set only; unrelated repository-health work remains unstaged.
- A live two-process run exercised the built developer executable (real runtime process, real pty terminal) with a real Pi `0.85.1` host loaded from the compiled Adapter via `pi --mode rpc`: an ordinary message sent through one action with no gate and Pi received the exact bytes; a credential-like message produced one composed gate naming the detector marker, cancelling sent nothing, and confirming sent the exact bytes; the identical sensitive message afterwards was not re-gated (the durable acknowledgment was reused and the warning stayed visible); a changed sensitive message gated again without sending; `HEAD`, the working tree, and the selected bytes were unchanged throughout, and the TUI stayed responsive.
