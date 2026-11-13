---
id: WF-067
title: "Disposition the Application findings"
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

Settle the disposition and the within-package rank of the **10** ledger findings
owned by the Neoflow Application.

**A-01** through **A-06**, **X-08**, **S-04**, **S-05**, and **S-07**.

This is the most varied group on the map: 6 proposed `fixed`, 3 `accepted`, and
the ledger's only `deferred`. The three `accepted` proposals are where the map's
evidence rule does its work — confirm each is genuinely deliberate rather than
unexamined — and the `deferred` one is where the Live Changes boundary is tested.

Four carry a question the audit left open:

1. **A-06** — every visible current Review re-runs three `git` processes,
   including a whole-working-tree `status`, every 750 ms forever. Proposed
   `deferred` to **P16B** Live Changes, which replaces Application-side polling
   with hint-driven Workspace verification. Decide whether that deferral holds,
   or whether an unbounded process loop shipping in the interim is itself the
   problem. The finding notes a **P16B** detail that does not change its
   disposition — read it before agreeing.
2. **X-08** — a published command surface with no producer, including an 87-line
   state-mutating interruption handler that no producer and no test has ever
   executed. Proposed `accepted` — cover it, do not delete it — because direct
   review handoff and interruption are designed v1 behaviours whose Application
   end is unwired, and this map rules product decisions out of scope. Decide
   whether "cover it" belongs to this map's disposition at all, or whether the
   coverage obligation is **X-09**'s and this finding is purely a record.
3. **A-04** — the launcher's Node gate is looser than every other bound and
   starts on known-broken versions. Its repair is already named as a **P16C**
   fix by the execution plan itself. Decide whether that naming binds this
   ticket or whether it is re-openable.
4. **S-05** — pasted text is filtered by a weaker rule than typed text. Decide
   whether the two rules converge, and on which of them, since that is a
   trust-boundary decision rather than a cleanup.

## Established facts

- **By severity: 4 medium** (**A-01**, **A-02**, **A-04**, **A-06**), **6 low**.
  No high finding in this package.
- **The three `accepted` proposals are X-08, A-03, and S-04.** A-03 is each suite
  building its own scripted doubles; S-04 is the User Configuration directory
  being the one durable root never verified. Both were proposed `accepted` on
  reasoning recorded in the finding, and **S-04**'s carries a qualifier.
- **A-05 is confirmed dead code that reverses an earlier audit ruling.** The
  revise-question editor is wired end to end, unreachable, and unsavable if it
  were reached — both save guards accept only `create-question`. 100 lines,
  proposed `fixed`. Its Workspace end lies outside that count and is noted on
  [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md);
  the deletion is one act across two packages, so decide it as one. (That ticket
  is one of four from the 2026-08-07 split of the original Workspace pass.)
- **S-07 is unexploitable today only because the Workspace escapes control
  characters out of paths.** Box titles are the one rendered text the view never
  filters. The protection is in a different Module than the gap, which is worth
  saying in the disposition rather than leaving implied.
- **A-01 and the "unbounded scroll" lead turned out to be one defect**, not two.
  Do not look for a second.
- **X-09 covers the Review-completion tests and is pulled ahead.** Read its
  resolution before ranking **X-08**: if the missing endings are already
  scheduled, **X-08**'s coverage argument may already be partly discharged.
- **Shared-fixture coupling was never systematically assessed.** **X-06** and
  **A-03** stand as written and were not re-derived by the dead-code and
  test-quality sweep. If **A-03**'s `accepted` proposal is overturned here, that
  gap is the reason to look again rather than a reason to trust it.

## Blocked by

- [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)

## Resolution comment

**Split into three on a named seam, not decided; no finding was dispositioned.**
Closed on 2026-08-08 so it is unambiguously off the frontier, with the work moved
intact to [text filtering](./WF-075-disposition-application-filtering-findings.md)
(3), [unreachable surfaces and test doubles](./WF-076-disposition-application-unreachable-surface-findings.md)
(3), and [bounds and checks](./WF-077-disposition-application-bounds-and-checks-findings.md)
(4).

**Sum check, because this is the step the previous split got wrong.** 3 + 3 + 4 =
**10**, matching this ticket's count. The Workspace split named eighteen findings in
groups that were supposed to total nineteen, and the error was caught *only* by
adding the groups up — so the groups were added up.

| Ticket | Findings | Count |
| --- | --- | --- |
| [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md) | **A-02**, **S-05**, **S-07** | 3 |
| [Disposition the Application unreachable-surface and test-double findings](./WF-076-disposition-application-unreachable-surface-findings.md) | **A-05**, **X-08**, **A-03** | 3 |
| [Disposition the Application bounds and checks findings](./WF-077-disposition-application-bounds-and-checks-findings.md) | **A-01**, **A-06**, **A-04**, **S-04** | 4 |

