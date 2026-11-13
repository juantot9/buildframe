---
id: WF-056
title: "Decide the declared Node version range"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-05
assets: []
---

## Question

What Node version range should each package declare, and should the repository pin a development Node version at all?

## Established facts

Three different postures exist today:

| Package | Declared `engines.node` |
| --- | --- |
| `apps/neoflow` | `>=26.4.0 <27` |
| `packages/workspace`, `packages/local-runtime`, `packages/pi-adapter` | `>=22.19.0` |
| Root, `apps/cli`, `apps/tui`, `packages/core`, `packages/ai-harness`, `packages/pi-connector` | none |

- `apps/neoflow`'s narrow range exists because OpenTUI `0.5.1` needs `--experimental-ffi`, which Gate A proved under Node `26.4.0`.
- No `.nvmrc`, `.node-version`, `.tool-versions`, or Volta pin exists anywhere. Root declares `packageManager: pnpm@11.10.0`, so the package manager is pinned while the runtime is not.

## Notes

- Takeable in parallel with [Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md): the facts above are settled and need nothing from the ledger.
- This is a configuration-consistency decision only. It is **not** a release, publishing, or packaging decision—those remain with [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md) and are out of scope for this map. Decide what the repository declares and pins for development, not what gets published or under which coordinate.
- The three active packages' `>=22.19.0` claim is worth testing rather than assuming: they are consumed by an application that cannot run below `26.4.0`, so the question is whether the lower range is a genuine supported floor or an unproven leftover.

## Resolution comment

The repository declares one Node range everywhere it declares one at all, pins a
development version, and guards the routes that depend on the FFI flag. The
`>=22.19.0` floor is retired: it was never tested, and it could not have been,
because the packages' own test route injects `--experimental-ffi`, a flag that
does not exist below Node 26.

| Where | Value |
| --- | --- |
| `.nvmrc` | `26.5.1` |
| `engines.node` — root, `apps/neoflow`, `workspace`, `local-runtime`, `pi-adapter` | `>=26.4.0 <26.6.0` |
| `engines.node` — the five legacy packages | unchanged (none declared) |
| `@types/node` | `^26.1.2`, resolving to 26.1.2 |
| guard | `scripts/check-node-version.mjs`, prefixed onto `v1:test:fast`, `v1:test:full`, `v1:risk:dogfood`, `v1:dogfood` |

Legacy keeps declaring nothing because it genuinely runs below 26 — its suite
passes on Node 24.18.0 — and polishing packages scheduled for deletion is out of
scope for this map.

### Node 26.6.0 and later are unusable for this repository

This was found by installing the current release rather than reasoning about it,
and it is the reason the range has an upper bound rather than `<27`.

| Version | Full `v1:test:full` | Wall clock |
| --- | --- | --- |
| 26.4.0 | 85/85, twice | 13.95s, 14.00s |
| 26.5.0 | 85/85 | 14.37s |
| 26.5.1 | 85/85 | 14.08s |
| 26.6.0 | not run — spawn probe already disqualifying | — |
| 26.7.0 | 3 to 5 tests fail, run to run | 75.15s |

The cause is a `child_process` spawn regression that first appears in **26.6.0**
(released 2026-08-03), not in 26.7.0. Resolving a command through `PATH` costs
roughly 47ms instead of 12ms; spawning by absolute path is barely affected.
Measured with 21 `PATH` entries, `spawnSync('git', ['--version'])` ×30:

| Version | via `PATH` | via absolute path |
| --- | --- | --- |
| 26.4.0 | 354ms / 322ms | ~313ms |
| 26.5.0 | 318ms / 320ms | ~314ms |
| 26.5.1 | 319ms | ~311ms |
| 26.6.0 | 2008ms / 1593ms | ~317ms |
| 26.7.0 | 1587ms / 1479ms | ~362ms |

`node:sqlite`, `crypto`, and file I/O are identical across all of them, so this
is specific to process spawning. Neoflow's Workspace shells out to `git`
constantly, which is why the scenario tests degrade by roughly 10× while the
fast tests are untouched. The failures that follow are timeouts and one blown
performance budget rather than logic errors, and their count varies run to run —
the slowdown is the defect, the failures are downstream of it.

