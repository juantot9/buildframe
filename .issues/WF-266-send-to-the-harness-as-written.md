---
id: WF-266
title: "Send to the Harness as written"
status: closed
labels:
  - wayfinder:task
parent: WF-259
assignee: juanan
created: 2026-11-06
---

## Outcome

Everything Neoflow sends to a Harness (Review Messages, Asks, and any later Planning Handoff) goes exactly as the user wrote or selected it. Neoflow never scans outgoing material for secrets, never flags it as sensitive, and never asks before sending it. The only send confirmation left in Reviewing is that an earlier turn to the same session never reported back, so sending now may repeat work.

## Decision (owner, 2026-11-06)

"We shouldn't interfere in the user's message … this should be as direct to the harness as possible." Applied to every send to a Harness, not just Review Messages.

This supersedes the sensitive-disclosure parts of [Set trust and consent guardrails](./WF-011-set-trust-consent-guardrails.md) and [Compose Review context commitment assessment](./WF-223-compose-review-context-commitment-assessment.md): the local detector, provenance markers (ignored, outside-checkout, credential-like paths), Sensitive Disclosure Acknowledgment, and the `sensitive-disclosure` requirement are gone. The unresolved-activity gate, Commitment Blockers, and the Sensitive Export Gate for portable output are unchanged; private-data care still applies to what Neoflow stores and exports locally.

## Interface

- The Commitment Policy assesses only exact proposal identity, destination, outgoing bytes, and active or unresolved Invocations. Its view contract has no sensitivity fields.
- The confirmation reads "An earlier Message here never reported back." and its action is `[Enter] send anyway`, because the only risk it names is repeating work.
- Acknowledgement records written before this change stay readable; nothing new is written for content.

## Verification

- Commit `2a50dc0`. Policy unit tests assert that secret-looking text and credential-like locations assess `direct`. A scenario test sends a secret-looking Message with no confirmation, and the Adapter receives its exact bytes.
- Gate, acknowledgment-durability, and crash tests now drive the gate with a lost earlier turn.
- `CONTEXT.md` replaces Sensitive Disclosure Acknowledgment and Sensitive Handoff Context with As-Written Disclosure. `PRODUCT.md`, `DESIGN.md`, and `docs/blueprint/harness-capability-seam.md` match.
