---
id: WF-012
title: "Choose the terminal interaction system"
status: closed
labels:
  - wayfinder:prototype
parent: WF-001
assignee: juanan
blocked_by: [WF-007]
created: 2026-07-14
assets:
  - "git branch prototype/terminal-interaction-system at d14cfc9"
  - "apps/tui/prototypes/terminal-interaction-system/ on that branch"
---

## Question

Which information architecture, navigation, focus, command, help, mouse, responsive-layout, and accessibility model makes Planning and Reviewing easy to learn, comfortable for long sessions, and fast for experienced users?

## Blocked by

- [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md)

## Resolution comment

Neoflow uses three product-level composition families: a workflow-first Home with a compact attention summary, one configurable Workflow workspace, and a dedicated focus layer for consequential submission or decisions. A lifecycle state does not automatically earn a new destination. The workspace instead uses `Auto`, `Focus`, `Balanced`, and `Overview` arrangements. `Auto` is the v1 default: focused goal entry for Planning, Overview for sustained Plan reading and comments, Balanced for ordinary Review work, focused finding-by-finding checking after updates, and one named region at a time on narrow terminals. A fixed user preference overrides task defaults where space safely permits.

Planning begins with a central local “What do you want to plan?” composer, selected context, and recognizable destination. Nothing reaches the harness until `Start exploration` saves the exact Planning context; exploration then remains in the harness-owned conversation. Sustained Planning centers the Plan with history, anchored comments, changed-context awareness, and approval blockers available contextually. Review begins by choosing visible comparison intent, then centers saved changes, files, diff, findings, and progress. Ordinary Review defaults to the focused layout validated in variant B; the resizable Files / Diff / Findings triad from variant A remains the Overview arrangement. Checking an update uses variant C’s one-finding decision focus with original and updated locations immediately inspectable.

Side regions are directly toggleable, and hidden regions retain labelled counts, warnings, and command access. Review columns have semantic minimum widths and may be resized by pointer, focused-divider arrows, or expert bindings; all bindings are configurable. File navigation supports `Auto`, `Side`, and `Top`: Auto uses a side list when wide, a top ribbon when medium, and a picker when narrow. Review Files visibility and side-pane width changes are presentation preferences and save immediately to User Configuration, surviving TUI and runtime restarts without entering workflow State. Transient focus, selection, scroll, and viewport-clamped effective widths remain session-local. Broader arrangement changes may still use an explicit saved-default action, while reset returns to that default.

User preferences live in one versioned, human-editable JSON configuration outside the repository. The TUI Settings section edits and previews the same file, validates conflicts, reveals its location, and resets individual choices. The JSON is safe for manual dotfile sharing and contains presentation, layout, Review-navigation, and keybinding preferences—but no Workspace Identity, session, credentials, or workflow history. V1 provides no automatic multi-device synchronization.

Navigation is conventional first and Vim-friendly second: Tab and Shift+Tab move between meaningful regions; arrows move within one; `j/k` are aliases away from text entry; Enter acts; and Escape returns one layer. Direct visible actions remain primary. Contextual controls show only nearby choices, `Ctrl+K` searches all commands and explains unavailable ones, and `?` opens help for the focused region. There is no required modal navigation state. Mouse clicks, wheel scrolling, and optional divider dragging accelerate the same visible interactions and always retain keyboard parity; no information or action depends on hover, dragging, or right-click.

Responsive behavior reflows by meaning rather than squeezing every pane. Wide layouts may coexist; medium layouts preserve the artifact plus one useful context; narrow and first-class linear layouts show one named region with breadcrumbs, counts, and warnings. Focus and state are textually explicit. Meaning never relies on color or Unicode symbols, no-color and ASCII-safe presentation are persistent preferences, and reduced live update behavior is supported. Neoflow makes no blanket screen-reader compatibility claim without separate verification.

A composed gate receives dedicated focus while preserving workflow and return context. Its primary hierarchy is the accurately named action, recognizable destination, included work, and at most one plain-language material limitation. Changed or sensitive context is individually inspectable and excludable in details; exact capability, lifecycle, and receipt terms remain in technical detail. True blockers expose a corrective action and never an override. Recovery stays scoped and non-modal: primary copy says what the developer knows—such as “Pi stopped reporting”—then distinguishes running the same Plan again, starting potentially overlapping work, and work that cannot proceed because its source cannot be confirmed.

All user-facing Neoflow surfaces use everyday developer language. Precise domain names appear only where a truth-critical distinction would otherwise be lost, or under technical details and history. This Interaction Language rule applies to future TUI, CLI, editor, notification, help, and user-documentation work while internal records and technical documentation retain canonical terminology. The resulting User Configuration boundary is recorded in [`CONTEXT.md`](../CONTEXT.md).

Validated interactive prototype: `apps/tui/prototypes/terminal-interaction-system/` on branch `prototype/terminal-interaction-system`, commit `d14cfc9`. Its three source variants and recorded synthesis cover realistic Planning and Reviewing density, commitment and recovery edge states, keyboard and mouse behavior, responsive widths, linear/no-color/ASCII presentation, layout configuration, and portable JSON settings. Final color, typography, spacing, and decorative treatment remain for [Choose Neoflow’s visual language](./WF-013-choose-visual-language.md).

## Post-validation clarification

[Choose Neoflow’s visual language](./WF-013-choose-visual-language.md) exposed the persistent layout-preset strip as workspace clutter. `Auto`, `Focus`, `Balanced`, and `Overview` therefore live in Settings rather than as persistent workspace buttons or global command-palette actions. Immediate task-local controls—Files and Findings visibility, file navigation, and divider resizing—remain beside the work they affect. This changes control placement, not the validated adaptive arrangements or their saved-default behavior.
