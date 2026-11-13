---
target: Reviewing TUI
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:apps/neoflow/src/reviewingView.ts"
target_fingerprint: "sha256:b885ee410910c244f7d8a7d2d6b5c643ebf5d9859ee1ae63084117eeb63fa184"
target_path: apps/neoflow/src/reviewingView.ts
timestamp: 2026-11-05T15-47-39Z
slug: apps-neoflow-src-reviewingview-ts
---
# Critique: Reviewing TUI (apps/neoflow/src/reviewingView.ts), 2026-11-05, third run

Method: dual-agent (A: design review from rendered frames · B: detector). The working tree includes the uncommitted confirmation-dialog rewrite. Frames were rendered at 132x40, 100x30, 80x24 and 60x20, plus light-terminal, --no-color --ascii, every header style, the keys row in each focus, and the confirmation dialog.

## Score: 28/40, Good (bottom of band)
1 Status 3 · 2 Real world 3 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition 3 · 7 Flexibility 3 · 8 Minimalist 3 · 9 Error recovery 2 · 10 Help 3

## Design specificity
The meaning-carrying parts are Neoflow's own: the history rail, `✎ Code changed while answering`, `Saved. Waiting for Pi to start.`, the brass `PAST · during #1` Diff. The outer shells are generic: the three-pane lazygit layout, the centred Home launcher, and a two-row masthead that repeats "Current Review" three times.

Detector: 4 advisory `design-system-color` findings at reviewingView.ts:136, 162, 165, 195. All are false positives (preset role values in the theme tables, which DESIGN.md asks for). The detector does not read OpenTUI view trees; browser overlay not applicable.

## Priority issues
- [P1] Status channels contradict each other: the status line stays "Saved. Waiting for Pi fixture to start." after the card says working (reviewingModel.ts:3100); Files keeps `FOCUSED` while the composer is open in the Diff at 100x30; the header keeps `▌ LIVE CHANGES` while the Diff shows a past step (reviewingView.ts:5326). Command: /impeccable clarify
- [P1] Configuration renders broken: fixed `height: 12` (reviewingView.ts:5105) for 13 rows, so the footer hint is drawn into the bottom border in brass; it overlaps the Message card and History borders; striped surface rows; off-centre at 80x24. Command: /impeccable polish
- [P1] Failures have no recovery key: "Check its window, then send again." with no resend; Home failure is end-truncated and shows internal text. Command: /impeccable harden
- [P2] The confirmation dialog hides what it warns about (no excerpt; needs a workspace contract field), the risk sentence is muted while its label is bold, the keys live only in the footer, and Enter carries over from the composer into "send anyway". Command: /impeccable clarify
- [P2] Accent and glyph meanings leak: syntax function/tag tokens use the accent hex; number/constant use the warning hex; `●` green means live, current and connected; ASCII spinner `- |` collides with separators and borders. Command: /impeccable colorize

## Header and keys row (asked for in the previous turn)
- Header: the three styles differ only at 100+ columns; breadcrumb-rail never collapses (keeps a full `─` rule at 60x20); the WIDE/BALANCED/LINEAR word is internal; hiding the header loses the agent's connection status.
- Keys row: 8–9 options at wide sizes; drops `[Tab] pane` at 60x20 while keeping `[q] quit`; not focus-aware; `[x] interrupt` shows with nothing running; `[[] history` reads as a typo; two separator styles.

## Persona red flags
- Power user: Tab is typed into the composer; `?` can't open help while composing; resend means retyping; `[f]`, `[t]`, `/` never shown.
- Keyboard-only / low vision / no colour: the linear tab strip doesn't mark the active tab under --no-color; rail markers are colour blocks only; muted on accentSoft is 3.83:1; notices expire with no log.
- Split-pane solo dev: about 11 of 20 rows are code at 60x20; History rows lose the file name; `Current Rev…`.

## Minor observations
- "Settings saved" on close with no change. Preview leads with bytes and says both "the agent" and "Pi fixture". Fullwidth `＋`. Empty review says "No changed file selected." and hides `[f] All files`. The composer is 10 rows when empty and doesn't say how to add a newline. Home repeats its description.

## Questions
- Could the rail be the header, so the masthead's repeated "Current Review" goes?
- Should every non-answered outcome be one key from a recorded resend?
- What stops a removed line from holding a Message, when PRODUCT.md promises old-side Anchors?
