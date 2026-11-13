---
id: WF-170
title: "Preserve abort ownership through Runtime bootstrap"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-169]
created: 2026-09-01
---

## Question

Can Local Runtime keep one caller's abort lifetime continuously owned from socket creation through bootstrap and session handoff for both connection Interfaces?

## Acceptance evidence

- Workspace-client and Harness-Adapter connection attempts retain abort ownership across transport connection, bootstrap acceptance/establishment, pending-frame transfer, and session-lifetime listener installation.
- Semantic socket regressions connect to a valid delayed peer, abort after `connect` but before acceptance, and observe the existing cancelled rejection plus peer close; current source fails by returning a connected/live session.
- Pre-aborted, connect-time aborted, post-connect session aborted, timeout, invalid bootstrap, role/version refusal, ordered frame delivery, graceful close, and Harness establishment behavior remain covered.
- Wire frames, protocol versions, roles, diagnostics, timeout values, pending bounds, Workspace/Harness Interfaces, and WF-166 operation ordering remain unchanged.
- Focused Local Runtime evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Active v1 anti-pattern audit, AV-03](../docs/audit/active-v1-antipatterns-2026-09-01.md#av-03--abort-ownership-is-dropped-during-local-runtime-bootstrap)
- [Make bootstrap version types truthful](./WF-110-make-bootstrap-version-types-truthful.md)
- [Run Local Runtime read cohorts behind operation barriers](./WF-166-run-local-runtime-read-cohorts-behind-operation-barriers.md)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

Connection lifetime belongs inside the two private Local Runtime connection assemblies. Apply one continuous owner rule there; do not expose framing, add a public lifecycle abstraction, or couple cancellation to operation ordering.

## Constraints

- Preserve `BOOTSTRAP_TIMEOUT_MS`, Local Runtime polling at 100 attempts / 5 ms, result ordering, mutation barriers, subscription acknowledgement, and graceful disposal.
- Do not replay an abort, call, directive, frame, or effect.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. Both Local Runtime connection assemblies now install one abort owner as
soon as the connected socket enters framed bootstrap, immediately recheck an
already-aborted signal, retain that same callback through acceptance and session
handoff, and remove it on peer close. During bootstrap the callback destroys the
peer and the caller receives the existing `runtime-unavailable` / `cancelled`
diagnostic; after handoff it closes the Workspace peer or disposes the Harness
Adapter session exactly as before. No listener-transfer interval remains, and no
new lifecycle Interface or frame exists.

A new two-case semantic raw-socket contract waits until each client has sent its
valid bootstrap, aborts in the former gap, then offers otherwise-valid accepted
frames. Both corrected clients reject as cancelled and the peer observes close.
Restoring the old source makes the Workspace client return `connected`; the
Harness Adapter loses the abort too and eventually returns establishment
refusal rather than cancellation, so both focused cases fail. Existing
post-connect disposal, pending bounds, ordered results, unsubscribe
acknowledgement, and WF-166 command/read barriers remain covered.

On Node 26.5.1 with pnpm 11.20.0, all seven Local Runtime files / 22 tests pass.
Canonical `v1:verify` passes 27 files / 156 tests, typecheck, builds, and smoke;
all four compiled State, Local Runtime, Pi Adapter, and dogfood probes pass, and
`git diff --check` is clean. Wire objects, protocol versions, diagnostics,
timeouts, polling, roles, package Interfaces, user data, and the unrelated
`package.json` bump remain unchanged.
