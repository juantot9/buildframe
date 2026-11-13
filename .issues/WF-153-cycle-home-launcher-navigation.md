---
id: WF-153
title: "Cycle Home launcher navigation"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-147
assignee: juanan
blocked_by: [WF-152]
created: 2026-08-30
---

## Problem

The Scenario C acceptor accepted cyclic commit-list movement and immediately requested the same `j`/`k` first↔last behavior at Reviewing's main Home entrance. Home launcher movement still clamps even though it is a small closed set of actionable choices.

## Acceptance evidence

- On the Home launcher, single-step `j`/Down from the last actionable choice selects the first, and `k`/Up from the first selects the last. Ordinary movement between choices remains unchanged.
- Cycle only through choices currently available in the model-owned launcher set: continue/start current Review, start a new Current Review when one exists, Review other changes, and Previous Reviews when retained history exists. Unavailable visual rows do not become selectable.
- Preserve Enter as the sole activation/command action and click as selection-only. Wrapped focus changes perform no Workspace command, State transition, read, preview, or persistence.
- Preserve non-single-step policy: Page Up/Down and `g`/`G` remain bounded edge movement; comparison commit cycling remains as accepted; retained-history paging/movement does not change.
- Extend the existing real Workspace/OpenTUI Home scenario to cover launcher sets both with and without retained history, prove `k` first→last and `j` last→first, prove the visible marker follows the exact choice, and prove State remains unchanged before Enter.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. The acceptor reruns the main entrance and explicitly accepts or rejects the correction.

## Authority

- Human request and Scenario C record: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Accepted commit-list policy: [Cycle comparison commit navigation](./WF-152-cycle-comparison-commit-navigation.md)
- Existing click/Enter ownership: [Stabilize clickable Home choices](./WF-145-stabilize-clickable-home-choices.md)

## Seam decision

Keep launcher cycling in the private `ReviewingApplicationModel`, beside the existing dynamic actionable-choice list. The existing single-step signal may select cyclic policy for both launcher and comparison modes while page and edge calls retain bounded movement. No View, Workspace Interface, generic navigation Interface, or shared helper changes.

## Constraints

- Do not make unavailable choices focusable or infer actions from rendered row positions.
- Do not change launcher ordering, wording, pointer targets, activation semantics, Home history paging, commit graph bounds, or comparison previews.
- Do not combine measured performance, command discovery/leader-key design, wrapping, top-header work, or historical-dialog work.
- Preserve legacy/user data and the unrelated root `package.json` package-manager bump.

## Result (2026-08-30)

Complete in production commit `f3696b1bc3119dbe5f0b21e7f6b9999fc1967ad3`. The private model's single-step policy now cycles both dynamic Home launcher choices and the already-accepted comparison commit rows, while page and edge calls remain bounded. Launcher cycling uses the same actionable-choice list as rendering and activation, so unavailable new-Current/history rows remain unfocusable. Click remains selection-only, Enter remains activation-only, and focus movement performs no read, preview, command, State transition, or persistence.

The real Workspace/OpenTUI scenario proves first↔last launcher movement with both three-choice/no-history and four-choice/retained-history sets, exact focus markers, unchanged State before Enter, and unchanged comparison/history policies. Focused Application tests passed 5 files / 26 tests; canonical verification passed 26 files / 147 tests; all four compiled State, Runtime, Pi, and dogfood risk probes passed on Node 26.5.1 with pnpm 11.20.0.

The actual acceptor reran the four-choice fixture from this exact source in Warp Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64 release `25.6.0`, Node 26.5.1, true color, and 132x50. They confirmed Home cycling works as expected and reported no confusion. Bounded postinspection found zero State-version or Review-count movement, unchanged Current and Previous identities, Git HEAD, and sanitized working bytes. The runtime retired after its idle grace and every fixture/helper was removed.
