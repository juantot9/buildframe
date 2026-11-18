---
id: WF-298
title: "Re-scope Planning's first slice for the post-0.1.0 product"
status: open
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
