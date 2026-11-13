# OpenTUI migration feasibility

Date: 2026-07-30

## Question

Can Neoflow migrate its v1 Reviewing application from `@earendil-works/pi-tui` to OpenTUI, and what would that migration require?

## Verdict

**Yes, technically—but not as a drop-in renderer swap and not on Neoflow's current runtime contract.**

OpenTUI has the rendering, layout, input, and deterministic test facilities needed for Neoflow's TUI. Most of Neoflow's durable Workspace, Reviewing, Projection, Harness Interaction, and local-runtime architecture can remain unchanged. The renderer-facing application shell, view implementation, key normalization, local editor integration, terminal test seam, package/runtime floor, and release evidence would change.

The immediate blocker is runtime compatibility. Neoflow currently runs Node `24.18.0`, has no Bun installation, and is governed by a Node `22.19.0` floor. OpenTUI `v0.4.5` declares Bun `>=1.3.0`; its official runtime documentation says creating the native renderer requires either Bun or Node `26.4.0` with experimental FFI. Importing the package in older Node is not equivalent to creating a renderer.

OpenTUI therefore should not be introduced as part of the current P16 usability correction. It needs a separate renderer/runtime decision and a disposable proof package. The Home simplification remains valid regardless of renderer: OpenTUI can make layouts easier to implement, but it cannot decide the interaction hierarchy for us.

## What OpenTUI provides

At the pinned `v0.4.5` release:

- A native Zig renderer with TypeScript bindings and prebuilt optional native packages for supported macOS, Linux, Windows, x64, arm64, glibc, and musl targets.
- An imperative `@opentui/core` API plus optional React and Solid reconcilers.
- Yoga/Flexbox layout, responsive resize events, alternate-screen rendering, structured keyboard and paste events, focusable input controls, scrollboxes, and code/diff renderables.
- `@opentui/core/testing`, which supplies a native in-memory renderer, deterministic keyboard and mouse drivers, resize, captured character/styled frames, waits, and renderer statistics.
- Bun standalone executable support. Node single-executable support exists, but it requires Node `26.4.0`, experimental FFI, explicit native/Tree-sitter asset extraction, and application-owned extraction permissions, integrity, concurrency, and cleanup.

The imperative core is the closer fit for Neoflow. Adopting the React reconciler would reintroduce a framework that the v1 source island deliberately removed and is not necessary to obtain OpenTUI's renderer, layout, input, or testing facilities.

## What Neoflow can preserve

The migration does **not** require changing:

- the closed Workspace `execute`, `read`, and `subscribe` Interface;
- Authoritative State, Evidence, Reviewing, Projection, or Harness Interaction semantics;
- same-version projection replacement and stale-envelope rejection;
- stable Review/file/row/Question identities;
- commit-before-effect, truthful local pending, human-only disposition, or no-replay rules;
- the local runtime protocol or Pi Adapter contract.

Those rules sit above the private renderer dependency. OpenTUI should remain private implementation inside the Reviewing Application Module, just as `pi-tui` is today. A permanent generic multi-renderer product Interface is still unjustified.

## What must be replaced or adapted

Current renderer coupling is concentrated in five production/test files:

- `apps/neoflow/src/reviewingApplication.ts` owns `ProcessTerminal` and `TUI`.
- `apps/neoflow/src/reviewingView.ts` produces width-bounded ANSI line arrays using `pi-tui` width/wrap helpers.
- `apps/neoflow/src/reviewingModel.ts` consumes raw terminal bytes through `Key`, `matchesKey`, and `decodeKittyPrintable`.
- `apps/neoflow/src/launcher.ts` exposes the current `Terminal` test seam.
- `apps/neoflow/test/scenarios/reviewingApplication.test.ts` scripts that seam and inspects emitted frames.

A migration would:

1. Keep the local Reviewing controller/state machine, but replace raw-byte input with a small Neoflow-owned normalized local action or an OpenTUI `KeyEvent` adapter.
2. Rewrite the line-array view as OpenTUI renderables/constructs. Yoga can own physical layout; Neoflow must continue to own semantic Wide/Balanced/Linear choices and bounded projection windows.
3. Replace the `pi-tui` scripted `Terminal` Adapter scenarios with OpenTUI's in-memory test renderer and mock input. Keep semantic-frame assertions and the existing 80×24, no-color, ASCII, bounded-row, pending-before-I/O, and selection-through-reflow evidence.
4. Rework terminal lifecycle and cleanup around `createCliRenderer()`/`destroy()`.
5. Revalidate text width, clipping, control-character safety, Kitty keyboard behavior, multiline editing, focus, resize, slow output, and shutdown.
6. Amend runtime, packaging, support-manifest, clean-install, platform-matrix, and rollback decisions before release.

