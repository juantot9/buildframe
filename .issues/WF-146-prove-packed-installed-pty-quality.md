---
id: WF-146
title: "Prove packed installed PTY quality"
status: closed
labels:
  - wayfinder:task
parent: WF-140
assignee: juanan
blocked_by: [WF-145]
created: 2026-08-27
---

## Question

Does the current private Workspace ← Local Runtime ← Application package graph survive clean deterministic packing, empty-home tarball installation, native OpenTUI resolution, and real terminal process lifecycle evidence without adding P54 release machinery or relying on source-workspace resolution?

## Acceptance evidence

- Create a clean detached worktree at the exact source commit. With Node 26.5.1 and pnpm 11.20.0, perform a frozen offline install, clean-build Workspace, Local Runtime, and Application, and pack each twice with `--skip-manifest-obfuscation`. Corresponding tarballs are byte-reproducible.
- Every tarball contains only its packed `package.json` and `dist/**`; expected JavaScript/declaration closures, exact exports/bin, engines, local dependency direction, and Application's exact `@opentui/core@0.5.1` dependency hold. No source, test, prototype, generated State, lockfile, or undeclared file ships.
- Install only the three local tarballs plus their declared external closure into an empty disposable package root and HOME, using local-tarball overrides for private `0.0.0` dependencies. Import each documented root/subpath, reject private subpaths, run installed `neoflow-v1-dogfood --help`, and prove the host-specific `@opentui/core-darwin-arm64@0.5.1` package is selected.
- Exercise the installed executable—not a workspace script—through real fresh PTYs in normal and `--no-color --ascii` modes over sanitized disposable Git/State/runtime roots. Each path enters/leaves alternate screen, reaches usable Home and Current Review, handles a 132×32 to 80×24 resize, exits after a real signal, and restores canonical input plus echo.
- Normal output carries terminal styling; no-color output carries no non-reset SGR styling; ASCII output retains required semantic labels with no non-ASCII printable character. Both paths suppress only the expected FFI experimental warning and leave no runtime process/socket behind.
- Record commands, source commit, OS/architecture, Node/pnpm/OpenTUI versions, tarball digests/content counts, installed graph/imports, PTY outcomes, terminal flags, and cleanup outcome in this issue. Remove the worktree, tarballs, package root, HOME, fixtures, sockets, and all disposable probes before closure.
- Rerun canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check`. This child changes issue records only unless evidence exposes a focused owning defect; any defect gets its own planned child before repair.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Verification lanes: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
- Renderer distribution decision: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)
- Packaging boundary: [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)

## Seam decision

This is disposable release evidence over the existing private package Interfaces, not a new test framework or release assembly. Use one owner-local shell/Python probe under `/tmp` to coordinate standard pack/install tools and real POSIX PTYs, record only semantic assertions and digests, then delete it. A persistent packaging or PTY script would prematurely become P54 surface and is forbidden unless a reproduced product defect demonstrates a lasting owner.

## Constraints

- Do not change package names, versions, `private`, exports, dependencies, bins, lockfiles, or support manifests.
- Do not use workspace symlinks, source conditions, repository `node_modules`, scripted OpenTUI renderers, or pseudo-human evidence for installed-path claims.
- Do not print fixture source content beyond intentionally generated sanitized labels.
- Do not claim public release support, CI/platform matrix coverage, Terminal.app human acceptance, or P54 completion.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

The proof ran from detached worktree commit
`65be5bf81af5149baf9f82f5a6885307ab4465c4` on macOS 26.6 build
25G72, arm64, with Node 26.5.1 and pnpm 11.20.0. A frozen offline install
and clean package-ordered builds left that worktree clean. The final disposable
pack command set `UV_THREADPOOL_SIZE=1` and used
`pnpm pack --skip-manifest-obfuscation`: two complete graph packs were
byte-identical, and twenty additional Application packs had one digest.

That explicit concurrency bound matters. An uncontrolled third pack exposed a
pnpm 11.20.0 `p-map-values` insertion race while it asynchronously converted the
two `workspace:*` dependency values: the packed Application manifest could swap
only those two JSON key positions. Source and semantic manifest content were
unchanged. Serializing the package manager's disposable filesystem work produced
twenty identical trials without adding repository configuration or prematurely
building P54 release assembly. The final tarball digests were:

- Workspace: `5625693f9ddbf18376f6e8253864bf8c8f24f520146d131b28da8e3001e018a3`
- Local Runtime: `339d061577cff9e127f584e505f0987814d1c7fb9c19f9231c531837911f6956`
- Application: `4f9bc9034d27775df9b0de9c04a29a2d121da4ab4edbd7b0a8c422b85cadf9e9`

The Workspace archive had 37 entries (18 JavaScript, 18 declarations, and its
manifest), Local Runtime had 21 (10/10/manifest), and Application had 25
(12/12/manifest). Every entry was `package.json` or `dist/**`; relative runtime
imports and declaration closures resolved, the exact allowlisted exports and
`>=26.4.0 <26.6.0` engines survived, local dependencies pointed only inward, and
the Application bin retained its executable mode and exact OpenTUI `0.5.1`
dependency. No source, tests, prototypes, State, lockfile, or undeclared file
shipped.

A disposable package root installed only those tarballs, with local-tarball
overrides for their private `0.0.0` coordinates. A fresh-HOME frozen offline
reinstall passed. All five Workspace, three Local Runtime, and two Application
allowlisted entrypoints imported from paths physically inside that package root;
representative private subpaths failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
The installed bin's realpath also remained inside the package root. On pinned
Node 26.5.1, `neoflow-v1-dogfood --help` printed the expected product and usage
lines with empty stderr. OpenTUI core was exactly `0.5.1`, and among its native
optional variants only `@opentui/core-darwin-arm64@0.5.1` was installed.

Two independently fresh sanitized Git, State, runtime, HOME, and PTY roots then
ran that installed bin. Normal mode entered and left alternate screen, reached
Home and Current Review, resized from 132x32 to the 80x24 Linear layout, exited
zero through real `SIGTERM`, emitted 551 non-reset SGR styles, and restored
canonical input and echo; its 24,964 captured bytes had digest
`f67d65aeee9d3d45020c34d1695935c52453038d2504b9c1bbc294d17566f72b`.
The `--no-color --ascii` run did the same through real `SIGINT`, emitted zero
non-reset SGR sequences and no byte above ASCII, retained the required semantic
labels, and restored terminal flags; its 13,101 bytes had digest
`2e185c40d9e052c0e91a6c466582f0f647bb83a194ee18dd8ecb6ebba122a7f7`.
Neither run leaked the FFI warning. Their detached runtimes retired normally
after the 30-second idle grace (29.887 and 30.124 seconds measured), removed
their sockets, and left no matching process.

Canonical `pnpm v1:verify` passed 26 files / 147 tests, typecheck, clean builds,
and smoke. All four compiled State, Local Runtime, Pi Adapter, and dogfood risk
probes passed, as did `git diff --check`. The detached worktree, package roots,
HOME directories, fixtures, PTYs, tarballs, probes, runtime directories, and
sockets were removed and the worktree registry pruned. No production or package
file changed; legacy/user data, P54 release scope, and the unrelated root
`package.json` bump remained untouched.
