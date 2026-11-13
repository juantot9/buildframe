---
id: WF-232
title: "Refine the Messages panel"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-14
---

## Outcome

The Messages pane reads cleanly at default and narrow widths: each Message is scannable in one glance (state, location, a short body hint), the selected Message and its Response form an obvious pair, and nothing collides with borders or wraps into unreadable fragments. The owner's tested reaction to the current pane is "I don't like the way it looks"; this child settles the actual look.

## Findings (2026-09-14, rendered frame at 132×34)

Current structure: a list of 5-row cards (`#N location`, up to two preview rows, state label) above a selected-Message detail card (`Message` + full body + `Pi Response` + response body) in a ~40-column right pane.

- **Defect:** the card's state label overflows its box. A card is `height: 5` with a border, leaving three inner rows, but the title plus up to two preview rows plus the state label need four; the label is drawn on the bottom border with its spaces replaced by border dashes. The frame shows `╰─Response─captured──────────────────╯` and `╰─Awaiting─Response──────────────────╯`.
- The list and the detail column together consume the whole pane height; with one Message, most of the pane is empty, and the list/detail split gives each a small window.
- The state text is the only place a captured Response is signalled in the list; the body preview and state share the same visual weight.

## Interface

The pane owns its presentation only: it renders Review Messages, Responses, historical Questions, and interaction state from the existing projections. It invents no records, no ordering, and no message semantics. Any restyle stays inside `reviewingView.ts` (and its pane-scroll helpers); the model keeps its current selection and window contracts unless a specific interaction needs one.

## Acceptance

- [x] No rendered cell collides with a border or overflows its box at Wide, Balanced, Narrow, and ASCII presentations.
- [x] A Message card shows state, location, and a bounded body hint without truncating mid-word; long bodies degrade predictably.
- [x] Selected Message and its Response read as one pair; a captured Response is visible without opening the detail, and an absent Response is stated as awaiting rather than implied captured. (Revised at close: per-Message invocation failure is not part of the Messages projection — handoffs carry no message identity — so the pane shows captured or awaiting truthfully and does not fabricate a failed state.)
- [x] Historical Questions remain readable and clearly labelled without being converted to Messages.
- [x] Empty, one-Message, and long-list states all use the pane height honestly (no large dead zone, no ambiguous scrolling); keyboard and pointer behavior is unchanged.
- [x] The application Reviewing scenario suite (and any focused pane tests) pass, plus format, typechecks, and `git diff --check`.

## Constraints

- Keep the diff-first three-pane layout and the existing shortcuts; this is a presentation refinement, not a new interaction model.
- No new durable records, no message wording changes, no renaming of Message semantics.
- Color, state, and emphasis continue to follow the `QUIET_GRAPHITE`-class semantic theme, including no-color and ASCII modes.

## Resolution (settled 2026-09-14)

Keep the UI name **Messages** and use one dense list without a separate detail region. Every collapsed row shows a useful bounded Message preview, its location, and a textual state marker without relying on color. There is no blank row or card gap between adjacent entries.

The keyboard-selected or pointer-hovered Message expands in place as one compact Message/Response pair. Moving the pointer away restores the keyboard selection's expansion, so hover remains optional and keyboard behavior is complete. The expanded entry uses only the rows needed for bounded readable previews; long content remains predictably clipped and scrollable through the existing pane behavior rather than reserving a fixed detail area.

Historical Questions retain their explicit label and existing semantics. State uses compact text and a glyph where available, never a border-only or color-only accent.

## Resolution status

**Confirmed by the owner (2026-09-14).** The owner specifically requested a useful small collapsed preview, inline expansion on hover to reveal the Response, and minimal space between list entries.

## Completion evidence (2026-09-14)

- The separate selected-Message detail card is gone. `questionsPane` in `apps/neoflow/src/reviewingView.ts` renders one dense list whose entries are borderless rows of derived height: a header with ordinal, clipped location, and textual state; up to two bounded body preview rows while collapsed; and, for the keyboard-selected or pointer-hovered Message only, up to two body rows plus up to three Response preview rows with a trailing `Response · awaiting Pi` row when no Response exists. Adjacent entries have no gap and no card border, so nothing can collide with a frame.
- The bordered 5-row card class of defect is structurally impossible now: heights come from the exact rendered children (`height: children.length`), locations are clipped with display-cell-aware `clipEnd`, and previews wrap on word boundaries with a terminal ellipsis via `previewRows`, including wide-cell and ASCII handling. The rendered frames above show Wide 132×34, ASCII 224×48, and the local entry with no overflow.
- State is compact text plus a glyph and is never color-only: `✓ Response`, `○ Awaiting` (`+`/`.` in ASCII), and for the application-local entry `… Checking`, `! Confirm`, `… Saving`, `✓ Saved`, `! Not sent`, `? Unknown`, always prefixed with `+ local` and a truthful detail line. The no-color versus rich dogfood frame comparison remains byte-identical.
- The keyboard-selected and pointer-hovered expansions are unified: hover is presentation-only model state (`hoveredMessageIdentity`) resolved as hover-first with the keyboard selection as fallback; releasing hover restores the selected Message. Scroll reconciliation deliberately follows keyboard selection only, so hover can never scroll a card out from under the pointer, and centering in the compact strip likewise follows the keyboard selection.
- Pointer hover uses the OpenTUI mouse-movement stream (now `enableMouseMovement: true`) through one root `onMouseMove` hit test over the Message card IDs; mouse down/up still owns activation, and hover updates are skipped while a native text-selection drag is active.
- Empty, single-Message, long-list, and historical-Question states all use the full pane body height through the existing pane-scroll helper; historical Questions keep their existing labelled cards. Unused Message-detail-only scroll plumbing (`messageDetailScroll`, `wheelMessageDetail`, the `message-detail` region) was removed, while `ReviewingPaneScrollState` remains the pane contract.
- Verification on Node 26.5.1: the application scenario suite passes 18/18, including new assertions that collapsed entries are tighter than the selected entry, that hovering a collapsed entry expands it without replacing keyboard selection, and that the selected entry expands again after hover ends; the full Vitest suite passes (41 files, 354 tests); the compiled dogfood fault probe passes with its Message-response assertions moved to the refined pane; all package and test typechecks, clean direct builds of all four packages, build smoke, compiled risk probes, formatting, the dependency firewall, and `git diff --check` pass with unrelated repository-health work unstaged.
