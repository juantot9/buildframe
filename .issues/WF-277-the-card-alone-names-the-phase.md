---
id: WF-277
title: "The card alone names the phase"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

While a Message is checked and saved, only the composer card says which phase it is in. Dialogs give their keys once, in the footer, and a stacked card doesn't print a short Message twice.

## Finding

The 2026-11-06 critique re-run (P2, "say it once"):

- During the check, "checking" appeared six times: in the Diff title, the card title, the card hint, the History badge, the History detail line and the status line ("Checking before sending…").
- Once saved, the card said "it moves to History in a moment" and the footer said "once it shows in History", but the Message was already in History as `＋ local`.
- Preview and Configuration printed their key hints inside the box and again in the footer.
- A stacked card showed "#3 · Third", then "Third" again.
- An empty draft's footer said "Typed text needs Esc twice to discard".

## Interface

- **Composer card:** the title reads Checking, Saving or Saved. The hint says only what that phase means: "Nothing is saved yet.", "Saving it locally first." or "This closes by itself."
- **Diff title:** while composing, it keeps describing the Diff (`since last commit · file:line`).
- **History:** the `＋ local` row shows its badge and body. Its detail line only appears once the composer has closed.
- **Status line:** says nothing during the check and the save. "Saved. Waiting for <agent> to start." follows as before.
- **Footer:** "[Ctrl+C] quit", then "Keys you press now wait until it’s saved."
- **Dialogs:** Preview and Configuration no longer repeat their keys inside the box. "Preparing the preview…" is Frost Text, not the accent.
- **Stacked card:** when the selected Message fits its index row whole, its body isn't printed again.
- **Empty draft:** the footer reads `[Esc] close`.

## Verification

- `tells one story while a Message is checked before saving` now counts "checking" exactly twice: once in the card title and once in the History badge. It fails on the old code.
- `keeps each state word whole in a stack of Messages on one line` asserts the selected short body appears once. It fails on the old code.
- The Configuration test asserts the keys appear in the footer and not inside the box.
