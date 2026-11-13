---
id: WF-156
title: "Research compact terminal command discovery"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-155]
created: 2026-08-30
---

## Question

Which built-in command-discovery patterns used by established keyboard-driven terminal applications could replace Neoflow's persistent command/information rows without hiding contextual availability or inventing unfamiliar interaction?

Scenario C's acceptor did not accept the persistent information and command presentation and explicitly requested study of established terminal-application patterns, including a leader/prefix key with a compact available-actions window. This child gathers primary-source evidence before a design or production change.

## Acceptance evidence

- Create `docs/research/terminal-command-discovery-patterns-2026-08-30.md` from first-party documentation and source code. Cite stable version/tag/commit links for every behavioral claim and distinguish built-in product behavior from optional plugins.
- Compare at least five maintained terminal applications spanning contextual footer hints, modal help, prefix/leader key tables, command palettes, and mode/status disclosure. For each, record the bootstrap affordance, invocation key, contextual filtering or grouping, focus/activation model, dismissal, narrow-terminal behavior where documented, and whether commands remain directly invocable without opening discovery.
- Include first-party evidence from OpenTUI 0.5.9 for only the private implementation capabilities relevant to a compact action window: keyboard events, focus/overlay composition, sizing/overflow, and pointer activation. Do not turn framework APIs into product requirements.
- Evaluate the observed patterns against Neoflow's accepted constraints: 80x24 and 132x50 layouts, no-color/ASCII meaning, contextual overlays, stable ordinary Reviewing commands, Enter-only activation where already accepted, click-select-only Home semantics, composer text entry, Esc ownership, and no Workspace or package Interface changes.
- End with two or three bounded prototype directions and explicit rejected/unsupported options. Keep findings separate from a production decision; name the smallest next human-comparison child.
- Add no product code, dependency, telemetry, command binding, durable fact, generic overlay, or renderer/package Interface. `git diff --check` passes and the unrelated root `package.json` bump remains excluded.

## Authority

- Human finding: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Existing stable command work: [Localize target safety and stabilize Review commands](./WF-144-localize-target-safety-and-stabilize-review-commands.md)
- Private renderer decision: [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)
- Fixed bounded geometry: [Keep bounded comparison preview visible](./WF-155-keep-bounded-comparison-preview-visible.md)

## Seam decision

Research the interaction vocabulary before designing its implementation. The eventual owner, if accepted, remains the private Reviewing Application model/view/input seam: the model knows current actions and focus, the View presents them, and input dispatches existing actions. This child must not pre-commit to leader, prefix, palette, modal, or footer architecture.

## Constraints

- Prefer official manuals, versioned source, specifications, and first-party design notes. Secondary articles, screenshots without owned semantics, and popularity claims are not authority.
- Do not assume Vim/Emacs familiarity, expose internal command names, or copy a plugin merely because its visual treatment is recognizable.
- Do not combine top-header redesign, historical-dialog distinction/latency, commit-line wrapping, performance optimization, or general keymap configurability.
- Do not use automated output as human acceptance. A later throwaway prototype must obtain the actual acceptor's comparative verdict before production work.
- Preserve legacy/user data and the unrelated root `package.json` package-manager bump.

## Result (2026-08-30)

Complete in [`terminal-command-discovery-patterns-2026-08-30.md`](../docs/research/terminal-command-discovery-patterns-2026-08-30.md). The study pins first-party release commits for tmux 3.7c, Helix 25.07.1, Zellij 0.45.1, Lazygit 0.64.1, K9s 0.51.0, Yazi 26.8.15, and exact OpenTUI 0.5.9. It distinguishes prefix-only lists, immediate pending-key windows, contextual footer/menu hybrids, read-only contextual help, and adaptive mode bars, including activation, cancellation, context ownership, and sourced narrow-layout behavior.

The transferable finding is two-stage discovery: one compact visible bootstrap plus an on-demand list derived from current private Application state. A hidden leader does not bootstrap itself; permanent multi-line mode chrome recreates the failed presentation; `?` is already owned by action checks; and neither a searchable palette nor `@opentui/keymap` is justified by the current bounded vocabulary. OpenTUI Core 0.5.9 already supplies the private key, overlay, clipping, resize, focus, and pointer mechanics needed for comparison without a dependency or Interface change.

[Prototype compact contextual action discovery](./WF-157-prototype-compact-contextual-action-discovery.md) will compare the three bounded directions identified by research: read-through leader, focus-first chooser, and adaptive strip/read-only lookup. No product source, dependency, command, durable fact, package Interface, telemetry, legacy/user data, or unrelated package-manager change was made; `git diff --check` passes.
