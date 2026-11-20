---
id: WF-288
title: "A one-line edit in a CRLF-checked-out file shows the whole file rewritten"
status: closed
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

## Done (2026-11-20, `windows` branch)

- **Old Snapshots keep their Diffs** (owner decision). A Snapshot's rows are
  written when it is captured and never rebuilt, so nothing saved changes.
  History step Diffs between two Snapshots taken before this change compare
  raw bytes as before.
- **Git decides, not a guess.** Inspection's Git already reads the operator's
  system and global config natively (WF-096), so it knows the effective
  `core.autocrlf`, including the `true` Git for Windows sets in its system
  file. Working-tree sides now also ask `git check-attr` for `text`, `crlf`
  and `eol` (`workspaceEvidence/attributes.ts`), and
  `workspaceEvidence/lineEndings.ts` resolves them the way `convert_attrs` in
  Git's convert.c does: `text` (else the legacy `crlf`) decides, an `eol`
  makes a non-binary file text, and with neither, `core.autocrlf` true or
  input means `auto`. No filter driver runs.
- **A new side fact, only where it matters.** A working-tree side carries
  `lineEndingConversion: 'text' | 'auto'` only when Git converts it and its
  bytes hold a CRLF (noted while streaming, kept or not). Files Git leaves
  alone, and every LF file, keep byte-identical evidence and records. The
  State parser accepts the key on working-tree sides only, in the same key
  order as Workspace Evidence (manifest digests use plain JSON).
- **Lines compare as Git compares them** (`reviewing/diff.ts`,
  `reviewing/lineEndingComparison.ts`). On a side Git converts, a line's CR
  before its LF takes no part in comparison; rows still carry the exact bytes,
  offsets and digests. For `auto`, Git leaves binary-looking content alone
  (lone CR, NUL, or too many control characters: `convert_is_binary`) and
  leaves the CRs alone when the index copy already has one; the other side of
  the comparison stands in for the index. Each side follows its own fact, so
  two converted working states compare cleanly between History steps.
- **Not covered:** `working-tree-encoding` (a UTF-16 file is not text to
  BuildFrame), and a staged copy whose CRs differ from the committed one under
  `auto` (Git checks the index; BuildFrame checks the compared side).
- Size budget: `decorateAttributes` moved verbatim from the frozen
  `content.ts` to `attributes.ts` (now under budget); the scope-membership
  parsers moved to `reviewing/parsingScopeMembership.ts`; the generated and
  large-file side types moved to `workspaceEvidence/sideFacts.ts`. Every
  frozen file shrank.

## Verification (Windows 11, Node 26.5.1, Git 2.55.0.windows.3)

- `workspaceReviewingLineEndings.test.ts`, against real Git, with
  `core.autocrlf` set in each repository so the host's config cannot decide:
  a one-line edit in an `eol=crlf` file and under `core.autocrlf=true` each
  show one deletion and one addition; an LF→CRLF rewrite of a file with no
  attributes and `core.autocrlf=false` still shows every line changed; a file
  committed with CRLF under `core.autocrlf=true` shows one changed line. With
  the comparison change disabled, the first two fail and the last two pass.
  (Run with the native-Windows refusal patched out locally until WF-315.)
- `test/fast/lineEndings.test.ts`: the attribute table, Git's binary check
  and the comparison cases, 27 tests; these run on Windows today.
- Full suite on Windows with the refusal patched out: 704 tests, 675 pass;
  the same one failure as without this change ("rejects native Windows", by
  design while patched), plus two Workspace Identity lock and state-home tests
  that failed once under full-suite load and passed 3 of 3 when rerun.
- Typecheck, oxlint, oxfmt and the size budget pass. Not run here: macOS and
  Linux.