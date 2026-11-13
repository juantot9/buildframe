---
id: WF-065
title: "Disposition the Workspace findings"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: null
blocked_by: [WF-064]
created: 2026-08-07
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Settle the disposition and the within-package rank of the **19** ledger findings
whose owning Module is the Workspace, excluding the three already settled on
[Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)
— **W-01**, **X-09**, and **S-01**, the last two filed under the cross-cutting
and security categories but Workspace-owned — and the naming decision held on
[Decide whether the Workspace Writer vocabulary drift obliges a rename](./WF-069-decide-workspace-writer-rename.md).

**X-01**, **X-02**, **X-03**, **X-04**, **X-06**, and **W-02** through **W-15**.

Every one is proposed `fixed`, so the decision on each is whether that survives
contact with the map's evidence rule — a finding supported only by taste is
`accepted`, not `fixed` — and whether **P16B** Live Changes will rewrite the code
anyway, in which case it is `deferred` to that package rather than decided here.

Four of the nineteen carry a question the audit explicitly left to this decision
rather than answering itself. Resolve those rather than passing them on:

1. **X-02** — whether it escalates from medium to high turns on whether the
   delivered view carries its own freshness claim. The finding says the
   disposition decision should settle that.
2. **W-13** — the consolidation it proposes has a home that already exists, and
   two `sha256` implementations disagree. Decide whether consolidating is
   evidence-driven repair or the tidiness this map forbids, and note that its
   own `accepted` half was flagged as worth re-weighing here.
3. **W-14** — `git` resolved through `PATH` is *why* the supported Node ceiling
   exists. Its fix is unproven across four handoffs, so decide whether it is
   `fixed`, or `accepted` with the declared range standing as the mitigation.
4. **W-06** — atomic-rename durability applied at three different strengths.
   Decide the target strength, since "make them consistent" does not say which
   of the three wins.

## Established facts

- **This is the largest ticket on the map and it holds the ledger's only high
  finding.** By severity: 1 high (**W-07**), 7 medium (**X-01**, **X-02**,
  **X-04**, **W-03**, **W-06**, **W-10**, **W-11**), 11 low.
- **W-07 is already judged not to unsettle the pushed Gate B checkpoint**, for
  reasons recorded in the finding. That judgement is not reopened here; what is
  open is its rank and its disposition as a **P16C** fix.
- **Three findings sit in test source, not production source** — **X-04**,
  **X-06**, and the test half of **W-15**'s neighbourhood. The map's no-code-change
  rule covers them identically.
