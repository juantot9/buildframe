---
id: WF-288
title: "A one-line edit in a CRLF-checked-out file shows the whole file rewritten"
status: open
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-16
---

## Finding

Confirmed 2026-11-16 (lead 4 of `docs/audit/codebase-health-2026-11-16.md`).
In a repository with `.gitattributes` `*.txt text eol=crlf`, Git stores the
file with LF and checks it out with CRLF. Editing one word on line 3 of a
5-line file gave a live Diff of 5 deletions (`one` … `five`) and 5 additions
(`one\r` … `five\r`). `git diff` shows one changed line.

`reviewing/diff.ts` compares the committed blob with the raw working-tree
bytes, so every line differs by its trailing `\r`. The same applies to
`core.autocrlf=true` and probably to `working-tree-encoding`.

Only edited files that Git converts are affected; unconverted files and
unchanged files are not. It is uncommon on macOS and Linux but common for
`*.bat`, `*.cmd` and `*.sln` files, and for every file on Windows, which is
the next platform goal.

## Direction

Compare lines the way Git does, but only for files Git itself converts
(their `eol`/`text` attributes or `core.autocrlf`), so a deliberate change of
line endings in an unconverted file stays visible. Do not run repository
filter drivers to do it: inspection deliberately never runs them.

The Diff is saved in Review Snapshots, so decide whether old Snapshots keep
their rewritten-looking Diffs.

## Verification

- A one-line edit in an `eol=crlf` file shows one deletion and one addition.
- An LF→CRLF conversion of a file with no line-ending attributes still shows
  every line changed.
