---
id: WF-233
title: "Show complete selected Messages and use Harness-neutral copy"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

A selected Review Message is readable in full inside the inline Messages pane, with pane-local scrolling when it is taller than the viewport. Generic Reviewing copy names the Harness role rather than the current Pi implementation, so future Claude Code, OpenCode, Codex, or other reviewed Adapters do not require product-language changes.

## Finding

The first WF-231/WF-232 human walkthrough reproduced two product defects:

- after submitting the long Message in manual step 2.4, the selected/local row permanently showed only a bounded preview, so the user could not read the complete text they had just sent;
- generic workflow labels such as `Send to Pi` and `awaiting Pi` leaked the only current Adapter implementation into the Harness-agnostic Reviewing surface.

Concrete Attachment destination labels may still truthfully identify Pi when Pi is attached. The defect is generic workflow copy hard-coded to Pi, not the display of an actual destination identity.

## Interface

Collapsed rows remain dense bounded previews. The effective keyboard-selected Message and the provisional local Message show their complete body, wrapped by terminal display cells; an oversized selected row uses the existing Messages-pane scroll model rather than clipping or creating a separate detail card. Pointer hover remains an optional bounded expansion and does not replace keyboard selection.

Generic actions and lifecycle labels use **Harness**. Actual destination summaries continue to use the Adapter-provided Harness and session labels.

## Module seam

Complete-body presentation stays in the Reviewing application/view. The existing `review.message-body` projection supplies a selected body when the bounded list projection is truncated; no Workspace or Harness Interaction Interface change is needed. Harness-neutral terminology changes presentation copy only and does not weaken current Pi Adapter compatibility evidence.

## Acceptance

- [x] A provisional local Message shows its complete body before the command result when the vertical Messages pane is available.
- [x] The keyboard-selected durable Message shows its complete body; if taller than the pane, wheel scrolling can reach its final text without changing Message selection.
- [x] Collapsed and pointer-hover-only rows remain bounded and dense; leaving hover restores the complete keyboard-selected row.
- [x] Complete wrapping preserves line breaks and whole Unicode graphemes at Wide, Balanced, Narrow/Linear, ASCII, and no-color presentations without border collisions.
- [x] Generic Reviewing UI and notices contain no hard-coded `Pi`; concrete Attachment labels and Pi-specific Adapter/developer documentation remain truthful.
- [x] Focused application scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

The user's manual finding settles both decisions directly: complete selected/local Message text is required, and **Harness** is the provider-neutral product role. Pi, Claude Code, OpenCode, Codex, and future integrations are concrete Harness destinations supplied through reviewed Adapters, never generic Reviewing vocabulary.

## Completion evidence (2026-09-15)

- Vertical Message cards now derive their height from display-cell-aware complete wrapping. The provisional row and keyboard-selected durable row render every body row; collapsed and hover-only rows retain the bounded preview.
- Truncated list projections trigger the existing `review.message-body` read as soon as the Review selects the Message. The projected prefix is explicitly marked as loading while the complete immutable body is requested.
- An oversized selected card remains selected while the existing pane-owned visual offset scrolls from its first row through its Unicode final line. Focused Messages own the full body area in Linear and code-spotlight layouts instead of the former six-row strip.
- Reviewing actions, lifecycle labels, pending notices, and developer entrypoint copy now name the generic Harness role. Adapter-provided destination labels remain concrete.
- Application scenarios cover immediate long provisional text, complete durable text, truncated-body retrieval, pointer hover, multiline Unicode wrapping, oversized scrolling, and the Linear layout. The 41-file/356-test suite, lint, format, dependency firewall, typechecks, clean build, build smoke, compiled dogfood fault probe, and `git diff --check` pass on Node 26.5.1.
