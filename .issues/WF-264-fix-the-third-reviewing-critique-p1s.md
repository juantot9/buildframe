---
id: WF-264
title: "Fix the third Reviewing critique's P1s, plain-word confirmation, one-row header, ranked keys row"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-05
---

## Outcome

These come from the third 2026-11-05 Reviewing critique (`.impeccable/critique/2026-11-05T15-47-39Z__apps-neoflow-src-reviewingview-ts.md`, 28/40) and from the owner's request to fix the confirmation screen and judge the header and keys row.
- The status line, pane focus and header never contradict what the screen shows.
- Configuration renders as a finished dialog.
- A failed, lost, stopped or unanswered Message can be sent again with `r`, without retyping.
- The send confirmation speaks in plain words and is the only thing on screen.
- The header is one row; the keys row is ranked and follows focus.

## Finding

- **Status contradicted the card.** "Saved. Waiting for Pi to start." stayed after the card said working, because `settledOutcome` only announced terminal states.
- **Two "you are here" signals.** Starting a Message from Files kept `Files FOCUSED` while the composer, which lives in the Diff, took the keys.
- **Header said live during a past step.** The source block ignored `shownStep`.
- **Configuration was broken.** A fixed `height: 12` for 13 rows drew the key hint into the bottom border, in Brass; it sat under Message cards (zIndex 20) and was positioned against the terminal, not the body.
- **No recovery after failure.** "Check its window, then send again." had no key; the user had to retype and re-anchor.
- **Confirmation used internal names.** `1 thing(s)`, `(message-text)`, a raw invocation id, a byte count, and empty rows; the panes (including a card repeating the password) showed around it.
- **Header and keys row.** Three header styles only differed at 100+ columns; one never collapsed; `WIDE`/`BALANCED`/`LINEAR` is internal. The keys row dropped `[Tab] pane` at 60 columns but kept `[q] quit`, ignored focus, offered `[x] interrupt` with nothing running, and wrote `[[] history`.

## Interface

- `settledOutcome` announces `working` as "<agent> started #N." so the waiting line is replaced.
- `shownFocus(state)` (view) treats the Diff as focused while `state.editor` exists; pane borders, titles and the linear pane choice use it.
- `r` in History (`sendSelectedMessageAgain`) opens the composer on the Message's file and line in the current basis with its full text, for states in `SEND_AGAIN_STATES`. Nothing is sent until Enter; it is saved as a new Message, and an unresolved earlier turn still raises the confirmation's "never reported back" item.
- `messagesPaneName(state)` names the pane `History` or `Messages` the same way in titles, the linear tab strip and hints.
- `ReviewingHeaderPreferences` is `{ visible }`. A stored `style` is ignored on load (no warning) and dropped on save. Configuration's row is "Header: Shown / Hidden".
- The header is one row: `Neoflow / <route>`, then the source word (`PAST STEP` in Brass during a past step) and the agent. Hidden, the agent moves to the end of the history row.
- `actionStrip` ranks hints per focus; `fitHints` joins with two spaces.
- The confirmation lists each flagged part by plain subject and reason, says how many characters go, and sits on a backdrop. The footer says `[Enter] send anyway` when something was flagged.
- A zero-size `reviewing-layout-<mode>` renderable lets tests wait for relayout now that the layout word is gone.

## Not done

- Showing which text looked like a secret needs the excerpt in the workspace's view contract (`ReviewMessageSensitiveOccurrenceView`); the harness-interaction subpath exports no runtime code by design.
- The critique's P2 colour pass (syntax tokens on the accent hue, green `●` meaning connected, ASCII spinner `- |` colliding with separators) and the confirmation's Enter carry-over guard.

## Verification

- Typecheck, lint and format clean for `apps/neoflow`; 87/87 app tests.
- New assertions: "started" replaces "waiting"; `r` reopens the failed Message's text on its line and Enter sends a second Message; the header says `PAST STEP` and not `LIVE` on a past step; the Configuration hint sits inside the box; the keys row keeps `[?] keys` and `[Tab] pane` at every width and hides `[x] interrupt` when nothing runs; a retired header style is ignored and dropped. The "started" assertion fails without its fix.
- Frames re-rendered at 132x40, 100x30, 80x24 and 60x20, plus `--no-color --ascii`.
