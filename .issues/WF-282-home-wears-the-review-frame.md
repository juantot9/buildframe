---
id: WF-282
title: "Home wears the Review's frame"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-09
---

## Outcome

Opening Neoflow and opening a Review look like one app. Home sits in the Review's frame: header, a context row, then one bordered pane. Its rows, keys and words follow the same rules as a Review's.

## Finding

The 2026-11-09 Home critique scored 24/40, with consistency at 1/4. The snapshot is `.impeccable/critique/2026-11-09T08-43-30Z__apps-neoflow-src-reviewingview-ts.md`. Findings:

- **[P1] Layout:** Home was a centred splash with no panes, title row or pane surface. It also moved: centred for the launcher, top-left for the commit picker, and one row off between states.
- **[P1] Selection:** the wash covered only the label, the label took the accent, and a history row's second line got a wash of its own.
- **[P1] Commit picker:**
  - `[Commit]   Range to HEAD` looked like a key.
  - Tab and `/` lived in body text, not the footer.
  - "0 changed files / Enter starts this Review" was shown in green.
  - The same fact was repeated in the status line.
- **[P2] Narrow widths:** at 70 columns, sentences were cut mid-word ("…about them to your", "your files a", "only lets you r"), and wrapped descriptions lost their indent.
- **[P2] Repetition:** the NEOFLOW wordmark repeated the header. Previous Reviews said "Previous Review(s)" five times.
- **Minor:**
  - ASCII icons collided with the cursor and separators.
  - The same key was labelled differently in different views (`[j/k] select` / `commit` / `Review`).
  - Commit hashes had mixed lengths.
  - The header said "Review other changes" where the choice said "Review a commit or range".

## Interface

- **Context row:** sits on Graphite Raised where a Review's history row goes. It reads "No Review open" (Pewter) or "Current Review · 1 file · 0 Messages".
- **One pane:**
  - Rounded border in the accent, with the title `▌ Home FOCUSED  N choices`.
  - The commit picker (`▌ Commits FOCUSED`) and Previous Reviews (`▌ Previous Reviews FOCUSED  N · newest first · read only`) reuse the same pane, so nothing moves.
  - The header names the picker "Review a commit or range".
- **Rows:**
  - `›`, then bold Frost Text on Harbor Cyan Wash, padded to the pane's inner width.
  - Previous Reviews show one row each: when, counts, outcome.
  - The choice description wraps on whole words and keeps its two-cell indent.
  - The wordmark and the duplicate titles are gone.
- **Commit picker:**
  - Single-spaced rows.
  - The mode is a radio pair: `● One commit   ○ Range up to HEAD`, or `(*)`/`( )` in ASCII.
  - The preview is Frost Text and Pewter, with 12-character hashes.
  - An empty comparison says "No changed files · [Tab] compares a range instead" in the preview only.
  - Footer: `[/] search` (rank 3) and `[Tab] commit / range` (rank 4).
  - Opening search takes its two input rows from the list, so the preview never moves.
- **Keys:**
  - `[j/k] move` in every Home view.
  - `[Esc] Home` and `[q] quit` share rank 6, as in a Review.
  - Help reads `[j/k] Move` and `[Enter] Open` on the launcher, and `[Enter] Start a Review of it` in the picker.
- **ASCII icons:** `+` new, `@` continue, `=` commit or range, `%` Previous Reviews.
- **DESIGN.md:** a new Home section; list-row selection now names Home and the whole-row wash.

Enter on an empty comparison still starts a Review, as before. Only the wording and colour changed.

## Verification

- **New test:** `frames Home like a Review: one pane under a context row, rows washed whole, words said once` fails on the old code. It asserts:
  - the context row and the pane's top border and title;
  - no wordmark;
  - whole-word wrapping with the indent kept;
  - the wash on all 66 inner cells in Frost Text at 70 columns;
  - the radio pair;
  - the empty commit said once and never as "Enter starts this Review".
- **Updated tests (Home copy and geometry):**
  - Previous Reviews row form.
  - Picker footer and labels.
  - Commit list height (single-spaced: 37 rows at 132x50 and 11 at 80x24, up from 33 and 7).
  - The preview staying in place while search opens.
- **Full run:** `pnpm verify` passes, 646 tests.
