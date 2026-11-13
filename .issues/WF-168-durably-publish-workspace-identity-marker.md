---
id: WF-168
title: "Durably publish the Workspace Identity marker"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: []
created: 2026-09-01
---

## Question

Can Workspace Identity retain its exclusive hard-link installation while reporting `ready` only after the authoritative marker's directory entry is durable?

## Acceptance evidence

- Successful first installation preserves the exact marker bytes, `0600` mode, same-directory temporary file, hard-link no-overwrite race, collision behavior, and Workspace Interface.
- Marker publication syncs complete temporary bytes, performs its final directory operations, and syncs the marker's Git administration directory before authority can return.
- A Workspace Identity fault scenario rejects specifically at the marker-directory sync with `workspace-authority-unavailable` / `write-marker`; current source fails by returning `ready` because it never attempts that sync.
- Removing the fault lets the same checkout establish exactly one marker/registry identity without replacement, and a concurrent installer still adopts the one winning marker.
- Focused Workspace Identity evidence, canonical verification, all four compiled probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Active v1 anti-pattern audit, AV-01](../docs/audit/active-v1-antipatterns-2026-09-01.md#av-01--workspace-marker-publication-stops-before-the-directory-durability-barrier)
- [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- W-06 and [Durably publish the Workspace Identity registry](./WF-102-durably-publish-workspace-identity-registry.md)

## Seam decision

Marker publication already belongs to the private Workspace Identity Module. Deepen that operation through its existing filesystem primitives; add no filesystem Interface or generic durability helper and do not weaken marker authority.

## Constraints

- Preserve marker and registry formats, identity/collision semantics, diagnostics, and package Interfaces.
- Do not reconstruct a missing marker from the registry, mint on ambiguity, or touch real Workspace data.
- Do not generalize identity durability to accepted unsynced presentation preferences.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. `resolveUnderLock` now crosses one marker-directory `FileHandle.sync()`
after reading or atomically installing the authoritative marker and before
registry reconciliation can return identity authority. The existing
same-directory `0600` temporary file, complete file sync, hard-link no-overwrite
race, best-effort temporary cleanup, marker bytes, collision rules, and registry
format are unchanged. Existing markers cross the same barrier, which both
upgrades pre-WF-168 installations and lets a marker left by a failed first sync
recover without replacement on the next bootstrap.

The Workspace Identity scenario now separates the two directory barriers. A
marker-only sync fault observes `workspace-authority-unavailable` /
`write-marker`, then recovers the already-linked marker and registers that exact
identity after the fault is removed. A second scenario allows the marker sync
and faults only the following registry sync, preserving WF-102's
`write-registry` evidence. Restoring the old source makes both focused scenarios
fail: the first reports the later registry owner, and the second incorrectly
returns `ready` because only one directory sync exists.

On Node 26.5.1 with pnpm 11.20.0, all 18 Workspace Identity scenarios pass.
Canonical `v1:verify` passes 26 files / 153 tests, typecheck, builds, and smoke;
all four compiled State, Local Runtime, Pi Adapter, and dogfood probes pass, and
`git diff --check` is clean. No production Interface, durable byte, diagnostic
shape, dependency, user data, or unrelated `package.json` change was included.
