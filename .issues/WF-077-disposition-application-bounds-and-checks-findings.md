---
id: WF-077
title: "Disposition the Application bounds and checks findings"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-08
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Settle the disposition and the within-package rank of the **4** Application
findings about bounds the Application does not enforce and checks it does not make.

**A-01**, **A-06**, **A-04**, and **S-04**.

One of three tickets from the split of
[Disposition the Application findings](./WF-067-disposition-application-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its resolution
comment. **Rank within the Application band, not within this ticket.**

Proposals differ: **A-01** `fixed`, **S-04** `accepted`, **A-04** `fixed` but already
named as a P16C fix by the execution plan, and **A-06** is **the ledger's only
`deferred`**. The decision on each is whether that survives the map's evidence rule —
a finding supported only by taste is `accepted`, not `fixed`.

## Established facts

- **This is the largest of the three tickets and it is the residue, not a cluster.**
  Its four findings are genuinely independent of one another; they are together
  because none couples to anything in the other two tickets, and four is inside the
  measured one-session size. **Do not manufacture a shared ruling.** The two halves
  are real, though: A-01 and A-06 are bounds nothing enforces, A-04 and S-04 are
  checks weaker than the ones their siblings make.
- **Three of the four say the same sentence about themselves, and it is worth
  testing rather than admiring.** A-01: the view clamps into a local variable and
  never writes back, so the model's number drifts. A-04: "looser than every other
  bound". S-04: every other durable root re-asserts its permissions and "this one is
  the exception to it". Each is a **completeness claim about its siblings**, which is
  the class this ledger has most often found wrong. Enumerate the siblings.
- **A-06 is the biggest decision in the package and carries the most inherited
  context.** It is proposed `deferred` to the **Implement the accepted Live Changes**
  package. WF-067's question stands: decide whether the deferral holds, or whether an
  unbounded process loop shipping in the interim is itself the problem. The finding
  notes a P16B detail that does not change its disposition — **read it before
  agreeing**.
- **A-06 changes the exposure of two already-settled findings, which is an argument
  the deferral must answer.** **W-07** — the ledger's **only high** finding — and
  **W-09** both describe this exact `runGit` path. W-07's likelihood was assessed
  against user-initiated reads; this loop re-enters the same path unattended, **80
  times a minute**, for as long as a Review is on screen. Both are settled `fixed` in
  the Workspace band and neither was ranked with this loop in view.
- **A-06's seam with X-02 is already recorded on both findings.** A-06 is deferred to
  P16B *because* Live Changes deletes the 750 ms poll, which makes X-02's
  subscription the only remaining freshness channel at the exact moment A-06
  resolves. X-02 is settled; that coupling is a constraint on P16B, already in the
  ledger's obligations block, and this ticket should not re-derive it.
- **A-06 also corrects one of this ledger's own rulings** — that no polling exists in
  `apps/neoflow/src`. The wrong entry is kept and marked in **Ruled out**.
- **A-04's repair is already named as a P16C fix by the execution plan itself.**
  WF-067's question stands: decide whether that naming binds this ticket or whether
  it is re-openable. It is one of the two findings that together are the whole of the
  supported-Node-range problem — **W-14** is why the ceiling exists, A-04 is what the
  shipped launcher does about it — and the range itself was settled by
  [Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md),
  which is **not** reopened here.
- **W-14's ceiling question was severed and left open for P16C**, deliberately, by
  [Disposition the Workspace evidence and git findings](./WF-071-disposition-workspace-evidence-and-git-findings.md).
  If A-04's ruling depends on it, say so rather than answering it here.
- **S-04's exposure is bounded and the finding says so.** The config file is written
  `mode: 0o600` with `flag: 'wx'` and `rename` preserves the mode, so contents stay
  private even under a loose directory; what leaks is the file's existence and name,
  and the contents are theme and layout preferences. Its proposal is conditional —
  "accepted, **unless the disposition decision prefers consistency for its own
  sake**" — and this map's evidence rule already answers that conditional. Say which
  way and why.
- **A-01 and the "unbounded scroll" lead turned out to be one defect**, not two. Do
  not look for a second. Its user-visible half is the behaviour `HANDOFF.md` records
  as human-accepted at Gate A.

## Method

**A ratification pass is not a reading pass.** A-06 is the one finding on this map
whose disposition depends on a *package that does not exist yet*, so the deferral is
a claim about the future and cannot be checked by reading code. Check the two things
that can be: that the loop is as described, and that the Live Changes design really
replaces it wholesale rather than merely changing its cadence.

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` — with a
written reason required for `first` and `last` only, and ties carry no meaning. An
`accepted` finding records `Rank: n/a` rather than a band. **A `deferred` finding
names its owning package explicitly**, per the ledger's disposition scale.

## Resolution comment

**Four findings settled: `fixed`, `fixed`, `accepted`, `deferred`. None pulled
ahead, no severity changed, and no new finding filed — the count stays at 46, now
37 settled and 9 proposed.** This closes the Application band, the last of the
three tickets the Application split produced.

The rulings and all of their evidence are on the findings themselves in
`docs/audit/pre-p17-codebase-findings.md`; this comment records what the pass
decided and why, not what it found.

### A-01 — `fixed`, on a re-scoped repair

The defect is real and is not taste: during drift **one screen states the same
position two different ways**, because the card's own `bottomTitle` prints
`Detail rows N-M/total` from the clamped offset while the footer prints
`discussion N` from the raw one. Three corrections were needed first.

- **The enumeration is wrong.** There are **two** raising mutations, not one —
  `reviewingModel.ts:1056` (keyboard) and `:1180` (pointer). The conclusion "no
  upper bound anywhere in the model" survives, but a repair clamping only the
  keyboard path would have left the second open.
- **The pointer path is bounded at its producer.** `reviewingView.ts:813`
  dispatches `Math.min(maximumOffset, offset + 8)`, so a mouse click cannot drift
  and in fact repairs an already-drifted value. Only the keyboard drifts — and on
  a short discussion (`maximumOffset === 0`) the paging row is not rendered at
  all, so the pointer escape hatch is absent in exactly the configuration the
  finding describes.
- **The proposed repair names a quantity the model does not hold.** The bound
  derives from `wrappedRows` at the view's `contentWidth` and from card layout
  constants (`availableHeight = state.height - 11`, `embeddedHeight`, `cardHeight`).
  The model has `width`/`height` and nothing else of that chain. "Clamp in the
  model" therefore means copying the view's wrapping and layout arithmetic into
  the model — reproducing **W-13**'s defect class to delete a `Math.min`. The
  repair is re-scoped to bounding the keyboard mutation and stopping the footer
  reporting a number the card has already corrected.

**Gate A did not accept this.** The finding reads `HANDOFF.md` as recording the
drift as human-accepted. What `HANDOFF.md:31` records is that acceptance covered
"long Question-card paging" — that paging *works*, not that a counter may run past
the end. Nothing records that the drift was seen.

**The regression test is one assertion added to an existing test.**
`reviewingApplication.test.ts:1269`–`:1286` already drives this surface through
both paths and asserts only the clamped indicator; at `:1282`–`:1286` it presses
`PageDown` twice more and then asserts a bare `toContain('Detail rows ')`. It walks
straight through the overshoot and checks the one indicator that hides it.

### A-04 — `fixed`, with half the repair removed from its scope

**The execution plan's naming binds, and this ticket asked whether it does.** The
**P54 amendment of 2026-08-06** states the launcher gate "is repaired earlier, at
**P16C**, as ledger finding **A-04**; this package owns only the manifest wording
the warning quotes." So it is not re-openable as a question of whether to fix — a
later package's acceptance evidence depends on it — and the same sentence removes
"single-source the bounds" from A-04, because the support manifest is P54's.

**There are four statements of the range, not three, and the fourth is the
loosest.** `support/manifest.json:10` declares `>=22.19.0` and is **pinned by an
assertion** at `scripts/smoke-build-v1.mjs:132`. It is not a gate — the manifest
carries `status: "unreleased-source-island"` and an empty `supportedNodeRanges` —
so the finding's conclusion survives, but any single-sourcing edit meets it, and
that empty field is the natural home for the single source P54 will populate.

**The finding's strongest support is one it does not cite.** WF-056 probed directly
that pnpm "does not fail the install on the root project's own `engines`, and it
does not fail even with `engine-strict=true`". `engines.node` is advisory as a
measured fact, which is what leaves `developerExecutable.ts:23` the only
enforcement of any kind a consumer meets.

**The ceiling question is not answered here** — it stays with **W-14**, severed for
P16C by WF-071. The repair is deliberately shaped not to wait on it.

### S-04 — `accepted`

The proposal's conditional — "unless the disposition decision prefers consistency
for its own sake" — is answered by this map's own rule: consistency for its own
sake is taste, and taste is `accepted`. Nothing else supports a repair; the
exposure is the existence and name of a file of theme preferences, written `0o600`
through a mode-preserving `rename`.

**The sibling claim was enumerated and it holds — on four sites, not three.** The
enumeration was short by two, and correcting it made the finding **stronger**:
`authoritativeStateWorker.ts:871` is a fourth durable root that re-asserts, twice,
and the sixth site (`workspaceIdentity.ts:719`) is a lock directory whose
deliberately non-recursive `mkdir` obtains the same property by a different route.

### A-06 — `deferred` to **P16B**, with its interim mitigation withdrawn

**The deferral holds. The premise attached to it is false.** The note defers
"because the owning package is at P19/P22 and this ships before it". The owning
package is **P16B — Implement the accepted Live Changes design**, whose dependency
is the already-complete P16A, and on which **P16C itself depends**. The order is
P16A → P16B → P16C, so the loop is deleted *before* every other repair on this
ledger. There is no interim.

**The correcting fact was already in the ledger.** **L-03**'s pull-forward bullet
has said since 2026-08-07 that "P16C depends on P16B, so P16B lands first", and all
four pull-forwards are stated `before P16B`. A finding contradicted its own
document's roster. **This is the tenth axis: the schedule a disposition rests on
must be read, not remembered.**

Two independent reasons back the withdrawal, either sufficient alone:

- **The loop has no test coverage of any kind.** Neither
  `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS` nor `#verifyVisibleCurrentSource`
  appears anywhere under `apps/neoflow/test/`. Changing the cadence would be an
  unverifiable change to untested code, altering user-visible freshness latency.
- **The crash path it protects is already scheduled ahead of it.** **W-07** and
  **W-09** are both `fixed` and both ranked `Workspace / first`. Whichever way the
  packages interleave, the unattended re-entry ends at the next package.

**The exposure argument is recorded as answered, not dismissed.** Neither W-07's nor
W-09's rank reasoning cites this loop, so A-06's contribution is genuinely new
information — it changes neither rank because both are already as early as the
scale allows.

**The mechanism was re-verified, not trusted**, and is exactly as described: the
`finally` re-arm, the single `snapshotStatus` consumer, and three sequential `git`
spawns in `inspect`. Two accuracy corrections that change nothing: the timer is
`unref`ed, so "forever" does not mean it holds the process open; and the empty
`catch` is **capability-shaped**, not an accident — `CONTEXT.md:296`–`:297` defines
Snapshot Status and lists `_Avoid_: Git error means stale, assumed current`.
Recorded so it is not re-filed later.

**The "intent recorded nowhere" claim survives a stricter test than it was made
against.** The finding checked `docs/` and `CONTEXT.md`; extending to the capability
rule's third source — WF-051's outcomes and **amendments** — also finds no cadence
statement.

### What was decided without asking

- **Taking the recommended ticket** over the tracker's filename-order pick.
- **Withdrawing A-06's interim mitigation** rather than treating it as a separate
  decision for P16B. Its premise is false, so there is nothing to weigh.
- **Ranking A-06 `n/a`** rather than inventing an Application band for a finding
  that leaves the band with its code. Precedent: `accepted` findings record `n/a`.
- **Not filing a 47th finding** for the untested liveness loop. It is deferred code;
  the fact is recorded as a P16B obligation instead. Precedent: S-01, L-04, X-06.
- **Narrowing A-04's scope** on the strength of a plan amendment rather than
  proposing the full single-sourcing the finding asked for.

### Method note

Three of the four findings say the same sentence about themselves — "every other X
does this, and I am the exception". All three were tested by enumeration rather than
read. Two were wrong about the count and one was wrong in the generous direction;
**none** was wrong about its conclusion. A completeness claim and the conclusion it
supports fail independently.

### Verification

`pnpm v1:test:full` on Node 26.5.1: **17 files, 85 tests, 13.71 s**, all passing.
`git status --short` confirms two Markdown files changed and no source. A
stray-control-byte sweep over the ledger is clean. Counts reconcile: 46 findings,
**37 settled + 9 proposed**; severity unchanged at 1 high, 16 medium, 27 low, plus
**LG-01** and **S-06** which record a fact.
