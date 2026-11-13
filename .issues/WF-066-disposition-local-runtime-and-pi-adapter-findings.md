---
id: WF-066
title: "Disposition the Local Runtime and Pi Adapter findings"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: [WF-064]
created: 2026-08-07
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Settle the disposition and the within-package rank of the **4** ledger findings
owned by the Local Runtime and the Pi Adapter, excluding the one pulled ahead on
[Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md).

**L-01**, **L-02**, **L-04**, and **P-01**.

Two packages share one ticket because the Pi Adapter has exactly one finding and
they are adjacent in **P16C**'s order. Keep their ranks separate — the execution
package works Local Runtime, then Pi Adapter.

Two carry a question the audit left open:

1. **L-04** — the bootstrap parser manufactures a literal version type it never
   verified, and the file holds **three grades of the same defect**, one already
   correct and one semantically wrong. Decide whether all three are one fix or
   whether the correct one is the pattern the other two adopt. The
   harness-adapter parsers in the same file already validate their literal
   version inside the parser, which is what the finding asks for — so this is
   plausibly a consistency repair rather than a judgement call.
2. **P-01** — three unguarded async paths can crash the user's Pi session. It is
   the ledger's clearest case of a defect no linter caught: the linter posture
   decision measured `no-floating-promises` and `no-misused-promises` at zero
   hits and confirmed neither reports this. Decide whether the fix carries an
   obligation to prove it stays fixed, given nothing mechanical will.

## Established facts

- **All four are proposed `fixed`.** One medium (**P-01**), three low (**L-01**,
  **L-02**, **L-04**). No high finding in either package.
- **L-01 is a comment that denies the acknowledgement the code implements.** The
  disposition question is which of the two is wrong — that decides whether this
  is a one-line comment edit or a behavioural change, and only one of those is
  cheap.
- **Nothing imports the Pi Adapter yet.** That fact is what makes one ruled-out
  hostile-Pi-response lead hold, and the ledger records it as an **expiry** —
  the ruling lapses the moment something does import it. Do not lean on it as a
  reason to rank **P-01** low without saying so explicitly.
- **X-03's fourth `JSON.stringify` comparison site is in the Pi Adapter**, and
  **W-13**'s copied helpers may reach here. Both are dispositioned with the
  Workspace on
  [Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md);
  read what that ticket recorded as inherited before deciding, rather than
  re-deciding.
- **L-03 is settled: `fixed`, Local Runtime / `first`, pulled ahead of P16B.**
  Note the deadline moved — the ledger had said before **P16C**, and the
  disposition pass moved it to before **P16B**, which lands first and changes the
  same command surface. The seam is *not* typed yet and will not be on this map;
  what is settled is the ruling, not the repair. Rank **L-04** knowing the typed
  seam arrives before P16B's changes, not before this ticket.
- **The record format is settled and is not reopened here.** `**Disposition:**`,
  `**Rank:**`, an optional `**Pulled ahead:**`, and `**Decided:**`, specified in
  the ledger under **How a settled finding is recorded**. Rank is a band —
  `first`, `normal`, or `last` — and the two packages keep separate bands, as
  this ticket already requires.

## Blocked by

- [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)

## Resolution comment

**All four ruled `fixed`, none pulled ahead, and two of the four were wrong about
their own evidence while right about their disposition.** The rulings themselves
live in `docs/audit/pre-p17-codebase-findings.md` under **L-01**, **L-02**,
**L-04** and **P-01**; this comment records what the pass decided and why, not what
it wrote.

This was the first pass to run the settled record format on a real package, which
was the reason for taking it before the 19-finding Workspace pass. **The format
needed no change.** One gap in it was found and filled by ruling rather than by
amendment — see *What the format inherits* below.

### The two findings that survived intact

**L-01** — the comment that denies the acknowledgement the code implements. The
ticket asked which of the two is wrong, because only one answer is cheap. **The
comment is wrong**, and the evidence is stronger than the finding claimed: the
server sends `workspace.unsubscribed` on *every* unsubscribe, unconditionally and
outside the branch that detaches the subscription, and carries its own comment
stating the ordering guarantee. Two comments in one protocol describe the same
mechanism and contradict each other. So this is the cheap branch — one comment.

The ruling adds one constraint the finding did not: **rewrite it, do not delete
it.** The tombstone the false comment guards is still needed, for a reason the
comment never states — the acknowledgement is *ordered after* updates the server
had already queued. Deleting the comment satisfies the finding's literal complaint
and destroys the only written rationale for `#retiredSubscriptions`.

**L-02** — frame reassembly re-copying per chunk. Ratified unchanged; both halves
re-read at source. One constraint added for whoever executes it: the overflow guard
reads the very field the rewrite removes, so the chunk list must carry a running
byte total or `MAX_FRAME_BYTES` silently stops enforcing. That limit is the
frame-too-large protection, so the running total is the requirement and the copy
saving is the benefit, not the other way round.

### The two that did not

**P-01 was wrong in both directions at once**, and this is the pass's main result.

- **The count was too low.** Three unguarded async paths in one file are **six
  across two**. The finding never followed `extension.ts:130` into
  `piNativeEvents.ts`, where `bindPiReviewedAdapterEvents` registers three more
  `async` handlers awaiting adapter methods with no `try`. One of them additionally
  makes a synchronous *host* call inside the async handler.
- **The mechanism was too generous.** The finding says the two `attachLoop` paths
  "reach the Workspace and can reject". The Workspace is the one source that
  **cannot** propagate: `#emit` catches every sink failure and queues the evidence,
  and `#flushEvidence` does the same. A failing sink produces no rejection at all.
  Five of the six paths actually reject through uncaught calls into the **Pi host**;
  only the `workspace.read` on the first path rejects for the stated reason.