- **X-03 and W-13 both reach outside the Workspace.** X-03's fourth site is in
  the Pi Adapter and W-13's helpers are copied across modules. They are
  dispositioned here because the Workspace holds the canonical copy; record any
  obligation the sibling package inherits so
  [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
  does not decide it twice.
- **W-15 is thirteen dead type re-exports in one block**, and it is the *entire*
  unused-export result across 516 exports in 29,076 lines. Its `fixed` proposal
  survived two checks — not a published Interface, not a deliberate
  pass-through — so the innocent readings are already ruled out.
- **A-05's dead path has a Workspace end** outside its own 100-line count. It is
  dispositioned with the Application, not here, but the Workspace side of the
  deletion is real; do not decide it independently.
- **The record format is settled and is not reopened here.** `**Disposition:**`,
  `**Rank:**`, an optional `**Pulled ahead:**`, and `**Decided:**`, specified in
  the ledger under **How a settled finding is recorded**. Rank is a band —
  `first`, `normal`, or `last` — with a written reason required for `first` and
  `last` only, and ties carry no meaning. There is no need to order these
  nineteen against each other, and doing so would manufacture precision the
  evidence does not support.
- **If this ticket does not fit one session, split it on a named seam** rather
  than compacting mid-pass: evidence and `git` (**W-07**, **W-08**, **W-09**,
  **W-14**), state and projection (**X-01**, **X-02**, **W-03**, **W-04**,
  **W-05**, **W-06**, **W-15**), reviewing and diff (**X-03**, **W-10**,
  **W-11**, **W-12**, **W-13**), and tests (**X-04**, **X-06**). Record the split
  as fresh tickets on the map rather than leaving a half-worked one closed.

## Blocked by

- [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)

## Resolution comment

**Split, not decided. No finding was dispositioned here.** Closed on 2026-08-07
so it is unambiguously off the frontier; the work moved intact to four fresh
tickets, on this ticket's own named seam, before any session claimed it.

### Why it was split before being worked rather than during

This ticket already carried the instruction to split on a named seam *if it did
not fit one session*. That instruction was left as written for four handoffs and
was the map's standing risk, for a structural reason: **a session only discovers
it does not fit once its budget is largely spent**, and at that point compacting
through is the path of least resistance and splitting is the expensive option.
The instruction asked a session to make its most disciplined choice at its least
disciplined moment.

What changed is that the cost of a finding is now **measured** rather than
estimated.
[Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
settled four findings in one session and **two of the four needed substantive
correction rather than agreement** — one undercounted its own defect sites and
named a fault source that could not propagate, the other had a false semantic
claim and a fourth site nobody had counted. That is the real rate for a
ratification pass held to this map's standard, and at that rate nineteen findings
is roughly four sessions. The seam was going to be used; using it now costs one
edit and using it later costs a compacted pass.

### Where every finding went

The seam named four groups. All four became tickets, none was merged, and the
finding lists below are exhaustive and disjoint.

| Ticket | Findings | Count |
| --- | --- | --- |
| [Disposition the Workspace evidence and git findings](./WF-071-disposition-workspace-evidence-and-git-findings.md) | **W-02**, **W-07**, **W-08**, **W-09**, **W-14** | 5 |
| [Disposition the Workspace state and projection findings](./WF-072-disposition-workspace-state-and-projection-findings.md) | **X-01**, **X-02**, **W-03**, **W-04**, **W-05**, **W-06**, **W-15** | 7 |
| [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md) | **X-03**, **W-10**, **W-11**, **W-12**, **W-13** | 5 |
| [Disposition the Workspace test-source findings](./WF-074-disposition-workspace-test-source-findings.md) | **X-04**, **X-06** | 2 |

**The seam had a completeness error, and it is worth recording.** Its four groups
named **eighteen** findings, not nineteen: **W-02** appeared in none of them. It
is placed with evidence and `git` because it lives in `workspaceEvidence.ts`'s
capture paths alongside **W-07**–**W-09**. This is the same failure this map keeps
finding — a list presented as exhaustive that is not — made this time in a
ticket rather than in a finding or a ruling, and caught only because the split
required adding the groups up.

### What the four tickets carry forward

- **The four open questions were distributed with their findings**, not
  centralised: **W-14** to evidence and `git`, **X-02** and **W-06** to state and
  projection, **W-13** to reviewing and diff. Test-source carries none.
- **Rank stays a single Workspace band across all four tickets.** The band is a
  property of the owning package, not of a ticket, so `first` means first in the
  Workspace. Each new ticket says so, because four tickets over one package is
  exactly the shape that would otherwise produce four independent `first`s.
- **The cross-package obligations moved to reviewing and diff**, which is now the
  only place **X-03**'s Pi Adapter site and **W-13**'s copied helpers are decided.
  The Local Runtime and Pi Adapter pass closed without pre-empting either and
  said so explicitly, so nothing about them has been decided anywhere.
- **The largest ticket carries its own second seam.** State and projection is 7
  findings and two open questions; it names the split to use if it does not fit,
  rather than inheriting the same unusable instruction this ticket carried.
- **Every new ticket carries the ratification standard explicitly** — test the
  completeness claim and the mechanism, do not read and agree — because that
  standard is what made these tickets expensive enough to need splitting, and a
  session that does not know it will conclude the ticket is oversized.

### Not changed

- **No finding was touched.** The ledger is untouched by this split; all nineteen
  still read **Proposed disposition**.
- **No blocking edges.** All four are open, unassigned, and unblocked, matching
  how the remaining passes sit — the owner may run them in parallel.
- **Historical references were left as written.** Closed tickets that link here
  were true when written; this comment is the redirect.
