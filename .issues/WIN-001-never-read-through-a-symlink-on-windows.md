---
id: WIN-001
title: "Never read through a symlink on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-22
---

## Finding

Node defines no `O_NOFOLLOW` on Windows (`fs.constants.O_NOFOLLOW` is
`undefined`), so `O_RDONLY | O_NOFOLLOW` opens with flags that follow links.
Two readers rely on it alone:

- `packages/workspace/src/workspaceEvidence/repositoryContent.ts:101`
  (`readRepositoryContentWindow`, the file content Reviewing shows)
- `packages/workspace/src/workspaceEvidence/content.ts:134`
  (`streamRegularFile`, content digests and captures)

`legacyReviewSource.ts:771` uses it too, but already compares the `lstat`
taken before the open with the handle's `fstat` (`sameStat`), so a link
swapped in is caught there.

Without Developer Mode or an elevated token, Git checks symlinks out as
plain files and nothing is followed. With either (common on developer
machines, and GitHub's Windows runner runs as Administrator), a checkout's
symlink to a file outside it is read and shown, which macOS and Linux
refuse.

Found by CI run 44958983631: `repositoryContent.test.ts` "refuses symlinks"
reads the link's target and reports it `available`.

## Work

- Refuse links on Windows without `O_NOFOLLOW`: `lstat` the path (must be a
  regular file), open it, `fstat` the handle and require the same `dev` and
  `ino` (populated on NTFS), as `legacyReviewSource.ts` does. Keep macOS
  and Linux unchanged.
- Look for other no-follow assumptions on Windows (`O_NOFOLLOW`, `lstat`
  followed by a path-based open).

## Progress (2026-11-22)

- `workspaceEvidence/openUnfollowed.ts` opens both readers' files. With
  `O_NOFOLLOW` (macOS, Linux) it opens exactly as before. Without it
  (Windows) the path must not be a link before the open, and the handle must
  be the same file (`dev`, `ino`) after it.
- `openUnfollowed.test.ts` runs that Windows path on every platform: a
  junction is refused on the reference machine (no privilege needed), a
  file symlink wherever symlinks work (CI), and a path that became another
  file between the check and the open is refused.
- No other reader of checkout content opens by path: `readFile`,
  `createReadStream` and `O_NOFOLLOW` appear nowhere else in the evidence
  and context code.
- Still to see: the Windows CI job, where symlinks work.

## Verification

- `repositoryContent.test.ts` "refuses symlinks" passes on the Windows CI
  job, where symlinks are available.
- A Windows test with Developer Mode, or an elevated shell, on the
  reference machine.

## Progress (2026-11-23)

- CI run 45072386168 (on `efdf166`): all six jobs pass; on the Windows jobs, where symlinks work, the symlink refusal cases
  ran and passed.
- Left: the second check above, on the reference machine (Developer Mode or
  an elevated shell).
