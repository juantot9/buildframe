---
id: WF-097
title: "Bound Authoritative State requests"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-096]
created: 2026-08-13
---

## Question

Can W-03 give every request to the synchronous Authoritative State worker a bounded, exactly-once deadline, report that State is not responding, and retire the uncertain worker lifetime without widening the Workspace Interface or replaying a command whose commit outcome is unknown?

## Blocked by

- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)

## Acceptance evidence

- Commit, read, content-read, status, and close requests all have one explicit owner-side deadline; response, worker error/exit, post failure, and timeout races settle once and clear every timer.
- Timeout reports a distinct private Authoritative State error code, prevents later requests on the timed-out owner, and terminates the worker before rejection settles so no thread, writer lease, or pending request survives.
- A timed-out commit is treated as an unknown outcome: no semantic owner or runtime automatically retries it or emits an external effect, and durable command-result recovery remains the only way to learn a late commit after restart.
- Focused contract evidence deterministically pauses a worker request, observes bounded failure through the Workspace Interface, proves no Harness directive was emitted, proves the old writer lease is released, and resolves the durable result only by reopening State rather than replaying the command.
- Startup migration progress remains W-04's accepted scope; this child does not invent a progress protocol.
- The Workspace Interface and dependency firewall remain unchanged. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- W-03 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Constraints

- Keep the deadline inside the private Authoritative State Module. Do not add a generic timeout Module or expose worker controls.
- Do not couple implementation to the Git child-process deadline; only reuse established vocabulary where it fits.
- Do not interrupt synchronous SQLite in place or claim a timed-out commit rolled back. Terminate and retire the whole worker lifetime conservatively.
- Preserve stable command identity and no-replay semantics. A timeout cannot be translated into an ordinary semantic rejection that invites retry.
- Keep the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The private Authoritative State Module now gives every post-startup worker
request—commit, read, bounded content read, status, and close—one 30-second
owner-side deadline. Pending entries own their timers; normal result, worker
failure/exit, post failure, and timeout paths clear them and settle at most once.
The test-only constructor seam may shorten the deadline, but validates it inside a
one-hour maximum and does not enter the Workspace package Interface.

Because the worker is fully synchronous, timeout does not pretend it can cancel
one SQLite operation in place or prove rollback. It closes the State lifetime,
ignores any late response, terminates and awaits the whole worker, and only then
rejects the triggering request as `state-request-timeout`; queued requests become
`state-closed`. Thus no thread, writer lease, timer, or pending request survives
the reported timeout, and the old owner accepts no later operation.

A deterministic contract seam pauses one named command after its Durable Commit
but before its response. State tests prove the timeout waits through worker
termination, releases the writer lease, rejects queued work exactly once, and
recovers the committed record only by reopening State. A Workspace Interface
scenario drives a real `review.question.ask` through the same fault: the call
fails with the private timeout code, no Harness directive is emitted, the old
Workspace becomes closed, and reopening exposes the durable command result
without replaying the command or directive.

The broader suite also exposed two pre-existing Application test races. The
moved-HEAD runtime scenario previously relied on rapid key dispatch through
several asynchronous views; it now establishes the fixed range directly through
the Workspace Interface and retains the live-runtime continuation behavior it
actually tests. The clicked-file timing assertion now measures when the desired
frame is observed and allows 500 ms of full-suite scheduler headroom while still
asserting exactly one bounded `review.live-diff` read.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passed the dependency
firewall, all 19 files / 124 tests, typecheck, builds, and smoke. All four compiled
risk probes passed: Authoritative State, Local Runtime, reviewed Pi 0.80.6 Adapter,
and end-to-end dogfood. `git diff --check` is clean. The public Workspace
Interface and dependency firewall are unchanged, W-04 remains accepted scope,
and the unrelated root `package.json` bump remains excluded.
