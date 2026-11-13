---
id: WF-234
title: "Show the complete Response for the selected Message"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

The Harness answer to a selected Review Message is readable in full inside the inline Messages pane: the effective keyboard-selected Message renders its complete Review Response, wrapped by terminal display cells, with pane-local scrolling when the pair is taller than the viewport.

## Finding

The second WF-231/WF-232 human walkthrough reproduced one defect, confirmed against the owner's persisted session state: after Pi answered the manual Message, the selected card showed the complete Message body but only the first three wrapped Response rows followed by an ellipsis. The 299-byte Pi answer — the entire point of the exchange — could not be read anywhere in the application, in any layout or focus state. The compact hover expansion and the horizontal strip showed the same bounded preview.

The projection already carries the Response body up to a 4 KB preview with an explicit `truncated` flag, and `review.message-body` already streams the complete Message body, so the missing capability was a complete Response read plus complete rendering for the effective Message.

## Interface

The keyboard-selected Message shows its complete Message body and complete Review Response as one pair; an oversized pair uses the existing Messages-pane scroll model instead of clipping. Collapsed rows and pointer-hover-only rows remain dense bounded previews, and the compact horizontal strip stays bounded. When the list projection's Response preview is truncated, the existing complete-body read supplies the remainder for the selected Message.

## Module seam

`review.message-body` gains an explicit `part: 'message' | 'response'` selection; the view shape is unchanged and no new request kind, record, or command exists. Complete-Response presentation stays in the Reviewing application/view and drains through the existing `load-message-body` effect, model state, and failure notice. No Harness Interaction Interface change is needed.

## Acceptance

- [x] The keyboard-selected Message renders its complete wrapped Response body, including a distinctive final line, without requiring hover.
- [x] An oversized Message/Response pair scrolls inside the Messages pane through the Response's final line without changing Message selection.
- [x] Collapsed and pointer-hover-only rows remain bounded previews and never render the Response tail; the compact strip stays bounded.
- [x] A Response whose list preview is truncated loads its complete immutable body through `review.message-body part: 'response'` and reports failure truthfully when unavailable.
- [x] Wide, Balanced, Linear, ASCII, and no-color presentations keep borders intact and preserve whole Unicode graphemes.
- [x] Focused application and Workspace scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

A Review Response is the answer the owner asked for; bounding it to three rows made the pane unreadable by construction. The effective Message now pairs the complete body with the complete Response, the way the separate detail card used to before the palette-shaping refactor, while every other row stays a dense bounded preview. The complete Response read reuses the existing Message-body streaming seam rather than inventing a second body pipeline.

## Completion evidence (2026-09-15)

- `ReviewMessageBodyViewRequest` accepts an explicit `part: 'message' | 'response'`; the projection validates it, resolves the one immutable response record for the message through the same index entry and record checks as the list projection, and streams it through the existing windowed body shape. Invalid parts fail closed, and a message without a response reads as `not-found`.
- The Reviewing model carries `selectedMessageResponseBody` next to the existing Message-body slot, requests both truncated parts when the selected pair needs them, resets them on every selection or route change, and reports `The complete Response body could not be loaded.` on failure.
- The effective keyboard-selected Message renders the complete wrapped Response with a green `Response ·` prefix row plus one bounded multiline body; hover-only and collapsed rows keep their bounded previews and the compact strip stays bounded. The pane's existing oversized-selection scroll model reaches the Response tail without moving selection.
- Application scenarios assert the collapsed card excludes the Message and Response tails, the selected card contains both complete tails, the hovered card stays bounded while the selected pair is unaffected, and a truncated Response loads its complete immutable body before scrolling to its final line at 100×28. The Workspace scenario reads a windowed complete Response and its missing-response `not-found` path.
- Verification on Node 26.5.1: the 41-file/356-test suite, lint, format, dependency firewall, package and test typechecks, clean direct builds of all four packages, build smoke, the compiled dogfood fault probe, and `git diff --check` pass with unrelated repository-health work unstaged.
