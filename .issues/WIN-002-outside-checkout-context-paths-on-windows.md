---
id: WIN-002
title: "Outside-checkout Context paths on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-22
---

## Finding

`contextEvidence.ts` treats outside-checkout paths as POSIX bytes. Walking
an outside directory joins each child with `/` (`walkOutsideDirectory`,
`Buffer.concat([absolutePrefix, SLASH, name])`), and `pathUnderPrefix`
decides containment by a byte prefix followed by `/`. On Windows a selected
`C:\…\outside-dir` yields `C:\…\outside-dir/a.txt`, and the prefix check
also ignores `\` and case-insensitive names.

Found by CI run 44958983631: `workspaceContextEvidence.test.ts` "admits
explicit ignored and outside-checkout selections…" expects
`path.join(outsideDir, 'a.txt')` and receives the mixed form. It runs only
where symlinks are available (the GitHub runner), so the reference machine
never ran it.

## Work

- Decide how outside-checkout paths are spelled and compared on Windows
  (separator, drive letter and case), and where that rule lives.
- `contextEvidence.ts` is over the file size budget (frozen): the Windows
  path handling goes in a new file beside it, and the edit there moves out
  at least as much as it adds.
- Keep macOS and Linux bytes, Context records and identities unchanged.

## Progress (2026-11-22)

- Decision (default, for the owner to confirm): outside-checkout paths are
  the host's absolute paths. On Windows a selection is normalized once
  (`path.win32.normalize`: `/` to `\`, repeated separators), children are
  joined with `\` and containment checks `\` (a drive root such as `C:\`
  already ends with it). Case is not folded: `C:\X` and `c:\x` stay two
  selections, which can only duplicate candidates, never reach beyond a
  selection. macOS and Linux keep a selection's exact bytes and `/`.
- The rule lives in `outsidePaths.ts`; `contextEvidence.ts` only calls it
  (70,317 → 70,298 bytes, comments tightened to fit).
- `outsidePaths.test.ts` covers both spellings on every platform.
- Still to see: the Windows CI job (the scenario needs symlinks).

## Verification

- The test above passes on the Windows CI job.
