---
target: Reviewing TUI
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:a79408f6f432529d33484d5000b7ad86a07da48c62c05f19a0bfd97b1fa4249a"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-05T14-45-06Z
slug: apps-neoflow-src-reviewingview-ts
---
# Critique: Reviewing TUI (apps/neoflow/src/reviewingView.ts), 2026-11-05, second run

Method: design review only. The detector does not apply to a terminal UI. Frames were rendered at 132x40, 100x30, 80x24 and 60x20, plus light-terminal, --no-color --ascii and confirmation-screen frames.

## Score: 26/40, Acceptable
1 Visibility of system status 3 · 2 Match with the real world 2 · 3 User control 2 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition over recall 3 · 7 Flexibility 3 · 8 Minimalist design 2 · 9 Error recovery 3 · 10 Help 3

The first run's five priority issues no longer appear. This run found the next layer of problems.

## Priority issues
- [P1] "sent" claims more than Neoflow knows: `✓ sent` uses the same glyph and tone as `✓ answered` while the Message is still saving, and the status line stays "✓ Sent" after a failure or unknown outcome (reviewingStatus.ts:47,71). Command: /impeccable clarify
- [P1] The Diff selection resets to line 1 after an answer or live refresh, so the next `a` anchors to line 1. `f` jumps the file selection, and the first file opened is a deleted one rather than the top of the list. Pre-existing (the first critique's frame 10 shows it too). Command: /impeccable harden
- [P1] One Esc discards a non-empty draft, and drafts are not persisted (reviewingModel.ts:5087). Command: /impeccable harden
- [P2] Confirmation screen: `1 thing(s)`, `(message-text)` and a raw invocation id; the flagged text is never shown; background text bleeds through at 132 and 80 columns. Command: /impeccable clarify
- [P2] The accent is used beyond focus: syntax tokens, the history rail, the `now` chip, and the change note (DESIGN.md says Brass). Command: /impeccable colorize

## Persona red flags
- Power user: launch stops at Home; Esc discards drafts; no newline key; no resend for a failed Message; the F3 preview doesn't say Enter sends.
- Keyboard-only / low vision / no colour: in --ascii both ◆ and ● become *; [x] interrupt is offered when nothing is running; some text is clipped with no marker.
- Split-pane solo dev: History labels lose the file name; the 60x20 header and footer clip; about 8 of 20 rows are chrome; the tab says Messages but the pane says History.

## Minor observations
- Closing Configuration without changes shows "Settings saved".
- The empty Review copy doesn't say nothing changed.
- `＋` is a full-width character.
- Warm Carbon's warning is about 15° of hue from its accent.
- Moves dropped at a confirmation step are not announced.
- End-clips have no ellipsis where text isn't explicitly fitted.

## Questions to consider
- What would the Message row say if it could only claim what Neoflow has evidence for?
- Should History be a one-line index rather than a second copy of the answer?
- Should launch open the Current Review directly, with Home one Esc away?
