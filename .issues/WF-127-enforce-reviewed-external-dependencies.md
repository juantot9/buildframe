---
id: WF-127
title: "Enforce reviewed external dependencies"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-126]
created: 2026-08-27
---

## Question

Can the existing v1 dependency firewall reject every unreviewed third-party package while preserving the exact owner, source/test lane, manifest-field, and package-subpath uses the active source island needs?

## Acceptance evidence

- `scripts/check-v1-dependencies.mjs` owns one explicit external-package policy beside each v1 owner; unknown bare packages no longer fall through as allowed.
- Production source allows no external package for Workspace or Local Runtime, only Pi's host package for Pi Adapter, and only OpenTUI for the Application.
- Test source allows only `vitest` for all four owners plus OpenTUI for Application tests. An allowed package subpath, including `@opentui/core/testing`, inherits only its reviewed top-level package decision.
- Manifest fields allow only Application `dependencies.@opentui/core` and Pi Adapter `devDependencies` / `peerDependencies` on `@earendil-works/pi-coding-agent`. Empty fields and every internal v1 dependency retain their current behavior.
- Diagnostics name the exact file, unapproved specifier, and production-source, test-source, package-import-target, or manifest-field context.
- Live negative controls prove the new dimensions independently: an unknown test import, test-only `vitest` in production source, and a package in an unapproved manifest field each fail at the exact control. The old script accepts those same controls. All controls are removed.
- The canonical dependency check passes over current source, tests, prototypes, and manifests. Legacy-package/path and outward-v1 controls remain enforced without widening any package Interface.
- No package manifest, lockfile, source-package dependency, package Interface, or test configuration changes. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled S-03 policy and intentional dependency census: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Ranked finding: [`S-03`](../docs/audit/pre-p17-codebase-findings.md#s-03--the-v1-dependency-firewall-does-not-police-third-party-dependencies)
- Existing enforcement seam: [`scripts/check-v1-dependencies.mjs`](../scripts/check-v1-dependencies.mjs)

## Seam decision

Deepen the existing firewall rather than adding another script, package, or exported Interface. The reviewed policy is owner-local data; one private check applies it to manifest declarations and parsed module specifiers. Keep package-name approval at the top-level package so legitimate reviewed subpaths do not require a second shallow list.

## Constraints

- Change only the existing dependency script plus issue records.
- Do not infer approval from installation, lockfile presence, registry identity, workspace privacy, or another owner's allowlist.
- Keep manifest fields and production/test source lanes distinct; do not replace the policy with one repository-wide bag of package names.
- Preserve every legacy and v1 dependency-direction rejection and all relative/path handling.
- Remove every negative control before canonical verification.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The existing firewall now owns an explicit external-dependency policy beside each v1 package. Workspace and Local Runtime production admit no third party; Pi Adapter production admits only `@earendil-works/pi-coding-agent`; Application production admits only `@opentui/core`. Test policy independently admits `vitest` for each owner and OpenTUI for Application tests, so the existing `@opentui/core/testing` subpath inherits the reviewed package decision without creating a shallow subpath list.

Manifest policy is field-specific: only Application `dependencies` may name OpenTUI, and only Pi Adapter `devDependencies` / `peerDependencies` may name the Pi host. Recognized self/inward v1 dependencies return through their existing direction policy rather than being mistaken for externals. `node:` built-ins and relative/file paths retain their prior handling, while unknown bare specifiers now report the exact owner file and production-source, test-source, package-import-target, or manifest-field context. The source census also now covers explicit CommonJS `.cjs` / `.cts` variants instead of leaving an extension-shaped bypass.

Three simultaneous controls demonstrate the old behavior and the repair: an unknown `left-pad` test import, production `vitest` import, and OpenTUI in the wrong manifest field all pass under the old script; the repaired script rejects all three at their exact files and contexts. A separate package-import target rejects `left-pad`, and a `.cjs` `require('left-pad')` is also caught. Existing live controls still reject a legacy `@neoflow/core` import and an outward Workspace-to-Local-Runtime import. Every control and manifest mutation was removed, and the canonical firewall passes the current source, tests, prototypes, and manifests.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes the strengthened firewall, all 25 files / 145 tests, typecheck, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. No package manifest, lockfile, dependency, package Interface, source-package file, test, or configuration changed; the unrelated root `package.json` bump remains excluded.
