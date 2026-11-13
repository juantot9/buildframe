---
id: WF-194
title: "Adopt the current OpenTUI release and refresh its agent skill"
status: closed
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-09-07
---

## Resolution
Closed (2026-09-07). `@opentui/core` is bumped from 0.5.9 to 0.5.10 (released 2026-09-01) in root `package.json` and `apps/neoflow/package.json`, with the lockfile regenerated under pnpm 11.20.0; `v1:check:dependencies` passes. Every surface proved unchanged: typecheck; the full serialized lane with 32 files / 262 tests; build and compiled import smoke; all four compiled risk probes (State, Local Runtime, Pi, dogfood) including the rebuilt dogfood fault probe; and `git diff --check`. The scripted Terminal scenarios kept their settled no-color/ASCII assertions with zero presentation delta. The known intermittent OpenTUI-FFI `ERR_IPC_CHANNEL_CLOSED` teardown rejection surfaced twice at lane exit after all 262 tests had passed and the lane passed cleanly on rerun (exit 0); it is recorded as environmental, with no product change and no pool-config workaround retained.

### OpenTUI 0.5.9 → 0.5.10 inventory

- *docs: improve OpenTUI skill guidance* (upstream PR #1461) — landed in this release's `SKILL.md` (new "Terminal layout defaults" and "Choose packages" guidance) and is carried by the skill refresh below.
- *renderer: reduce image streaming overhead* (#1467) and *renderer: preserve native scrollback images* (#1470) — image-pipeline improvements; irrelevant to Neoflow v1, which renders no images.
- *fix(core): retry the final automatic frame after backpressure* (#1457) — resilience inside OpenTUI's own frame pump; the application's pending-before-I/O and bounded streaming contracts are unaffected and were re-proven by the scripted Terminal scenarios on the new version.
- *fix(core): preserve markdown during stream completion* (#1469) — relevant candidate for WF-195: a `markdown` component with stream-completion preservation exists upstream, so a future Reviewing markdown presentation inherits correct completion behavior.
- *fix(native): ship stripped libraries with separate release symbols* (#1437) — native artifacts are now stripped, with separate symbol archives and a new `docs/test-and-debug/native-crashes.mdx` page for matching release symbols. All risk probes passed on the stripped binaries; no action needed now, but crash triage for future native faults must load the matching release symbols per that page.

**Tree-sitter status for WF-195:** tree-sitter syntax highlighting already exists in the 0.5.9/0.5.10 line (`docs/components/code.mdx`, plus `diff.mdx` and `markdown.mdx` components); 0.5.10 adds no new rich-content mechanism. WF-195 should therefore evaluate the existing `code`/`diff`/`markdown` components against its bounded-slice and degradation constraints rather than waiting for a new capability.

### Agent skill refresh

The OpenTUI agent skill at `~/.pi/agent/skills/opentui` was refreshed on 2026-09-07 to the v0.5.10 content: `SKILL.md` and the sibling `docs/**` tree were replaced from the upstream tag, the `/docs` path invariant is preserved verbatim, and the new `test-and-debug/native-crashes.mdx` page is reachable from the refreshed `troubleshooting.mdx` cross-link per the skill's working rules. `SOURCE.txt` records release v0.5.10, tag object `07baf92f6cae4bc5596d2af9c6651cd0864ee12e`, commit `f6673a04ccb671b9207da358c57152bfd27c781f`, installed 2026-09-07, and content SHA-256 `ca6fec8cedcfb6f6ea4a9914c6c2140e2efc4e1b21beee037de3c392b9268340` (method: per-file `shasum -a 256` over the sorted `SKILL.md` + `docs` file list, then SHA-256 of that list).

## Outcome

Neoflow runs on the current OpenTUI release: `@opentui/core` is bumped from `0.5.9` to the current version (0.5.10 as of 2026-09-07, or later if the release has moved by execution) in both the root `package.json` devDependencies and `apps/neoflow/package.json`, and every existing surface proves unchanged behavior on the new version — the compiled Reviewing Application, scripted Terminal scenarios, launcher harness, all four compiled risk probes (State, Local Runtime, Pi, dogfood), and canonical verification all pass with zero semantic delta. The functionality OpenTUI added since `0.5.9` is inventoried from upstream release notes and documentation, with an explicit assessment of which new capabilities are relevant to Neoflow v1 surfaces (input to WF-195). The OpenTUI agent skill is refreshed to the new release: its `SKILL.md` and sibling `docs/**` files are updated so the skill covers the release's current public API and reading order, preserving the documented `/docs` path invariant. The skill lives outside this repository; its update is recorded in this issue's resolution rather than landed in the repo tree.

## Interface

No product Interface changes. The only repo-tree delta is the dependency pin bump in the two `package.json` files (plus lockfile) and, if the new release requires it, minimal mechanical adaptation in `apps/neoflow/src` (import paths, renamed exports) that preserves every existing projection, command, and presentation contract byte-for-byte. Any behavioral difference discovered while proving the bump is either a defect fixed to restore settled behavior or an upstream change escalated to WF-195's presentation decision — never silently adopted.

## Module seam

No Module seam changes. `apps/neoflow` continues to consume only the closed Workspace Interface and pinned `@opentui/core` version; the dependency bump does not widen what the application may touch. The skill update is external tooling and has no repo seam.

## Acceptance

- [x] `@opentui/core` is bumped to the current release in root `package.json` and `apps/neoflow/package.json` with the lockfile regenerated through the established pnpm route (Node 26.5.1 / pnpm 11.20.0), and `pnpm v1:check:dependencies` still passes.
- [x] Canonical verification (fast/full lanes, typecheck, build, compiled import smokes), all four compiled risk probes including the rebuilt dogfood probe, and `git diff --check` pass with no legacy restoration.
- [x] Every scripted Terminal scenario (Wide/Balanced/Linear reflow, focus retention, pending-before-I/O, no-color/ASCII assertions) and the launcher harness pass unchanged on the new version, proving zero presentation regression.
- [x] A written inventory in this issue's resolution enumerates OpenTUI functionality added since 0.5.9 and names which capabilities are candidates for Neoflow v1 surfaces, explicitly deferring adoption decisions to WF-195.
- [x] The OpenTUI agent skill at `~/.pi/agent/skills/opentui` is refreshed to the new release (SKILL.md routing plus sibling `docs/**` pages), keeps the `/docs` path invariant, and its completion is recorded in this issue's resolution with the date.
- [x] Only the dependency-pinch hunks of the two `package.json` files are staged; the pre-existing unrelated `packageManager` bump stays unstaged (selective hunk staging, never `git add -A`).

## Constraints

- Keep Node 26.5.1 / pnpm 11.20.0, State format 2, Interface version 1, the three-method Workspace Interface, and all limits/deadlines/budgets unchanged.
- No semantic behavior change in this task: rendering, command handling, and durable records remain exactly as settled. Rich-content adoption is WF-195's decision, not this bump's side effect.
- The pre-existing unrelated root `packageManager` bump (pnpm 11.10.0 → 11.20.0) must stay unstaged through every commit of this task.
- Never inspect real user repositories or `.neoflow` state; verification uses the established disposable fixtures and risk probes.
- One focused task at a time: this task must be committed and pushed before WF-195 starts.

## Authority

- [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md)
- [Choose the visual language](./WF-013-choose-visual-language.md)
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
