---
id: WF-102
title: "Durably publish the Workspace Identity registry"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can Workspace Identity report a registry update as ready only after the renamed directory entry is durable, matching Authoritative State's accepted file-sync/rename/directory-sync strength?

## Acceptance evidence

- `writeRegistry` syncs the completed temporary file, renames it over the registry, and syncs the containing registry directory before bootstrap can report `ready`; every opened handle closes on success and failure.
- A Workspace Interface scenario injects failure only for directory-handle `sync()` while allowing regular-file syncs, then observes `bootstrapWorkspace` reject with `workspace-authority-unavailable` / `write-registry` rather than claim readiness.
- Removing the injected failure lets the same checkout recover through its already-written marker and registry without minting a second Workspace identity.
- The regression fails against the old implementation because no directory sync is attempted and the faulted bootstrap incorrectly reports `ready`.
- No public Interface, filesystem port, test-only production option, registry format, or User Configuration behavior changes.
- Focused Workspace Identity tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled target strength and measured cost: [`W-06`](../docs/audit/pre-p17-codebase-findings.md#w-06--atomic-rename-durability-is-applied-at-three-different-strengths)
- State/projection disposition: [Disposition the Workspace state and projection findings](./WF-072-disposition-workspace-state-and-projection-findings.md)

## Constraints

- Preserve marker authority, registry locking, atomic rename, permissions, and fail-closed diagnostics.
- Do not broaden this Workspace child into the separately settled Application post-rename `fs.access` repair or its accepted preference-sync posture.
- Keep fault injection entirely in the test's filesystem Adapter; do not widen Workspace construction or bootstrap inputs.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `writeRegistry` now follows the accepted Authoritative State strength: it
syncs and closes the complete temporary file, atomically renames it, restores the
registry's `0600` mode, then opens and syncs the containing registry directory
before Workspace bootstrap can report `ready`. The private directory-sync helper
closes its handle in `finally`, and any open, sync, or close failure remains the
existing fail-closed `workspace-authority-unavailable` / `write-registry`
diagnostic.

The new Workspace Identity scenario faults the real filesystem Adapter's
`FileHandle.sync()` only when the handle is a directory. Marker and registry
temporary-file syncs still invoke the real implementation. The old source fails
the regression by returning `ready`, proving it never crosses the injected
directory durability barrier. The repaired source rejects visibly after rename;
once the fault is removed, the same checkout recovers the already-written marker
and sole registry registration and exposes that exact Workspace identity through
`Workspace.read`, rather than minting replacement authority.

No registry bytes, locking rule, marker authority, public Interface, production
test seam, or Application preference behavior changed. On Node 26.5.1 with pnpm
11.20.0, the complete Workspace Identity file passes 17/17. `pnpm v1:verify`
passes the dependency firewall, all 19 files / 129 tests, typecheck, builds, and
smoke. All four compiled risk probes pass, and `git diff --check` is clean. The
unrelated root `package.json` bump remains excluded.
