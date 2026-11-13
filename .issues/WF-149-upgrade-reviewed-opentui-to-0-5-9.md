---
id: WF-149
title: "Upgrade reviewed OpenTUI to 0.5.9"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-148]
created: 2026-08-29
---

## Question

Can the private Reviewing Application and its local OpenTUI skill move from exact OpenTUI 0.5.1 to the current reviewed 0.5.9 release without changing Neoflow semantics, package Interfaces, terminal guarantees, or prematurely choosing the failed moved-HEAD dialog redesign?

## Acceptance evidence

- Establish the release only from first-party evidence. Record npm registry metadata, exact tarball integrity/signature/provenance, GitHub release/tag/commit, publication time, license, dependency closure, Node support, and relevant 0.5.2–0.5.9 release changes. The package is older than the enforced 24-hour cooldown at installation time.
- Update exact `@opentui/core` pins in the root development manifest and private Application manifest to `0.5.9`; update the lockfile and all eight exact native optional packages. The external dependency set and transitive JavaScript dependency coordinates remain unchanged.
- Remove the nine obsolete OpenTUI 0.5.1 cooldown exclusions. Do not add a 0.5.9 exception: the ordinary `minimumReleaseAge: 1440` policy must admit it. Keep Pi's reviewed exceptions and all build-script policy unchanged.
- Refresh `~/.pi/agent/skills/opentui` from `packages/web/src/content/{SKILL.md,docs/**}` at the exact 0.5.9 tag commit, update `SOURCE.txt`, and verify the copied tree against that source. Record this local tool update in the issue; do not copy skill documentation into Neoflow production or package it.
- Prove the existing Application compiles and all owner-local OpenTUI scenarios pass without compatibility shims. Inspect changed public types/exports used by Neoflow and keep OpenTUI private behind `createReviewingApplication`; add no `@opentui/keymap`, framework binding, renderer Interface, or new dependency merely because 0.5.9 exposes it.
- Re-prove canonical `pnpm v1:verify`, all four compiled risk probes, source/compiled package surfaces, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. From a clean detached worktree, pack/install the three private tarballs and run the installed executable through normal and no-color/ASCII real PTYs, including native `@opentui/core-darwin-arm64@0.5.9`, alternate screen, resize, signal, termios restoration, and idle runtime cleanup.
- Record exact commands and outcomes, remove every disposable worktree/install/PTY/probe artifact, and leave only dependency, lock, cooldown-policy, issue, and any compatibility-required Application/test changes. Preserve the unrelated root `package.json` package-manager bump outside this child.

## Authority

- Human gate: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Renderer/runtime decision: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)
- Reviewed dependency policy: [Enforce reviewed external dependencies](./WF-127-enforce-reviewed-external-dependencies.md)
- Packed/PTY baseline: [Prove packed installed PTY quality](./WF-146-prove-packed-installed-pty-quality.md)

## Seam decision

This child updates the one reviewed external implementation already sitting behind the private Application seam. It does not add a new seam or let OpenTUI concepts escape the Module. New library capability becomes eligible evidence for the later visual prototype, not an excuse to fold redesign into dependency maintenance.

## Constraints

- Pin exactly 0.5.9; do not use a range, dist-tag, or unreleased commit.
- Do not modify Workspace, Local Runtime, Pi Adapter, durable State, wire shapes, semantic commands, or accepted Reviewing behavior.
- Do not redesign the continuation choice, top header, historical dialog, or Esc retargeting here.
- Do not adopt double-click, animation, embedded terminal, audio, split-footer, keymap, React, or Solid without a separate proven owner.
- Do not begin P17, P18, or P54, and do not treat a successful dependency update as human acceptance.

## Resolution comment

First-party review pinned GitHub release `v0.5.9`, annotated tag object
`a46022237cc92826558e8f493e3d00874b8b8d18`, and commit
`df2fc1594bb7a1274fc490155305e3d9f61f1b01`. GitHub published the release at
`2026-08-27T23:19:19Z`; npm published Core at `2026-08-27T23:19:08.178Z`, more
than 41 hours before installation, so the ordinary 24-hour cooldown admitted
it. The package remains MIT. Registry metadata tied Core and all eight native
packages to the same Git commit and reported npm signatures plus SLSA v1
provenance for every artifact. Core's verified tarball SHA-1 is
`411bd7f7bf483448c5744603a19f001f18418e95` and its SHA-512 integrity is
`sha512-d0EWYyp6djitu1N1R0o75NrLl4TxY3oJEmRNrX9vSKKC5/jriGQdSV6lJmwiB77O0cxtBnPzWztAV79vA1J2fA==`.
The selected Darwin-arm64 artifact independently matched SHA-1
`f9bd47986f5e3faa3329e819507a796b4e50fb37` and
`sha512-YcpWGD8GwoO3UYYw0kLDI4qof3ElSwWW5M3fNG+Kw87BSjCa5frZqak5xebdZ/XU5Xsk+BjgbBsxbzo9yrIjZQ==`.

