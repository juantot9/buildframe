---
id: WF-281
title: "Offer the preview once an agent is connected"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-07
---

## Outcome

The composer offers `[F3] preview` only while a coding agent is connected. Pressed earlier, F3 says why instead of opening a preview that closes at once.

## Finding

Owner dogfooding, 2026-11-07: "F3 automatically closes." With no agent connected, the preview's inspection is refused with `attachment-not-found`. The overlay opened, then closed straight away, and the reason only showed in the status line.

While testing the fix, a second problem showed up. Since WF-277, an empty draft's footer says `[Esc] close` and a typed one says `[Esc] discard`. But typing updated only the text box, so the footer kept `[Esc] close` until something else redrew the screen.

## Interface

- **Composer footer:** `[F3] preview` appears only while the connection view lists a connected agent. It appears as soon as one connects.
- **F3 with no agent:** the status line gives the `attachment-not-found` sentence ("No coding agent has connected to this repository yet…"). The draft stays as it is and no overlay opens.
- **Footer on typing:** the screen redraws when the draft goes from empty to not empty, or back. Other keystrokes don't trigger a redraw.
- `DESIGN.md` "Keys live in the footer" records when the preview key appears.

## Verification

`offers the preview only once an agent is connected` covers:
- no `[F3]` before an agent connects;
- F3 explains and opens no overlay;
- `[F3] preview` appears after the adapter is established;
- F3 then opens the exact preview.

It fails on the old code at its first wait, because the footer still said `[Esc] close`.
