---
target: apps/neoflow/src/reviewingView.ts (after colour pass)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:912b6635168dd9c34c466ce977392bfbbdc89060ac17790de9b06aaa1306a489"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-06T13-11-18Z
slug: apps-neoflow-src-reviewingview-ts
---
Method: dual-agent (A: design review from rendered frames · B: detector)

## Design health: 29/40 (Good), up from 28

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Saving shows four different statements; "Opening" uses a still `○` |
| 2 | Match with the real world | 3 | "Loading same-version Review views", "Checking exact target", "Moves you type" |
| 3 | User control and freedom | 3 | Esc and `r` exist, but `r` works only from History |
| 4 | Consistency | 2 | `[ / ]` vs `[[ / ]]` vs `[/]`; `[t]` review points vs compare; `○` has five meanings |
| 5 | Error prevention | 3 | Saved is not sent; Esc twice to discard |
| 6 | Recognition over recall | 3 | The card says "Press r"; the keys row hides `[r]` outside History |
| 7 | Flexibility | 3 | Ranked keys, mouse optional, F3 preview |
| 8 | Minimalist design | 3 | "Current Review" twice; answer printed twice; accent in about 8 places |
| 9 | Error recovery | 3 | Resend exists; Home error cut off; empty Review is a dead end |
| 10 | Help | 3 | Grouped help; composer has no newline hint |

**Colour pass:**
- Function/tag tokens: fixed. Number/constant tokens still equal the warning hex in three themes.
- Green `●`: fixed; it now marks only the agent.
- ASCII spinner: fixed in source, not seen running. The ASCII "Opening" row is a still `.`.
- With the green gone, the header route and the rail lead look identical.

**Detector:** 4 design-system-color advisories in the preset tables, all false positives (same as last run). No token equals its preset's accent. Green also appears on "Enter starts this Review", the current-head choice card, and success notices.

**Not captured** (stale script): Configuration, past step, working/stopping, ASCII spinner running, linear layout, send confirmation.

## Priority issues
1. **[P1]** "Press r to send it again" doesn't hold outside History. Fix: `r` acts from any Review pane, and `[r] send again` shows in every focus while it applies.
2. **[P2]** The accent still marks states and decoration:
   - `✎` is accent, not brass.
   - Badges turn accent on selected rows.
   - The wordmark, help labels and the rail at "now" are accent.
   - Number/constant tokens use the warning colour.
3. **[P2]** The send moment contradicts itself (Updating / Saving locally / saved / Saved; waiting). Fix: close the composer once the save commits; show one "Saving #1…" line, then one "Saved. Waiting…" sentence.
4. **[P2]** Repeated chrome. Fix:
   - Put the rail in the header.
   - Drop "everything since last commit" at now.
   - History shows a preview while the card shows the full answer.
5. **[P3]** Key wording and dead ends:
   - `[ and ]`.
   - One label for `t`.
   - Errors wrap to two rows.
   - Empty Review says "No changes since your last commit. [f] shows all files." in muted text.

## Persona red flags
- **Power user:** `r`/`x` from the Diff only redirect; `[ / ]` reads like search; no newline hint.
- **First-timer:** cut-off file names; "Checking exact target"; empty Review is a dead end.
- **No-colour/ASCII:** `*` means three things; `||` on the focused title; `|` header separator vs `-` elsewhere; muted text on accentSoft is 3.8:1 in dark themes.

## Minor observations
- Help overlay has no backdrop.
- The Files and History bodies have no inner padding.
- `＋ local` uses a fullwidth plus.
- The Home header shows no agent status on failure.

## Questions to consider
- What if the focused pane were the only accent region?
- What is History for while the card shows the full answer?
- Should "Code changed while answering" be the one brass thing in the card?
