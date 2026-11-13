---
id: WF-167
title: "Audit active v1 code for concrete anti-patterns"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-147]
created: 2026-09-01
---

## Question

Which concrete anti-patterns remain in the active v1 production code after the accepted P16E pass, when judged against actual correctness, performance, durability, security, deep-Module, and maintainability consequences rather than generic style preferences?

## Acceptance evidence

- Audit every active production source under `packages/workspace/src`, `packages/local-runtime/src`, `packages/pi-adapter/src`, and `apps/neoflow/src`, plus v1-owned package manifests, TypeScript/workspace configuration, and root `v1:*` policy/probe scripts. Use exact source commit `79cc4ec00004b4aee89ded0c11c238d14e700321` as the implementation baseline; later issue-only commits do not change that code.
- Exclude `dist`, generated output, dependencies, prototype branches/subtrees, temporary helpers, and deletion-bound legacy production (`apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, `packages/pi-connector`, and `nvim`). Consult active tests only to confirm or rule out a suspected production consequence; do not inflate the audit with test-style preferences.
- Search systematically for accidental serialization or concurrency, unbounded/eager work, hidden retries, stale or duplicated state, temporal coupling, fire-and-forget rejection loss, resource/lifecycle leaks, unsafe filesystem/process handling, swallowed diagnostics, protocol/order assumptions, representation drift, shallow/pass-through Interfaces, speculative seams, generic registries, policy duplication, and ownerless cross-Module knowledge. Treat large files, casts, nested conditionals, or duplication as findings only when an observed Interface or maintenance consequence makes them load-bearing.
- Reconcile every lead against `docs/audit/pre-p17-codebase-findings.md` and WF-094–WF-166. Do not rediscover a closed, accepted, deletion-bound, or explicitly deferred item as new. For each lead, record the primary source path/line, execution path, consequence, current evidence/test, prior disposition if any, and classification: confirmed blocker, confirmed non-blocking debt, ruled out, or already owned.
- Write one durable report at `docs/audit/active-v1-antipatterns-2026-09-01.md`. Confirmed findings must name severity, owning Module/seam, trigger, smallest credible correction direction, and missing regression evidence without implementing the correction. Ruled-out high-risk leads must say what invariant or test eliminates the risk.
- Change no production implementation, public/package Interface, dependency, test behavior, generated file, workflow State, or user/legacy data in this audit. Run source/dependency inventories and `git diff --check`; leave only issue/report evidence plus the unrelated root `package.json` bump.
- If the audit confirms any release-blocking defect, create and push one focused owner-specific child per accepted finding before implementation. Do not close WF-140 or begin P17 until the report is reconciled. Non-blocking future improvements remain explicit debt and do not retroactively revoke accepted human evidence.

## Authority

- User-approved scope: active-v1 production code, excluding generated/prototype and deletion-bound legacy code
- Existing broad audit: [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
- Deep-Module vocabulary and package ordering: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Current quality gate: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Latest measured anti-pattern correction: [Run Local Runtime read cohorts behind operation barriers](./WF-166-run-local-runtime-read-cohorts-behind-operation-barriers.md)

## Seam decision

This is evidence about existing Modules, not a new lint, analyzer, Interface, or abstraction. Read primary source and cross-check observable paths through existing Interfaces. The report owns classification; any implementation belongs later to a focused child at the confirmed owner. This preserves locality and prevents an “anti-pattern cleanup” umbrella from mixing unrelated changes.

## Constraints

- Do not use generic best-practice checklists as evidence, score files by size/complexity alone, or label deliberate bounded/retry/security policy as a smell without tracing its Interface consequence.
- Do not reopen settled findings without new source evidence, audit deletion-bound legacy quality, or pull P17/P18/P54 implementation into this scan.
- Do not add ESLint, formatter, static-analysis dependency, telemetry, benchmark hook, shared helper, generic scheduler, registry, cache, prefetch, or production instrumentation.
- Do not inspect real `.neoflow` data, credentials, Pi sessions, user configuration, legacy queue/receipt bytes, or the unrelated root `package.json` bump.

## Findings and focused owners

- [Durably publish the Workspace Identity marker](./WF-168-durably-publish-workspace-identity-marker.md) — AV-01.
- [Bound Workspace Identity subprocesses](./WF-169-bound-workspace-identity-subprocesses.md) — AV-02.
- [Preserve abort ownership through Runtime bootstrap](./WF-170-preserve-abort-through-runtime-bootstrap.md) — AV-03.
- [Contain Pi no-start timeout failures](./WF-171-contain-pi-no-start-timeout-failures.md) — AV-04.
- [Own Home navigation read failures](./WF-172-own-home-navigation-read-failures.md) — AV-05.
- [Complete the User Configuration save repair](./WF-173-complete-user-configuration-save-repair.md) — the already-settled W-06 Application obligation.

## Resolution comment

Complete. The durable report is
[`active-v1-antipatterns-2026-09-01.md`](../docs/audit/active-v1-antipatterns-2026-09-01.md).
The baseline remains `79cc4ec00004b4aee89ded0c11c238d14e700321`: all 46
active TypeScript production files (36,005 lines), 15 v1-owned manifest/config
files, and eight root v1 policy/probe scripts were reviewed, while generated,
prototype, dependency, and deletion-bound legacy sources remained excluded.

Three Node 26.5.1 compiled reproductions confirm a lost Local Runtime abort, a
Pi timer `unhandledRejection`, and an Application Home-read
`unhandledRejection`; a fourth hung-Git reproduction remains pending beyond the
settled 30-second deadline. Filesystem ordering confirms the authoritative
marker lacks the directory durability barrier already required of the registry.
The report reconciles these against WF-094–WF-166, retains the migration and
remaining Scenario A performance dispositions, and records W-06's still-present
post-rename access check as already owned rather than inventing a sixth audit
finding.

Five release-blocking findings and that one prior execution discrepancy now have
focused owner-specific children in Workspace → Local Runtime → Pi Adapter →
Application order. WF-167 changes no production source, Interface, dependency,
test, generated output, State, or user data. The scoped dependency policy,
inventories, and `git diff --check` pass on Node 26.5.1; the unrelated root
`package.json` bump remains the sole pre-existing worktree modification outside
issue/report evidence. WF-140 remains open until WF-168–WF-173 and final
verification close.
