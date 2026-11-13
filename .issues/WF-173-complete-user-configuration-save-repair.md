---
id: WF-173
title: "Complete the User Configuration save repair"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-172]
created: 2026-09-01
---

## Question

Can the Application complete W-06's already-settled post-rename repair so a committed Configuration save is not falsely reported as failed?

## Acceptance evidence

- `FileUserConfiguration.saveReviewingPreferences` treats successful same-directory rename as the save's commit point and performs no post-commit `fs.access` test.
- A focused fault proves the replacement bytes are committed and readable while a post-rename access probe would reject; current source returns `rejected`, while corrected source returns `saved` and never emits “Layout was not saved.”
- Unknown-field preservation, malformed/newer refusal, `0600` temporary creation, same-directory atomic replacement, cleanup, save serialization/debounce, exit flush, and all reviewing preferences remain unchanged.
- No file or directory fsync is added: W-06's accepted weaker durability for portable presentation preferences remains in force.
- Focused User Configuration/Application evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Active v1 anti-pattern audit, already-owned W-06 discrepancy](../docs/audit/active-v1-antipatterns-2026-09-01.md#w-06--post-rename-user-configuration-fsaccess-remains-present)
- W-06 in [`pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md#w-06--atomic-rename-durability-is-applied-at-three-different-strengths)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

This is completion of an existing Application-owned disposition, not a new anti-pattern or durability policy. Remove the misleading post-commit check at the Configuration seam; add no filesystem abstraction.

## Constraints

- Preserve exact Configuration JSON shape/defaults, workflow State separation, paths, modes, and accepted unsynced preference durability.
- Do not change warning text for genuine pre-commit save failures.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. `FileUserConfiguration.saveReviewingPreferences` now returns `saved`
immediately after its existing same-directory rename and best-effort temporary
cleanup. The post-commit `fs.access` call and now-unused constants import are
deleted. The pre-commit read/validation, `0700` directory creation, exclusive
`0600` temporary write, atomic rename, cleanup, serialization/debounce, and exit
flush paths are unchanged. No file or directory fsync was added, retaining
W-06's accepted weaker durability for portable presentation preferences.

A focused real-Application fault replaces the process-local `fs.access` export
with a rejecting probe, records the File Configuration result, changes one
preference through the real Configuration overlay, and closes the overlay
before settlement. Corrected source never calls the probe, returns exactly
`{ status: 'saved' }`, leaves readable `0600` replacement bytes carrying the
selected `warm-carbon` theme, and emits no `Layout was not saved` text in either
the semantic tree or raw terminal frames. Restoring the old post-rename call
returns `rejected` with the injected failure even though those replacement bytes
have already committed.

On Node 26.5.1 with pnpm 11.20.0, five User Configuration contracts plus the
focused Application fault pass. Canonical `v1:verify` passes 27 files / 160
tests, typecheck, builds, and smoke; all four compiled State, Local Runtime,
reviewed Pi 0.80.6, and dogfood probes pass, and `git diff --check` is clean.
Configuration shape/defaults, unknown fields, refusal rules, warnings for genuine
pre-commit failure, workflow State separation, package Interfaces, user data,
and the unrelated `package.json` bump remain unchanged.
