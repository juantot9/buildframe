---
id: WF-072
title: "Disposition the Workspace state and projection findings"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-07
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Settle the disposition and the within-package rank of the **7** Workspace
findings that own authoritative state, startup, durability, and projection.

**X-01**, **X-02**, **W-03**, **W-04**, **W-05**, **W-06**, and **W-15**.

One of four tickets from the split of
[Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its
resolution comment. **Rank within the Workspace band, not within this ticket.**

Every one is proposed `fixed`, so the decision on each is whether that survives
the map's evidence rule — a finding supported only by taste is `accepted`, not
`fixed` — and whether **P16B** Live Changes rewrites the code anyway, in which
case it is `deferred` to that package rather than decided here. **That second
test bites hardest in this ticket**: Live Changes rewrites the Snapshot lineage
and the projection surface, so `deferred` is a live answer here in a way it is
not elsewhere in the Workspace.

Two carry a question the audit explicitly left to this decision:

1. **X-02** — whether it escalates from medium to high turns on whether the
   delivered view carries its own freshness claim. The finding says the
   disposition decision should settle that. Establish what the view actually
   claims before ruling; this is a code question, not a judgement.
2. **W-06** — atomic-rename durability applied at three different strengths.
   Decide the **target strength**, since "make them consistent" does not say
   which of the three wins, and levelling down is a durability regression while
   levelling up has a cost nobody has priced.

## Established facts

- **This is the largest of the four split tickets and carries two of the four
  open questions.** By severity: 3 medium (**X-01**, **X-02**, **W-03**), 4 low.
  If it does not fit one session, split again on the seam between durability and
  startup (**W-04**, **W-05**, **W-06**) and state and projection (**X-01**,
  **X-02**, **W-03**, **W-15**), and record it as fresh tickets rather than
  compacting mid-pass.
- **W-01 is already settled and is this ticket's nearest neighbour** — the
  unbounded `#snapshotEvidenceIdentities` map in `projection.ts`, ruled `fixed`,
  Workspace / `first`, and **pulled ahead of P16B**. Read its ruling before
  ranking **X-01** or **W-15**; do not re-decide it.
- **W-15 is thirteen dead type re-exports in one block**, and it is the *entire*
  unused-export result across 516 exports in 29,076 lines. Its `fixed` proposal
  survived two checks — not a published Interface, not a deliberate
  pass-through — so the innocent readings are already ruled out. The tooling
  research behind that result is closed; do not re-run it.
- **A-05's Workspace end is not this ticket's**, despite touching state. It lands
  on the reviewing command surface and is noted on
  [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md),
  which holds it in one place.

## Method

**A ratification pass is not a reading pass.** Where a finding's disposition
rests on a claim of completeness — "the only", "all", "no other" — that claim is
the thing to test, because completeness claims are where this ledger has already
been shown to fail three times: once in a ruling, once in **S-01**, and twice in
[Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md),
which also found a finding naming a fault source that could not actually
propagate. Test the mechanism as well as the count.

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` —
with a written reason required for `first` and `last` only, and ties carry no
meaning.

## Resolution comment

All seven settled. **Five hold at `fixed`, two flip to `accepted`, and only one of
the seven — W-03 — survived with every claim intact.** No finding is `deferred`,
no finding is pulled ahead, and no severity moved. Ledger now **25 of 46**.

Everything below is recorded on the findings themselves in
`docs/audit/pre-p17-codebase-findings.md`; this comment is the reasoning that
crosses them.

### The deferral question, asked once for all seven

**Nothing defers.** Asked before working any finding individually, per the previous
pass's method note, and it was worth asking early here because this ticket was the
one where `deferred` was supposed to bite hardest.

It did not bite at all, and the reason is stronger than "P16B re-runs this code".
For **X-01**, P16B is *bound by* the contract the finding is about: its own
acceptance evidence says "existing Reviews created under the immutable-Current
model remain readable facts", so P16B is precisely the package that must not break
stored digests. A finding cannot be deferred to a package that is forbidden from
touching it. For **X-02**, P16B adds projection scopes and deletes the compensating
poll but keeps the subscription plumbing, so it loads that code rather than
replacing it. **W-03**, **W-04**, **W-05** sit on the worker port and startup, which
P16B does not touch — though it does raise the commit rate that W-03 is about.
**W-06** and **W-15** are untouched by it entirely.

### The two `accepted` rulings, and why they are not concessions

These are the ledger's first two `accepted` dispositions. **Both came from
disproving a hazard, not from declining to fix one** — which is the distinction the
map's evidence rule is for.

**W-05 — the leak does not exist, measured.** The finding says `onError` "can fire
for a thread that is still alive, and that thread is then unreferenced and never
joined". Probed three ways to raise `'error'`: an uncaught top-level throw, an
uncaught throw from a timer, and an unhandled rejection — the last two with the
worker deliberately held alive by a live `setInterval`. **`'exit'` followed
`'error'` in every case within 0.25–0.49 ms.** Node terminates a worker on an
uncaught exception; `'error'` is emitted *because* the thread is dying. `cleanup()`
does remove the `'exit'` listener, so the exit goes unobserved — but unobserved is
not un-happened, and that gap was the whole claimed cost. The three-line
consolidation is still available and still harmless; with the leak gone, only
symmetry argues for it, and the map sends taste-only improvements to `accepted`.

**W-04 — the repair is impossible as written.** "The signal already exists; it is
simply wired only to tests" is false. `migrationCheckpoint` is a test
**failpoint-and-pause** primitive: it throws when `data.failpoint` matches, and it
sends `migration-checkpoint` **only** when `data.pauseAtMigrationCheckpoint` matches
that exact checkpoint — then parks the worker forever on `Atomics.wait` over a
`SharedArrayBuffer` nobody notifies. Exposing what the worker "already sends" would
wire production to a message that is never sent; ungating it would hang startup on
every migration. Two further facts narrow it: both slow paths the finding names live
inside `migrateGeneration`, so an **ordinary start is not the slow case** (it runs
`PRAGMA quick_check`, not `integrity_check`), and no released build has ever written
a format-1 store. The general problem — slow being indistinguishable from stuck — is
**W-03**'s, is `fixed`, and ranks `first` partly for this reason.

### X-02's open question answered against the escalation

The ticket asked whether the delivered view carries its own freshness claim, with
the escalation to high turning on it. **It does — and that is exactly why it does
not escalate.**

`ReviewProjectionHeader.snapshotStatus` is `'current' | 'stale' | 'unverified'`,
verbatim `CONTEXT.md`'s Truth-Critical Distinction, and it is rendered in three
places. But **the subscription is not what maintains it.** The independent 750 ms
poll recorded as **A-06** calls `Projection.read` directly and consumes *only*
`header.snapshotStatus`, so a frozen subscription does not by itself leave the
header asserting a stale `current` — and the poll keeps retrying, recovering the
moment the store does.

And that poll **already discards its own read failures deliberately, with the
reasoning written into the code**: "Automatic liveness must not turn a transient
verification read into a false stale/unverified condition." The silence this finding
names is therefore not a lone oversight, and an undifferentiated error channel would
surface precisely what the Application has already decided to suppress. What
survives is narrower and genuinely uncovered: the `catch` also swallows
`ProjectionRecordsInvalid`, the projection's own record-corruption detector, and
"transient verification read" does not describe a corrupt record. Severity stays
**medium**; the repair narrows to that.

**This produced the pass's one genuinely new fact: A-06 and X-02 are the same seam
from two sides, and neither says so.** A-06 is deferred to P16B *because* Live
Changes deletes that poll. Deleting it makes X-02's subscription the **only**
channel maintaining the freshness claim, at the exact moment A-06 resolves. Recorded
on both.

### X-01 repeated W-10's shape, and its count was short by one

The previous pass's rule — **two repairs joined by "or" is a claim, and claims
fail** — carried in and paid immediately. X-01 offers a canonical serializer *or* a
golden test. They are not alternatives: the serializer rewrites every stored digest,
making it a durable-format migration dressed as a cleanup, and it collides with
P16B's "existing Reviews remain readable" criterion. **Withdrawn.**

Worse, the withdrawn option would have been applied to the wrong set. X-01 names two
sites; there are **three**, and the missing one is the **producer** —
`workspaceEvidence.ts:1590`, in a different module from both named sites. Applying a
canonical serializer to the two named lines alone would have left the producer
emitting plain `JSON.stringify` and **manufactured exactly the `HarnessStateProblem`
corruption the finding warns about.** Its mechanism claim is also half wrong: site 1
is protected by `normalizeManifest` as described, but site 2's read path
(`parseReviewManifestWindow`) is a validating pass-through cast with no rebuild at
all, so its canonicality comes from persisted bytes, not from a normalizer. The
contract spans three modules.

Measured rather than argued: reordering the literal moves the digest from
`035112085a2081f4…` to `1f81adddfb8c7fe4…` on identical data; `JSON.parse` →
`JSON.stringify` and `structuredClone` both preserve key order; and the one shape
that would break the round trip — integer-like keys — occurs nowhere in this
manifest. All three completeness claims (no canonical serializer, no comment, no
golden test) hold.

**Honouring X-03's constraint:** X-01 did not widen to reach the three durable
comparison sites. Because the serializer is withdrawn, they do **not** become
redundant — **X-03's `normalizeCommand` repair is load-bearing and stands alone**,
which is the opposite of the contingency X-03 anticipated.

### W-06's target strength, decided and priced

**Target is the worker's pattern: `fsync` the file, rename, `fsync` the directory.**
`writeRegistry` levels up to it. Levelling down stopped being a candidate once the
cost was measured instead of assumed.

Benchmarked 200 writes per strength on two volumes: no sync 0.372 ms/write, file
sync 4.866 ms, file + directory sync 9.758 ms. **The directory `fsync` costs
~4.9 ms.** For `writeRegistry` that is nil in practice — one caller, inside identity
bootstrap, guarded by `if (updatedRegistry !== registry)`, so **at most once per
process start and not at all on an unchanged repeat start**. There is no cost
argument against it. `userConfiguration` stays unsynced on a measured 13–26× ratio
for data `CONTEXT.md` defines as carrying no workflow state, credentials, or
history — and one correction that strengthens the same conclusion: it is **not**
"every pane resize", since saves are debounced 100 ms and serialised through a
promise chain.

The secondary nit is split out as separately `fixed`: the post-rename `fs.access`
makes the Application tell the user "Layout was not saved" about a save that
succeeded. That is a false statement to the user, independent of the fsync question,
and two lines.

### W-15's count is one short, in the ledger's recurring shape

**Fourteen dead re-exports, not thirteen. `StateMigrationCheckpoint` is the
fourteenth**, so the trim is to **eleven**, not twelve. Nothing imports it from
`authoritativeState.js`; it appears in that file only as its **own** `import type`
from the protocol — which is what its three uses are bound to — and as the
re-export. The file's local import made the re-export look consumed. That is the
error class this ledger keeps naming: **a necessary condition read as a sufficient
one**, applied correctly to twenty-four names and slipped on the twenty-fifth.

Also worth the repair's framing: **seven of the eleven survivors are consumed only
by tests**, which import the module path directly and could import the protocol
instead. Only four have a production consumer, so the block advertises a contract
**six times** its production size rather than twice. Both innocence checks hold, and
the protocol arithmetic (33 exports, 25 forwarded, 8 omitted) is exact.

### Ledger bookkeeping corrected in passing

The Summary's pull-forward roster still read **three** findings after **W-10** was
added on 2026-08-07, and that paragraph is the one place P16B's pull-forwards are
collected. Corrected to four, with W-10 listed and the roster marked as the thing to
keep current. The three non-pull-forward P16B obligations — X-01's, X-02's and
L-04's — are now recorded alongside it, since constraints on what P16B may do had no
home before.

### Method notes for the passes behind this one

- **Check a neighbouring finding before ruling on severity.** X-02 was one edit away
  from being escalated to `high` on a correct reading of its own evidence. Reading
  **A-06** — a finding in a different package, filed by a different sweep —
  reversed it, because A-06 owns the channel that actually maintains X-02's subject.
  **A finding's severity can depend on code no line of it cites.**
- **When a finding says a mechanism exists, open the mechanism.** W-04's whole
  repair rested on `migration-checkpoint` being a progress signal. It is a pause
  handshake that parks the thread. Reading the emitter took one grep.
- **A worker-thread lifecycle claim is cheap to run and expensive to reason about.**
  W-05's probe took minutes and overturned a `fixed`. Node's `'error'`/`'exit'`
  ordering is not something to infer.
- **Price the thing before accepting the cost argument.** W-06's `accepted` half was
  proposed on an unpriced fsync. The price turned out to support the ruling — but the
  *registry* half turned out to cost nothing at all, which the finding had also not
  established.
- **Two `accepted` rulings in one pass is not a soft pass.** Both required more work
  than ratifying `fixed` would have, and both moved the ledger closer to true.
