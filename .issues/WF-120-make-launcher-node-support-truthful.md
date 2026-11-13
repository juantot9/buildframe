---
id: WF-120
title: "Make launcher Node support truthful"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-119]
created: 2026-08-26
---

## Question

Can the developer executable refuse only runtimes below OpenTUI's real Node floor, warn once and continue outside the source package's declared ceiling, and name the pinned tested version without reviving the spawn-regression claim that WF-095 disproved?

## Acceptance evidence

- Process-level Application tests enter the real developer executable after replacing only the child process's reported Node version. They assert exit status, stdout, and stderr rather than exporting a version-policy test seam.
- A version below 26.4.0 exits 1 before FFI re-execution or launcher import and names the floor plus pinned tested Node 26.5.1. Exact 26.4.0 and pinned 26.5.1 reach `--help` with no warning.
- Node 26.6.0 and 26.7.0 each emit one warning that names the declared `>=26.4.0 <26.6.0` source range and pinned tested 26.5.1, then reach `--help` successfully. Node 27 follows the same warn-and-run posture rather than the current false `<27` refusal.
- No Node version remains on a known-bad list: WF-095's complete suites passed on 26.6.0 and 26.7.0 after canonical Git resolution. A future refusal requires an explicit exact version and measured reason; this child invents neither.
- The old launcher fails the regression by omitting warnings for 26.6/26.7 and refusing 27. A warning-placement control proves ordinary FFI re-execution emits an above-ceiling warning only once.
- FFI detection/re-execution, signal forwarding, argument parsing, launcher loading, current `engines.node`, `.nvmrc`, root `check-node-version`, and the unreleased support manifest remain otherwise unchanged. A-04 owns the executable gate and message, not P54's future support-manifest single source.
- No version-policy function or constant is added to the Application package Interface. The compiled launcher and application runtime value surfaces remain unchanged.
- Focused executable and Application scenarios, Application typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled executable policy: [`A-04`](../docs/audit/pre-p17-codebase-findings.md#a-04--the-launchers-node-gate-is-looser-than-every-other-bound-and-starts-on-known-broken-versions)
- Corrected scope and P54 ownership: [Disposition the Application bounds and checks findings](./WF-077-disposition-application-bounds-and-checks-findings.md)
- Evidence that 26.6.0 and 26.7.0 are no longer known bad: [Resolve the Git executable and retest the Node ceiling](./WF-095-resolve-git-executable-and-retest-node-ceiling.md)
- Future support-manifest requirement: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)

## Seam decision

The executable process is the Interface that owns this behavior. Keep version assessment private inside `developerExecutable.ts` and verify it through child-process exit/output, using a child-local configurable `process.versions.node` value before module load. Exporting a policy helper would widen the Application Interface for implementation logic that no production caller needs.

## Constraints

- Preserve the exact 26.4.0 floor required by OpenTUI FFI and the repository-pinned tested version 26.5.1.
- Do not retain the stale statement that Node 26.6+ carries a current Neoflow spawn regression; WF-095 removed and re-tested that cause.
- Warn above the declared ceiling and continue. Do not turn advisory `engines.node` into an executable refusal without an exact measured known-bad version.
- Do not change package/root engine ranges, `.nvmrc`, `scripts/check-node-version.mjs`, or `support/manifest.json` in this Application child.
- Do not combine this child with A-05, S-05/S-07, W-06, W-13, or last-ranked A-02.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `developerExecutable.ts` now classifies the running three-part Node version
against the exact 26.4.0 FFI floor and the source package's declared 26.6.0
exclusive ceiling. Below the floor it exits before FFI re-execution or launcher
loading and points to pinned tested Node 26.5.1. Inside the declared range it runs
silently. At or above the ceiling it emits one warning naming both the declared
range and pinned version, then continues because the version is not known bad.
The false `<27` refusal and “OpenTUI proof” message are gone.

There is deliberately no known-bad list today. WF-095 removed bare-word Git
resolution and passed complete suites on 26.6.0 and 26.7.0, so retaining either as
a refusal would contradict current evidence. A future refusal must add an exact
version and measured reason; this child adds no placeholder fact.

The new process-level test changes only `process.versions.node` inside an isolated
child before loading the real source executable. It proves 26.3.9 exits 1 with the
floor/pin message; 26.4.0 and 26.5.1 reach `--help` without stderr; and 26.6.0,
26.7.0, and 27.0.0 each warn once and reach the same help successfully. The old
implementation fails the selected regression 1/1 with its stale `<27` message,
omits both 26.x warnings, and refuses 27. An additional compiled run under the
real installed Node 26.7.0 without an FFI flag exits 0 after re-execution with
exactly one warning and one usage frame, proving warning placement does not
duplicate output.

All four Application test files pass 22/22, and Application typecheck/build pass.
The compiled Application root still exposes only `createReviewingApplication`.
The launcher still exposes only `openDeveloperReviewing` and
`openDeveloperWorkspaceRuntime`. Existing FFI re-execution, signal forwarding,
arguments, package/root engine ranges, `.nvmrc`,
root Node check, and support manifest are unchanged.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes the dependency
firewall, all 24 files / 141 tests, typecheck, builds, and smoke. All four compiled
risk probes pass and `git diff --check` is clean. The unrelated root `package.json`
bump remains excluded. A-04 is closed without taking over P54's future support
manifest or the later root support-posture work.
