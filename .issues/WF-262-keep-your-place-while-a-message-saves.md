---
id: WF-262
title: "Keep your place while a Message saves"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-05
---

## Outcome

Sending a Message no longer moves you. Focus stays in the pane you were in, usually the Diff, and the Messages pane still switches into view beside it. Moves typed while the Message is checked and saved locally are kept and applied once it is saved, instead of being dropped.

## Finding

This was P2 in the 2026-11-05 Reviewing critique.
- Submitting set focus to Messages (`requestMessageInspection`, `commitInspectedMessage`, and the pending `returnFocus`), so the next `j` moved the wrong list.
- During the save, the model dropped every key. In the view, every key except Esc, copy, F3 and F4 went to the composer's Textarea, so keys typed during the check and the save landed in the locked draft.
- The footer said "Sending… keys are paused until Neoflow answers", but Neoflow doesn't answer anything.
- The draft sync froze the text only for a preview check, a confirmation gate or an open preview. During a send check, any Textarea report cancelled the check, even one with unchanged text after a re-render. Typing during the check therefore silently stopped the send and left the status on "Checking before sending…".

## Interface

- On submit, `balancedContext` becomes `questions` and focus is left alone. The pending command's `returnFocus` is the focus at submit time.
- While a submit check or a `review.message.commit` is pending, the view routes keys to the model. The model holds up to 16 navigation keys: arrows, Page Up/Down, Tab/Shift+Tab, `j`, `k`, `[` and `]`. Everything else is dropped as before.
- `applyReview` replays the held keys through `handleInput` after the projection that settles the save, so they apply from the selection the projection sets. Held keys are dropped if the save ends another way, if a confirmation step opens, or if the check rejects the Message.
- The footer now reads "Saving the Message locally…" with "Moves you type now apply once it's saved. [Ctrl+C] quit".
- The draft is frozen while any inspection or the save is pending, so the inspected bytes are exactly the bytes sent and a re-render cannot cancel the check.

## Acceptance

- [x] After sending, the Diff keeps focus.
- [x] `j j` typed during the save apply afterwards, and the sent text is unchanged.
- [x] Moves typed during a check that ends in a confirmation are dropped, and the send still completes after confirming.
- [x] Tests that relied on focus jumping to Messages now move there explicitly (`focusPane`).

## Completion evidence (2026-11-05)

- Scenarios `keeps your place in the Diff while a Message saves and applies the moves typed meanwhile` and `drops moves typed during the check when sending stops for a confirmation` pass. The app suite passes 82/82, and typecheck, oxlint and oxfmt are clean for `apps/neoflow`.
- Re-rendered critique frames show the Diff keeping focus while sending, and the new footer fits at every rendered size.
