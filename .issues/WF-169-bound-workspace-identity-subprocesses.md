---
id: WF-169
title: "Bound Workspace Identity subprocesses"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-168]
created: 2026-09-01
---

## Question

Can Workspace Identity give every repository and fixed-system subprocess a finite owner deadline without changing Git interpretation or bootstrap diagnostics?

## Acceptance evidence

- Identity's hardened `git rev-parse` calls route through the existing package-private Git process owner with the settled 30-second deadline, exact arguments/environment, bounded output, and exactly-once child cleanup.
- Darwin `/bin/ps` process-identity inspection has an explicit finite local deadline and preserves conservative lock-owner behavior when process identity cannot be learned.
- A hung-child Identity regression observes bounded rejection only after the child is gone, then proves the same process can bootstrap a normal checkout; current source fails by remaining pending.
- Checkout-controlled execution hardening, absolute Git resolution, linked-worktree behavior, registry locking, marker authority, diagnostics, and the Workspace Interface remain unchanged.
- Focused Workspace process/Identity evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Active v1 anti-pattern audit, AV-02](../docs/audit/active-v1-antipatterns-2026-09-01.md#av-02--workspace-identity-subprocesses-bypass-finite-lifecycle-ownership)
- [Harden Workspace Git process execution](./WF-094-harden-workspace-git-process-execution.md)
- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

Repository-aware Git lifecycle belongs to the established package-private `gitProcess` Module; fixed `/bin/ps` inspection remains local to Workspace Identity with an explicit deadline. Do not create a generic subprocess abstraction.

## Constraints

- Preserve the 30-second Git policy, 64 KiB Identity stdout ceiling, hardened environment, absolute executable, argument list, and semantic diagnostics.
- Do not add cancellation or timeout fields to the Workspace Interface.
- Do not reopen the separately accepted format-1 migration timeout disposition.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. Workspace Identity's three hardened `rev-parse` calls now use the existing
package-private `runGitProcess` owner with the unchanged argument list,
inspection environment, 64 KiB stdout ceiling, and settled 30-second deadline.
The result remains decoded with Node's UTF-8 replacement behavior. Identity's
failure mapper now reads both the old `execFile` string stderr and the bounded
Git owner's Buffer stderr, preserving inaccessible/dubious-repository
classification. The Darwin-only fixed `/bin/ps` inspection separately carries a
30-second local timeout and `SIGKILL`; failure retains the conservative
running-with-unknown-identity result. No generic process Interface was added.

The new Identity-level regression puts a delegating operator-owned Git wrapper
on an isolated module's `PATH`; only its three repository-aware `rev-parse`
children sleep. Fake time crosses the real 30-second owner policy, bootstrap
returns the existing `git-inspection-failed` / `inspection-failed` diagnostic
only after all three PIDs are gone, and a normal bootstrap then succeeds in the
same process. Restoring the old direct `execFile` source leaves the operation
live until test cleanup kills the children, so the focused assertion fails.

On Node 26.5.1 with pnpm 11.20.0, all 19 Workspace Identity scenarios pass and
Workspace typecheck is clean. Canonical `v1:verify` passes 26 files / 154 tests,
typecheck, builds, and smoke; all four compiled State, Local Runtime, Pi Adapter,
and dogfood probes pass, and `git diff --check` is clean. Git security policy,
marker/registry bytes, diagnostics, package Interfaces, user data, and the
unrelated `package.json` bump remain unchanged.
