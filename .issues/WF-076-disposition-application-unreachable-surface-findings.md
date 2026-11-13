---
id: WF-076
title: "Disposition the Application unreachable-surface and test-double findings"
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

Settle the disposition and the within-package rank of the **3** Application
findings about surfaces that exist but are never reached, and about the test
infrastructure that decides what "reached" means.

**A-05**, **X-08**, and **A-03**.

One of three tickets from the split of
[Disposition the Application findings](./WF-067-disposition-application-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its resolution
comment. **Rank within the Application band, not within this ticket.**

Proposals differ: **A-05** `fixed`, **A-03** `accepted`, **X-08** `accepted` for the
code and `fixed` for the coverage. The decision on each is whether that survives the
map's evidence rule — a finding supported only by taste is `accepted`, not `fixed`.

## Established facts

- **A-05 and X-08 must be decided together because they answer the same question in
  opposite directions.** Both are published surfaces with no producer. **A-05** is
  proposed for deletion; **X-08** is proposed for coverage and explicitly not
  deletion, "because deleting them would destroy intended work". The distinction
  X-08 draws is `capability-shaped, not accident-shaped`. **That distinction is the
  ticket's real subject** — it is the rule this map hands to P16C, and neither
  finding states it as a rule.
- **X-08 already carries a split disposition**, which the ledger now has a precedent
  for (**W-06**, **X-06**). Its `fixed` half is a coverage obligation, and the open
  question is whether that obligation belongs to this map at all.
- **Read X-09's resolution before ranking X-08.** X-09 is settled, ranked
  `Workspace / first`, and **pulled ahead of P16B**. If the missing Review endings
  are already scheduled, X-08's coverage argument may already be partly discharged —
  this is the question WF-067 raised and did not answer.
- **A-05's deletion is one act across two packages.** Its Workspace end lies outside
  its 100-line count and was noted on
  [Disposition the Workspace reviewing and diff findings](./WF-073-disposition-workspace-reviewing-and-diff-findings.md),
  which is **closed and settled**. Decide the deletion as one act; the Workspace band
  has no open ticket left to absorb a constraint, so record any on the finding and in
  the ledger's obligations block.
- **A-05 reverses an earlier audit ruling, and the reversal's method is what
  produced X-08.** Count reachability from *producers*, across every module that
  constructs one. The wrong ruling is deliberately kept in the ledger and marked.
- **A-03's stated blocker was measured on 2026-08-08 and does not exist.** Its
  proposal reads "accepted across package boundaries **unless the firewall permits a
  shared test package**". The real `scripts/check-v1-dependencies.mjs` was run
  against a synthesized tree: a fifth package under `packages/` is invisible to it by
  bare specifier and by relative path alike, while a planted control violation from
  the same directory is caught. **The firewall permits it.** The measurement is
  recorded on A-03 as a fact, not a ruling. **Do not ratify that clause as written** —
  an `accepted` here now needs a cost argument rather than a prohibition.
- **X-06 supplies the cost argument and already declined the same consolidation.**
  Settled 2026-08-08: permitted, but paid for with an unpoliced dependency edge on
  `packages/workspace`, the one package the firewall declares to depend on nothing.
  A-03 may adopt, narrow, or reject that reasoning — but it is now the live argument,
  and A-03's within-`apps/neoflow` half was never firewall-constrained at all.
- **A-03's cross-reference to "the four duplicated `waitFor` helpers in X-06" is
  correct** and was confirmed on 2026-08-08 against the source. X-06's heading said
  three until it was fixed; the body always said four.
- **Shared-fixture coupling was never systematically assessed.** X-06 and A-03 stand
  as written and were not re-derived by the dead-code and test-quality sweep. If
  A-03's `accepted` proposal is overturned here, that gap is the reason to look again
  rather than a reason to trust it.

## Method

**A ratification pass is not a reading pass.** A-03's count of nine scripted doubles
across five suites is a completeness claim of exactly the class this ledger has
repeatedly found wrong, and X-06's neighbouring count was carried at three different
values in four documents before it was checked. **Count the doubles before ruling on
them.** X-08's "nothing constructs it" is the same class and is the whole of its
argument.

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` — with a
written reason required for `first` and `last` only, and ties carry no meaning. An
`accepted` finding records `Rank: n/a` rather than a band; a **split** disposition
still takes a band, because its `fixed` half contributes work to the package.

## Resolution comment

**All three settled. Both proposals survive and one finding splits — and the pass's
real output is that the distinction the ticket named is now a rule with a test,
instead of an adjective two findings used in opposite directions.**

Ledger now **33 of 46** settled, 13 carrying proposals. The Application band has 4
findings left, all in
[Disposition the Application bounds and checks findings](./WF-077-disposition-application-bounds-and-checks-findings.md).
No code changed; `git status --short` shows only this ticket, the ledger, and the
map.

### The rule, which is the thing to carry forward

The ticket said the `capability-shaped, not accident-shaped` distinction "is the
rule this map hands to P16C and neither finding states it as a rule". It is now
stated, on **X-08**, and it is decidable by grep rather than by taste:

> A producerless published surface is **capability-shaped** when a source of intent
> outside the code — `CONTEXT.md`, `docs/blueprint/`, or a scheduled package of the
> execution plan — names the behaviour and the implementation matches it. It is
> **accident-shaped** when no such source names it and the surrounding code refuses
> it.

Applied to the two findings that disagreed:

| | source of intent | surrounding code | verdict |
| --- | --- | --- | --- |
| **X-08** interruption | `CONTEXT.md:499`–`:501` **Interruption Route**; `docs/blueprint/harness-capability-seam.md:54`, `:112`–`:120` | honours it end to end | capability — keep, cover |
| **X-08** review handoff | `CONTEXT.md:115` **Handoff Disclosure Preview** | honours it | capability — keep, cover |
| **A-05** Application half | none: no term, no seam entry, no slice step | refuses it **three** ways | accident — delete |
| **A-05** Workspace half | `CONTEXT.md:327` **Annotation Draft**; slice step 3 | honours it | capability — keep |

The implementation-matches half of the test is not decoration. `#requestInterruption`
writes `implication: 'intent-only'` and `route: 'direct-request'` and never touches
`invocation.status` — which is `CONTEXT.md:500` implemented literally. A surface
that a document names but whose implementation contradicts it would fail the rule.

### A-05 — split, overturning both the proposal and this ticket's instruction

This ticket said "A-05's deletion is one act across two packages. Decide the
deletion as one act." **The evidence says the two ends have opposite shapes**, so it
is two acts: `fixed` for the Application half, `accepted` for the Workspace half.

- **The Application count is exact.** 9 + 5 + 5 + 48 + 33 = 100, every boundary
  re-read; `load-question-editor` still returns exactly two code sites.
- **The Workspace end, which the 2026-08-07 amendment added and never counted, is
  106 lines** — `#reviseDraft` alone is 55 (`reviewing.ts:2390`–`:2444`), plus 9 + 7
  + 1 + 29 + 2 declarations, validation and dispatch, plus one line each in
  `projection.ts`, `index.ts` and `workspace.ts`. **The deletion as proposed is 206
  lines across two packages, not 100**, and three of them are on the Workspace's
  published Interface.
- **Deleting the Workspace half would be X-08's error in reverse.**
  `review.question-draft.revise` is the durable expression of **Annotation Draft**
  (`CONTEXT.md:327`: "Mutable, local feedback… **It remains editable until the user
  deliberately commits it**"), and its sibling `review.question-draft.create` is
  **step 3** of the chosen dogfood slice *and* one of the five surfaces X-08 keeps.
  Deleting revise while create stays leaves a draft that can be created and never
  edited — destroying intended work, which is exactly what X-08 refuses to do.
- **Two facts strengthen the Application half.** The save path is refused **three**
  ways, not two: past the two kind guards, `submitEditor` hardcodes
  `const actionKind: ReviewProjectedActionKind = 'review.question.ask'`
  (`reviewingModel.ts:2368`), so removing both guards builds an *ask* command from a
  revise editor. There is no wrong-but-present save path; there is none at all. And
  the projection never advertises a revise action — `review.question-draft.revise`
  reaches `projection.ts` only as a union member (`:206`) and is passed to
  `projectedAction` nowhere.
- **Obligation:** the accepted half inherits X-08's coverage argument. `#reviseDraft`
  is 55 lines of untested, producerless state mutation — X-08's shape exactly — and
  **X-09** routed "the revise pair" here rather than to X-08.
- **Rank:** Application / normal.

### X-08 — ratified, with one evidence claim overturned and the coverage narrowed

Every structural claim holds under a per-literal grep: the five producerless values,
`#requestInterruption` at **87 lines to the line**, the fallthrough at `:1266`–`:1272`,
the `index.ts:42` export. **What fails is "none exercises it."**
`packages/pi-adapter/test/contracts/piAdapter.test.ts:404`–`:411` **performs a
`harness.direct-invocation.interrupt` directive and asserts the host aborted** — the
exact directive `#requestInterruption` dispatches after commit. Six of the seven
interruption references are capability declarations; the seventh is a live exercise
of the feature's far end.

That makes the finding **more precise and its repair cheaper**, not weaker. The
uncovered span is the produce–validate–commit–dispatch middle, all inside the
Workspace. And that same test forges an `interruptionIntentIdentity` and casts it
`as never` (`:407`) **because nothing but `#requestInterruption` can mint one** — so
the cast is a symptom of this gap, and covering the handler retires it. The
coverage disposition now names what to assert: the intent record, the new state
version, the **unchanged** `invocation.status`, and the directive handed to the
adapter.

**Rank: Workspace / normal, overriding this ticket's "rank within the Application
band".** The precedent is **X-09**, the finding this ticket required be read first,
which also names both Modules and was "filed under the Workspace because that is
where the handlers and the fixtures live". Every line of X-08's `fixed` half is
Workspace — the 87 lines, the five declarations, and
`packages/workspace/test/scenarios/harnessInteraction.test.ts`, which already holds
the review-handoff commands and a `ScriptedAdapter`. `normal` rather than `first`:
nothing constructs any of the five, so no later package is made dearer by waiting.

**The ticket's open question is answered: X-09 discharges none of X-08.** X-09's fix
covers `review.complete`, `review.cancel` and `review.question.disposition.set`; its
own evidence routes the interruption pair to X-08 and the revise pair to A-05.
Nothing overlaps.

### A-03 — accepted both halves, and the count was produced by a name pattern

**Nine is 13.** Every class declared in the four active test roots, across the same
five suites: `reviewingApplication.test.ts:63`, `:238`, `:317`, `:385`;
`harnessAdapterRuntime.test.ts:93`, `:117`; `localRuntime.test.ts:49`, `:129`;
`piAdapter.test.ts:26`, `:48`, `:89`; `harnessInteraction.test.ts:125`, `:353`.
Twelve are doubles of a production Interface; `RawPeer` is an inline socket harness.
**The nine are exactly those whose names begin `Scripted` or `Timed`.** The finding's
own wording is "scripted/timed/**fake**" — and no class in the repository is named
`Fake*`, so that arm of the enumeration returned nothing while four fakes existed
(`StressWorkspace`, `AppliedEvidenceSink`, `FaultingState`, `RawPeer`). The
`apps/neoflow` half is **four** doubles, not three, and the uncounted one is the
**largest inline double in the repository**: `StressWorkspace` at 264 lines against
`TimedWorkspace`'s 31.

**But the decisive measurement is that there is nothing here to consolidate.** The
category is duplication; the evidence only ever established that doubles are defined
*inline*, never that any two are similar — and both comparisons that look like
duplication fail:

- The four `apps/neoflow` doubles are four distinct mechanisms: a terminal stub, a
  scripted adapter, a **delegating spy** over a real `Workspace` (`TimedWorkspace`
  forwards `execute`/`read`/`subscribe` to a delegate while recording timings and
  in-flight reads), and a **standalone canned fake** with no delegate
  (`StressWorkspace`). Co-location was counted, not duplication.
- The two classes sharing a name across packages share only that name and their
  Interface: `ScriptedAdapter` is **23** lines in `packages/local-runtime` and **54**
  in `packages/workspace`, where it gains an options constructor, an `observations`
  log and an `onPerform` hook. A shared version is a **superset**, not an extraction.

So the cross-boundary half is accepted **on cost, not on the prohibition it was
written around** — the firewall permits a shared test package, that clause is
withdrawn, **X-06**'s cost argument stands, and the superset problem is a second
cost the firewall question had hidden. The within-`apps/neoflow` half is declined on
the ledger's own evidence rule: nothing measurable is duplicated, so `fixed` would
rest on taste. Also measured: **the `driver.ts` precedent A-03 invokes has a 1-of-7
adoption rate** — 69 lines, imported by one of the seven `packages/workspace`
scenario suites. The one genuinely duplicated thing in this area remains **X-06**'s
four `waitFor` helpers, two byte-identical, already owned and already split.
**Rank: n/a.**

### The lead that did not survive, recorded because it nearly became a 47th finding

Tracing A-05's producers turned up what looked like a serious defect: the Review's
terminal operations are unreachable in the shipped Application, by **two independent
gates**. `commandForAction` (`reviewingModel.ts:2264`) has one caller,
`executeProjectedAction` (`:2252`), which has two callers — `:1777` and `:1821` —
**both passing the literal `'review.current-changes.start'`**, so the
`review.complete`, `review.cancel`, `review.question.disposition.*` and
`review.question-batch.commit` arms are never entered. Independently, the
projection's `reviewActions` and `questionActions` (`projection.ts:1054`, `:1062`)
are **stubs returning `[]`** with every parameter unused, so `manifest.actions` and
every question item's `actions` are always empty. Only the diff view's `actions` are
populated — which is why Ask works and why every test asserting on `.actions` reads
that one surface and stays green.

**It is not a defect. P16 was *amended* to "natural follow-up without disposition or
Finish ceremony"**, so those stubs are that amendment implemented; `Finish review`
remains step 7 of the chosen slice. Filed nothing; the count stays at 46. What the
lead did produce is real:

- **X-09's premise is false and is corrected in place.** "Both are performed
  routinely by the shipped Application" cannot be true when the arms are
  unreachable. Its disposition, rank and pull-forward are unaffected — the scenarios
  it prescribes drive the Workspace directly — and the finding is arguably
  strengthened. The error is this ledger's recurring one seen one level up: **A-05's
  method says count reachability from producers, and X-09 counted producers without
  asking whether the producers are themselves reachable.**
- **Obligation on P16C:** both stubs are **unmarked** — no comment, no TODO — and
  that silence is what let a false premise into a settled finding. One line each
  naming the amended P16 gate.
- **Method note:** the check that killed this lead was reading the execution plan's
  own package outcome. Three greps against `CONTEXT.md`, `docs/blueprint/` and
  WF-051 are the same three greps the capability rule needs — running them first
  would have cost a minute and saved the detour.

### Method notes for the passes that follow

- **A count produced by a name pattern is not a count of the subject.** A-03's nine
  were `Scripted*`/`Timed*`; its subject was inline doubles, and it named "fake" in
  its own wording while no class carries that name. Before ratifying an enumeration,
  ask what query produced it — the answer is usually recoverable from which items
  are missing.
- **A finding that draws a distinction owes a test for it.** X-08 and A-05 used
  "capability-shaped" and "accident-shaped" as adjectives about surfaces that are
  structurally indistinguishable — both declared, validated, dispatched, backed by a
  complete handler, exported, and constructed by nothing. The discriminator was never
  in the code; it was in `CONTEXT.md`, the blueprint, and the execution plan.
- **"Nothing exercises it" fails independently of "nothing constructs it".** X-08's
  construction claim held exactly and its exercise claim did not, because the feature
  is dispatched *out* of the module and the far end is tested from the other side.
- **A cast to `never` in a test is a producer-side smell.** It usually means the
  test cannot obtain a real value because the only producer is untested — which
  makes it a free pointer at the gap and a free way to check the fix.
- **The eighth and ninth axes.** Add to the seven this ledger already tracks: a
  finding's **count method** (A-03), and whether a finding's **producers are
  themselves reachable** (X-09).
