---
id: WF-158
title: "Present a compact contextual action lookup"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-157]
created: 2026-08-30
---

## Question

How should the private Reviewing Application rewrite the human-selected adaptive action strip and read-only lookup so ordinary Home and Review actions become discoverable without preserving the rejected multi-line command chrome or changing any command semantics?

## Acceptance evidence

- Rewrite Variant C afresh against the existing private `ReviewingApplicationModel`/View/input seam; no prototype component, switcher, runner, or package route lands on `main`. The model owns only whether ordinary action lookup is open, while the View derives bounded presentation from current projected Application state. Add no Workspace read, command registry, renderer Interface, durable fact, telemetry, package export, keymap dependency, or generic modal abstraction.
- Replace ordinary Home launcher/comparison/history and Reviewing persistent multi-line command rows with one non-wrapping contextual strip. Its visible bootstrap is `[Space] actions`; the remaining bounded hints adapt to the current route and width while preserving stable ordinary Reviewing vocabulary across Files, Diff, Questions, and layout breakpoints.
- On an ordinary non-editing Home or Review surface, unmodified Space opens an opaque read-only current-actions lookup. Group only actions already accepted in that context, identify direct keys without relying on color, and omit actions that are genuinely unavailable. Lookup rows never focus or execute; Space, Enter, or Esc closes without replay, other action keys and pointer targets are inert while open, global Ctrl+C keeps its existing process ownership, and the existing direct key works only after closing.
- Keep `?` as Action Checks. Space remains text in the Question composer and remains owned by comparison input's existing grammar/filter rather than opening discovery. Search, configuration, moved-HEAD continuation, historical detail, changed-target disclosure, and every other contextual surface retain their own instructions and Esc/Enter/Space ownership; they neither open nor advertise the ordinary lookup.
- Preserve all existing command dispatch, Home/commit/history click-selection-only behavior, Enter-only activation, cyclic `j`/`k`, page/edge movement, selection identities, merge-parent choice, preview reads, Action Checks, cancellation, State transitions, diagnostics, and Workspace/package Interfaces exactly.
- Keep the bounded comparison row viewport, selected commit, fixed three-row preview, status, and one-row action strip visible before, during, and after loading at 132x50 and 80x24 for both short and exact 500-commit/truncated projections. Lookup geometry remains inside those terminals in true-color and no-color/ASCII modes and does not move the underlying selection.
- Extend owner-local model and real-Workspace Application scenarios through production inputs. Prove ordinary open/close priority, no activation/replay, inert pointer targets, text/context ownership, dynamic current actions, one-row geometry, removal of rejected `KEYBOARD CONTROLS` chrome, responsive lookup, fixed comparison preview, zero State movement, and unchanged source/compiled package behavior.
- Verify on Node 26.5.1 with pnpm 11.20.0: Application typecheck/tests, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood risk probes, and `git diff --check` pass. Then rerun the affected genuine human Scenario C through the built real executable; record only environment, outcome, confusion, and bounded fixture metadata, and close only if the acceptor accepts discovery and revisits perceived loading.

## Authority

- Human-selected throwaway evidence: [Prototype compact contextual action discovery](./WF-157-prototype-compact-contextual-action-discovery.md)
- Primary-source pattern study: [Research compact terminal command discovery](./WF-156-research-compact-terminal-command-discovery.md)
- Failed production scenario: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Stable direct commands: [Localize target safety and stabilize Review commands](./WF-144-localize-target-safety-and-stabilize-review-commands.md)
- Bounded comparison geometry: [Keep bounded comparison preview visible](./WF-155-keep-bounded-comparison-preview-visible.md)

## Seam decision

This remains one deep private Application Interface. `ReviewingApplicationModel` owns input priority and the ephemeral open/closed fact; the existing View owns route-aware labels, responsive strip/lookup geometry, and pointer interception. Existing action handlers remain the sole execution policy. Keeping description and geometry inward avoids exporting a command registry merely to replace private presentation.

