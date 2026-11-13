---
id: WF-271
title: "One story while a Message saves"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

From Enter until the Message is in History, every part of the screen tells the same story: first saving, then saved and waiting for the agent. None of them claims the Message was sent.

## Finding

The 2026-11-06 critique raised this as P2: the send moment contradicted itself. Once the save had committed, but before the Review refreshed, the screen showed four different statements at once:
- the status line said `⠴ Updating…`;
- the footer said "Saving the Message locally…" and "Moves you type now apply once it's saved.";
- the composer still read `New Message` with its editing hint;
- the local card said "Saved; waiting for Pi to start.", with a semicolon where the status line later uses a full stop.

Before the commit, the status line said "Sending to <agent>…" even though nothing had reached the agent.

Fixing this exposed a race. If the agent started before the saved Message first appeared in History, the status line never said "<agent> started #N." The Message had no earlier state to compare against.

## Interface

- **Status line:**
  - While the commit runs: `⠋ Saving #N…`.
  - After the commit: "Saved. Waiting for <agent> to start.", the same sentence `finishPending` keeps.
- **Composer while the save is in flight:**
  - The title reads `Saving · file:line`, then `Saved · file:line`, or `Not confirmed` if contact was lost.
  - The hint reads "Saving it locally first.", then "Saved; it moves to History in a moment."
  - The Diff title says `saving` instead of `composing`.
- **Footer:** "Keys you press now apply once it's saved." (or "…once it shows in History."), then `[Ctrl+C] quit`.
- **Local card:** its detail reads "Saved. Waiting for <agent> to start."
- **Outcomes:** a Message saved by this session counts as waiting before its first projection, so `settledOutcome` reports its first state change.
- `DESIGN.md` (State badge) records the sequence.

## Verification

- `keeps your place in the Diff while a Message saves…` now waits for the new footer wording.
- `says a Message is saved, not sent, and replaces that with its outcome` now reaches "Saved. Waiting…" before the Review refreshes. It emits the agent's start right away, and it times out on "started" without the seeding fix.
- All 91 app tests pass.