A necessary condition reported as sufficient, and a sufficient one reported as
necessary, inside one finding. **The correction is not bookkeeping**: a fixer who
believes the Workspace is the fault source will test the new guards with a failing
sink, see nothing reject on five of six paths, and reasonably conclude the guards
are dead code. The faults to inject are a throwing Pi host and a failing
`workspace.read`.

**L-04's completeness claim held; its semantic claim did not.** "All six
narrowly-typed version fields" is exactly right — verified by enumerating every
`typeof …VERSION` and every double cast in the file. But grade 3's reason is
withdrawn: the two fields it called semantically wrong, "because they carry the
peer's supported version, a value whose entire purpose is to differ from ours", are
written by **our own server with our own constant**. On the wire `supported` means
*the sender's* version. The true reason is more general and survives — **one
interface serves both directions, so a literal type can be true in only one of
them**, and the parser sits on the side where it is false.

A **fourth defective site** turned up that neither the audit nor the dead-code
sweep had counted: `harnessAdapter.ts:403` hardcodes `1` where its sibling uses
`WORKSPACE_INTERFACE_VERSION`. Since this finding names those call sites as the
*sole* enforcement of the negotiated version, one of the four not tracking the
constant is the same defect one layer out.

Both corrections were folded into the existing findings rather than opened as new
ones — same title, same call sites, same defect class — matching how **S-01**
absorbed its second vector. The ledger's count stays at 46.

### The two questions the ticket left open

**1. L-04: one fix, or is the correct grade the pattern?** Grade 1 is the pattern,
**but the three grades are not one fix — they are three edits, and two move in
opposite directions.** Grade 2 adopts grade 1 (validate inside the parser). Grade 3
must be *widened* to `number`, because validating it would be actively wrong on the
read side where the parser lives. The third edit is the hardcoded `1`. Treating all
three as one consistency repair — the reading the finding invited — would have
broken the rejection frame's whole purpose.

Checked rather than assumed: **the fix is behaviour-preserving.** Moving the
comparison into the parser makes it return `undefined`, and both call sites then
fall back to the *same* `invalid-runtime-bootstrap` diagnostic they already produce
on a version mismatch. Nothing is lost.

**2. P-01: does the fix carry an obligation to prove it stays fixed?** **Yes, and
it is discharged structurally rather than by a test** — route every `pi.on`
registration through one wrapper that catches, and delete the per-site guards it
subsumes. Decided by the owner from three options.

The evidence that made it more than a preference: nothing mechanical catches this
(the linter posture decision measured both candidate rules at zero hits and
confirmed neither reports it), and — established here — **no test covers either
file**. Both are imported only by the package entry the Pi host loads; the sole
contract test touches neither, and no test in the repository mentions any of the
four handler names. A regression test would need a Pi host double that does not
exist, costing more than the six guards and still covering only those six. And the
author's own record is decisive: the correct guard appears at two sites in this
code and is **missing at six of the eight opportunities**, so per-site discipline
has a *measured* failure rate here, not a suspected one.

### What the format inherits

- **A single-finding package makes the rank band vacuous.** The Pi Adapter has one
  finding, so there is no ordinary work for a `first` band to precede, and `first`
  requires a written reason that could only be "it is the only one". **`normal` is
  the honest band.** Ruled here rather than amended into the format, since the
  format already says ties carry no meaning.
- **The expiry trap was avoided explicitly, as this ticket required.** P-01's rank
  is *not* derived from "nothing imports the Pi Adapter yet"; the band would be the
  same if the package were imported tomorrow. That is stated in the finding so a
  later reader cannot mistake the reason.
- **Ranks:** **L-04** is the one `first` — the four call-site comparisons are the
  sole version enforcement on the accept path, and the tool that reports them as
  always-constant has no autofix and no suggestion, so the deletion hazard needs a
  human acting on an authoritative-looking report. That report has a named and
  *endorsed* trigger: the linter posture decision concluded these tools are worth an
  occasional probe run. **L-01**, **L-02** and **P-01** are `normal`.
- **No pull-forwards.** No later package makes any of these repairs dearer. One
  conditional obligation is recorded instead, and it belongs to another package: **if
  P16B bumps `WORKSPACE_INTERFACE_VERSION`, the hardcoded `1` must be updated in the
  same change**, because bumping a version constant obliges updating every site that
  compares against it. Whether P16B bumps it is not established here and is P16B's
  call. Recorded because the stale literal is invisible from the Workspace package
  where the constant lives.

### What this pass deliberately did not do

- **Nothing inherited from the Workspace pass, because it has not run.** The ticket
  told this pass to read what
  [Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md)
  recorded about **X-03**'s fourth `JSON.stringify` site and **W-13**'s copied
  helpers before deciding. That ticket is still open and unclaimed — the map's
  blocking edges were removed and the six passes made parallel — so there was
  nothing to inherit. **Both remain entirely with the Workspace pass**, and this
  pass did not pre-empt either, including where X-03's fourth site sits in the Pi
  Adapter.
- **No new findings, no new tickets, and no fog.** Both corrections belonged inside
  existing findings. The one general question this pass could have raised — whether
  the untested Pi extension wiring is its own defect — is answered by P-01's
  structural fix, so a separate finding would only duplicate its remedy.
- **No code was changed**, per the map's standing rule. **No test suite was run**;
  every claim here is from reading source and enumerating call sites.
