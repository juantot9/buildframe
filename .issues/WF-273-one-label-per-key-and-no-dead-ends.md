---
id: WF-273
title: "One label per key, whole error sentences, and no dead end on an empty Review"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

Each key has one label wherever it shows, and the bracket keys can't be mistaken for search. Warnings and errors keep their ending, which is usually the part that says what to do. A Review with no changes says so calmly and offers the way on.

## Finding

The 2026-11-06 critique raised these as P3:
- The history keys were written three ways: `[ / ] history`, `[[ / ]]` in help and the Versions dialog, and next to `[/] search`.
- `t` was labelled "review points" in one place and "compare" in another, but it opens the same Review points picker either way.
- The status line always fit one row and cut the end with `…`, which went against DESIGN's "wrap recovery sentences". At 100 columns, a Home failure ended "(injected Home read failu…".
- A clean worktree showed "No changed file selected." in Brass, in both the Diff body and its title. `a` then said "Select a file or a Diff line", though there were none.

## Interface

- **Bracket keys:** read `[ and ]` in the keys row, help and the Versions dialog. Help prints a key that already starts with `[` as is.
- **`t`:** reads `[t] review points` and "Choose review point" everywhere.
- **Status line:** a warning or error wider than the footer wraps onto a second row (two at most), and the footer grows by one row. The status line keeps `id: reviewing-status-line`.
- **Empty Review:**
  - The Diff says "No changes since your last commit. [f] shows all files." in Pewter, or "No changed files here." for a comparison, and its title reads `no changes`.
  - `a` says "Nothing has changed yet. Press f to show all files, then select a line and press a."
- **`DESIGN.md`:** the Notices, Keys row and Do's sections record these rules.
- **Not changed:** the no-answer glyph `·` still matches the separator, because its word, "no answer", always follows it.

## Verification

- New: `wraps an error onto a second status row instead of cutting it short` (60x24) and `says plainly when nothing has changed, and how to go on`. Both fail on the old code.
- The wide keys-row and help tests expect `[ and ]` and `[t] review points`.
- All 93 app tests pass.