## Runtime routes

### Route A — Node 26.4+ with experimental FFI

This preserves the broad Node process topology and npm installation posture better than Bun, but it still changes material guarantees:

- raise the supported Node floor from `22.19.0` to at least `26.4.0`;
- launch with `--experimental-ffi` and, under Node permissions, `--allow-ffi` plus required filesystem permissions;
- ship and verify OpenTUI's platform-native optional packages;
- accept experimental Node FFI as release-critical infrastructure;
- re-run State, Runtime, Pi, dogfood, installation, and platform evidence on the new Node line.

This route cannot run in the current Node `24.18.0` environment.

### Route B — Bun

Bun is OpenTUI's documented default and supports standalone compilation, but it is a larger Neoflow architecture and packaging change:

- add Bun as an end-user runtime or ship platform-specific standalone binaries;
- revisit the npm-only, no-platform-binary v1 installation decision;
- prove exact `node:sqlite`, worker-thread, process, signal, IPC, and filesystem behavior used by the Workspace runtime;
- stop relying on `process.execPath` to mean the selected Node runtime when launching the writer process, or explicitly separate the Bun TUI process from the Node runtime process;
- add a multi-platform native binary build/signing/release matrix.

This route is not recommended for a renderer-only migration.

## Recommended migration experiment

**Status update (2026-08-03):** The disposable proof is captured on branch `prototype/opentui-reviewing-visuals` at commit `860604c`. It runs pinned OpenTUI `0.4.5` under a checksum-pinned, `/tmp`-isolated Bun `1.3.0` without entering the production source graph. Three layouts render the same scripted Review and independently vary Files visibility and theme. Themes are open semantic palettes: `quiet-graphite` is the default preset, user definitions may inherit a preset and override arbitrary color roles, and surface roles accept `transparent` to inherit the terminal background without claiming control of emulator opacity. The user likes the direction and wants these choices composed through User Configuration rather than treated as mutually exclusive mockups. This validates the visual model and preserves the prototype as primary evidence; it does not yet approve a production migration, runtime-floor change, or direct promotion of prototype code.

Use a disposable proof package before changing production:

1. Pin one exact OpenTUI release; do not track `main`.
2. Use Node `26.4.x` with experimental FFI for the first experiment, keeping the existing Node-shaped topology.
3. Render only the simplified launch path plus one representative Reviewing workspace from scripted same-version projections.
4. Prove 80×24 and wide reflow, stable selection, question editing, structured keyboard input, no-color/ASCII output, bounded rows, pending before I/O, deterministic captured frames, and clean terminal restoration.
5. Run a packed npm artifact on the supported macOS/Linux targets and record native dependency size and startup/per-frame measurements.
6. Decide explicitly whether the UI benefit justifies changing the Node floor, native dependency policy, and release matrix.

Do not run `pi-tui` and OpenTUI as production alternatives or add a renderer abstraction merely to stage the migration. A winning proof should replace the private implementation in one bounded cutover; a failed proof should leave production unchanged.

## Real-model Node-FFI proof update (2026-08-04)

The disposable `prototype/opentui-real-model` branch replaces the v1 Application's private `pi-tui` implementation with imperative OpenTUI `0.4.5` constructs and runs the unchanged semantic owners under checksum-verified Node `26.4.0 --experimental-ffi`. Unlike the earlier scripted visual proof, it consumes real same-version Workspace projections and replaces the Terminal test seam with OpenTUI's native in-memory renderer.

