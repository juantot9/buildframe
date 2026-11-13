---
id: WF-152
title: "Cycle comparison commit navigation"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-147
assignee: juanan
blocked_by: [WF-151]
created: 2026-08-30
---

## Problem

In Home's local comparison browser, single-step `j`/`k` navigation stops at the first and last loaded commits. The Scenario C acceptor liked commit selection and navigation but explicitly requested cyclic first↔last movement. Their later clarification confirms the observed new Review was intentionally activated with Enter; click remains selection-only and needs no repair.

## Acceptance evidence

- In Home comparison mode, single-step `j`/Down from the last projected commit selects the first, and `k`/Up from the first selects the last. Ordinary movement between commits remains unchanged.
- Cycle only across the existing bounded projected commit rows, including when the projection reports truncation. Add no off-window paging, speculative cache, Git read, Workspace request, or projection field.
- Reuse the existing model-owned comparison selection transition so every wrapped move clears only superseded merge-parent/preview state, schedules the same bounded latest-selection preview, and leaves click selection plus Enter activation unchanged.
- Preserve non-single-step behavior: Page Up/Down remain bounded page movement, `g`/`G` remain exact first/last movement, `h`/`l` retain merge-parent selection, Tab retains comparison-mode selection, and launcher/history movement does not gain wrapping.
- A real Workspace/OpenTUI scenario starts on the first commit, proves `k` wraps to the last and `j` returns to the first, proves the preview and visible marker follow each exact identity, and proves State remains unchanged until the already-established Enter action.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. The acceptor reruns the bounded Scenario C navigation and explicitly accepts or rejects the correction.

## Authority

- Failed human scenario and activation clarification: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Existing model-owned keyboard/pointer transition: [Stabilize clickable Home choices](./WF-145-stabilize-clickable-home-choices.md)
- P16E owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)

## Seam decision

Keep cyclic movement inside the private `ReviewingApplicationModel`, which already owns Home mode, selected commit identity, and bounded preview scheduling. Distinguish single-step comparison movement from page and edge movement at that existing seam, then reuse `selectComparisonCommit`. No View, Workspace Interface, Git owner, or generic list-navigation Interface changes.

## Constraints

- Click selects only; Enter remains the sole activation and command action.
- Do not change graph bounds, projection shape, preview debounce/cancellation, merge-parent semantics, or comparison commands.
- Do not combine measured loading/performance work, command discovery/leader-key design, commit-row wrapping, top-header work, or historical-dialog work.
- Add no generic cyclic-list helper or cross-package test helper solely for this two-line private policy.
- Preserve legacy/user data and the unrelated root `package.json` package-manager bump.

## Result (2026-08-30)

Complete in production commit `1a3b26476696edd2a7a5ec4aae070fbaf74fda6f`. Only single-step Home comparison movement now cycles over the existing projected commit rows: `k`/Up from the first selects the last, and `j`/Down from the last selects the first. Page and edge calls retain clamped behavior. Every move still uses the existing private commit-selection transition and bounded preview request; pointer selection, merge-parent choice, Enter activation, projection shape, graph bound, commands, and State are unchanged.

The real Workspace/OpenTUI scenario proves both wrap directions across exact commit identities, matching previews, a fixed controls row, and no State movement before the established Enter action. The old clamp would fail the first→last assertion. Focused Application tests passed 5 files / 26 tests; canonical verification passed 26 files / 147 tests; all four compiled State, Runtime, Pi, and dogfood risk probes passed on Node 26.5.1 with pnpm 11.20.0.

The actual acceptor reran the four-commit fixture from this exact source in Warp Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64 release `25.6.0`, Node 26.5.1, true color, and 132x50. They accepted commit cycling, reported no commit-list confusion, and requested launcher cycling as a separate follow-up. Bounded postinspection found zero State-version and Review-count movement, unchanged first/last commit identities, Git HEAD, and sanitized working bytes. The runtime retired after its idle grace and every fixture/helper was removed. [Cycle Home launcher navigation](./WF-153-cycle-home-launcher-navigation.md) owns the new main-entrance request.
