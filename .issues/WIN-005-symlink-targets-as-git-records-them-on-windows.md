---
id: WIN-005
title: "Symlink targets as Git records them on Windows"
status: open
labels:
  - wayfinder:task
parent: WF-304
assignee: juanan
blocked_by: []
created: 2026-11-22
---

## Finding

Workspace Evidence and Context read a checkout symlink's target with
`readlink` and keep its raw bytes. Windows stores a target with `\`
separators: Node writes `../outside-b` as `..\outside-b`, and `readlink`
returns that. Git for Windows reads the same link back as `../outside-b`,
so a link's captured target differed from its blob, and the committed and
working sides of an unchanged link would differ by separator alone.

Found by CI run 45057917403 (on `17fe10a`), once the symlink capture case in
`workspaceEvidencePerSideDegraded.test.ts` ran on Windows (its FIFO steps
moved to a POSIX-only file): expected `../outside-b`, captured `..\outside-b`.

## Progress (2026-11-22)

- Decision (default, for the owner to confirm): a symlink target is the
  bytes Git records. On Windows every `\` reads as `/`, as Git for Windows
  does; macOS and Linux keep raw bytes, where `\` is an ordinary byte.
- The rule lives in `linkTarget.ts` (`readLinkTarget`, `gitLinkTarget`);
  `content.ts` (Workspace Evidence) and `contextEvidence.ts` (Context) both
  read targets through it. `contextEvidence.ts` shrank (70,298 → 70,155).
- `linkTarget.test.ts` covers both spellings on every platform.
- Still to see: the Windows CI job.

## Verification

- The symlink capture case passes on the Windows CI job.
