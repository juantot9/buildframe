---
id: WF-206
title: "Adopt GitHub Actions continuous verification"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: []
created: 2026-09-07
---

## Question

Finding F8: there is no CI pipeline despite a CI-shaped composite
`pnpm v1:verify`, and the `engines` pin `>=26.4.0 <26.6.0` is razor-thin.
Settle at charting: CI runs on GitHub Actions (remote `juantot9/neoflow`
exists), executing the canonical `v1:verify` chain on push and pull request.
This ticket also decides the engines question — what Node range the project
promises to run on — since the CI matrix is where that promise is exercised.
Resolve the workflow shape (triggers, matrix, concurrency, caching) and the
engines range as one decision, implement, and prove by a green run on the
remote.

## Resolution

- **Workflow shape.** `.github/workflows/verify.yml` runs the canonical
  `pnpm v1:verify` chain unchanged — no step duplication in YAML — on `push`
  to `main`, `pull_request` targeting `main`, and `workflow_dispatch`.
  Concurrency cancels superseded runs on the same ref; the pnpm store is
  cached through `actions/setup-node`; the job has a 45-minute bound and only
  `contents: read` permission.
- **Matrix.** `macos-latest` at the two boundaries of the engines range:
  `26.4.0` (oldest allowed) and `26.5.1` (`.nvmrc` pin). `fail-fast: false` so
  one boundary cannot hide the other's result. macOS is the platform the
  canonical chain and the manual loop are verified on; the Linux container pass
  surfaced real defects instead of a portable suite — spurious Message-commit
  refusals from capture retention (WF-247) and the unchanged-content line reset
  (WF-248) — so Linux waits for those fixes before it can carry the matrix.
- **Chain hardening.** CI exposed three latent portability assumptions in the
  otherwise-verified chain, now settled: the default Vitest forks pool
  intermittently dies at startup with `ERR_IPC_CHANNEL_CLOSED` (the suite runs
  in the `threads` pool), the directive waits and per-test bounds assumed a
  workstation (raised to 60s polling and the documented longer bounds), tsx
  subprocess tests resolved workspace packages to `dist` on a fresh clone (they
  now request the `development` export condition), and one Workspace Evidence
  scenario assumed a case-insensitive host (now host-conditional).
- **Engines.** The range stays `>=26.4.0 <26.6.0`. The upper bound is a
  measured regression, not drift: Node 26.6.0+ makes every `child_process`
  PATH spawn ~4x slower and the v1 suite times out (recorded in
  `scripts/check-node-version.mjs`, measured 2026-08-06). The matrix now
  exercises the promise at both ends; `.nvmrc` stays the recommended pin at
  `26.5.1`.

## Acceptance

- [x] `.github/workflows/verify.yml` runs `pnpm v1:verify` on push to `main`,
      pull requests targeting `main`, and manual dispatch.
- [x] The Node boundary matrix (`26.4.0`, `26.5.1`) is green on
      `juantot9/neoflow`.
- [x] The engines question is settled in the repository: the range in
      `package.json` and the pin in `.nvmrc` are justified by the CI result.

## Completion evidence (2026-09-17)

- Green run `35202527525`: `v1:verify (Node 26.5.1)` in 5m44s and
  `v1:verify (Node 26.4.0)` in 3m47s on `macos-latest`, covering lint, format,
  dependency firewall, all 44 files / 380 tests, package and test typechecks,
  clean builds, and build smoke.
- The first Linux attempts surfaced real portability gaps instead of a portable
  suite: WF-247 (capture retention spurious commit refusal, open) and WF-248
  (content-line reset, fixed and tested).
- The workflow still carries a cosmetic `pnpm/action-setup@v4` Node 20
  deprecation annotation until that action ships a newer runtime.
