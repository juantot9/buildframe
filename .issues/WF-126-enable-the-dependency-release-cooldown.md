---
id: WF-126
title: "Enable the dependency release cooldown"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-125]
created: 2026-08-27
---

## Question

Does the root package-manager policy explicitly hold ordinary dependency versions for 24 hours while preserving every reviewed exact Pi and OpenTUI exception?

## Acceptance evidence

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`; the value is minutes and therefore encodes the settled 24-hour policy in repository-owned configuration.
- All 13 exact exceptions actually present remain byte-for-byte and in order: four Pi 0.80.6 packages and nine OpenTUI 0.5.1 packages. The ledger's “fourteen” count is corrected as arithmetic, not satisfied by inventing an exception.
- `minimumReleaseAgeStrict` is not added; explicit age configuration retains pnpm's settled strict approval behavior without duplicating the default.
- A focused old-configuration control reports no project-owned `minimumReleaseAge`, while the repaired workspace reports exactly `1440`. The package-manager configuration parser accepts the complete exclusion list.
- No dependency, package script, install/build allowlist, manifest, or lockfile byte changes. The unrelated root `package.json` pnpm bump remains excluded.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled S-02 value, exceptions, and strictness decision: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Ranked finding: [`S-02`](../docs/audit/pre-p17-codebase-findings.md#s-02--the-dependency-cooldown-the-workspace-appears-to-configure-is-not-on)

## Seam decision

This is one root package-manager policy change, not a new Module or verification wrapper. Put the explicit age beside the existing reviewed exceptions. Do not move package resolution into a script, duplicate pnpm's policy engine, or add a test that parses YAML instead of exercising pnpm's configuration Interface.

## Constraints

- Change only `pnpm-workspace.yaml` plus issue records.
- Preserve every existing exception, `allowBuilds`, and `onlyBuiltDependencies` entry exactly.
- Do not add `minimumReleaseAgeStrict`, alter the cooldown value, regenerate the lockfile, or resolve any dependency.
- Do not stage the unrelated root `package.json` modification.

## Resolution comment

`pnpm-workspace.yaml` now declares `minimumReleaseAge: 1440` immediately before the existing exception list, making the settled 24-hour cooldown repository-owned. No strictness override was added; explicit age configuration keeps pnpm's strict approval behavior.

The edit is purely additive. All 13 exceptions remain byte-for-byte and in their original order: four exact Pi 0.80.6 packages and nine exact OpenTUI 0.5.1 packages. This corrects the finding's stale “fourteen” arithmetic without inventing an unreviewed exception. `allowBuilds`, `onlyBuiltDependencies`, every manifest, and `pnpm-lock.yaml` are unchanged.

Through pnpm 11.20.0's configuration Interface, the committed old configuration control reports project-owned `minimumReleaseAge` as `undefined`; the repaired workspace reports exactly `1440`. `pnpm config list --location project --json` parses all 13 exceptions and confirms there is no explicit `minimumReleaseAgeStrict`. Although pnpm 11.20.0 also has a built-in 24-hour default, the explicit declaration preserves the policy for the repository's still-committed pnpm 11.10.0 baseline rather than depending on whichever tool default happens to run. The first repaired command also performed pnpm's real lockfile supply-chain preflight: all 292 entries passed, including the reviewed exceptions, without changing lockfile bytes.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes all 25 files / 145 tests, dependency checks, typecheck, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. The unrelated root `package.json` bump remains excluded.