The 0.5.2–0.5.9 review covered the static Ghostty native build, clipboard and
paste work, embedded terminal addition, Node 26.4+ support, selection and mouse
changes, Unicode/grapheme corrections, bordered hit-grid clipping, renderer
backpressure and invalid-dimension fixes, terminal cleanup/keepalive changes,
and native layout performance work. Neoflow adopted none of the new terminal,
clipboard, double-click, keymap, framework, animation, or audio features. The
published package-entry map and direct JavaScript coordinates stayed unchanged:
`bun-ffi-structs@0.3.1`, `diff@9.0.0`, `marked@17.0.1`,
`string-width@7.2.0`, and `strip-ansi@7.1.2`, with
`web-tree-sitter@0.25.10` as the peer. The only optional-coordinate change is
all eight native packages moving exactly to 0.5.9. Inspection of Neoflow's used
exports found only compatible widening and renderer behavior changes; source
and compiled typechecks required no shim or Application change.

Commit `ad2c904` changed the root development pin and private Application pin
to exact `0.5.9`, moved Core plus all eight native optional records in
`pnpm-lock.yaml`, and removed the nine obsolete 0.5.1 cooldown exclusions. No
new exclusion, dependency, package Interface, or transitive JavaScript
coordinate was added. The configured package mirror failed before changing
the lock or installed graph; an explicit primary npm registry run then passed
pnpm's 292-entry supply-chain
policy and installed the reviewed artifacts. The unrelated root
`packageManager` change remains the sole unstaged change and was excluded from
`ad2c904`.

The local OpenTUI skill now contains the 77 upstream files from
`packages/web/src/content/{SKILL.md,docs/**}` at the pinned commit. The copied
tree compared byte-for-byte with that source and has aggregate SHA-256
`8a2157c02f637534d3ca0dad3854d35daa97ed0ba94e9adba850461c9b249a74`;
`SOURCE.txt` records the release, tag object, commit, installation date, and
digest. No skill content entered Neoflow.

Focused Application typecheck and all five source test files passed (26/26).
Canonical `pnpm v1:verify` on Node 26.5.1 and pnpm 11.20.0 passed all 26 files / 147
tests, v1 typechecks, clean builds, and compiled smoke. The four compiled State,
Local Runtime, Pi Adapter, and dogfood risk probes passed independently, as did
`git diff --check`.

A clean detached worktree at `ad2c904a13cf4c1d82608d4de29426896261a510`
used `PNPM_CONFIG_PM_ON_FAIL=ignore`, the pinned pnpm launcher,
`pnpm install --offline --frozen-lockfile`, package-ordered builds, and
`UV_THREADPOOL_SIZE=1 pnpm pack --skip-manifest-obfuscation`. Two complete pack
rounds were byte-identical:

- Workspace: `5625693f9ddbf18376f6e8253864bf8c8f24f520146d131b28da8e3001e018a3`
  (37 files: 18 JavaScript, 18 declarations, manifest)
- Local Runtime: `339d061577cff9e127f584e505f0987814d1c7fb9c19f9231c531837911f6956`
  (21 files: 10 JavaScript, 10 declarations, manifest)
- Application: `807d22268e906f788ec13b227bfed4c421716b4867796aded13b6cb4bb130798`
  (25 files: 12 JavaScript, 12 declarations, manifest)

Every archive entry was its packed manifest or `dist/**`. A fresh package root
created its lock from only those tarballs and their declared closure; a second
empty HOME then completed `pnpm install --offline --frozen-lockfile`. All ten
allowlisted Workspace/Local Runtime/Application entrypoints imported from the
installed root, three representative private subpaths rejected with
`ERR_PACKAGE_PATH_NOT_EXPORTED`, and the installed bin's help ran cleanly on
Node 26.5.1. Core was exactly 0.5.9, and the sole installed native optional was
`@opentui/core-darwin-arm64@0.5.9`.

Two real installed-bin PTYs entered and left alternate screen, reached Home and
Current Review, resized 132x32 to the 80x24 Linear layout, exited zero after
real signals, restored canonical input plus echo, leaked no FFI warning, and
retired their detached runtimes and sockets normally. Normal mode used
`SIGTERM`, emitted 20,074 bytes with 422 non-reset SGR sequences, and had SHA-256
`1752712485c626976917dceed6ea38671064c892a31720fb32015f527d5688fd`.
`--no-color --ascii` used `SIGINT`, emitted 13,638 ASCII-only bytes with zero
non-reset SGR sequences, and had SHA-256
`c628ec68e984177254b8b89e6077fa517a9a2555bbe634a6575f36b0cb02bcd6`.
Idle runtime cleanup took 30.315 and 30.241 seconds. The detached worktree,
clone, package roots, HOME roots, fixtures, PTYs, tarballs, metadata files,
backups, probes, processes, and sockets were removed. This dependency proof
does not accept or choose a later Reviewing redesign.
