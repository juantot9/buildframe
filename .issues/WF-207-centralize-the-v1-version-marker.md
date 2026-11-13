---
id: WF-207
title: "Centralize the v1 version marker"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: juanan
blocked_by: [WF-206]
created: 2026-09-07
---

## Question

Finding F6: "v1" is baked into identifiers everywhere — `v1:` prefixes on 20+
npm scripts, `tsconfig.v1.json`, `tsconfig.v1-tests.json`, `vitest.v1.config.ts`,
probe script filenames, and the bin name `neoflow-v1-dogfood` — so a v2
migration would touch dozens of files for no functional reason. Decide where
the version marker belongs (one constant or the package version), which
filenames and script names lose the marker, and which keep it because they
denote a durable wire or format version rather than an effort label. Update
every reference, including the CI workflow adopted by
[Adopt GitHub Actions continuous verification](./WF-206-adopt-github-actions-continuous-verification.md),
and prove the canonical verify chain still passes.

## Blocked by

- [Adopt GitHub Actions continuous verification](./WF-206-adopt-github-actions-continuous-verification.md) — both reshape the root `package.json`, and the CI workflow references the script names this ticket renames.

## Resolution

The `v1` marker is an effort label, not a version: the repository contains only
the active source graph, and the versions that matter — State format 2, the
protocol and capability identities, and checksum domain separators — are owned
by their modules and keep their `v1`/`format-1` names. No effort-wide constant
is introduced, because no effort-wide marker remains; the product version keeps
its existing homes (`package.json#version` for code, `support/manifest.json`
for release coordinates).

Names that lose the marker:

- Root npm scripts drop the `v1:` prefix, and the version-agnostic aliases
  become the canonical names (`v1:test:full` + `test` → `test`,
  `v1:verify` + `verify` → `verify`, and likewise for lint, format,
  dependencies, typecheck, build, smoke, dogfood, and risk);
  `v1:fixture:state:v1` → `fixture:state`.
- `tsconfig.v1.json` → `tsconfig.json`, the shared strict source config the
  four package configs extend; `tsconfig.v1-tests.json` →
  `tsconfig.tests.json`.
- `vitest.v1.config.ts` → `vitest.config.ts`.
- Probe and check scripts drop the suffix: `probe-authoritative-state.mjs`,
  `probe-local-runtime.mjs`, `probe-pi-adapter.mjs`, `probe-dogfood.mjs`,
  `smoke-build.mjs`, `check-dependencies.mjs`,
  `generate-authoritative-state-golden.mjs`.
- The dogfood bin `neoflow-v1-dogfood` → `neoflow-dogfood`, including its
  usage line.

Names that keep the marker because they denote durable wire or format
identities rather than an effort: `neoflow-state-record-v1`, the command,
request, and result checksum domains, the `pi-direct-*-review-v1` capability
and contract identities, protocol version `1` and `schemaVersion` fields, the
`legacy-review-v1` and `format-1` fixtures, and the manifest's `schemaVersion`
and `protocols`.

Live references are updated: root `package.json`, the four package `tsconfig`
extends, `tsconfig.tests.json`, `.github/workflows/verify.yml`, `README.md`,
`HANDOFF.md`, and the dependency firewall's retired-path list — the renamed
`scripts/smoke-build.mjs` reclaims a retired standalone name, so that entry
leaves the list. Dated audit, research, and issue records keep the names they
recorded; they are history, not live references.

## Acceptance

- [x] Every live effort-labeled script, config, probe, and bin name loses
      `v1`; durable wire/format identities keep theirs.
- [x] Every live reference is updated (root scripts, package configs, CI
      workflow, README, HANDOFF, firewall retired paths), and dated records
      are left as history.
- [x] The canonical `pnpm verify` chain passes, and the compiled risk probes
      run from their renamed entry points.

## Completion evidence (2026-09-17)

- Renamed: the 18 canonical root scripts (no `v1:` prefix and no duplicate
  aliases), `tsconfig.json` + `tsconfig.tests.json`, `vitest.config.ts`, the
  probe/check/smoke scripts
  (`probe-authoritative-state`, `probe-local-runtime`, `probe-pi-adapter`,
  `probe-dogfood`, `smoke-build`, `check-dependencies`,
  `generate-authoritative-state-golden`), and the `neoflow-dogfood` bin with
  its usage line.
- Live references updated: root `package.json`, the four package `tsconfig`
  extends, `.github/workflows/verify.yml`, `README.md`, `HANDOFF.md`, and
  `scripts/check-dependencies.mjs` — its retired-path list drops
  `scripts/smoke-build.mjs`, which the active smoke script reclaimed, with a
  comment recording why.
- `git grep` finds no live reference to an old name. Remaining hits are the
  `.issues/`, `docs/audit/`, and `docs/research/` records and the durable
  `legacy-review-v1`/`queue-v1`/`receipts-v1` fixtures, protocol and capability
  identities, and checksum domains.
- `pnpm verify` on Node 26.5.1: lint, format, dependency firewall, 44 files /
  380 tests, package and test typechecks, clean builds, and build smoke pass
  (6m59s). All four compiled risk probes pass from their renamed entry points:
  `risk:state`, `risk:runtime`, `risk:pi` (Pi 0.80.6 live probe), and
  `risk:dogfood` (end-to-end executable and fault probe).
- `node apps/neoflow/dist/developerExecutable.js --help` prints the
  `neoflow-dogfood` usage line; the `Neoflow v1 Reviewing dogfood` banner stays
  as product identity rather than an effort label.
