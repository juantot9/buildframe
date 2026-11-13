---
id: WF-265
title: "Open a Message whose file is outside the loaded part of the Files list"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

Enter on a Message in History opens it in the Diff on its line, however long the Files list is, and the status line says where it went (`#19 · path:108`) or why it couldn't.

## Finding

Found while dogfooding: Enter on #19 did nothing visible. The Review had 165 changed files, and the app loads them 64 at a time. `navigateToMessage` only searched the loaded window; when the file was outside it, it set "The Message file is outside the loaded Review window." with `??=`, so the line was dropped whenever another notice was showing, and nothing offered a way forward. `#readReviewBundle` matched `filePathBytesBase64` only inside the window it was asked for, so the Message-origin path had the same limit.

Two smaller causes of "nothing happened":
- `j`/`k` in History already moves the Diff to a loaded Message's line, so Enter only moved focus.
- While building the fix, an Enter that arrived before a `j`/`k`-started load had landed was reported as "no changes", because the guard could not tell loading from missing.

## Interface

- `#withFileWindow` (application) resolves a target asked for only by path: it walks the changed-file windows (live, or saved for a fixed comparison or snapshot) and, after `f`, the all-files windows, and sets the offsets that hold the path.
- `navigateToMessage(item, absolute, reach)`: with `reach` (Enter, or a load Enter started), a file outside the window is requested by path; without it (`j`/`k`), nothing loads and the status line says "Press Enter to open #N at path:line."
- `#messageFileRequest` remembers that path and whether its load has landed; only a landed load that still lacks the file says "has no changes now; press f to show all files, then Enter again."
- `#landingNotice` says `#N · path:line` once the line is on screen; Enter clears the status line first, so only what this navigation says can replace it.

## Verification

- Reproduced on a copy of the owner's real Workspace state (65 MB, opened against the real checkout, deleted afterwards): Enter on #19 now lands on `reviewMessage.ts:108` with Files on the window that holds it.
- New test: 71 changed files, a Message on the last; after returning to the top of the list, selecting it gives the Enter hint and Enter lands on it. It fails on the previous code.
- 88/88 app tests; typecheck, lint and format clean.