### Why split, and why now

Ten findings against a measured **4–7 per session**, with roughly half needing
substantive correction rather than agreement. The measure has now held across six
passes. This ticket was also **the most varied group on the map** — six proposed
`fixed`, three `accepted`, and the ledger's only `deferred` — so it is the one
where a mid-pass compaction would cost the most, because a ratification that stops
being read is a ratification that ratifies.

**It was split before being worked rather than during**, which was the standing risk
the Workspace split named: a session only discovers it does not fit once its budget
is largely spent, which asks for the most disciplined choice at the least disciplined
moment. The Workspace split was made under exactly that pressure and still shipped a
counting error.

### The seam, and the evidence for it

The split is by **what kind of decision each finding demands**, and two of the three
groups exist because their findings are coupled by evidence rather than by topic.

**Text filtering is a real cluster, and the strongest argument for splitting here at
all: two of its findings contradict each other and neither says so.** S-05's evidence
states that `label()` is where `safeText` strips C0 and C1 centrally, "so every
*other* rendered string, including hostile commit subjects and branch names, is
already neutralised". **S-07 is precisely a rendered string that does not pass
through `label()`.** S-05's claim about the completeness of the defence is disproved
by its neighbour, filed by a different sweep, cited by no line of it. A-02 is the
third rule on the same shape — one filter per surface, each with an exception — and
whether the answer is three repairs or one relocated primitive is a question no
finding asks. That is the A-06/X-02 pattern the state-and-projection pass named, and
it is the reason these three cannot be ratified apart.

**Unreachable surfaces is a real cluster because A-05 and X-08 answer the same
question in opposite directions.** Both are published surfaces with no producer;
A-05 is proposed for deletion and X-08 explicitly for coverage rather than deletion,
on the distinction `capability-shaped, not accident-shaped`. **That distinction is
the rule this map hands to P16C, and neither finding states it as a rule.** A-03
joins them because it is the test-infrastructure finding that decides what "reached"
means, and because it now carries a correction of its own.

**Bounds and checks is the residue, and the ticket says so rather than pretending
otherwise.** Its four findings are independent of one another; they are together
because none couples to anything in the other two groups and four is inside the
measured size. Forcing a shared ruling on them is the error the Workspace split's
own seam made.

### What the split preserves

- **Rank stays one Application band across all three tickets.** The band belongs to
  the package, and three tickets over one package is exactly the shape that would
  otherwise produce three independent `first`s. This is the rule the Workspace split
  established and it carries unchanged.
- **All four open questions travelled with their findings** rather than being
  centralised: S-05's convergence question to the filtering ticket, X-08's
  coverage-versus-X-09 question to the unreachable-surface ticket, and both A-06's
  deferral question and A-04's P16C-binding question to the bounds ticket.
- **Cross-package obligations are distributed by finding rather than centralised**,
  which is a deliberate departure from the Workspace split. There, one ticket owned
  every inherited site. Here each group carries its own — S-07's defence lives in the
  Workspace, A-05's deletion spans two packages, A-06 changes the exposure of W-07
  and W-09 — and, critically, **the Workspace band is now fully settled**, so there
  is no open ticket left to absorb a constraint. Each ticket is told to record its
  obligations on the finding and in the ledger's obligations block instead.
- **Every ticket states the ratification standard and the record format
  explicitly**, including the two format rules added since this ticket was written:
  an `accepted` finding records `Rank: n/a`, and a **split** disposition still takes
  a band.

### One thing carried in that changes a ticket rather than a finding

**A-03's stated blocker was measured on 2026-08-08 and does not exist.** Its
proposal is written around "unless the firewall permits a shared test package", and
the firewall permits it — established by running the real
`scripts/check-v1-dependencies.mjs` against a synthesized tree, where a fifth package
under `packages/` is invisible by bare specifier and by relative path alike while a
planted control violation from the same directory is caught. The unreachable-surface
ticket is told not to ratify that clause as written, and is handed X-06's cost
argument as the live replacement. Without that instruction the clause would have been
ratified, because it reads like a premise rather than a claim.

### What this does not do

**A split is not a resolution.** No finding here was dispositioned, the ledger is
unchanged by this act, and the count stays at 46 with 27 settled. The three new
tickets are open, unassigned, and unblocked; this ticket's own `blocked_by`
([Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md))
is closed, so none of the three inherits a live block and the owner may run them in
parallel.
