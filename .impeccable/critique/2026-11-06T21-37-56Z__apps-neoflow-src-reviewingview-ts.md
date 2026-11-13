---
target: apps/neoflow/src/reviewingView.ts (after WF-275)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:a79963b2d81556148e8921ec4ddbf0f0d8b60bcda004142eda38d02470d975b6"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-06T21-37-56Z
slug: apps-neoflow-src-reviewingview-ts
---
Method: dual-agent (A: design review from 32 rendered frames · B: detector + contrast checks)

## Design health: 28/40 (Good), down from 30

The journey went deeper this run (code file, failure, past step) and hit a real bug.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Wrong file under the composer; "moves to History in a moment" when it's already there |
| 2 | Match with the real world | 3 | "+ 1 local", "edits outside answers", "review points" |
| 3 | User control and freedom | 3 | Keys locked to `[Ctrl+C] quit` while saving |
| 4 | Consistency | 2 | Keys row ranks differ by pane (14 vs 15); ASCII `○` is `o` on rail, `.` in History; Home's first option changes |
| 5 | Error prevention | 3 | F3 + proportionate gate; undermined by the wrong-file composer |
| 6 | Recognition over recall | 3 | History cuts file names; empty Review omits `[f]` |
| 7 | Flexibility | 3 | Keys locked during save |
| 8 | Minimalist design | 2 | "checking" ×6 in 09; Preview/Configuration hints twice; "#3 · Third" then "Third" |
| 9 | Error recovery | 3 | Home load failure vague, no retry key |
| 10 | Help | 3 | Hint in border; debug key listed; no F3/composer keys |

## Design specificity
Authored for Neoflow: the rail, saved-is-not-sent, `✎ Code changed while answering` into a brass past step, a gate only after a lost turn.
Detector: 4 design-system-color advisories (theme border/background values not listed in DESIGN.md), false positives as drift. All pairs ≥3:1; muted on accentSoft/successSoft 3.8–4.4:1 (known). Warm Carbon keyword/number near its amber accent.

## Priority issues
- [P1] Selection jumps back to the first file ~3 s after opening another, with no key pressed; the composer then sits under review.txt while saying src/reviewQueue.ts:17. Fix the refresh that drops the selected file; pin the Diff to the anchor while composing; test that Diff title and card name the same file.
- [P2] Send flow repeats itself: "checking" in six places (09); frame 10 copy contradicts History. One owner per fact.
- [P2] Mid-word cuts remain: "…ue.ts:17", "equal priori…", ASCII "is working o...". Use "line 17" when name:line doesn't fit; word-boundary fit everywhere.
- [P2] Accent leaks: card paging hints, Claude Code status line, opening/loading screens, preview text and hints, continuation diagram, past-Review dialog body; "▶ now ◀ here" accent while cursor is elsewhere; five literal "...".
- [P2] Keys row doesn't fit the situation: empty Review lacks `f`; ranking unstable; no History cue at 100 columns.

## Persona red flags
- Alex: keys locked during save; no newline hint; 10-item keys row; debug key in help.
- Sam: `||` focus reads as a double border; ASCII `+`, `o`/`.`, `*` collisions; stacked selection marked by colour only.
- Daily solo developer: the file jump; History can't name the file; 65 identical Previous Reviews; "Press a…" on a line with a working Message.

## Minor observations
Configuration dialog off-centre; gutter widens 3 cells on first mark; syntax colours arrive late; routine edits always brass; past-step rail chip in accent; first answer line green; unexplained `+` in frame 16; "Esc twice" on empty draft.

## Questions to consider
- Should an open composer lock the Diff to its line?
- Could the send phases be one ticking line on the card?
- Is your own editing between answers a caution that deserves brass?
