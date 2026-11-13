---
id: WF-129
title: "Enforce unused declaration checks"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-128]
created: 2026-08-27
---

## Question

Can the active v1 graph enforce TypeScript's unused-local and unused-parameter checks while deleting only the declarations the settled posture already proved dead?

## Acceptance evidence

- `tsconfig.v1.json` enables `noUnusedLocals` and `noUnusedParameters`; the flags remain out of `tsconfig.base.json`, so legacy source scheduled for cutover is not pulled into this gate.
- The current pre-change compiler control fails with 17 diagnostics: eight across active production source and nine across tests. The historical “18 declarations” count is corrected to the current tree rather than used to manufacture another deletion.
- Every reported dead private import, constant, helper, and parameter is removed together with any import made dead by that deletion. No exported declaration, live validation, cancellation guard, durable fact, package Interface, or reachable test assertion is removed.
- All four package typechecks and `tsconfig.v1-tests.json` pass with both flags inherited from the shared v1 configuration.
- Temporary unused-local and unused-parameter controls fail with actionable TS6133 diagnostics under the canonical typecheck configuration, then are removed.
- Focused Git process, Workspace Harness Interaction/Projection, Local Runtime, Pi Adapter, and Application tests retain behavior; source-island and compiled smoke surfaces remain exact.
- No linter, formatter, dependency, package manifest, lockfile, or separate configuration file is added. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled compiler-only posture and location: [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
- Current-tree execution obligation: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)
- Root-pass ownership confirmation: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)

## Seam decision

Use TypeScript's existing shared v1 configuration as the gate. The two flags deepen the canonical static check without adding a tool or Interface. Delete only compiler-proved private residue in the same change; do not turn this into a dead-export sweep, refactor, or cleanup of code the flags do not name.

## Constraints

- Put both flags only in `tsconfig.v1.json`; `tsconfig.v1-tests.json` inherits them.
- Keep runtime semantics, durable bytes, diagnostics, timeouts, package exports, and reachable test assertions unchanged.
- Do not delete an exported declaration merely because no in-repository caller uses it; unused exports remain a separately settled class.
- Do not follow lint-style “unnecessary” advice into untrusted-input validation or post-`await` guards.
- Remove all temporary mutation controls before canonical verification.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

`tsconfig.v1.json` now enables `noUnusedLocals` and `noUnusedParameters`. Every active package config and `tsconfig.v1-tests.json` inherits the checks; `tsconfig.base.json` remains unchanged, and all five legacy package typechecks still pass without inheriting the new gate.

The fresh pre-change census found 17 unique diagnostics rather than the historical 18: eight in active production source and nine in tests. The same change removes exactly that private residue plus imports made dead by those removals. Production loses one unused Git-boolean key parameter, one Harness Interaction type import, two Projection constants, one decoder helper and its import, and three Application imports. Tests lose three initially unused imports, six wholly unreachable helpers, and three type imports those helpers had kept alive; only assertions trapped inside those unused helper bodies disappear. No exported declaration, reachable validation/assertion, timeout, durable fact, or package Interface changes.

All four package typechecks plus the v1 test config pass with both checks active. A temporary exported control containing one unused parameter and one unused local passes when both checks are explicitly disabled, then fails under the inherited configuration with two exact TS6133 diagnostics; removing it returns Workspace typecheck to green. The focused affected surface passes 11 files / 68 tests across Git process, Harness Interaction, Projection, Local Runtime, Pi Adapter, and Application behavior.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes the strengthened static gate, all 25 files / 145 tests, dependency checks, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. No linter, formatter, dependency, manifest, lockfile, package Interface, or separate configuration file was added; the unrelated root `package.json` bump remains excluded.
