---
id: WF-185
title: "Hard-cut the legacy product source"
status: closed
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: [WF-174]
created: 2026-09-02
---

## Outcome

`apps/neoflow` becomes the only application source and the active v1 Workspace,
Local Runtime, and Pi Adapter become the only supporting package graph. The
retained legacy TUI, CLI, shared core, Mock harness, Pi connector, Neovim bridge,
old root routes, compiled smoke, workspace importers, and now-unused
Ink/React/Commander lock graph are removed in one coordinated cut. No user data,
v1 State, Configuration, migration evidence, historical issue/audit evidence,
prototype branch, or release manifest is removed or rewritten.

## Grounding

- P18 authority: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Hard-cut and data-retention decision: [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- Proven importer dependency: [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- Exact deletion-bound census: [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- Release assembly remains downstream: [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)

## Cut set

Delete these production-branch source trees and their manifests, tests,
tsconfigs, and checked-in workspace links exactly:

```text
apps/tui
apps/cli
packages/core
packages/ai-harness
packages/pi-connector
nvim
```

Delete the legacy-only `scripts/smoke-build.mjs`. Remove root `dev:tui`,
`dev:cli`, `start:tui`, every `legacy:*` route, and composite legacy execution
from `test`, `typecheck`, `build`, `smoke:build`, and `verify`; those generic
routes become aliases of the already-proven v1 routes. Regenerate the lockfile
from the remaining workspaces so the five retired importers and otherwise-unused
Commander, Ink, React, and React type graph disappear.

Rewrite the root README and stale root handoff as truthful source-stage v1
instructions/topology. Keep historical `.issues/**`, `docs/audit/**`, and
research citations intact even when they name deleted paths. Keep
`support/manifest.json` byte-identical for P54.

## Guard seam

Deepen `scripts/check-v1-dependencies.mjs` rather than adding a shallow second
scanner. Give it a static retired package/path vocabulary so it both rejects any
remaining/reintroduced legacy directory and continues rejecting old package
imports after their manifests are gone. It also checks that root scripts and the
lockfile contain no retired package coordinate/importer/link. Historical issue,
audit, and research text is evidence and is not treated as executable source.

The resulting root `verify` has one meaning: dependency/cutover policy plus the
active v1 tests, types, build, and compiled smoke. No compatibility alias starts
or tests a deleted product.

## State and safety invariants

- Remove code only. Never inspect, copy, print, chmod, move, delete, or rewrite
  `.neoflow/review.json`, any legacy receipt, v1 State generation/lock/BLOB,
  Configuration, or other user data. Use exact repository-relative deletion
  paths; never use a filesystem search as a deletion input.
- Do not retain a wrapper, forwarding export, fallback, dual writer, generic
  mode protocol, Mock route, old socket/CLI alias, hidden executable, or package
  coordinate. If active source still needs a deleted mechanic, stop and give the
  owning v1 Module a focused transplant rather than restore compatibility.
- Preserve `packages/workspace`, `packages/local-runtime`,
  `packages/pi-adapter`, and `apps/neoflow` Interfaces and behavior unchanged.
  Workspace/Local Runtime stay version 1 and State stays format 2.
- Preserve all P17 importer source, sanitized fixtures, migration records, and
  explicit reads/commands. Deleting the old producers does not delete their
  user files or make migration evidence canonical v1 history.
- Preserve `support/manifest.json` and public coordinates as unreleased; P54
  alone owns package naming, release metadata, artifact assembly, and install
  commands.
- Preserve the unrelated working-tree `package.json` package-manager bump. Stage
  only P18 script edits against the committed package-manager value so that bump
  remains the sole unstaged change after the cutover commit.

## Decisions during execution

- [Serialize wall-clock v1 scenario files](./WF-186-serialize-wall-clock-v1-scenario-files.md) — closed: the cutover gate demonstrated that default cross-file fixture contention can invalidate unrelated wall-clock evidence under a loaded host; the canonical file lane is serialized without changing any product/test timeout or assertion.

## Acceptance

- [x] The full pre-cut legacy verification passes once at the planned checkpoint;
      then all six exact legacy trees and `scripts/smoke-build.mjs` are absent
      from the repository and workspace graph.
- [x] No active source, manifest, root route, README instruction, lock importer,
      workspace link, package coordinate, executable alias, Mock fallback, old
      protocol, or Neovim command reaches the retired product.
- [x] Generic `test`, `typecheck`, `build`, `smoke:build`, and `verify` execute
      only the active v1 graph; all `legacy:*`, old TUI/CLI start/dev, and
      compatibility routes are gone.
- [x] The deepened dependency/cutover guard fails focused negative controls for a
      reintroduced retired directory, old package import, root script reference,
      and lockfile importer/link, then passes after exact restoration.
- [x] A frozen install from the regenerated lockfile succeeds and proves the
      retired importers plus otherwise-unused Commander/Ink/React packages are
      absent while reviewed active dependencies remain pinned.
- [x] Canonical verification, all four compiled risk probes, active source and
      compiled package seams, and `git diff --check` pass on Node 26.5.1 / pnpm
      11.20.0. The first Reviewing dogfood executable still builds and runs its
      fault probe with no legacy fallback.
- [x] `support/manifest.json`, P17 sanitized fixtures, ignored legacy user bytes,
      and v1 stores remain untouched. `git status` shows only the unrelated root
      package-manager bump after the focused cutover commit.

## Non-goals and constraints

- Do not delete or rewrite historical issue/audit/research evidence, prototype
  branches, user data, v1 records, migration BLOBs, or Configuration.
- Do not add public package coordinates, installer/setup behavior, release
  metadata, upgrade/rollback policy, support claims, or a replacement editor
  integration. P54 and its downstream release packages own those decisions.
- Do not refactor or polish active v1 Modules during deletion. Any demonstrated
  active regression returns to its existing owner in a separate child.
- Do not preserve a legacy test merely to test deleted behavior; keep only
  behavior already transplanted behind an active owner's Interface.

## Resolution

Closed on 2026-09-02. The coordinated cut removes `apps/tui`, `apps/cli`,
`packages/core`, `packages/ai-harness`, `packages/pi-connector`, `nvim`, the
legacy compiled-smoke script, and the last production-branch disposable
prototype. `apps/neoflow` is now the sole application source; Workspace, Local
Runtime, and Pi Adapter are the only supporting source packages. No wrapper,
forwarding export, legacy command, Mock fallback, old socket protocol, editor
alias, or compatibility route remains.

The generic test, typecheck, build, smoke, and verify commands now delegate only
to their v1 routes. The regenerated frozen lock has four package importers plus
the root workspace and no retired importer, workspace link, Commander, Ink,
React, or React-types graph. A frozen offline install completed with exactly
those five workspace projects. The deepened existing dependency firewall keeps
static retired path/package authority after deletion and rejected focused
mutations that restored a retired directory, package import, root route,
lockfile importer/link, or disposable prototype before passing after exact
restoration.

The pre-cut legacy verification passed before deletion. After the cut, the
serialized canonical lane passed all 32 files / 221 tests unchanged; dependency
policy, package and test typechecks, clean builds, compiled smoke, active source
islands, and `git diff --check` passed on Node 26.5.1 / pnpm 11.20.0. The State,
Local Runtime, Pi Adapter, and end-to-end dogfood compiled risk probes all
passed, including the first Reviewing executable's fault path without a legacy
fallback. Focused reruns also confirmed that unrelated loaded-host stalls did
not represent semantic failures.

`support/manifest.json` and every P17 sanitized fixture remain byte-identical.
No real legacy user source or receipt and no real-user v1 State, Configuration,
or store was read, copied, moved, rewritten, or deleted. Workspace and Local
Runtime remain Interface version 1, State remains format 2, and public
coordinates and release assembly remain deferred. The unrelated root
package-manager bump stays outside the cutover commit.
