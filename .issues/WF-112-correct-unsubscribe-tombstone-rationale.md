---
id: WF-112
title: "Correct unsubscribe tombstone rationale"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-111]
created: 2026-08-26
---

## Question

Can the Local Runtime client explain the real ordered-acknowledgement race that requires retired-subscription tombstones, instead of denying the acknowledgement its own protocol handler consumes?

## Acceptance evidence

- The comment beside the missing-active-subscription branch states that the server acknowledgement follows updates already queued before cancellation.
- It explains that only the known retired stream is discarded until that acknowledgement arrives, while unknown updates remain fail-closed.
- The false statement `Unsubscribe has no server acknowledgement` is absent, and the client rationale agrees with the server's adjacent send-side ordering comment and `HANDOFF.md`.
- The rationale is rewritten rather than deleted; the tombstone's purpose remains local to the code that distinguishes retired and unknown streams.
- No executable source, protocol frame, timeout, Interface, test, or generated declaration changes. No new behavioral test is added for a comment-only correction; WF-111's exact acknowledgement and non-delivery contracts remain the governing evidence.
- Focused Local Runtime socket contracts, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled rewrite-not-delete repair: [`L-01`](../docs/audit/pre-p17-codebase-findings.md#l-01--a-comment-denies-the-acknowledgement-the-code-implements)
- Local Runtime disposition reasoning: [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
- Governing executable evidence: [Prove Local Runtime unsubscribe acknowledgement](./WF-111-prove-local-runtime-unsubscribe-acknowledgement.md)

## Seam decision

The comment belongs beside the client tombstone branch because that is where an already-queued update and an unknown stream become observationally identical except for retained cancellation identity. Moving the rationale to general documentation or deleting it would make the implementation shallower to maintain, while changing behavior would exceed a comment-only finding.

## Constraints

- Rewrite the existing comment in place; do not delete it or duplicate the server comment verbatim.
- Preserve `#retiredSubscriptions`, acknowledgement handling, and unknown-stream protocol failure exactly.
- Do not combine this child with L-02 frame assembly or X-06 wait diagnostics.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The client branch now states the actual ordering rule: the server
acknowledgement follows updates already queued before cancellation. Until that
acknowledgement arrives, only the known retired stream is discarded; an unknown
update still fails the protocol. The false no-acknowledgement premise is gone,
and the rationale remains beside the tombstone lookup it explains rather than
being deleted or moved away from the mechanism.

A focused census finds the same rule in all three authoritative places: the
client's receive-side rationale, the server's send-side ordering comment, and
`HANDOFF.md`'s cancellation guarantee. Transpiling the before/after client with
comments removed produces byte-identical output, so no executable token changed.
WF-111's semantic and raw-socket evidence remains the behavioral proof; the
complete Local Runtime socket contract passes 7/7 without a duplicate test for
comment text.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 21 files / 136 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. No tombstone, frame, timeout,
Interface, test, or declaration changed. The unrelated root `package.json` bump
remains excluded.