## Constraints

- Do not copy prototype source or add a leader/prefix sequence, focus-first chooser, searchable palette, direct lookup activation, configurable keymap, `@opentui/keymap`, animation, or a second help system.
- Do not repurpose `?`, intercept typed Space, add direct click activation, or weaken contextual overlays, changed-target safety, moved-HEAD choice, historical navigation, or comparison selection semantics.
- Do not add paging, Git caching, projection fields, off-window reads, performance optimization, header redesign, historical-latency work, historical-versus-Live redesign, wrapping, P17/P18/P54 scope, or legacy/user-data access.
- Preserve exact production wire shapes, durable bytes, diagnostics, timeouts, roles, package Interfaces, OpenTUI 0.5.9, Node support, and the unrelated root `package.json` package-manager bump outside every commit.

## Progress (2026-08-31)

Production commit `92bf150dc75615ef7868479bc91c321451fb00c7` rewrites the selected Variant C against the private Application seam. Ordinary Home/comparison/history and Review surfaces now reserve one adaptive `[Space] actions` row; Space opens an opaque, read-only current-actions lookup; direct keys remain unchanged after close; action rows and underlying pointer targets cannot execute while open; and contextual composer, comparison-input, search, configuration, continuation, and historical surfaces retain input ownership. The exact 500-commit/truncated projection keeps its selected row, fixed preview, strip, and lookup inside both required terminal sizes without another read.

Application typecheck and all 27 Application tests pass. Canonical verification passes 26 files / 148 tests, all four compiled State/Runtime/Pi/dogfood probes pass, and `git diff --check` passes on Node 26.5.1 with pnpm 11.20.0. The first canonical invocation ended in a Vitest/Tinypool `ERR_IPC_CHANNEL_CLOSED` transport rejection without a reported test failure; the owning full 148-test lane and then the complete canonical gate passed consecutively, with no retained worker, fixture, or process. This is recorded rather than treated as a test waiver.

The actual acceptor opened the exact built commit in Warp Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64 release `25.6.0`, Node 26.5.1, true color, and 156x50 against one sanitized 510-commit fixture. They correctly questioned whether Neoflow loads all history and what navigation means in a repository with thousands of commits. Inspection confirmed the existing Workspace asks Git for at most 501 rows, publishes the newest 500 with `truncated: true`, performs no paging/fetch, and bounds Application navigation to that projection—but the View does not disclose that scope. The acceptor also requested `/` search through commit messages.

The pass paused without claiming WF-158 or Scenario C acceptance. The acceptor explicitly rejected an all-history exploratory search as unnecessarily broad and agreed on this scope: `/` searches messages only within the newest 500 shown commits; the View discloses truncation and “oldest shown”; an intentional older hash/branch/tag remains available through a separate exact-revision action. Fixture postinspection found State version 2, two Review identities, exact 500/truncated projection, 510 Git commits, one working-status row, and unchanged Git/working-byte digest. The executable and socket retired. [Search visible comparison commit messages](./WF-159-search-visible-comparison-commit-messages.md) owns that focused correction before renewed acceptance.

WF-159 production commit `06a2d207bf3ff647ab2995d8a774920bc93530e1` now discloses the newest-500 scope, makes `/` search only the shown commit subjects, and moves unchanged exact revision inspection to `r`. The same private action strip and read-only lookup expose those distinct routes without another help system or Workspace read. Application, canonical 148-test, compiled-risk, and geometry evidence all pass.

The actual acceptor reran Scenario C through that exact built commit in Warp Terminal on macOS arm64, Node 26.5.1, true color, at 155x50. They accepted the corrected interaction with “I like it,” said loading “felt good,” and reported no new confusion. Their standing directive is that performance remain present in every interaction, irrespective of this pass. Postinspection preserved State version 2, two Reviews, the exact 500-of-510 truncated projection, Git HEAD/order, and sanitized working bytes. No process or socket remains. WF-158 is accepted and closed.