The measured numbers and their date are written into the guard's failure message
so the next person to hit this does not have to rediscover them.

### The pin is 26.5.1, and that moves it off Gate A's proved version

Gate A was a human visual acceptance of the OpenTUI renderer. No automated test
covers whether the FFI renderer draws correctly, so 85/85 on 26.5.1 does not
re-establish it, and this was raised before the choice was made. 26.5.1 was
chosen for the five weeks of upstream fixes over 26.4.0.

The fallback is preserved deliberately: 26.4.0 remains inside `engines`, so if a
rendering fault ever appears, `nvm use 26.4.0` returns to the exact version a
human accepted. Do not narrow the range's lower bound past 26.4.0 without
re-running Gate A's visual check.

### `@types/node` — R-01 is closed, and it cost two characters

Bumping four majors produced exactly one compiler error across the whole
repository, and it was a real one the stale types had been hiding:

- `packages/local-runtime/src/lifecycle.ts:462` — `process.disconnect()` is
  typed `disconnect(): void` in 22.20.0 but `disconnect?(): void` in 26.1.2. The
  optional form is correct: like `process.send`, it exists only on a process
  spawned with an IPC channel. The same file already guards `send` for exactly
  this (`process.send === undefined || !process.connected`, line 453) and did
  not guard `disconnect`. Fixed with `process.disconnect?.()`.

With that one change, all four v1 projects, the v1 test project, and all five
legacy packages typecheck clean. The bump and the fix must stay together; the
bump alone leaves the repository red.

### Why a guard exists at all

Neither declaration mechanism can prevent the failure this ticket found.

- `engines` only warns. pnpm 11.10.0 does not fail the install on the root
  project's own `engines`, and it does not fail even with `engine-strict=true` —
  both were probed directly.
- `.nvmrc` is inert here. The shell loads plain `nvm` with no `chpwd` hook, so
  nothing switches Node on entering the directory.

The guard is the only mechanism that fires on the command actually typed. It
reads the range from root `package.json` rather than restating it, so the
declaration stays the single source of truth. It was verified to exit 1 on
26.7.0 and on 24.18.0, exit 0 on 26.5.1, and to stop `v1:test:fast` before
vitest starts.

### Verification

`pnpm verify` — the complete route, legacy and v1 — passes on 26.5.1: exit 0,
17/17 test files, 85/85 tests, both preflight checks reporting pass. Before this
change the same command could not start on the development machine at all, which
runs 24.18.0: `node: --experimental-ffi is not allowed in NODE_OPTIONS`,
exit code 9.

### This map's no-code-changes rule was waived deliberately

The owner waived it for this ticket, with the reasoning that the change touches
no product logic and is self-proving — its success criterion is that `pnpm
verify` runs, which is the very thing the rule protects. The objection raised at
the time was that the change could not be verified because Node 26 was not
installed; that objection was withdrawn once it became clear `nvm install`
persists to disk and the pinned binary could be invoked directly. It was then
verified in full.

### Consequence for packaging, which this ticket does not decide

[Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)
is closed and says the application package "declares only explicitly tested Node
major ranges beginning at the settled **Node 22.19.0** floor". That floor is now
stale twice over: Gate A settled the renderer on 26.x after WF-050 closed, and
this ticket retires 22.19.0 outright. The *principle* — declare only explicitly
tested ranges — is what today's evidence follows.

What is left for packaging to weigh, not decided here: WF-050 also rules out
bundling Node ("Do not add Homebrew, standalone Node bundles, platform binaries,
containers, or a self-updater in v1"), so a public `neoflow` npm consumer must
supply their own runtime. The tested window is currently three patch releases on
a line that is not yet LTS. Node 26 becomes LTS in October 2026, and the
regression is recent enough that an upstream fix may reopen the upper bound.
Widening `engines` requires a full suite run on the candidate version — a
passing spawn probe is not evidence of support.