Verdict: **technical pass; conditional production go through Node, not Bun**. All 80 v1 tests, legacy verification, and State, Runtime, Pi, and dogfood risk probes pass. The final packed macOS-arm64 install measured a 49,213,440-byte dependency closure, a 343.4 ms warm process-to-Home startup (with an earlier 902.8 ms clean cold bound), and a 17.4 ms local frame. Real PTY runs restored canonical input, echo, and alternate-screen state. Clean Debian glibc containers selected and executed the packed Linux arm64 and x64 native packages; the x64 run used Docker/QEMU on the arm64 host. The human visual gate accepted the centered Focus Home, the Configuration window, theme-owned borderless surfaces, and terminal-default backgrounds with thin focus-aware divisions. The complete evidence and exact bounds are in `apps/neoflow/prototypes/opentui-real-model/README.md` on that branch.

**Dependency refresh (2026-08-05):** the paused Gate A correction candidate moved both importers and native optional packages to exact OpenTUI `0.5.1` / upstream commit `ad9a818d7a9d73f3386e92a445d0feb4b395c69e`. The official skill from that tag is installed and its Textarea, renderer, keyboard, layout, testing, code, and Diff guidance now governs TUI changes. The `0.4.5` measurements above remain historical rather than being relabelled. Fresh `0.5.1` canonical verification passes with 84 v1 tests and all four risk probes; a packed macOS-arm64 install and normal plus no-color/ASCII PTY lifecycle runs also pass. See `opentui-selection-clipboard-paste-v0.5.1.md` and `opentui-bounded-syntax-highlighting-v0.5.1.md`.

The branch deliberately does not change `support/manifest.json`. The human, npm-bin FFI re-exec, macOS arm64, Linux arm64, and emulated Linux x64 gates now pass. Before release, require native Linux x64 CI and macOS x64 only if it remains supported. An explicitly approved production cut should use one Node `>=26.4.0 <27` renderer replacement; do not add Bun, dual runtimes, a renderer Interface, or a `pi-tui` fallback.

## Sources

OpenTUI primary sources, pinned to release `v0.4.5` / commit [`0c8c4f7`](https://github.com/anomalyco/opentui/tree/0c8c4f7cff2927e3df63a9757a45eff9a343611c):

- [Release `v0.4.5`](https://github.com/anomalyco/opentui/releases/tag/v0.4.5)
- [Core package manifest](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/core/package.json)
- [Getting started and runtime support](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/getting-started.mdx)
- [Renderer lifecycle, streams, resize, and input](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/core-concepts/renderer.mdx)
- [Yoga/Flexbox layout](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/core-concepts/layout.mdx)
- [Structured keyboard input](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/core-concepts/keyboard.mdx)
- [In-memory test renderer and drivers](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/core-concepts/testing.mdx)
- [Standalone executable requirements](https://github.com/anomalyco/opentui/blob/0c8c4f7cff2927e3df63a9757a45eff9a343611c/packages/web/src/content/docs/reference/standalone-executables.mdx)

Current dependency-refresh primary sources:

- [Release `v0.5.1`](https://github.com/anomalyco/opentui/releases/tag/v0.5.1) / commit [`ad9a818`](https://github.com/anomalyco/opentui/tree/ad9a818d7a9d73f3386e92a445d0feb4b395c69e)
- [Textarea source](https://github.com/anomalyco/opentui/blob/ad9a818d7a9d73f3386e92a445d0feb4b395c69e/packages/core/src/renderables/Textarea.ts) and [official Textarea skill page](https://github.com/anomalyco/opentui/blob/ad9a818d7a9d73f3386e92a445d0feb4b395c69e/packages/web/src/content/docs/components/textarea.mdx)
- [Renderer source](https://github.com/anomalyco/opentui/blob/ad9a818d7a9d73f3386e92a445d0feb4b395c69e/packages/core/src/renderer.ts) and [testing skill page](https://github.com/anomalyco/opentui/blob/ad9a818d7a9d73f3386e92a445d0feb4b395c69e/packages/web/src/content/docs/core-concepts/testing.mdx)

Neoflow authority and current implementation:

- [Choose the terminal interaction system](../../.issues/WF-012-choose-terminal-interaction-system.md)
- [Validate the TUI implementation foundation](../../.issues/WF-045-validate-tui-foundation.md)
- [Shape packaging, setup, and release topology](../../.issues/WF-050-shape-packaging-setup-release.md)
- `apps/neoflow/src/reviewingApplication.ts`
- `apps/neoflow/src/reviewingModel.ts`
- `apps/neoflow/src/reviewingView.ts`
- `apps/neoflow/test/scenarios/reviewingApplication.test.ts`
