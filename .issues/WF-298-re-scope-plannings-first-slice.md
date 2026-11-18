---
id: WF-298
title: "Re-scope Planning's first slice for the post-0.1.0 product"
status: closed
labels:
  - wayfinder:grilling
parent: WF-289
assignee: juanan
blocked_by: []
created: 2026-11-17
---

## Question

What is the smallest Planning slice worth building first, given the product
0.1.0 actually ships?

## Why it needs deciding

WF-051's Planning packages (P31–P41) were written in July, before the 0.1.0
amendments:

- P31 depends on the standalone Reviewing completion gate (P30), whose
  learning gate says not to begin Planning until Reviewing has no
  Review-specific exceptions.
- P31 includes the Manual Handoff fallback (WF-034), which belongs to P27 —
  out of the 0.1.0 path and not built.
- 0.1.0 reshaped Reviewing (one connected session, newest `/buildframe`
  wins, one small message per Send; WF-225, WF-228, WF-239). The Planning
  blueprint (WF-005, WF-024, WF-031, WF-037) predates that.

## To decide

- Does Planning start before P30, and what replaces its gate?
- Is Manual Handoff part of the first slice, or does the first slice use only
  the connected session?
- Which of P31's outcomes form the first slice (origin, context snapshot,
  exploration handoff, projections, the screen)?
- What the Planning screen needs from the shell (WF-297) and which records and
  views the Planning owner declares (WF-296).

## Output

A resolution in this ticket that supersedes the P31–P41 cards in WF-051 (that
file is past the size budget, so the amendment lives here), and the first
Planning implementation ticket, blocked by WF-296 and WF-297.

## Grilling, round 1 (2026-11-18)

- **What Planning is for — open.** The owner leans towards shaping the plan
  together from the start (goal and context before the agent explores) over
  reviewing a finished plan, and asked for research first: how feasible each
  is, the impact on the user, and what Plannotator and similar tools do.
- **Starts now**, without waiting for P30. WF-296 and WF-297 replace its gate:
  Reviewing must need no special cases once Planning arrives.
- **No Manual Handoff** in the first slice; the connected session only.
- **The July design (WF-005, P31–P41) is background reference**, not
  authority. Its truth rules stay; its vocabulary is kept where it still fits.
- **One path for every connected agent** through the connector kit; native
  plan-mode capture (Claude, OpenCode, Pi) is a later slice per host.

## Grilling, rounds 2–3 (2026-11-18)

Research: [`docs/research/planning-shape-vs-review-wf298.md`](../docs/research/planning-shape-vs-review-wf298.md).

- **What Planning is for — settled.** A light start (a goal plus optional
  `file:line` pointers, sent as one Message), a full review loop on the plan
  (comments on its lines sent together, the agent revises, the owner approves
  a version), and a separate Implement step.
- **The plan is a markdown file BuildFrame owns**, which the agent edits in
  answer to the owner's comments (owner's proposal). No Response size cap
  applies, and plan versions are diffs.
- **A plan version is BuildFrame's snapshot** of the file's exact bytes when a
  Planning turn ends normally. Changes outside a turn are recorded as not the
  agent's; the owner's own edits between turns are kept as versions marked as
  the owner's.
- **During a Planning turn the agent may read and edit only the plan file**:
  enforced in Pi, requested of Claude and later OpenCode, and stated as a
  known limitation.
- **The start sends pointers, not file contents**; `CONTEXT.md`'s Planning
  Context Snapshot is amended accordingly.
- **Implement sends one Message naming the plan file and the approved
  version**, then normal Reviewing follows. The approved version stays frozen.
  Comparing code against the plan is a later slice.
- **Try it first**: the owner works for a day or two with a plan file reviewed
  in today's Reviewing before Planning code starts.
- **Where the plan file lives (round 4).** Not a folder in the working tree
  (owner: too noisy, easily forgotten), and not `.git` (Claude Code protects
  it and prompts on every write; no setting pre-approves it). It lives in an
  OS-managed temporary folder (`$TMPDIR` on macOS, `/tmp` on Linux). The file
  is a working copy: every version is saved in State, so BuildFrame rewrites
  it from the latest version if the OS clears it. Claude needs one user
  setting to edit there without asking; BuildFrame shows the exact line.

## Grilling, round 4 and resolution (2026-11-18)

- **Claude is held to the plan file by a plugin hook**, only while the running
  turn is one BuildFrame sent; the user's own prompts are never limited. Shell
  commands stay a stated limitation unless a second hook covers them.
- **Planning is a second screen** reached from Home ("Plan something new" and
  the list of plans); each plan opens as a document with its versions and line
  comments.
- **Several plans per repository**, each with its own file; Planning turns use
  the connected session one at a time, like any Message.
- **Approval stays on its frozen version.** If the plan changes afterwards,
  the plan and the Implement step say so plainly ("Approved: version 3 · the
  plan has changed since"). Implement always sends the approved version.
- **A plan ends as Implemented or Closed**; both stay readable.
- **Planning is a self-contained internal module** (its own Workspace owner
  through WF-296 and its own screen through WF-297) with an on/off setting,
  on by default. Downloadable modules are revisited when a second optional
  feature exists or others want to write their own.

**Resolution.** This ticket supersedes WF-051's P31–P41 cards for Planning's
first slice (WF-051 is past the file size budget, so the amendment lives
here). `CONTEXT.md`'s Planning Context Snapshot now means a goal plus
`file:line` pointers. Next: [Try plan review with today's Reviewing](./WF-299-try-plan-review-with-todays-reviewing.md)
and [Build Planning's first slice](./WF-300-build-plannings-first-slice.md).
