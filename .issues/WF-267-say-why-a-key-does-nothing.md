---
id: WF-267
title: "Say why a key does nothing, and resend a Message outside the loaded Files list"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

Every Reviewing key either does what it says or tells you why it can't, in the status line. `r` on a Message whose file sits outside the loaded part of the Files list reopens its draft there instead of claiming the file isn't in the Review.

## Finding

A sweep after WF-265 for the same two kinds of problem.

**Lookups limited to the loaded files:** `sendSelectedMessageAgain` searched only the 64 loaded files, so on a large Review `r` said "<file> isn't in this Review now" for a file that was there. Every other lookup by path or identity already loads what it needs (Messages and Questions page through their windows; Questions locate their anchor first; a Message from another review point is opened by path).

**Keys that did nothing without a word:**
- `r` and `w`/`v` outside the pane they work in.
- `Shift+Left/Right` while Diff lines wrap.
- `h`/`l` in the Diff on an added or removed line, which has only one side.
- Enter in the Diff, and Enter in an empty History.
- `]` at "now", `[` past the oldest Version, and `]` at the newest Version of a fixed comparison.
- `R` when Live Changes is already shown, or the Review isn't of current changes.
- Keys a saved Snapshot doesn't take while its dialog is open.

The wording on `r` for a Message that can't be resent was also wrong: it listed "ended", but an answered Message has ended and still can't be resent.

## Interface

- `#sendAgainRequest` remembers the Message `r` is reopening. `r` loads its file by path (`filePathBytesBase64`, as WF-265's Enter does), and when that load lands with the Message selected, `sendSelectedMessageAgain(landed: true)` opens the draft. If the file still isn't listed, `r` says it has no changes now and to press `f`.
- Each silent key above now calls `say(...)` with where the key works or why it can't.
- Left alone on purpose: keys during a save (the status line already shows a spinner), and keys while something loads (the status line names the load).

## Verification

- `opens and resends a Message in a file outside the loaded part of the Files list` (71 changed files, Message on the last) now also fails the turn, checks the `r` and `w` hints from Files, unloads the file, and presses `r` in History. It fails on the old code and passes now.
- `pnpm typecheck`, lint and format on `packages`/`apps`, and all 76 test files (634 tests) pass.
