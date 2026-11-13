---
target: apps/neoflow/src/reviewingView.ts (after WF-269..273)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:de70757b6c0741642ede472ba92594105350370d05e0c2ff3d9875d26bac463e"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-06T15-36-44Z
slug: apps-neoflow-src-reviewingview-ts
---
Method: dual-agent (A: design review from 32 rendered frames · B: detector)

## Design health: 30/40 (Good), up from 29

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | The check phase tells two stories; keys are dropped without a word during a Diff load |
| 2 | Match with the real world | 3 | "Checking exact target", "lost track of this turn", "send anyway" |
| 3 | User control and freedom | 3 | r/x from any pane; `q` quits on one press, even mid-typing |
| 4 | Consistency | 3 | Bracket keys fixed; `saving` vs `Saved`; "..." vs "…"; Files sits left at 132 columns, right at 100 |
| 5 | Error prevention | 3 | Lost-turn confirmation good; text typed during a load runs y/f/t/v as commands |
| 6 | Recognition over recall | 3 | `[r]` everywhere; the empty Review offers dead keys and hides `[f]` |
| 7 | Flexibility | 3 | Ranked keys, F3, linear layout; no newline hint |
| 8 | Minimalist design | 3 | Failure sentence ×3; first-run Home repeats itself |
| 9 | Error recovery | 3 | Errors wrap and name keys; "Try again" names none |
| 10 | Help | 3 | Grouped help; composer doesn't say newline vs send |

**WF-269 to WF-273:**
- WF-269 and WF-273 landed. WF-270 and WF-272 mostly landed.
- WF-271 fixed the commit phase only.
- Accent still used outside focus:
  - the working sentence;
  - the local row;
  - the past-step rail;
  - the Question card, the discussion card and the Diff gutter (found by the detector).

**Detector:** 4 design-system-color advisories in the preset tables, all false positives (unchanged). Tokens are clear of accent and warning, and all have 4.5:1+ contrast (lowest is Paper number at 4.89).

## Priority issues
1. **[P1]** Keys pressed while the Diff loads are dropped or run as commands (`a` silent at reviewingModel.ts:5174; `y`, `f` fired in 07; `q` quits on one press). Fix: hold keys during a load like the save phase does, or at least say "Still loading…", and never let q/x fire from a burst.
2. **[P2]** The check phase tells two stories (09/42): the composer, footer and Diff title say editing while History says checking, and the footer offers locked keys. Fix: Checking title, hint and footer; "Checking the line · not sent"; the Diff title says `saved` once saved.
3. **[P2]** Accent outside the focused pane: the working sentence and its card title, the local row wash, the past-step rail, the Question card, the discussion card and the Diff gutter. Fix: route them through selectionColors or Pewter; at most the spinner glyph stays in accent.
4. **[P2]** Text cut where the meaning is: "✗ faile" in the stack row (code points vs cells), "…ew.txt:1", "…les". Fix: reserve the state suffix by display cells; prefer the basename; drop counts whole.
5. **[P3]** Repetition and wording:
   - The failure sentence ×3 (apply diffShowsSelected to outcomes).
   - The first-run Home duplicate sentence.
   - "send anyway", "An earlier Message here" (name #3), "lost track of this turn", "Try again".

## Persona red flags
- **Power user:** type-ahead during a load runs commands; `q` unguarded; no newline hint.
- **First-timer:** the first-run Home repeats itself; jargon; the empty Review has dead keys and no `[f]`; the Files pane moves sides.
- **No-colour/ASCII/narrow:** `o` and `*` overloaded; `||` focused title; `|` header separator; 80x24 works well.

## Minor observations
- No backdrop on help or Configuration.
- Fullwidth `＋ local`.
- The Response's first line is green.
- `[Tab] switch` and `[Tab] pane` both show at 80 columns.
- Resting borders are faint in light (1.96:1).

## Questions to consider
- Should single-letter commands ever run while something loads?
- Does History earn 40 columns of repeated text, or should it be a one-line-per-Message ledger?
- Does the working spinner need the accent at all?

## Capture gaps
- Intended code-file Message missed (keys dropped during the load).
- No `Saving #N…` frame.
- No light Home.
- Never seen: stopping/interrupted, read-only Previous Review, comparison flow, wrap/side-by-side, search, a paged card.
