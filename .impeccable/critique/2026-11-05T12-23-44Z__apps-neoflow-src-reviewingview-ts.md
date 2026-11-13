---
target: Reviewing TUI
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:07544e2b2a3b8cfff7451518274fbf828bf56166e759a7e0ffa918e8cd2ec15b"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-05T12-23-44Z
slug: apps-neoflow-src-reviewingview-ts
---
# Critique: Reviewing TUI (apps/neoflow/src/reviewingView.ts), 2026-11-05

Method: design review only. The detector does not apply to a terminal UI. 46 real frames were rendered (132x40, 100x30, 80x24, 60x20, plus --no-color --ascii).

## Score: 26/40, Acceptable
1 Visibility of system status 3 · 2 Match with the real world 3 · 3 User control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition over recall 2 · 7 Flexibility 3 · 8 Minimalist design 2 · 9 Error recovery 3 · 10 Help 2

## Priority issues
- [P1] Text is cut from the middle, even recovery copy. `label()` truncates by default (reviewingView.ts:365). Fix: wrap prose, keep path tails, only cut labels. Command: /impeccable harden
- [P1] --ascii turns every non-ASCII character into `?` (safeText), colliding with the `?` that means unknown. Fix: an ASCII stand-in table, with `?` reserved for unknown. Command: /impeccable harden
- [P1] The Diff gets 54 of 132 columns at wide and wraps mid-token. Fix: proportional pane defaults, a file tree that shrinks to fit, wrapping at word or token boundaries. Command: /impeccable layout
- [P1] `a` from History or Files silently anchors to line 1 (reviewingModel.ts:4695), and the composer can be drawn away from its line. Command: /impeccable clarify
- [P2] After send, focus jumps to History (reviewingModel.ts:5080), keys typed during the save are dropped, and the "keys are paused until Neoflow answers" copy is wrong. Command: /impeccable optimize

## Persona red flags
- Power user: keys dropped while sending; focus stolen after send; Space and ? open the same sheet.
- Keyboard-only / low vision / no colour: --no-color drops bold; the linear tab strip marks the active tab by colour only; ASCII `?` collisions; help cut off at 80 columns.
- Split-pane solo dev: at 100x30 the Messages pane disappears and Files moves sides; at 80x24 the tab says "Messages" but the pane says "History"; at 60x20 the header, footer and [Tab] are clipped.

## Minor observations
- The accent is used as decoration (wordmark, LIVE CHANGES, syntax tokens, word chips).
- `✓ sent` shares the glyph and green of `✓ answered`.
- `[x] interrupt` is shown when nothing is running.
- A Review with no changes says "0 changed files" instead of "Nothing changed since your last commit".
- The first selection is a deletion, so the first `a` is refused.
- Configuration still says "Questions".
- Every Previous Review has the same title.

## Questions to consider
- Should the side panes be summoned rather than permanent?
- Could "unknown" lead to an action instead of a dead end?
- Should History, Messages and Questions become one name?
