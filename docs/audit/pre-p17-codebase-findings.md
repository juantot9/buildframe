# Pre-P17 codebase finding ledger

Opened: 2026-08-05
Owner ticket: [Audit architecture and risk across every package](../../.issues/WF-054-audit-architecture-risk-every-package.md)
Execution package: `P16A` of [Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md)

This is the single shared ledger for the pre-P17 codebase deepening gate. The
audit that produces it changes no code. Ranking these findings and settling each
disposition is **not** part of the audit; it is the disposition phase of
[Chart the pre-P17 codebase deepening plan](../../.issues/WF-053-pre-p17-codebase-deepening-plan.md),
which is complete.

## How to read a finding

Each finding names its owning Module, its file and line, its category, its
severity, the exact evidence that establishes it, and one decided disposition.

**Categories:** correctness, durability, concurrency, performance, security,
testing, duplication, maintainability.

**Severity:**

- **high** — can lose or corrupt durable state, mislead the user about a
  truth-critical distinction, or break a documented guarantee.
- **medium** — degrades correctness, resource use, or safety under conditions
  this product will actually meet.
- **low** — real but bounded; costs clarity or effort more than behavior.

**Disposition values:**

- **fixed** — should be repaired during the deepening gate.
- **accepted** — real, and deliberately left as it is, with the reason recorded.
- **deferred** — owned by a package that will rewrite this code anyway, named
  explicitly.
- **deletion-bound** — in code scheduled for removal at the hard legacy cutover;
  not worth repairing.

A finding supported only by taste is **accepted**, never **fixed**.

## How a settled finding is recorded

Decided on 2026-08-07 by
[Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md),
the first pass of the disposition phase, so the five package passes behind it
inherit this format rather than each inventing one. Settling a finding replaces
its `**Proposed disposition:**` line with two or three lines:

```markdown
- **Disposition:** fixed — <what is repaired, and its scope>
- **Rank:** Workspace / first — <why, required for first and last only>
- **Pulled ahead:** before P16B — <why this cannot wait for its own package>
- **Decided:** 2026-08-07 by [<ticket title>](../../.issues/<file>.md)
```

**Rank is a band within the owning package, not a position.** One of `first`,
`normal`, or `last`; `first` and `last` carry a written reason and `normal` does
not. Ties are expected and carry no meaning — the band says "do these before the
package's ordinary work", never "do this one before that one". Bands were chosen
over a strict 1..N order on the ledger's own evidence rule: ordering nineteen
findings against each other takes eighteen judgements, and the evidence supports
perhaps three of them. A rank supported only by taste is the same defect as a
disposition supported only by taste.

**Rank is within a package because the cross-package order is already fixed** by
**P16C** — Workspace, Local Runtime, Pi Adapter, Neoflow Application, then root
scripts, packaging, and configuration.

**`Pulled ahead` is a separate axis from rank, and is the rarer claim.** It
appears only when a *named later package* makes the repair dearer, or is itself
made safer by having it already done; it is absent otherwise. A finding can rank
`first` in its package without being pulled ahead, and that distinction is what
the execution packages act on: a pull-forward has to happen before the named
package starts, while a `first` band is simply the head of that package's own
queue.

**Every finding ends with one of the four dispositions, including the two that
record a fact rather than a defect.** **LG-01** and **S-06** carry severity "not
a defect" and disposition `accepted` — the severity scale is what has no row for
them, not the disposition scale. **P16E**'s requirement that no finding be left
unclassified is therefore satisfiable as written and needs no amendment.

## Coverage

| Area | Status |
| --- | --- |
| Cross-cutting sweeps | done |
| `packages/workspace` | done |
| `packages/local-runtime` | done |
| `packages/pi-adapter` | done |
| `apps/neoflow` | done |
| Root scripts and configuration | done |
| Legacy packages | done |
| Local threat model | done |
| Dependency supply chain | done |
| Dead code and unused exports | done |
| Test quality | done |

## Summary

**47 findings** confirmed, and **26 suspected problems ruled out** with their
reasons recorded in the last section so none is investigated twice. That section
carries **28** entries, not 26: two are **rulings that turned out to be wrong**,
kept and marked as such rather than deleted, so the faulty reasoning is on record.
They are the dead `ReviewingModelEffect` variants lead, confirmed afterwards as
**A-05**, and the "no polling exists" half of the manifest-polling lead, confirmed
afterwards as **A-06**.

By severity: **2 high**, **17 medium**, **26 low**, plus two entries (**LG-01**
and **S-06**) that record a fact rather than a defect. **A-02 moved from medium to
low on 2026-08-08**, the second severity correction on this ledger after W-13's
digest hazard moved down; **W-13's semantic-validation half moved to medium on
2026-08-09** after a malformed durable Snapshot passed its parser. A-02 remains
the first correction made by measuring a trigger rather than re-reading its
argument.

Ten findings arrived **after** the P16A sweep closed and are marked with a
**Provenance** line. The first nine were established while working the codebase
deepening map — five on 2026-08-06, and **L-04**, **X-08**, **X-09** and **W-15**
on 2026-08-07. **LG-03** arrived from P16D's deliberately separate blocker-only
legacy review on 2026-08-27. **W-14** and **A-04** came from
[Decide whether the OpenTUI renderer choice survives public distribution](../../.issues/WF-059-decide-renderer-survives-public-distribution.md),
and together they are the whole of the supported-Node-range problem: **W-14** is
why the ceiling exists, **A-04** is what the shipped launcher does about it.
**A-05** came from
[Decide whether the `reviewingModel` refactor is in scope](../../.issues/WF-058-decide-reviewingmodel-refactor-scope.md).
**A-06** and **S-07** came from
[Re-verify the ledger's ruled-out leads](../../.issues/WF-062-re-verify-ruled-out-leads.md).
**L-04** came from
[Decide the linter and formatter posture](../../.issues/WF-055-decide-linter-formatter-posture.md),
which rejected every tool it measured and still produced one finding by running
one of them once — the strongest evidence that ticket has for its own conclusion
that a linter is worth more here as an occasional probe than as a gate.
**X-08**, **X-09** and **W-15** came from
[Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md),
the second sweep, on the two axes the first one did not cover.
All three of **A-05**, **A-06** and **S-07** correct rulings this ledger itself
made during the sweep. All nine are filed here rather than on their tickets because
the code is live and the repair belongs to **P16C**.

**The dead-code axis came back nearly empty, and that is the result.** A `knip`
probe over 516 exports in 29,076 lines of active source returned exactly one
cluster — **W-15**, thirteen re-exports in a single block — and the producer-side
union sweep found five unconstructed variants, of which four were already known
through **A-05** and **X-08**. There is no dead-code backlog here, so the deepening
gate should not budget for one. **The test-quality axis is where the weight is**:
**X-09** is the only new medium, and it says the suite can start a Review but never
finish one.

**The Ruled out section has been re-verified once, and its error rate is 2 in 28.**
Every entry was re-read on 2026-08-06 against one question — does the stated
evidence establish the stated conclusion — and ten were taken back to the code.
Two conclusions were wrong (**A-05**, **A-06**). Three more were right on reasoning
that did not support them and are re-ruled in place with the gap named: the OSC 52
clipboard write, escape-sequence injection through rendered content (which produced
**S-07**), and the hostile-Pi-response lead, whose conclusion holds only because
nothing imports that package yet. One count was corrected (six wait helpers, not
four). The recurring error is not carelessness about facts — every cited line
number checked out — but **reporting a necessary condition as a sufficient one**:
a consumer-side check for a producer-side property, a token `grep` for a
behaviour, a string in a binary for a call, a module's own sinks for a value's
reach. The 21 entries not listed here were re-read and stand as written.

The single high finding is **W-07** — `runGit` writes to `child.stdin` with no
error listener, so the module's own output-limit path (`SIGKILL` mid-write) can
raise an unhandled `EPIPE` and terminate the process on a large repository. It is
judged **not** to make the pushed Gate B checkpoint unsafe to keep, for the
reasons recorded in the finding; it is a **P16C** fix.

**Five findings are worth doing before the packages that follow**, and all five
are pulled ahead of **P16B**. Three were settled on 2026-08-07 by
[Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md),
which ratified two of the claims below, moved one deadline earlier, and added a
third finding the earlier framing had not counted as sequenced; **W-10 joined them
later the same day, and W-13 on 2026-08-09**. This paragraph is the roster whoever
opens P16B reads, so it is kept current here rather than only in each finding:

- **W-01** — the unbounded `#snapshotEvidenceIdentities` map grows once per
  Snapshot, and **P16B** Live Changes changes that rate from one-per-Review to
  one-per-edit. Ratified as first written.
- **L-03** — the Workspace seam typed as `unknown` behind a double cast means
  command-shape changes will not fail to build. **Its deadline is P16B, not
  P16C**: P16C depends on P16B, so P16B lands first, and P16B adds request and
  command shapes across this same seam.
- **X-09** — no test finishes a Review, and **P16B** is the largest rewrite of
  the Review lifecycle on the roadmap. Tests written afterwards cannot catch its
  regressions.
- **W-10** — `sameDiffLine` copies both lines on every LCS comparison. Added on
  2026-08-07 by
  [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md),
  because P16C depends on P16B and would otherwise ship continuous re-diffing over
  the unfixed path.
- **W-13** — Workspace's durable parsers use whole-object casts after partial
  structural checks; `parseReviewSnapshot` accepts empty `basis`,
  `comparedState`, and `manifest` objects as a trusted Snapshot. P16B changes this
  exact durable shape, so package-local compiler-checked codecs must exist before
  the rewrite rather than describe its result afterwards. Added on 2026-08-09 by
  [Replace repeated isRecord validation with owner-local codecs](../../.issues/WF-078-revisit-active-input-codecs.md).

The execution plan has **no package between P16A and P16B** for this work to sit
in. These five either need one, or they run at the head of P16B before its own
changes begin; whoever opens P16B owns that call. **S-01** was considered for
pull-forward and deliberately excluded — it ranks `first` inside the Workspace
but nothing sequences it.

**P16B additionally inherits three obligations that are not pull-forwards** —
nothing to do before it starts, but constraints on what it may do. **X-01**: do
not adopt a canonical serializer while implementing Live Changes, because that
rewrites every stored digest and contradicts P16B's own acceptance criterion that
existing Reviews remain readable facts. **X-02**: A-06 is deferred to P16B because
Live Changes deletes the 750 ms poll that currently maintains `snapshotStatus`,
which makes X-02's subscription the sole remaining channel at that moment, so its
error handling must be settled in the same change. **L-04**: if P16B bumps
`WORKSPACE_INTERFACE_VERSION`, `harnessAdapter.ts:403`'s hardcoded `1` moves with
it. **A-06**, added 2026-08-08: the Application liveness loop P16B deletes has **no
test coverage at all** — neither `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS` nor
`#verifyVisibleCurrentSource` appears anywhere under `apps/neoflow/test/` — so P16B
replaces the current-source freshness behaviour with no regression net describing
what that behaviour was. It is the reason A-06's proposed interim cadence change was
withdrawn rather than taken, and the same reason applies to P16B's own first cut.

The security sweep added six findings (**S-01**–**S-06**) and no high one. Its
two medium findings are the only places where an *outside* input reaches a
trusted decision: **S-01**, where a repository's own `.git/config` reaches
command execution, and **S-02**, where the dependency cooldown the workspace
appears to configure is not actually switched on.

**S-01 grew when it was dispositioned on 2026-08-07, and the shape of the growth
matters more than the finding.** A second key on the same path — a clean filter
named by the repository's own `.gitattributes` and `.git/config` — executes
during the same `status` call, is not closed by the one-argument fix, and fires
on a freshly extracted checkout with nothing modified. The audit had checked two
neighbouring keys and found them closed, and reported that as the path being
closed; the recurring error the Ruled-out re-verification named — **a necessary
condition reported as a sufficient one** — is the same error, made this time in a
finding rather than in a ruling. The resulting policy question is now settled by
[Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](../../.issues/WF-070-decide-checkout-git-config-trust.md):
checkout-controlled Git configuration is generally untrusted for executable
effects, opening a checkout is not execution consent, and the rule applies before
the first Git call at both Workspace Git seams. P16C needs a class-level
completeness argument; a known-key blocklist remains partial.

**The Local Runtime and Pi Adapter pass met the same error class twice more, and
one of the two ran in a direction the ledger had not seen.** Settled on 2026-08-07
by
[Disposition the Local Runtime and Pi Adapter findings](../../.issues/WF-066-disposition-local-runtime-and-pi-adapter-findings.md).
All four findings hold at `fixed` and none is pulled ahead, but only **L-01** and
**L-02** survived with their evidence intact.

- **P-01 was wrong in both directions at once.** Its count was too low — three
  unguarded async paths in one file are six across two, because the finding never
  followed `extension.ts:130` into the three `async` handlers
  `bindPiReviewedAdapterEvents` registers. Its *mechanism* was too generous — the
  Workspace, named as the thing that rejects, is the one source that **cannot**
  propagate, because `#emit` catches every sink failure and queues instead. Five of
  the six actually reject through uncaught calls into the **Pi host**. A necessary
  condition reported as sufficient, and a sufficient one reported as necessary, in
  the same finding.
- **L-04's completeness claim held and its semantic claim did not.** "All six
  narrowly-typed version fields" is exactly right and was verified by enumeration.
  But the two fields it called semantically wrong — because they "carry the peer's
  supported version, a value whose entire purpose is to differ from ours" — are
  written by our own server with our own constant. The true reason is more general:
  **one interface serves both directions, so a literal type can be true in only one
  of them**, and the parser sits on the side where it is false. A fourth defective
  site (`harnessAdapter.ts:403` hardcodes `1` where its sibling uses the constant)
  turned up that neither the audit nor the dead-code sweep had counted.

Both were folded into their existing findings rather than opened as new ones — same
title, same call sites, same defect class — so the count stays at 46, matching how
**S-01** absorbed its second vector. The reusable form is that **a finding's
completeness and its mechanism fail independently**, and a finding can be right
about what to do while wrong about both why and how much. Ratifying either claim on
the strength of the other is the move this pass was built to avoid.

Two things the format inherits from this pass. **A single-finding package makes the
rank band vacuous** — `first` there would assert an ordering that does not exist, so
**P-01** takes `normal`. And **P-01's repair is the ledger's first structural
obligation**: nothing mechanical catches an unguarded host handler, no test covers
either file, and the correct guard is present at two of eight sites in the same
code, so the fix routes every registration through one guarded wrapper rather than
adding six `try` blocks and a promise to remember.

**The Workspace state and projection pass produced the ledger's first two
`accepted` rulings, and both came from disproving a hazard rather than from
declining to fix one.** Settled on 2026-08-07 by
[Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md).
Seven findings; five hold at `fixed`, **two flip to `accepted`**, and only **W-03**
survived with every claim intact.

- **W-05's mechanism was disproved by running it.** `worker.on('error')` never
  fires for a thread that survives: across an uncaught top-level throw, an uncaught
  throw from a timer, and an unhandled rejection — the last two with the worker
  deliberately held alive by a live `setInterval` — `'exit'` followed `'error'`
  within 0.25–0.49 ms every time. Node emits `'error'` *because* the thread is
  dying. Nothing is left running, so the code that looks like a resource leak
  measurably is not, and only symmetry argued for the change.
- **W-04's repair was overturned while its observation stood.** "The signal already
  exists; it is simply wired only to tests" is false: `migrationCheckpoint` is a
  test **failpoint-and-pause** primitive that sends its message only when a test
  asks it to pause at that exact checkpoint and then parks the worker forever on
  `Atomics.wait`. Exposing it would report nothing; ungating it would hang every
  migration. Both slow paths it names sit inside the one-time legacy migration —
  ordinary startup runs `quick_check`, not `integrity_check` — and no released build
  has ever written a format-1 store.
- **X-02's open question resolved against escalation, which is the opposite of what
  the question anticipated.** The delivered view *does* carry its own freshness
  claim — `snapshotStatus`, rendered in three places — but that claim is maintained
  by the independent 750 ms poll recorded as **A-06**, not by the frozen
  subscription; and that poll **already discards its own read failures deliberately,
  with the reason written into the code**. An undifferentiated error channel would
  contradict a decision the Application has already made and recorded. Severity
  stays medium, and the repair narrows to the part that rationale does not cover:
  `ProjectionRecordsInvalid` being swallowed alongside transient failures. **The
  coupling neither finding states is now recorded on both**: A-06 is deferred to
  P16B *because* Live Changes deletes that poll, which makes X-02's subscription the
  only remaining channel at the exact moment A-06 resolves.
- **X-01 repeated W-10's shape — two repairs joined by "or", not interchangeable.**
  The canonical-serializer option rewrites every stored digest, so it is a durable
  format migration wearing the costume of a cleanup, and it collides with P16B's own
  acceptance criterion that existing Reviews stay readable. **Withdrawn.** Its site
  count is also short by one, and the missing one is the *producer*
  (`workspaceEvidence.ts:1590`), in a different module from both named sites — so
  the withdrawn repair, applied to the two named lines alone, would have
  manufactured exactly the corruption the finding warns about.
- **W-06's target strength is decided and priced**: level `writeRegistry` up to the
  worker's file-plus-directory `fsync`. The directory sync costs ~4.9 ms measured,
  and `writeRegistry` runs at most once per process start and only when the
  registration changes, so the cost is nil. `userConfiguration` stays unsynced on a
  measured 13–26× ratio, and its saves are debounced at 100 ms rather than firing
  per pane resize.
- **W-15's count is one short too** — fourteen dead re-exports, not thirteen, and
  the fourteenth (`StateMigrationCheckpoint`) is the one where the file's own local
  import made the re-export *look* consumed. Its protocol arithmetic (33 exports, 25
  forwarded, 8 omitted) is exact.

Two things this pass adds to the format. **An `accepted` finding records `Rank: n/a`
rather than a band**, because a band orders work inside a package and an accepted
finding contributes none — the same reasoning that made the band vacuous for a
single-finding package. And the pass confirms that **a finding's evidence and its
proposed repair fail independently**, now on four separate findings across two
sessions: verifying every number in a finding says nothing about whether its fix is
the right one, or even a possible one.

**The Workspace test-source pass closed the Workspace band, and both of its findings
were wrong about their own subject while right about their disposition.** Settled on
2026-08-08 by
[Disposition the Workspace test-source findings](../../.issues/WF-074-disposition-workspace-test-source-findings.md).
Two findings; **X-04** holds at `fixed` with its repair tripled, and **X-06**
becomes the ledger's second split disposition.

- **X-04's count was exact and its characterisation was not.** Of the three fixed
  sleeps it names, one is exactly as described, one guards a *different* assertion
  from the one the finding names — the read it points at cannot fail either way,
  because the scripted double's `publish` never moves `#stateVersion` — and **the
  third is not an assertion at all**. `localRuntime.test.ts:504` sleeps 5 ms rather
  than 10, publishes *after* the sleep rather than before it, and then ends the test;
  deleting its last seven lines would not change whether it passes. The test is named
  *'sequences subscription updates and stops them after unsubscribe'* and the half
  its name promises is checked nowhere. Behind it sits the wider gap: that line holds
  the only `workspace.unsubscribe` in any test, and `workspace.unsubscribed` — the
  acknowledgement frame `HANDOFF.md:16` means by "subscriptions acknowledge
  cancellation" — appears in no test at all.
- **X-06 had been carried at three different counts in four places.** The heading
  said three, its own evidence and **A-03**'s cross-reference said four, and the
  Ruled-out entry said three of six. The source says **four** predicate pollers out
  of six `wait*` helpers, two of the four byte-identical; the evidence body was right
  all along and the heading is now corrected. Its `fixed` half narrows to labelling,
  which needs no sharing at all, and the consolidation half is `accepted`.
- **The constraint everyone assumed does not exist.** The v1 dependency firewall was
  **run** against a synthesized tree rather than read: a fifth package under
  `packages/` is invisible to it, by bare specifier and by relative path alike, while
  a planted control violation from the same directory is caught. So a shared test
  package is permitted. It is still declined, on cost — `packages/workspace` is
  declared to depend on nothing, and this would give it an edge the firewall cannot
  police — but "permitted and declined" is a different ruling from "forbidden", and
  **A-03 is written around the forbidden version.** That correction is recorded on
  A-03 as a fact for the Application pass, not as a ruling.

Two things this pass adds. **A finding's heading is a claim, and it fails
independently of its evidence** — X-06's body was accurate in every particular while
its title was not, and every downstream citation that disagreed with the body had
been copied from the title. And **an absence assertion cannot be validated by running
the suite**: a false pass is exactly what a green run produces, so the full v1 suite
passing during this pass (17 files, 85 tests, 15.9 s on 26.5.1) is evidence about
every other test and about neither of these.

**The Application text-filtering pass opened the Application band, and all three of
its findings hold at `fixed` while none of the three survived with its stated
mechanism intact.** Settled on 2026-08-08 by
[Disposition the Application text-filtering findings](../../.issues/WF-075-disposition-application-filtering-findings.md).
The pass began by enumerating the render surface, because every one of the three
rests on a completeness claim about it. **The surface is four things, and that is
now written down**: `Text.content` through `label()`, which filters strings and has
a typed `StyledText` bypass that nothing in the repository constructs; `Box.title`
at four sites; `Box.bottomTitle` at one; and `TextareaRenderable`.

- **A-02's trigger is now a number.** OpenTUI writes one `write` per span from a
  64 KiB auto-committing feed, so the split is real — but it does **not** accumulate
  across frames (100 frames totalling 261,600 bytes produced 100 writes, none at the
  boundary), and a single frame only crosses 64 KiB at roughly **62,000 character
  cells**, about 500×130. Measured, not argued: 450×110 is one write, 500×130 is two
  with the first exactly 65,536. That is what moved the severity to low. The filter
  is not vestigial — a no-color frame still carries 148 SGR sequences, 12% of its
  bytes — and the end-to-end leak is honestly recorded as **not reproduced**, because
  twenty frames with a fixed byte layout are one sample, not twenty.
- **S-05 was wrong about which module filters, wrong about the consequence, and its
  repair is a no-op for its own target.** `#onPaste` returns early whenever the
  composer is open, so the function it names is never called on the path it
  describes; OpenTUI's `TextareaRenderable.handlePaste` applies the identical
  expression. "The two diverge silently" is false — the sole caller rolls the
  textarea back, so the defect is a silent *discard*, not a divergence. And changing
  the named function would reach only Review search and the comparison input, **both
  of which already strip for themselves**. The typed rule cannot be applied verbatim
  in any case: it rejects rather than filters, so it would drop every multi-line
  paste.
- **S-07 understates itself three ways and its fix is a trade, not a superset.**
  Four titles, not three; **two** carry a repository path, not one; and
  `bottomTitle` is a fifth text-bearing prop on the same door. The measurement that
  matters: `safeText` and the Workspace's `evidencePath` **each catch what the other
  misses** — `safeText` covers C1 and lets `CR` and `LF` through, `evidencePath`
  covers `CR` and `LF` and lets C1 through. So routing titles through `safeText`
  adds coverage and gives some up.

**The cross-package obligation this pass records is stronger than the one it was
asked to record, and it belongs to P16C rather than P16B.** `evidencePath`
(`packages/workspace/src/workspaceEvidence.ts:1493`–`:1511`) is not a stopgap that
the Application repair retires — on the measurement above it is the **only** thing
covering `CR` and `LF` on box titles, before the S-07 fix and after it. Whoever
changes it owes the Application's titles a replacement first. The Workspace band is
fully settled and has no open ticket to absorb this, which is why it is here.

Two things this pass adds. **A finding can be right about its outcome and wrong
about its module** — S-05 correctly describes what reaches `editor.body` and names
a function that is bypassed on that path, so ratifying the outcome would have
ratified a repair that changes nothing. The check that caught it was reading the
*caller*, which is also what disproved the divergence claim: **three of the four
corrections in this pass came from reading one level out from the cited line**. And
**two filters are not automatically ranked** — the instinct to treat one as the real
defence and the other as luck is what hid a complementary pair for two sessions;
running both over the same input took a minute and inverted the conclusion.

**Measured in passing, recorded rather than filed, and owed to an already-settled
decision.** [Decide the linter and formatter posture](../../.issues/WF-055-decide-linter-formatter-posture.md)
settled on adding `noUnusedLocals` and `noUnusedParameters` to `tsconfig.v1.json`.
Neither flag is in that file yet, and turning them on today **fails the build** —
`tsc --noUnusedLocals` reports **8 errors across 4 files**: `fg` and `bg` imported
and never called plus an unused `ReviewDiffAvailableView` in `reviewingView.ts`, an
unused `decodedBody` in `reviewingModel.ts`, and four more in
`harnessInteraction.ts` and `projection.ts`. With `noEmitOnError: true` already set,
the flags and the deletions have to land in the same change. This is not a new
finding — the count stays at **46**, matching how **S-01**, **L-04** and **X-06**
absorbed their corrections — it is an obligation on whoever executes WF-055.

**The rule this ledger had been applying by feel is now stated, and it is checkable
in about three greps.** A producerless published surface is **capability-shaped**
when a source of intent outside the code — `CONTEXT.md`, `docs/blueprint/`, or a
scheduled package of the execution plan — names the behaviour and the
implementation matches it; it is **accident-shaped** when no such source names it
and the surrounding code refuses it. **X-08** and **A-05** had drawn that line in
opposite directions across indistinguishable-looking surfaces without either
stating a test. Under the rule both proposals survive, and **A-05 splits**: its
Application end fails on every count, while its Workspace end is the durable
expression of **Annotation Draft** (`CONTEXT.md:327`) and the sibling of a
scheduled slice step. Rank crossed a package boundary for the second time on this
ledger — **X-08** ranks **Workspace**, not Application, on **X-09**'s precedent,
because every line of its `fixed` half is Workspace code and Workspace fixtures.

**Three things recorded rather than filed, so the count stays at 46.** **P16C owes
coverage of `#reviseDraft` alongside `#requestInterruption`** — same shape, same
package, same suite — which is A-05's accepted half joining X-08's obligation.
**P16C owes a comment on `projection.ts`'s `reviewActions` and `questionActions`**,
two unmarked stubs returning `[]` because **P16** was amended to "natural follow-up
without disposition or Finish ceremony"; their silence put a false premise into
settled finding **X-09**, corrected in place there. And **the Harness Interaction
dispatch fallthrough is correct only while its union has three members** — nothing
enforces that, and a fourth would route silently into `#requestInterruption`.

**The Application band closes on a tenth axis: a finding's claim about *when* its
owning package runs is a claim, and this one was wrong in its own document.**
Settled on 2026-08-08 by
[Disposition the Application bounds and checks findings](../../.issues/WF-077-disposition-application-bounds-and-checks-findings.md),
the last of the three tickets the Application split produced. Four findings;
**A-01** and **A-04** hold at `fixed`, **S-04** at `accepted`, and **A-06** stays
`deferred` — the ledger's only one — but every one of the four was corrected.

- **A-06's deferral survives; the interim mitigation attached to it does not.** The
  note defers "because the owning package is at P19/P22 and this ships before it".
  The owning package is **P16B**, whose dependency is the already-complete P16A and
  on which **P16C itself depends** — so the loop is deleted *before* every other
  repair on this ledger, and there is no interim to mitigate. The correcting fact
  was already written in this Summary: **L-03**'s pull-forward bullet has said since
  2026-08-07 that "P16C depends on P16B, so P16B lands first". A finding contradicted
  its own ledger's roster, and the axis this adds is that **the schedule a
  disposition rests on must be read, not remembered**. Two independent reasons back
  the withdrawal: the loop has **no test coverage of any kind**, and the crash path
  the mitigation protects (**W-07**, with **W-09**) is already ranked
  `Workspace / first`, the head of the first band.
- **A-04's repair is half owned by another package, and the finding could not have
  known without reading an amendment.** The **P54 amendment of 2026-08-06** states
  that the launcher gate "is repaired earlier, at **P16C**, as ledger finding
  **A-04**; this package owns only the manifest wording the warning quotes" — which
  both binds the fix and removes "single-source the bounds" from its scope. The
  enumeration is also short: there are **four** statements of the supported range,
  not three, and the fourth (`support/manifest.json:10`, `>=22.19.0`) is the loosest
  of all and is **pinned by an assertion** at `scripts/smoke-build-v1.mjs:132`. It is
  not a gate, so the conclusion survives — but any single-sourcing edit meets it.
- **S-04 is the first enumeration on this ledger that came out the other way.** Its
  sibling list was short by two `mkdir` sites, and correcting it made the claim
  **stronger**: `authoritativeStateWorker.ts:871` is a fourth durable root that
  re-asserts, twice, and the sixth site is a lock directory whose deliberate
  non-recursive `mkdir` buys the same property by a different route. Every
  completeness claim tested on this ledger until now had failed; this one was merely
  understated.
- **A-01's conclusion holds on a corrected count, and its repair does not.** There
  are **two** unbounded mutations, not one — and the second is safe only because its
  *producer* in the view clamps before dispatching, so a mouse click silently repairs
  a drifted value while the keyboard cannot. The proposed repair, "clamp in the model
  against the known content length", names a quantity **the model does not hold**:
  the bound derives from the view's wrapping at the current pane width and its card
  layout constants, so honouring the proposal means copying that arithmetic into the
  model and reproducing **W-13**'s two-implementations-of-one-quantity defect to
  delete a `Math.min`.

**One method note worth more than the findings.** Three of the four say the same
sentence about themselves — "every other X does this, and I am the exception" — and
the pass tested all three by enumeration rather than reading. Two were wrong about
the count (**A-01**, **A-04**) and one was wrong in the generous direction
(**S-04**); **none** was wrong about its conclusion. A completeness claim and the
conclusion it supports fail independently, which is **X-01**'s lesson arriving from
the opposite direction: there, a correct mechanism rested on a short site list that
would have made the repair destructive; here, short site lists left three
conclusions standing and two repairs unusable as written.

**The root and legacy pass settled eight entries and, at that point, left one
proposed disposition on the whole ledger.** Settled on 2026-08-09 by
[Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md).
The root band has three `fixed`, two `accepted`, and one already-fixed entry; the
legacy band has one accepted fact and one finding split between `fixed` and
`deletion-bound`. No severity changed, none is pulled ahead, and no new finding was
filed. At that point the ledger was **45 of 46 settled**; **X-07** was the only
entry still carrying a proposal.

- **X-05's mechanism is false, and its useful half survives.** The two Local Runtime
  suites restore `XDG_RUNTIME_DIR` after every test and Vitest runs only one task at a
  time in a worker. Both suites pass with isolation and file parallelism disabled,
  and again in the threads pool with isolation disabled: **9 of 9** in both runs.
  Pinning `pool`, `isolate`, and `fileParallelism` would therefore freeze three
  unrelated defaults without protecting the tests. The hardcoded `/tmp` is
  load-bearing for a different reason: this machine's `os.tmpdir()` makes the Unix
  endpoint exceed the module's 100-byte limit, so the locator silently falls back
  outside the fixture; `/tmp` keeps the endpoint at 84 bytes and inside it. The fix
  narrows to recording that fact at both sites.
- **S-03's own acceptance condition is already true.** It says the unpoliced
  third-party path starts to cost when "an agent can edit a manifest"; agents are
  doing exactly that on this effort. The private-package check does not compensate:
  it prevents publication, not an unreviewed package entering the source, lockfile,
  or local process. The disposition is `fixed`, with an explicit per-package
  third-party allowlist beside the existing internal-boundary allowlist. The only
  production dependency entry admitted today is `@opentui/core`; the separately
  host-loaded Pi Adapter also needs its Pi peer, and tests need their explicitly
  test-only imports.
- **R-02's proposed aggregate is withdrawn rather than smuggled into an `accepted`
  ruling.** An aggregate script is a repository change, while `accepted` means the
  split remains. The sweep already established that the probes close no unique
  coverage gap, and there is no measured skipped-probe failure: every package result
  that requires them records them separately. Its other premise is stale too — the
  Pi probe registers its own deterministic provider and needs a live Pi binary, not
  authentication. The separation stays accepted; the gate continues to name
  canonical verification and all four probes explicitly.
- **S-02 takes the policy its exclusion history already describes: 24 hours.** Both
  exclusion groups were added in the same commits as the exact Pi and OpenTUI pins,
  and pnpm 11.10.0's strict release-age path persists approved immature versions in
  exactly this `name@version` form. `minimumReleaseAge: 1440` makes ordinary new
  versions wait one day while preserving those reviewed exact exceptions. One day is
  enough to make a same-day replacement observable without turning routine updates
  into a multi-day wait; an intentional urgent pin still has pnpm's explicit
  approval path.
- **LG-02 splits because its consequence claim is false.** The oversized aggregate
  failure is deletion-bound as proposed: it is visible, loses no durable data, and
  the v1 Evidence route already replaces the Interface. But the user does **not** see
  an error *instead of* a diff. `App.tsx` updates the red footer and leaves the prior
  `gitDiff` rendered, exactly the stale-diff risk the cited HANDOFF section records.
  P16D fixes that narrow unsafe residue by clearing the stale view on refresh failure;
  it does not transplant per-file degradation or add legacy tests.
- **Both fact records remain `accepted`, and both needed factual correction.**
  LG-01's save paths produce `0o600` files, but recursive `mkdir(..., mode: 0o700)`
  does not re-assert a pre-existing directory's mode; P17 already treats the source as
  hostile and relies on exact bytes, not that directory claim. S-06's “24 packages”
  is pnpm's count of dependency-tree **occurrences**, including a duplicated Workspace
  edge and duplicated `ansi-regex`; the installed production tree has **20 distinct
  third-party package-version identities**, including an auto-installed TypeScript
  peer and two `strip-ansi` versions omitted by the finding's list. The 4,830,592-byte
  native library and the no-lifecycle-script conclusion hold.
- **R-01 needs no fifth state.** `fixed` describes the state of the defect, not which
  ticket happened to repair it. The Node-range decision moved the sole declaration
  to `^26.1.2`, exposed and fixed the optional `process.disconnect`, and passed the
  full route. Its rank is `n/a` because P16C has no remaining work to order. That does
  not automatically discharge W-14 or A-04: the same waiver touched parts of them,
  but both retain independently ruled repairs.

**Two bookkeeping questions stay out of the finding count.** Fact records take
`accepted`, one of P16E's four named classifications, so a fifth “record” state would
make the gate harder rather than clearer. And the unimplemented `noUnusedLocals` and
`noUnusedParameters` decision remains the execution obligation already recorded in
this Summary; duplicating it as another finding would give one decision two owners.

**Verification stayed documentary.** No source, manifest, lockfile, script, or config
was changed. The full v1 suite passed on Node 26.5.1: **17 files, 85 tests, 14.25 s**.
The two targeted hostile-config X-05 runs passed **9/9** each before the full run.

Of the roughly two dozen leads recovered from the crashed session, the confirm
rate was close to half, and several confirmed ones were narrower or wider than
described — the four "unbounded caches" turned out to be one, the two
`authoritativeState.ts` concurrency leads were both unfounded while a third
problem (no request deadline) was real, and the "unbounded scroll" and "question
card offset" leads proved to be one defect. The skepticism the ticket asked for
was warranted.

**The final policy pass closed the then-46-entry ledger.**
[The Workspace Writer vocabulary decision](../../.issues/WF-069-decide-workspace-writer-rename.md)
accepted X-07 after disproving its premise: the runtime lifetime handle, Workspace
Identity authority, registry-lock owner, and Workspace Writer process are four
distinct concepts, and active source already uses Writer for the process role.
No rename, glossary change, or vocabulary gate follows.

**P16D extends the ledger to 47 of 47 settled.** Its blocker-only review confirmed
LG-03 after disposable probes proved that three legacy paths can follow symlinked
application-owned directories and mutate outside their intended roots. The finding
is high and `fixed`; it does not reopen any active package or deletion-bound legacy
cleanup.

One last owner-raised code concern arrived before the map closed and graduated
because it reproduced immediately rather than remaining fog.
[The active-input codec decision](../../.issues/WF-078-revisit-active-input-codecs.md)
overturned W-13's accepted validation half: `parseReviewSnapshot` accepts empty
nested objects as a trusted durable Snapshot. The finding count remains 46 because
this is the same helper and decoder surface W-13 already owns. Its Workspace
repair joins the pull-forward roster; Local Runtime and Application follow their
normal P16C order. No `Proposed disposition` remains.

## Findings

<!-- appended as each is confirmed; never held until the end -->

### Cross-cutting

#### X-01 — Durable digests depend on implicit source key order

- **Module / file:** Workspace — `packages/workspace/src/harness-interaction/harnessInteraction.ts:1041`, `:3307`
- **Category:** durability
- **Severity:** medium
- **Evidence:** Two durable integrity checks digest a JSON serialization:
  `sha256(JSON.stringify(manifest)) !== value.manifestSha256` and
  `sha256(JSON.stringify(files)) !== snapshot.manifest.digest.value`.
  `JSON.stringify` emits keys in object insertion order, so each digest is
  canonical only because `normalizeManifest` (`:508`–`:514`) and its peers
  rebuild the object with a fixed literal key order. Nothing enforces that
  order: there is no canonical serializer, no comment marking the key order as
  a durability contract, and no golden test pinning a known manifest to a known
  digest. Reordering those object literals — an edit a reviewer would read as
  cosmetic — silently invalidates every previously stored digest, and the
  mismatch surfaces as `HarnessStateProblem`, i.e. durable state reads as
  corrupt.
- **Re-verified 2026-08-07** by the disposition pass, which swept every
  JSON-serialization digest in active source rather than ratifying the pair.
  **Every mechanism claim holds and was measured. The site count does not, and
  the two proposed repairs are not alternatives.**
  - **The failure mode is real, and demonstrated rather than argued.** Reordering
    the source literal over the actual manifest shape moves the digest from
    `035112085a2081f4…` to `1f81adddfb8c7fe4…` on identical data. A `JSON.parse` →
    `JSON.stringify` round-trip *does* preserve key order, and `structuredClone`
    does too, so the persisted-order half of the contract is sound; the one shape
    where an engine reorders — integer-like keys — does not occur anywhere in this
    manifest.
  - **There are three sites, not two, and the third is the producer.**
    `workspaceEvidence.ts:1590` (`manifestDigest`, called at `:2235` and `:2290`)
    is what *writes* the digest that `harnessInteraction.ts:3307` verifies, and it
    is in a **different module** from both named sites. **A canonical serializer
    applied only to the two named lines would invalidate every stored digest**,
    because the producer would keep emitting plain `JSON.stringify` — manufacturing
    exactly the `HarnessStateProblem` corruption this finding warns about.
  - **The mechanism claim is right for one site and wrong for the other.** Site 1
    (`:1041`) is protected as described: producer (`:1426`) and verifier both run
    `normalizeManifest`, which rebuilds from a fixed literal (`:508`–`:514`). Site 2
    has **no normalizer on the read side at all** — `parseReviewManifestWindow`
    (`reviewing.ts:1049`–`:1070`) validates and returns
    `value as unknown as ReviewManifestWindowPayload`, a pass-through cast. Its
    canonicality comes from `publicFile`'s literal (`workspaceEvidence.ts:1563`) at
    write time surviving the round trip, not from "normalizeManifest and its
    peers". The contract spans **three modules**, not one.
  - **The three completeness claims all hold**, verified by sweep: no canonical
    serializer exists anywhere in the repository, no comment names key order as a
    durability contract, and no test pins a manifest to a known digest. The pinned
    64-hex digests under `test/fixtures/authoritative-state/format-1/` are
    generation-container digests, not manifest ones.
- **Disposition:** fixed — **one repair, not a choice of two.** Pin the current
  order with a golden digest test plus a comment naming it a durability contract,
  covering **all three** sites including the `workspaceEvidence.ts` producer. **The
  canonical-serializer option is withdrawn**: it rewrites every stored digest, so
  it is a durable-format migration wearing the costume of a code cleanup, and it
  collides head-on with **P16B**'s own acceptance criterion that "existing Reviews
  created under the immutable-Current model remain readable facts". The golden test
  costs one test and one comment, preserves every stored digest, and closes the
  stated hazard — a reviewer reading a literal reorder as cosmetic — at CI time,
  which is where it needs closing.
- **Rank:** Workspace / normal
- **Obligation recorded on P16B:** do **not** adopt a canonical serializer while
  implementing Live Changes. P16B creates a successor Snapshot per source change,
  so it runs this digest path far more often and is bound to keep existing Reviews
  readable; changing the serialization during that package would break its own
  acceptance evidence.
- **Coordination with X-03, honouring the constraint that finding set:** X-01 does
  **not** widen to reach the three durable comparison sites, and — because the
  canonical serializer is withdrawn — those sites do **not** become redundant.
  **X-03's `normalizeCommand` repair is load-bearing and stands alone.**
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### X-02 — Projection subscription failures are silently discarded

- **Module / file:** Workspace — `packages/workspace/src/projection.ts:1170`–`:1181`
- **Category:** correctness
- **Severity:** medium
- **Evidence:** `#schedule` runs the background refresh as
  `void this.read(...).then(...).catch(() => undefined)`, and
  `ProjectionSubscription` (`:671`–`:676`) carries only `onUpdate` — there is no
  error channel. A failing `read` therefore reaches no one: the subscriber keeps
  its last delivered projection, and `publishCommittedVersion` (`:1162`) will
  keep scheduling refreshes that keep failing. Under a state-store failure the
  surface silently freezes at an old `stateVersion` instead of reporting that it
  can no longer refresh. `CONTEXT.md` names "current versus stale versus
  unverified content" a Truth-Critical Distinction, which this path cannot
  express.
- **Open question answered 2026-08-07, in code rather than by judgement, and the
  answer blocks the escalation instead of granting it.**
  - **Yes, the delivered view carries its own freshness claim, and it is the exact
    Truth-Critical Distinction.** `ReviewProjectionHeader.snapshotStatus`
    (`projection.ts:157`) is `'current' | 'stale' | 'unverified'` — verbatim
    `CONTEXT.md`'s "current versus stale versus unverified content" — and it is
    rendered to the user in three places: the Review header band
    (`reviewingView.ts:1324`, `:1325`) and the status line (`:2120`).
  - **The claim is not maintained by this subscription.** It is maintained by the
    independent 750 ms poll recorded as **A-06**, which calls `Projection.read`
    directly and consumes *only* `header.snapshotStatus`
    (`reviewingApplication.ts:598`). So a frozen subscription does not, by itself,
    leave the header asserting a stale `current`; the poll is what refreshes that
    value, and it keeps retrying every 750 ms and recovers the moment the store
    does.
  - **And that poll discards its own read failures deliberately, with the reason
    written down** (`reviewingApplication.ts:601`–`:604`): "Automatic liveness must
    not turn a transient verification read into a false stale/unverified condition.
    Explicit reads and actions still report their normal failures through the
    existing Application path." The silence this finding names is therefore **not a
    lone oversight** — the Application has already ruled on the same trade-off, in
    code, and an error channel that surfaced transient refresh failures as staleness
    would contradict that recorded decision.
  - **What survives is narrower and not covered by that rationale.** The
    `.catch(() => undefined)` at `:1181` discards **`ProjectionRecordsInvalid`**
    (`:1140`) — the projection's own record-corruption detector — alongside
    transient store failures, and "transient verification read" does not describe a
    corrupt record. Under a *sustained* failure both channels are silent and the
    surface holds its last view indefinitely; the Application comment's own
    carve-out, that explicit reads and actions still report failures, only fires
    when the user acts, never while they read.
  - **The claim that there is no error channel holds one level higher than the
    finding checked.** `Workspace.subscribe` (`workspace.ts:504`–`:535`), the
    public Interface, also carries only `onUpdate`.
- **Disposition:** fixed — **severity stays medium; it does not escalate.** The
  repair narrows from "add an error channel" to two things the recorded Application
  rationale does not cover: stop discarding `ProjectionRecordsInvalid`, and
  distinguish a transient refresh failure from a durable one so that only the
  durable case can reach the surface. Adding an undifferentiated error channel is
  rejected — it would surface exactly what `reviewingApplication.ts:601`–`:604`
  deliberately suppresses.
- **Rank:** Workspace / first — it shares a file and a failure class with **W-01**,
  which is already `first` and pulled ahead, and the obligation below means its
  answer has to exist before Live Changes is designed rather than after.
- **Obligation recorded on P16B, and it is a coupling neither finding states:**
  **A-06 is deferred to P16B precisely because Live Changes replaces that 750 ms
  poll wholesale.** Removing it removes the channel that currently maintains
  `snapshotStatus`, which makes this subscription the **only** one — so X-02 stops
  being a secondary path and becomes the primary one at exactly the moment A-06 is
  resolved. P16B must settle this in the same change rather than inherit it.
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### X-03 — `JSON.stringify` equality comparisons

- **Module / file:** Workspace — `packages/workspace/src/reviewing.ts:1330`
  (`contentEqual`), `harness-interaction/harnessInteraction.ts:351`
  (`sameValue`), `projection.ts:1355`–`:1357`; Pi Adapter —
  `packages/pi-adapter/src/piAdapter.ts:184` (`markerMatches`); Application —
  `apps/neoflow/src/reviewingModel.ts:622`
- **Category:** correctness
- **Severity:** low
- **Evidence:** Six sites decide equality by comparing `JSON.stringify` output,
  which is key-order sensitive and therefore reports semantically equal objects
  as different. Each site currently survives on an unstated invariant: at
  `projection.ts:1355` a false negative costs a full evidence recapture, which
  silently defeats the retained-evidence performance fix rather than breaking
  correctness; at `piAdapter.ts:184` the compared marker is written by Neoflow
  itself through `appendCorrelationMarker` (`:589`) and only round-tripped by
  Pi, so it holds unless Pi's own storage reorders keys — if it ever does,
  correlation fails closed to `terminal-evidence-lost` and a valid answer is
  dropped rather than fabricated. `markerMatches` compares five scalar fields
  and would be strictly more robust as a field-by-field comparison at no cost.
- **Re-verified 2026-08-07** by the disposition pass, which swept every
  `JSON.stringify` in active source rather than ratifying the list. **The
  `markerMatches` half is correct in every particular. The site list is not**, and
  what it misses is worse than what it names.
  - **`markerMatches` holds exactly.** `PiCorrelationMarker` (`piAdapter.ts:65`) is
    five scalar string fields — count confirmed. Both constructions (`:371`, `:580`)
    use the same literal key order, so `JSON.stringify(expected)` is stable; the
    marker really is written by Neoflow at `appendCorrelationMarker` (`:589`) and
    only round-tripped through Pi's storage as `entry.data` (`:382`). Mechanism,
    count, and fail-closed consequence all survive.
  - **The count does not match the list.** The finding says "six sites" but names
    **five** locations, which contain **seven** comparison expressions — the
    `projection.ts:1355`–`:1357` entry is three, not one. A cosmetic error on its
    own, and the fourth in this ledger whose arithmetic did not survive being run.
  - **Three durable comparison sites are missed entirely**, and they are the ones
    that matter: `harnessInteraction.ts:3635` (`payload.normalizedCommand !==
    normalized`), `:1598` (`payload.normalizedEvidence !== normalized`), and
    `reviewing.ts:1761` (`payload.normalizedCommand !== normalized`). Each compares
    a freshly computed `JSON.stringify` against **one persisted in Authoritative
    State at an earlier time**, to decide whether a replayed command is the same
    command. They are neither X-03's in-process pairs nor **X-01**'s
    `sha256(JSON.stringify(…))` digests, so **the boundary between X-01 and X-03 was
    drawn on syntax rather than on mechanism**, and this class fell through it.
  - **The two sibling normalizers disagree, and only one is safe.** Measured, not
    read: `reviewing.ts:659` rebuilds every command from a fixed source literal, so
    caller key order is discarded. `harnessInteraction.ts:585` returns
    `cloneFrozen({...value, anchor: …})` (`:617`) and `cloneFrozen(value)` (`:644`);
    `cloneFrozen` is `deepFreeze(structuredClone(value))` (`:308`) and both spread
    and `structuredClone` **preserve the caller's key order**. A probe confirms two
    semantically identical commands differing only in caller key order produce
    different normalized strings under the harness normalizer and identical ones
    under the reviewing normalizer. Same package, same concept, opposite behaviour.
  - **The consequence is a false `command-identity-conflict`** — a replay of a
    command that already committed is reported as an identity reused for a
    *different* command, so the caller believes an operation failed that in fact
    succeeded.
  - **It is not reachable today, and the condition that would reach it is named.**
    `commandIdentity()` is `neoflow-tui-${randomUUID()}` (`reviewingModel.ts:303`),
    fresh per command, so no producer re-presents an identity with an
    independently constructed object; the one retry path
    (`#mapCommandCommitFailure`) reuses the same in-memory string. Severity
    therefore stays **low**. It rises the moment a producer reuses a
    `commandIdentity` across separately built objects — which is precisely what an
    idempotency key is *for*, and two of the three harness commands have no
    producer at all (**X-08**), so the first real one inherits this.
- **Disposition:** fixed — two repairs, not one. (1) `markerMatches` compares its
  five scalar fields directly, as proposed. (2) `harnessInteraction.ts`'s
  `normalizeCommand` rebuilds from a fixed literal the way its sibling in
  `reviewing.ts` already does, which closes all three durable sites structurally
  rather than by producer discipline — the **P-01** precedent, and the right shape
  here because the correct pattern is already present at one of the two sites in
  the same package. The four remaining in-process sites are **accepted**, with the
  invariant written down as proposed: each survives on caller-fixed key order, and
  no evidence shows any of them failing.
- **Rank:** Workspace / normal
- **Pi Adapter inheritance, recorded here because no later ticket revisits it:**
  `markerMatches` (`piAdapter.ts:184`) is the Pi Adapter's own site and the Pi
  Adapter fixes it; nothing about it waits on the Workspace. It carries no
  obligation in the other direction.
- **Coordination with X-01, owned by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md):**
  the three durable sites are ruled here and repaired by the normalizer change
  above, so **X-01 should not assume its canonical-serializer decision covers
  them, and need not widen to reach them.** If X-01 does adopt a canonical
  serializer, these three become redundant rather than conflicting.
- **Decided:** 2026-08-07 by [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md)

#### X-04 — Retired-stream guarantees are asserted after a fixed sleep, or not at all

- **Module / file:** Workspace — `packages/workspace/test/scenarios/workspaceProjection.test.ts:219`;
  Local Runtime — `packages/local-runtime/test/contracts/localRuntime.test.ts:332`, `:504`
- **Category:** testing
- **Severity:** medium
- **Evidence:** Three assertions establish that something did **not** arrive by
  sleeping a fixed interval and then checking absence — 30 ms before asserting
  `updates` is exactly `[0, 1, 2]`, and 10 ms after an unsubscribe-then-publish
  before asserting the version is still 2. An absence assertion behind a fixed
  delay passes trivially on a slow or loaded machine, so it can stop exercising
  its guarantee without ever failing. These particular assertions guard the
  retired-stream and unsubscribe behavior that the `HANDOFF.md` checkpoint
  claims as settled ("subscriptions acknowledge cancellation and tolerate only
  already-queued updates from known retired streams"), so a silent false pass
  costs confidence in a stated guarantee.
- **Tested 2026-08-08 — the count of three is exact, and one of the three is not
  what this finding says it is.** A sweep of every `setTimeout` across the four
  active test roots returns **nine**: five are poll bodies inside wait helpers
  (`workspaceProjection.test.ts:124`, `localRuntime.test.ts:226`,
  `harnessAdapterRuntime.test.ts:161`, `reviewingApplication.test.ts:219`, `:372`)
  and one is a scripted-timer yield (`piAdapter.test.ts:44`), leaving exactly these
  three fixed sleeps. The completeness claim holds. The characterisation does not.
  - **`workspaceProjection.test.ts:219` is exactly as described.** 30 ms after an
    idempotent replay of an already-executed command (`:218`), then `updates` is
    asserted to equal `[0, 1, 2]` (`:220`). An extra update published by a broken
    replay is caught only if it lands inside 30 ms.
  - **`localRuntime.test.ts:332` is real, but it guards a different assertion from
    the one named.** The finding says the sleep precedes "asserting the version is
    still 2" — that is the `read` at `:333`–`:336`, and it **cannot fail either
    way**: `ScriptedWorkspace.publish` (`:105`) only calls subscribers, and
    `#stateVersion` (`:52`) moves *only* in `execute` (`:69`), so the projection
    reads version 2 whether or not the post-unsubscribe update was delivered. The
    absence assertion the sleep actually protects is `updates` equalling `[2, 3]`,
    three lines further down at `:338`–`:340`.
  - **`localRuntime.test.ts:504` is not an assertion behind a sleep. There is no
    assertion.** Its interval is **5 ms, not 10**; the order is reversed —
    unsubscribe (`:500`), *then* sleep, *then* publish (`:505`) — and the test ends
    on `peer.socket.destroy()` (`:506`). **Deleting its last seven lines would not
    change whether it passes.** The test is named *'sequences subscription updates
    and stops them after unsubscribe'*: the sequencing half is genuinely asserted at
    `:477`–`:498`, and the half the name promises is checked nowhere. The lines are
    not inert — they do exercise the server's post-unsubscribe publish path, so a
    throw there would surface — but nothing about the guarantee is established.
  - **The gap is wider than that one test.** `:501` is the **only** occurrence of
    `workspace.unsubscribe` in any test file in the repository, and
    `workspace.unsubscribed` — the acknowledgement the server sends at
    `server.ts:619`, and the frame `HANDOFF.md:16` means by "subscriptions
    acknowledge cancellation" — appears in **no test at all**. The path is not dead:
    the client-level `unsubscribe()` at `:330` does run `client.ts:134` and `:181`.
    It is executed everywhere and asserted nowhere, which is a weaker gap than
    **X-09**'s, where the code path never runs under test at all.
  - **The `HANDOFF.md` claim this finding leans on is verbatim**, and is the whole
    of the guarantee's written existence: `HANDOFF.md:16` reads "subscriptions
    acknowledge cancellation and tolerate only already-queued updates from known
    retired streams", while the word *retired* appears in **no source or test file**
    in the repository.
  - **Severity stays medium.** The discovery makes the finding worse without
    reaching high, which needs a broken guarantee rather than an unevidenced one.
    **X-09** is the ceiling argument: a total coverage gap on the Review's terminal
    transitions — the product's central object — is medium, so a partial gap on
    subscription cancellation cannot exceed it.
  - **Not measured, deliberately: whether today's 30 ms and 10 ms margins are
    adequate.** A false-pass defect is unfalsifiable by running the suite, because a
    green run is precisely what a silently-trivial absence assertion produces. The
    full v1 suite passing on 26.5.1 during this pass (17 files, 85 tests, 15.9 s) is
    therefore evidence about the other tests and about nothing here. Establishing the
    margin means mutating the source and re-running, which this map's
    no-code-change rule puts outside a disposition pass.
- **Disposition:** fixed — and it is **three different repairs, not one treatment
  applied three times**. (1) `workspaceProjection.test.ts:219`: replace the sleep
  with a positive round-trip — execute a state-changing command, wait for its update
  through the existing `waitFor`, then assert the whole sequence, so the absence is
  bounded by an observed arrival. (2) `localRuntime.test.ts:332`: the same treatment
  for the `[2, 3]` assertion, **and delete or replace the dead read at `:333`–`:336`**,
  which asserts a constant. (3) `localRuntime.test.ts:504`: **write the assertions
  that were never written** — read the `workspace.unsubscribed` acknowledgement, then
  establish non-delivery of the post-unsubscribe publish against an observed event.
  Only (1) is the repair this finding proposed.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-08 by
  [Disposition the Workspace test-source findings](../../.issues/WF-074-disposition-workspace-test-source-findings.md)

#### X-05 — Two contract suites depend on an unexplained short runtime root

**Heading corrected on 2026-08-09.** The tests do not depend on Vitest isolation;
the hardcoded short path is the dependency that survived.

- **Module / file:** root — `vitest.v1.config.ts`; `packages/local-runtime/test/contracts/localRuntime.test.ts:239`,
  `packages/local-runtime/test/contracts/harnessAdapterRuntime.test.ts:174`
- **Category:** testing
- **Severity:** low
- **Evidence:** Both local-runtime contract suites mutate the process-global
  `process.env.XDG_RUNTIME_DIR` in `beforeEach` and restore it in `afterEach`.
  That is only safe because Vitest's default `isolate: true` gives each test
  file its own environment. `vitest.v1.config.ts` pins `environment`,
  `testTimeout`, `include`, and `passWithNoTests`, but not `pool`, `isolate`, or
  `fileParallelism` — so the correctness of these two suites rests on a default
  the config does not state. The same two files also hardcode `/tmp` rather than
  `os.tmpdir()`, unlike every other suite; this is very likely deliberate,
  because a macOS `os.tmpdir()` path plus a socket name can exceed the
  `sun_path` limit, but the reason is not recorded.
- **Tested 2026-08-09 — the isolation mechanism is false and the path mechanism
  is exact.** Vitest 3.2.7's current defaults are `pool: 'forks'`, `isolate: true`,
  and `fileParallelism: true`, but none is what protects these suites. They restore
  `XDG_RUNTIME_DIR` in `afterEach`, the runner executes one task at a time per worker,
  and both files pass together under two hostile configurations: `--no-isolate
  --no-file-parallelism` (**9/9**) and `--pool=threads --no-isolate` (**9/9**).
  Pinning three defaults would add configuration without closing a failure.
  The path half was measured against `runtimeLocationForWorkspace`. A fixture under
  this machine's `os.tmpdir()` produces an 80-byte base and would put the endpoint
  above `MAX_UNIX_ENDPOINT_BYTES = 100`, so the module silently uses its shared
  `/tmp/neoflow-<uid>` fallback **outside the fixture**. The hardcoded `/tmp` base
  produces an 84-byte endpoint inside the fixture. That is why these two suites are
  the only ones that cannot follow the repository's `os.tmpdir()` pattern.
- **Disposition:** fixed — add that short-endpoint/fallback rationale beside both
  hardcoded `/tmp` calls. Do **not** pin `pool`, `isolate`, or `fileParallelism`;
  the tests do not depend on them.
- **Rank:** Root / normal — the repair prevents a future “cleanup” from moving real
  socket state outside the fixture, but no current test is unsound and no later
  package makes the comment more urgent.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### X-06 — Four near-duplicate `waitFor` helpers

- **Module / file:** `packages/workspace/test/scenarios/workspaceProjection.test.ts:121`,
  `packages/local-runtime/test/contracts/localRuntime.test.ts:223`,
  `packages/local-runtime/test/contracts/harnessAdapterRuntime.test.ts:158`,
  `apps/neoflow/test/scenarios/reviewingApplication.test.ts:212`
- **Category:** duplication
- **Severity:** low
- **Evidence:** Four separate polling helpers with the same 5 ms body and
  different unexplained deadlines — 200, 100, 100, and 1,600 attempts. All are
  correctly bounded and all throw on timeout, so this costs consistency rather
  than reliability. Only the Application copy takes a `label`, so the other
  three fail with `condition was not reached` and no indication of which
  condition.
- **Tested 2026-08-08 — the evidence body is exact, the heading was not, and the
  ledger had been carrying three different counts for one finding.** Every claim in
  the body was checked against the source and every one holds: four helpers, all
  with a 5 ms body, deadlines of **200 / 100 / 100 / 1,600** attempts
  (`workspaceProjection.test.ts:121`, `localRuntime.test.ts:223`,
  `harnessAdapterRuntime.test.ts:158`, `reviewingApplication.test.ts:212`), none of
  the four carrying a comment explaining its number, and only the Application copy
  taking a `label` while the other three throw the bare string
  `'condition was not reached'`.
  - **The heading said three and has been corrected to four.** The population is
    now settled: **six** `wait*` helpers exist, of which **four** are the predicate
    pollers this finding is about; the other two are Application compositions that
    duplicate nothing (`waitForOutput` at `:224` has no loop of its own and delegates
    to `waitFor`, and `waitForInitialReviewReconciliation` at `:349` is a
    deadline-bounded settling heuristic). Of the four, `localRuntime.test.ts:223` and
    `harnessAdapterRuntime.test.ts:158` are **byte-identical**, and
    `workspaceProjection.test.ts:121` differs from them by the single literal `200`.
    Four sources had disagreed — this heading said three, its own evidence and
    **A-03**'s cross-reference said four, and the Ruled-out entry said three of six.
    The evidence body was right throughout.
  - **The labels are distributed backwards relative to need, which the finding does
    not notice.** In wall-clock the budgets are ~1 s, ~500 ms, ~500 ms and ~8 s
    against a `testTimeout` of 20 s (`vitest.v1.config.ts:6`). The two tightest
    budgets are the two **unlabelled** byte-identical copies, and the one generous
    budget is the copy that **has** a label. So the diagnostic cost this finding
    names is worst exactly where a legitimately slow machine is likeliest to trip it,
    and the failure a maintainer would then have to diagnose reads
    `condition was not reached`.
  - **The shared helper is permitted, which is the opposite of what was assumed —
    measured, not read.** The real `scripts/check-v1-dependencies.mjs` was run
    against a synthesized tree carrying a fifth package `packages/test-support` and a
    `packages/workspace` test importing it **both** ways, bare specifier and relative
    path. Neither was flagged, while a planted control import of
    `@neoflow/local-runtime` from the same directory **was** flagged — which also
    proves the firewall does descend into `test/`. The cause is structural: the
    firewall's `v1Packages` list is four hardcoded directories, and a specifier is
    checked only against legacy names, those four names, and paths resolving inside
    legacy or those four roots. A fifth package under `packages/` matches none of
    them. So the constraint **A-03** names as the blocker does not exist as written.
  - **It is still declined, on cost rather than prohibition.** The firewall's own
    declaration gives `packages/workspace` `allowedV1Dependencies: new Set()` — it
    depends on nothing — and a shared test package would hand it a dependency the
    firewall cannot see, buying an invisible edge in the one package declared to
    have none. Against that, this finding's own evidence states the duplication
    "costs consistency rather than reliability", which is the map's definition of a
    finding supported by taste.
- **Disposition:** **split.** **Fixed** for the diagnostic half: give the three
  unlabelled helpers a `label` argument and put it in the thrown message, matching
  `reviewingApplication.test.ts:212`. It is a one-file, no-import edit per site, it
  needs no sharing of any kind, and it repairs the half with a measurable cost.
  **Accepted** for the consolidation half — one shared helper across package
  boundaries — for the reason above: permitted, but paid for in an unpoliced
  dependency edge on the package that declares none, against a benefit the finding
  itself scopes as consistency. The differing deadlines stay as they are; nothing
  established that any of the four is wrong, only that none is explained.
- **Rank:** Workspace / last — the surviving `fixed` half is the only Workspace
  repair with no defect behind it. Its own evidence says so, and it should not take
  queue position from work that does.
- **Decided:** 2026-08-08 by
  [Disposition the Workspace test-source findings](../../.issues/WF-074-disposition-workspace-test-source-findings.md)

#### X-07 — Workspace Writer, runtime ownership, identity authority, and lock ownership are distinct

- **Module / file:** Workspace / Local Runtime —
  `packages/workspace/src/runtime.ts`, `workspace.ts`,
  `workspaceIdentity.ts`; `packages/local-runtime/src/lifecycle.ts`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** `CONTEXT.md` defines **Workspace Writer** as "the single local
  Neoflow process authorized to commit Authoritative Workflow State for one
  Workspace Identity". The audit grouped `WorkspaceRuntimeOwner` (22 production
  occurrences), `authorityUnavailable`/`AuthorityUnavailable` (21), and
  `holderIsGone`/`ownerHandle` (13) as 56 spellings of that one concept.
- **Re-verified 2026-08-09:** the count arithmetic is reproducible and the semantic
  grouping is false.
  - **`WorkspaceRuntimeOwner` is a lifetime handle, not the process role.** It
    bundles the opened Workspace, reviewed Adapter host and State lifetime behind
    `dispose()`. The 22 production occurrences are 16 in `runtime.ts` and 6 in
    `lifecycle.ts`; tests add 30, for 52 occurrences across eight TypeScript files.
  - **The authority family is Workspace Identity authority.** Every operation is
    `resolve-user-state`, registry locking, marker/registry read, or marker/registry
    write, and `workspaceIdentity.ts` explicitly names the marker as the identity
    authority. None acquires the Authoritative State writer lease.
  - **The holder/handle family is a short-lived registry-lock owner.** It exists
    during identity reconciliation, before a Workspace Writer need exist, and is
    released when that critical section ends.
  - **Writer vocabulary is already used for the writer role.** Active source names
    the writer-process entrypoint, writer lease, `runtime-writer-unavailable`
    diagnostic, and runtime-owned writer guards. "Writer is used nowhere" was true
    only of the selected identifier family.
  - The original "two files" scope was also false: the production sites span the
    four files named above.
- **Disposition:** accepted — keep `CONTEXT.md` and all four implementation
  vocabularies unchanged. Renaming identity authority or a registry lock owner to
  Writer would collapse distinct concepts, while renaming only the lifetime handle
  has no demonstrated benefit or defect behind it.
- **Rank:** n/a
- **Policy:** add no vocabulary gate. A token-level gate would encode the exact
  false assumption this re-verification exposed — that one domain term must appear
  in every nearby implementation identifier. Revisit only on evidence of repeated
  real drift, never on a schedule.
- **Decided:** 2026-08-09 by
  [Decide whether the Workspace Writer vocabulary drift obliges a rename](../../.issues/WF-069-decide-workspace-writer-rename.md)

#### X-08 — The Workspace publishes a command surface with no producer, and the tests hide it

- **Module / file:** Workspace / Application —
  `packages/workspace/src/harness-interaction/contracts.ts:344`, `:441`, `:448`;
  `packages/workspace/src/reviewing.ts:106`;
  `packages/workspace/src/harness-interaction/harnessInteraction.ts:1266`–`:1272`,
  `:2813`–`:2899`; the producers that do exist,
  `apps/neoflow/src/reviewingModel.ts:1901`–`:2408` and
  `packages/pi-adapter/src/piAdapter.ts:336`–`:705`
- **Category:** testing
- **Severity:** low
- **Provenance:** established 2026-08-07 by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md),
  applying **A-05**'s method — count reachability from *producers*, across every
  module that constructs one.
- **Evidence:** Of the 88 discriminant values declared across the four active
  packages, **five** are constructed by nothing in production. They divide by how
  well the test suite disguises that:
  **Three are constructed only by tests**, so the suite is green over a path no
  shipped code can reach — `review.question-draft.create` (built once, in
  `workspace/test/scenarios/harnessInteraction.test.ts:289`),
  `harness.review-handoff.commit` (`:341`), and `harness.review-handoff.inspect`
  (`:322`).
  **Two are constructed nowhere at all**, including in tests.
  `harness.review-handoff.inspect-default` is declared, handled at
  `harnessInteraction.ts:1307`, and even has a branch in the Application's fake
  Workspace (`reviewingApplication.test.ts:628`) — a test double for a request the
  Application never sends.
  The extreme case is `harness.invocation.interruption.request`. It is a member of
  the published `HarnessInteractionCommand` union, exported from the package
  Interface (`index.ts:42`), validated (`harnessInteraction.ts:647`), and backed by
  `#requestInterruption` — **87 lines**, `:2813`–`:2899`, which finds the invocation,
  checks its status and intent budget, mints a stable identity, and writes a new
  state version. **Nothing constructs it.** Not the Application, not the Pi Adapter
  — which produces only `harness.invocation.*` and `harness.availability.*`
  observations — and not one test. It is reached by *fallthrough*: the dispatch tests
  two kinds and returns `#requestInterruption(...)` for anything else.
  The seven test references to "interruption" all declare the *capability*
  (`interruption: 'correlated'`, `interruption: { route: 'direct-request' }`) and
  none exercises it, so the suite asserts the feature is advertised while never
  running it once.
  **This is capability-shaped, not accident-shaped**, and the distinction decides the
  disposition: direct review handoff and interruption are designed v1 behaviours whose
  Application end is not yet wired. Deleting them would destroy intended work. The
  finding is not "dead code"; it is that **87 lines of state-mutating logic on the
  published Interface have never executed**, and the green suite says nothing about
  whether they work.
- **Verified 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md).
  Every structural claim holds; one evidence claim does not.** Each of the five
  literals was grepped across every tracked file.
  `harness.invocation.interruption.request` occurs outside this ledger exactly
  three times — the declaration (`contracts.ts:344`), the validation
  (`harnessInteraction.ts:647`), and nothing else.
  `harness.review-handoff.inspect-default` occurs at its declaration, its handler
  (`:1307`), and one *handler* branch inside the Application's fake Workspace
  (`reviewingApplication.test.ts:628`), which is not a construction. The three
  test-only values are each constructed exactly once, at
  `harnessInteraction.test.ts:289`, `:322` and `:341`. `#requestInterruption` is
  **87 lines to the line** (`:2813`–`:2899`); the fallthrough is as described
  (`:1266`–`:1272` tests two kinds and returns `#requestInterruption` for anything
  else, which is correct only while the union has exactly three members and nothing
  enforces that); and `RequestHarnessInterruptionCommand` is exported at
  `index.ts:42`.
  **The claim that fails is "none exercises it".** Six of the seven test references
  are capability declarations as described. The seventh
  (`packages/pi-adapter/test/contracts/piAdapter.test.ts:404`–`:411`) **performs a
  `harness.direct-invocation.interrupt` directive and asserts the host aborted** —
  the exact directive `#requestInterruption` dispatches after commit. So the
  feature's far end *is* covered, and the uncovered span is narrower and more
  precise than the finding states: the **produce, validate, commit, dispatch**
  middle, all of it inside the Workspace. That test also supplies the cheapest
  argument for the repair: it cannot obtain a real
  `HarnessInterruptionIntentIdentity`, because the only code that mints one is
  `#requestInterruption`, so it forges one and casts it `as never` (`:407`).
  Covering `#requestInterruption` retires that cast.
- **"Capability-shaped, not accident-shaped" is upgraded from assertion to
  evidence, and stated as a rule.** This finding and **A-05** draw the same
  distinction in opposite directions and neither states a test for it, which is what
  their shared ticket existed to settle. The test adopted here, and handed to
  **P16C**: *a producerless published surface is capability-shaped when a source of
  intent outside the code — `CONTEXT.md`, `docs/blueprint/`, or a scheduled package
  of the execution plan — names the behaviour and the implementation matches it; it
  is accident-shaped when no such source names it and the surrounding code refuses
  it.* It costs about three greps.
  Interruption passes on both counts. `CONTEXT.md:499`–`:501` defines **Interruption
  Route** as a first-class term — "Pursuing any route records intent only and never
  changes Invocation Status without correlated Terminal Evidence" — and
  `docs/blueprint/harness-capability-seam.md:54` declares `requestInterruption` on
  the seam Interface, with a section at `:112`–`:120`. The implementation matches
  that specification literally: it writes `implication: 'intent-only'` and
  `route: 'direct-request'` and **never touches `invocation.status`**. Direct review
  handoff passes the same way (**Handoff Disclosure Preview**, `CONTEXT.md:115`),
  and `review.question-draft.create` is **step 3** of the chosen dogfood slice.
  **A-05's Application end fails the rule** — no term, no seam entry, no slice step,
  and three refusals in its own file — which is how two findings about
  indistinguishable-looking surfaces resolve in opposite directions on one standard
  rather than on taste.
- **X-09 discharges none of this.** Its ratified fix covers `review.complete`,
  `review.cancel` and `review.question.disposition.set`; its own evidence routes the
  interruption pair here and the revise pair to **A-05**. The question WF-067 raised
  is answered: nothing overlaps.
- **Disposition:** accepted for the code, fixed for the coverage — ratified as
  proposed, with the coverage narrowed to what is actually uncovered: one scenario
  driving `harness.invocation.interruption.request` through the Workspace to a
  committed `harness.invocation.interruption-requested`, asserting the intent
  record, the new state version, the **unchanged** `invocation.status`, and the
  directive handed to the attached adapter — after which `piAdapter.test.ts:407`'s
  `as never` cast can take a real identity. The escalation clause stands: **medium**
  the moment production code constructs any of the five. **A-05's accepted Workspace
  half joins this obligation**, because `#reviseDraft` is the same shape and X-09
  assigned it there.
- **Rank:** Workspace / normal — **not Application, which overrides this ticket's
  instruction to rank in the Application band.** The precedent is **X-09**, the
  neighbouring finding the ticket required be read first: it also names both Modules
  and was "filed under the Workspace because that is where the handlers and the
  fixtures live". Every line of this finding's `fixed` half is Workspace — the 87
  lines, the five declarations, and the suite that would hold the scenario
  (`packages/workspace/test/scenarios/harnessInteraction.test.ts`, which already
  carries the review-handoff commands and a `ScriptedAdapter`). `normal` rather than
  `first` because nothing constructs any of the five, so no later package is made
  dearer by leaving it. Deleting any of them remains a product decision outside this
  map.
- **Decided:** 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md)

#### X-09 — No test ever finishes a Review

- **Module / file:** Workspace / Application — the producers
  `apps/neoflow/src/reviewingModel.ts:2293` (`review.question.disposition.set`),
  `:2303` (`review.complete`), `:2311` (`review.cancel`); the handlers
  `packages/workspace/src/reviewing.ts:1693`–`:1697`; and the whole of
  `packages/workspace/test` and `apps/neoflow/test`, where none of the six kinds
  appears
- **Category:** testing
- **Severity:** medium
- **Provenance:** established 2026-08-07 by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md).
- **Evidence:** Of the **56** command and view-request kinds declared across the four
  active packages, 37 are constructed by at least one test, 6 are mentioned but never
  constructed, and **13 appear in no test at all** — 11 of which production code does
  construct.
  Six of those 13 form one coherent gap: the Review lifecycle's **terminal**
  operations. The Application builds `review.complete` (`reviewingModel.ts:2303`),
  `review.cancel` (`:2311`), and `review.question.disposition.set` (`:2293`) in
  shipped code; the Workspace dispatches all three (`reviewing.ts:1693`–`:1697`); and
  a repository-wide search of every test file returns **zero occurrences** of
  `review.complete`, `review.cancel`, or `disposition` in any form — command or
  result. Their three result kinds — `review.completed`, `review.cancelled`,
  `review.question.disposition-recorded` — are equally absent.
  The detection method matches how these tests actually work: they drive the
  Workspace with inline literals through `owner.workspace.execute({ kind: … })`
  (`workspaceReviewing.test.ts:86`, `:105`, `:113`, `:156`, `:199`), so a constructed
  kind is exactly what a test exercising a command looks like. There is no helper
  indirection hiding these.
  Stated plainly: **the suite can start a Review, capture evidence, create drafts,
  and commit a batch — and can never end one.** Completing and cancelling are durable,
  terminal state transitions on the product's central object, and both are performed
  routinely by the shipped Application.
  Two of the remaining seven are partially defended and should not be counted with
  these: `review.commit-graph` has no test at the request-routing layer, but the
  capability beneath it is covered directly
  (`workspaceEvidence.test.ts:177`, `:258`). The others belong to gaps already
  recorded — the interruption pair to **X-08**, the revise pair to **A-05** — leaving
  `harness.command.rejected` and `review.comparison-preview` genuinely uncovered on
  their own.
  **The risk probes do not compensate.** The obvious objection is that the four
  `v1:risk:*` probes and the dogfood probe cover this at integration level, outside
  the test suite. They do not: `scripts/*.mjs` contains **zero** occurrences of
  `review.complete`, `review.cancel`, or `disposition`, and the kinds those 1,627
  lines do construct — `review.current-changes.start`, `review.question.ask`,
  `review.questions`, `review.snapshot`, `workspace.home`, `workspace.identity` — are
  the same early-lifecycle ground the unit tests already hold. Every automated check
  in the repository, in or out of the canonical route, stops before the Review ends.
  Gate A and Gate B passed, so this is not evidence the behaviour is broken. It is
  evidence that **nothing would catch it breaking**, on the paths a reviewer reaches
  at the end of every single session.
- **Disposition:** fixed — one scenario that runs a Review to `completed` and one
  that runs it to `cancelled`, both asserting the terminal result and the state
  version, plus one setting a question disposition. Ratified unchanged: the
  fixtures that start and populate a Review already exist in
  `workspaceReviewing.test.ts`, so these are endings for scenarios already
  written.
- **Rank:** Workspace / first — it is pulled ahead, so it heads the package by
  construction. Filed under the Workspace because that is where the handlers and
  the fixtures live, even though the finding names both Modules.
- **Pulled ahead:** before P16B — **this overturns the ledger's framing, which
  grouped this finding with the cheap-and-valuable rather than the sequenced.**
  It carries the strongest ordering argument of the four. P16B is the largest
  semantic rewrite of the Review lifecycle on the roadmap, and today nothing in
  the suite, in the four risk probes, or in the dogfood probe would catch it
  breaking Review completion or cancellation. A test written after a rewrite
  cannot catch that rewrite's regressions; it can only describe whatever the
  rewrite produced. The tests should also survive the package that motivates
  them, which is what makes the pull-forward cheap rather than merely urgent:
  P16B changes Snapshot creation, Anchors, and Versions navigation, and does not
  redefine the terminal transitions themselves.
- **Decided:** 2026-08-07 by
  [Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md)
- **Corrected 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md),
  on a premise rather than on the disposition.** "Both are performed routinely by
  the shipped Application" is **false**, and the three cited producer lines are
  unreachable. `commandForAction` (`apps/neoflow/src/reviewingModel.ts:2264`) has
  exactly one caller, `executeProjectedAction` (`:2252`), which has exactly two
  callers — `:1777` and `:1821` — **both passing the literal
  `'review.current-changes.start'`**. So the `review.complete` (`:2301`),
  `review.cancel` (`:2309`), `review.question.disposition.*` (`:2284`) and
  `review.question-batch.commit` (`:2275`) arms are never entered. A second and
  independent gate says the same: the projection's `reviewActions` and
  `questionActions` (`packages/workspace/src/projection.ts:1054`, `:1062`) are
  **stubs returning `[]`** with every parameter unused, so `manifest.actions` and
  every question item's `actions` are always empty and `directAction` would find
  nothing even if a keybinding asked. Only the diff view's `actions` are populated,
  which is why `review.question.ask` works and why every test asserting on
  `.actions` reads that one surface and stays green.
  **This is not a defect and not a new finding.** **P16** was *amended* to "natural
  follow-up **without disposition or Finish ceremony**"
  ([Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md)),
  so the unreachable arms are that amendment implemented; `Finish review` remains
  step 7 of the chosen slice
  ([Choose the first dogfoodable vertical slice](../../.issues/WF-047-choose-first-dogfood-slice.md)).
  **Disposition, rank and pull-forward are unaffected** — the prescribed scenarios
  drive the Workspace directly, which is the layer that does the work — and the
  finding is if anything strengthened: no Application path exercises these
  transitions either. The error is this ledger's recurring one seen one level up:
  **A-05**'s method says count reachability from producers, and this finding counted
  producers without asking whether the producers are themselves reachable.
  **Obligation on P16C:** both stubs are unmarked, and that silence is what let a
  false premise into a settled finding — give each a one-line comment naming the
  amended P16 gate.

### `packages/workspace`

#### W-01 — `#snapshotEvidenceIdentities` grows without bound

- **Module / file:** Workspace — `packages/workspace/src/projection.ts:1112`,
  written at `:1359`, read at `:1337`
- **Category:** performance
- **Severity:** low now, medium once Live Changes lands
- **Evidence:** The map has exactly two operations across the whole file — a
  `get` at `:1337` and a `set` at `:1359`. There is no `delete`, no `clear`, and
  no size check, unlike all three sibling caches in the same class, which are
  all bounded: `#captures` is capped at 2 with FIFO eviction
  (`workspaceEvidence.ts:2140`, `:2165`), `#searchIndexes` is capped at 4
  (`projection.ts:2013`), and `#snapshotStatusReads` is both cleared on
  `publishCommittedVersion` (`:1163`) and deleted per entry on settle (`:1314`).
  So one entry — two identity strings — accumulates for every distinct
  `reviewSnapshotIdentity` that ever verified as current through the
  full-capture fallback, and nothing ever removes it for the life of the
  process.
  This is a growth problem only, not a correctness one: a hint whose evidence is
  no longer retained is detected at `:1344` and falls through to a full capture,
  so a stale entry degrades gracefully.
  The severity rises with **P16B**. Live Changes creates a successor Snapshot on
  every source change during a Review, so the number of distinct snapshot
  identities a long-lived process sees stops being roughly "one per Review" and
  becomes "one per edit".
- **Disposition:** fixed — give the map a bound and an eviction rule, copying
  whichever of the three sibling caches fits. The proposal is ratified
  unchanged: the growth is real, the sibling caches settle the pattern without
  inventing one, and a hint whose entry has been evicted already degrades
  gracefully at `:1344`, so the bound costs no correctness.
- **Rank:** Workspace / first — it is pulled ahead, so it heads the package by
  construction.
- **Pulled ahead:** before P16B — this is the ordering claim the ledger's
  Summary already made and it survives scrutiny. P16B changes the arrival rate
  of distinct snapshot identities from roughly one per Review to one per edit,
  so the same unbounded map costs far more afterwards, while the repair itself
  gets no easier for waiting.
- **Decided:** 2026-08-07 by
  [Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md)

#### W-02 — Capture eviction loop duplicated verbatim

- **Module / file:** Workspace — `packages/workspace/src/workspaceEvidence.ts:2139`–`:2143`
  and `:2164`–`:2168`
- **Category:** duplication
- **Severity:** low
- **Evidence:** The same five-line FIFO eviction — `set`, then
  `while (this.#captures.size > 2)` deleting the oldest key — appears twice,
  character for character, in two adjacent capture paths. The bound `2` is a
  bare literal in both, so the two copies can drift apart silently.
- **Re-verified 2026-08-07** by the disposition pass. **The evidence held exactly**,
  which on this ledger is worth stating rather than assuming: the two ranges are
  **byte-identical** (298 bytes each, six lines including the closing brace), and a
  sweep for size-bounded eviction across every active `src` tree finds these two and
  no others. The two writers are also the *only* two producers of `#captures` —
  `#capture` (`:2139`) and `#captureComparison` (`:2164`) — so a divergence between
  them is a divergence in the Map's whole retention rule.
- **Disposition:** fixed — hoist the bound to one named module constant and put the
  six lines behind one private helper. **The constant is the half the evidence
  supports**: two independent literals governing one Map, written by its only two
  producers, can drift silently and nothing mechanical would catch it. Extracting the
  helper is the tidiness half and rides along because it is free once the constant
  moves. **Not** a new `WorkspaceEvidenceLimits` field — that interface is exported
  and normalized (`:606`–`:621`), and nothing here argues the bound should be tunable.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-07 by [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md)

#### W-03 — No request has a deadline, and the worker is fully synchronous

- **Module / file:** Workspace — `packages/workspace/src/authoritativeState.ts:262`–`:286`
  (`#send`); `authoritativeStateWorker.ts:1918`–`:1947` (`handleRequest`)
- **Category:** durability
- **Severity:** medium
- **Evidence:** `#send` stores a `resolve`/`reject` pair in `#pending` and posts
  the message. There is no timer anywhere on either side of the port. The only
  events that can ever settle a pending request are a matching reply, a
  `worker.on('error')`, or a `worker.on('exit')` (`:225`–`:226`). Meanwhile
  `handleRequest` is entirely synchronous — `commit`, `read`, `readContent`, and
  `status` each run to completion on the worker thread with no yield — so one
  expensive commit blocks the thread and every later request simply sits in the
  port queue behind it.
  The consequence is not lost data: it is that a slow state operation is
  indistinguishable from a hung one, and no caller can time out, report
  progress, or give up. `PRAGMA synchronous = FULL` plus `fullfsync = ON`
  (`:265`–`:266`) makes a large commit genuinely slow on a slow disk, so this is
  reachable without any bug.
- **Re-verified 2026-08-07** by the disposition pass. **Every claim holds exactly,
  and this is the only finding in its ticket that needed no correction.**
  `setTimeout`, `setInterval`, and `setImmediate` each occur **zero** times in
  `authoritativeState.ts` and **zero** times in `authoritativeStateWorker.ts`, so
  "no timer anywhere on either side of the port" is literally true rather than
  approximately true. `handleRequest` (`:1918`–`:1947`) contains no `await` and no
  promise: `commit`, `read`, `readContent`, and `status` are called synchronously
  and their results sent inline. The three settling events are exactly as
  described (`:224`–`:226`), and `PRAGMA synchronous = FULL` with
  `PRAGMA fullfsync = ON` are both present in `configureWritableDatabase`, so the
  slow-commit premise is real — and on this machine a single full fsync measures
  ~4.9 ms, which is the unit that accumulates under a large commit.
- **Disposition:** fixed — a deadline per request, surfaced as a distinct error
  code, so the Application can say the store is not responding instead of waiting
  silently. Ratified unchanged. Bounding this also closes the "if a reply were ever
  lost" gap noted under the ruled-out request-ID lead.
- **Rank:** Workspace / first — structural rather than urgent. **W-04's entire
  subject, a slow startup that looks like a hang, is a special case of this one**,
  and a per-request deadline is the general mechanism for telling slow from stuck.
  Deciding it first means anything else in this area is scoped against a settled
  answer instead of inventing a second one. **P16B** also raises the commit rate —
  a successor Snapshot per source change rather than per Review — so the blocking
  worker is entered more often afterwards.
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### W-04 — Startup migration reports no progress outside tests

- **Module / file:** Workspace — `packages/workspace/src/authoritativeState.ts:344`–`:381`,
  `:74`–`:76`; `authoritativeStateWorker.ts:1949`–`:1952`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** `openAuthoritativeState` awaits a promise that settles only on
  `ready`, `startup-failed`, `error`, or `exit`, with no timeout. The worker
  emits `migration-checkpoint` messages and `openAuthoritativeState` forwards
  them — but only to `request.testControl?.onMigrationCheckpoint`, which
  production never supplies. `startDatabases()` runs synchronously *before*
  `send({ kind: 'ready' })`, so a large generation copy or a full
  `PRAGMA integrity_check` on a big store makes startup look like a hang with no
  signal available to the caller. The signal already exists; it is simply wired
  only to tests.
- **Re-verified 2026-08-07** by the disposition pass. **The observation holds and
  the repair does not. "The signal already exists; it is simply wired only to
  tests" is false in the one way that decides the fix.**
  - **The worker does not emit progress.** `migrationCheckpoint`
    (`authoritativeStateWorker.ts:375`–`:384`) is a **test failpoint-and-pause
    primitive**, not an emitter. It throws when `data.failpoint` matches, and it
    sends `migration-checkpoint` **only** when `data.pauseAtMigrationCheckpoint`
    matches that exact checkpoint — and then immediately parks the worker forever
    on `Atomics.wait(wait, 0, 0)` over a `SharedArrayBuffer` nobody ever notifies.
    Exposing "the checkpoints the worker already sends" would wire production to a
    message that is never sent; making it fire by removing the gate would **hang
    startup on every migration**. The repair is therefore to add a genuine
    send-and-continue progress emission distinct from the pause primitive — a real
    change to the worker protocol, not a rewiring.
  - **Both slow paths it names are inside the one-time legacy migration.** The
    "large generation copy" and the "full `PRAGMA integrity_check`" both live in
    `migrateGeneration`, which runs only when `formatVersion ===
    LEGACY_STORE_FORMAT_VERSION` (1). Ordinary startup goes through
    `openWritableGeneration`, which calls `validateGeneration(..., complete:
    false)` → `PRAGMA quick_check`, not `integrity_check`. **An ordinary start is
    not the slow case**, and all five checkpoints sit on the upgrade path.
  - **No released build has ever written a format-1 store**, because nothing has
    been released — `STORE_FORMAT_VERSION` is 2 and the only format-1 artefact in
    the repository is a test fixture.
  - The two claims that do hold: `openAuthoritativeState` really has no timeout,
    and `onMigrationCheckpoint` really is reachable only through
    `request.testControl`, which the sole production caller (`runtime.ts:126`)
    does not pass.
- **Disposition:** accepted — real, and deliberately left as it is. The map's rule
  is that a finding supported only by taste is `accepted` rather than `fixed`, and
  once the "signal already exists" claim is gone what remains is a worker-protocol
  addition to report progress during a one-time upgrade from a store format no
  released build has ever produced. The general problem — a slow state operation
  being indistinguishable from a stuck one — is **W-03**'s, is ruled `fixed`, and
  is ranked `first` partly for this reason. **This reopens** if the migration is
  ever pointed at real user data, which is a decision **P17**'s importer would make,
  not this one.
- **Rank:** n/a — accepted, so there is no work to order. **This is the ledger's
  first `accepted` ruling and it sets the format**: a `Rank` band orders work
  inside a package, and an accepted finding contributes none, so the line records
  that rather than asserting a position. Same reasoning as the Local Runtime pass's
  ruling that a single-finding package makes the band vacuous.
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### W-05 — Two startup failure paths leave the worker thread running

- **Module / file:** Workspace — `packages/workspace/src/authoritativeState.ts:364`–`:371`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** The `startup-failed` branch calls `void worker.terminate()`
  before rejecting (`:356`). The `onError` and `onExit` branches reject without
  terminating. `onExit` needs no terminate, but `onError` can fire for a thread
  that is still alive, and that thread is then unreferenced and never joined.
- **Re-verified 2026-08-07** by the disposition pass, by **running it rather than
  reasoning about it**. The code reads exactly as described — `startup-failed`
  terminates (`:356`), `onError` and `onExit` do not (`:364`–`:371`) — but **the
  hazard does not exist. `worker.on('error')` never fires for a thread that
  survives.**
  - Measured over three ways to raise `'error'`: an uncaught throw at worker top
    level, an uncaught throw from a timer, and an unhandled rejection. In the
    latter two the worker was deliberately held alive by a live `setInterval`.
  - **`'exit'` followed `'error'` in every case, within 0.25–0.49 ms.** Node
    terminates a worker on an uncaught exception; `'error'` is emitted *because*
    the thread is dying, not while it lives. There is no unreferenced thread and
    nothing to join.
  - `cleanup()` removes the `'exit'` listener inside `onError`, so the exit goes
    **unobserved** — but unobserved is not un-happened, and that distinction is the
    whole of the finding's claimed cost.
  - The `startup-failed` path's `terminate()` is itself redundant for the same
    reason: the worker calls `closeDatabases()` then `port.close()` before exiting
    on its own.
- **Disposition:** accepted — the asymmetry between the three branches is real and
  the consolidation is still three lines, but with the leak disproved **nothing but
  symmetry argues for it**, and the map's evidence rule sends a taste-only
  improvement to `accepted` rather than `fixed`. Recorded so the same reading is not
  made twice: the code looks like a resource leak and measurably is not.
- **Rank:** n/a — accepted, so there is no work to order.
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### W-06 — Atomic-rename durability is applied at three different strengths

- **Module / file:** Workspace — `packages/workspace/src/workspaceIdentity.ts:1002`–`:1018`
  (`writeRegistry`); Application — `apps/neoflow/src/userConfiguration.ts:475`–`:480`;
  compare Workspace — `authoritativeStateWorker.ts:233`–`:236`, `:426`–`:428`,
  `:1136`–`:1142`
- **Category:** durability
- **Severity:** medium for the registry, low for User Configuration
- **Evidence:** Three write-temp-then-rename paths, three different levels of
  care:
  1. `authoritativeStateWorker.ts` is fully correct — `fsyncPath` on the file
     *and* on the containing directory after the rename (`:426` then `:428`,
     `:1136` then `:1142`). This is the pattern the other two should match.
  2. `writeRegistry` syncs the temporary file (`:1014`) but never syncs the
     containing directory after `rename` (`:1017`). The bytes are durable; the
     *directory entry naming them* is not. A crash immediately after `rename`
     returns can therefore lose the rename and leave the previous registry
     content in place — and this file is the Workspace Identity registry, so
     what is lost is a durable identity registration.
  3. `userConfiguration.ts` performs no sync at all — plain `fs.writeFile`
     followed by `fs.rename`, with neither file nor directory flushed.
  Only case 2 is a genuine mismatch with the data's importance. Case 3 is
  defensible: `CONTEXT.md` defines User Configuration as presentation
  preferences carrying no workflow state, credentials, or history, so losing the
  most recent pane resize to a power cut costs nothing.
  Secondary nit on the same path: `userConfiguration.ts:484` runs
  `fs.access(R_OK | W_OK)` *after* the rename and turns a failure into
  `status: 'rejected'`, so an unusual permission state can report a save as
  rejected when the write actually succeeded and will be visible on next start.
- **Open question answered 2026-08-07 — the target strength is decided, and the
  cost nobody had priced is now measured rather than asserted.** All three code
  descriptions verified exact.
  - **Target strength: case 1.** `fsync` the file, rename, then `fsync` the
    containing directory. `writeRegistry` levels **up** to it. Levelling down was
    never a candidate once the cost of levelling up turned out to be nil.
  - **Priced on this machine's APFS, 200 writes each, on both the home volume and
    `/tmp`:** no sync 0.372 ms/write, file sync only 4.866 ms, file + directory
    sync 9.758 ms. **The directory `fsync` this finding asks for costs ~4.9 ms**
    (2.0×). That the number is milliseconds and not microseconds is itself
    evidence the sync is doing real work rather than being a no-op on this
    platform, so case 1 earns its "fully correct" label here.
  - **For `writeRegistry` that cost is nil in practice.** It has exactly one
    caller (`:1255`), inside workspace-identity bootstrap, and it is guarded by
    `if (updatedRegistry !== registry)` (`:1254`). So it runs **at most once per
    process start, and not at all on a repeat start whose registration is
    unchanged**. ~5 ms once, sometimes, to make a durable identity registration
    survive a crash after `rename` returns. There is no cost argument against it.
  - **For `userConfiguration.ts` the `accepted` ruling holds, now on a number.**
    Levelling it to case 2 costs 13× per save and to case 1 costs 26×, for data
    `CONTEXT.md` defines as presentation preferences carrying no workflow state,
    credentials, or history.
  - **One correction to the cost side, which strengthens the same conclusion:** it
    is **not** "every pane resize". Saves are debounced 100 ms and serialised
    through a promise chain (`reviewingApplication.ts:356`–`:387`), so the write
    rate is bounded near 10/s during a sustained drag no matter how many resize
    events fire. At 9.758 ms a case-1 save would consume ~10% of that interval —
    survivable, and still unjustified by the data.
- **Disposition:** fixed for `writeRegistry` — add the directory sync after
  `rename`, matching `authoritativeStateWorker.ts`. **Also fixed, separately:** the
  post-rename `fs.access` at `userConfiguration.ts:484`, because a permission
  quirk there makes the Application tell the user "Layout was not saved"
  (`reviewingApplication.ts:376`) about a save that succeeded and will be visible
  on next start — a false statement to the user, independent of the fsync question
  and a two-line fix. **Accepted for `userConfiguration.ts`'s missing syncs**, with
  the measured reason above.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

#### W-07 — `git` stdin has no error listener, so the output-limit path can crash the process

- **Module / file:** Workspace — `packages/workspace/src/workspaceEvidence.ts:646`–`:691`
  (`runGit`), reached from `inspectGitObjects` (`:1283`–`:1286`) and
  `readGitObjects` (`:1330`–`:1333`)
- **Category:** correctness
- **Severity:** high
- **Evidence:** `runGit` writes the whole request to the child in one call —
  `child.stdin.end(options.stdin)` (`:690`) — and installs an error listener on
  the *child process* (`:657`) but **none on `child.stdin`**. A grep of the whole
  active source finds no `stdin.on`/`stdin.once` anywhere, and no
  `process.on('uncaughtException')` handler either, so an `'error'` event on that
  stream is unhandled and terminates the process.
  The reachable trigger is the module's own degradation path. When stdout exceeds
  `maxStdoutBytes`, the handler sets `overLimit` and calls
  `child.kill('SIGKILL')` (`:660`–`:663`). Both callers pass a stdin buffer of
  `objectIds.length × ~41` bytes; once that exceeds the OS pipe buffer (64 KiB on
  Linux, i.e. roughly 1,600 object ids) the `end()` write is still draining when
  the kill lands, and writing to a killed child's pipe raises `EPIPE` on
  `child.stdin`.
  So the conditions are: many objects **and** output over the cap — which is
  exactly a large repository, exactly the case the byte caps exist to degrade
  gracefully. Instead of the intended `GitInspectionError('git-output-limit')`,
  the process dies. Nothing in the current suite covers it: there is no
  large-repository test, and P19 still owns that matrix.
  **Checkpoint judgment:** this does **not** make the pushed source unsafe to
  keep as the checkpoint. The crash happens during read-only Git inspection with
  no durable write in flight, Authoritative State is untouched, and recovery from
  process death is already proven by the dogfood probe. It is a defect to fix in
  **P16C**, not a reason to unwind the Gate B promotion.
- **Re-verified 2026-08-07** by the disposition pass, which **reproduced the crash**
  rather than ratifying the argument. The defect, the severity, and the disposition
  all survive. **The trigger does not**, and neither does the coverage claim.
  - **The crash is real, and measured.** A standalone harness mirroring `runGit`
    exactly — error listener on the child, none on `child.stdin` — dies with
    `Error: write EPIPE … Unhandled 'error' event` and exit code 1 on Node 26.5.1,
    macOS. This is no longer an inference from the absence of a listener.
  - **The 64 KiB threshold is exactly right, and holds on macOS too.** Sweeping the
    stdin size: 1,590 object ids (65,190 bytes) survives, 1,600 (65,600 bytes)
    crashes. The finding's "64 KiB … roughly 1,600 object ids" is confirmed to the
    id, and the Linux figure it cites turns out not to be Linux-specific.
  - **The stated trigger cannot fire at either call site.** The finding names the
    module's own output-limit path (`SIGKILL` mid-write), but both stdin-passing
    callers budget `256` stdout bytes per object, and the real output was measured at
    **49 bytes/object** for `cat-file --batch-check` and **50 bytes/object of overhead
    beyond content** for `cat-file --batch`. `readGitObjects`'s cap is
    `maximumBytes + n × 256`, and `maximumBytes` is not an estimate: `planCapture`
    (`:1763`–`:1796`) admits sides only while their exact `byteLength` fits the
    remaining budget, and `captureOldSides`/`captureCommitSides` sum those same
    lengths (`:1810`, `:1843`). So the cap sits roughly **5× above** the output it
    bounds, and `overLimit` never becomes true on the two paths that pass stdin.
  - **The reachable trigger is any early `git` exit while a large stdin drains** —
    reproduced against a non-repository checkout (`fatal: not a git repository`,
    exit 128), same unhandled `EPIPE`, same process death. That matters because it is
    precisely the case `#capture`'s retry loop (`:2126`) exists to survive: a checkout
    that moves or is replaced mid-capture. Instead of retrying, the process dies.
  - **The coverage claim is right for the wrong reason.** The finding says "there is
    no large-repository test". There is — `workspaceEvidence.test.ts:611` captures
    1,000 files and 50 MiB. It does not cover this defect because its 1,000 files are
    **untracked**, so every side is read from the working tree and none becomes
    `cat-file` stdin. Conclusion intact; stated reason false.
- **Disposition:** fixed — attach an `'error'` listener to `child.stdin`. **The
  parenthetical half of the proposal is withdrawn**: "stop killing before the write
  settles" was scoped to a trigger that cannot fire here, and the kill path needs no
  change. Two constraints on the regression test, because the obvious one does not
  reproduce: it needs **≥1,600 object ids** — roughly 800 changed *tracked* files in a
  commit-to-commit comparison, not a large working tree — **and** a forced early `git`
  exit. A test built from the existing 1,000-file fixture would pass against the
  unfixed code.
- **Rank:** Workspace / first — the ledger's only high finding, now reproduced rather
  than argued, and the repair is a few lines whose correctness depends on no other
  decision on this map.
- **Decided:** 2026-08-07 by [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md)

#### W-08 — Captured `git` stderr is zero-padded, and then never read

- **Module / file:** Workspace — `packages/workspace/src/workspaceEvidence.ts:652`,
  `:667`–`:670`, `:684`; `:568`–`:572` (`ProcessResult`)
- **Category:** correctness
- **Severity:** low
- **Evidence:** Two defects on the same dead field.
  1. The truncation is off. Chunks are appended only while
     `stderrBytes <= 64 * 1024`, but `stderrBytes` has *already* been incremented
     by the chunk being tested, so a chunk straddling the cap is dropped while
     still counted. `Buffer.concat(stderr, Math.min(stderrBytes, 64 * 1024))`
     (`:684`) then asks for more bytes than the retained chunks contain, and
     `Buffer.concat` **zero-pads** the shortfall. A 60 KiB write followed by a
     10 KiB write yields 60 KiB of real stderr plus 5,536 NUL bytes.
  2. It does not matter, because nothing reads it. The only reference to
     `.stderr` in the entire file is the collector at `:667`; `ProcessResult`
     declares the field and no consumer ever touches it.
  The more useful half of this is what (2) implies: when git fails, `runGit`
  rejects with a bare `GitInspectionError('git-inspection-failed')` (`:679`) and
  **discards the stderr it just spent effort collecting**. Every git failure is
  therefore unexplainable from the error alone — which will cost real time during
  P16C and P19.
- **Re-verified 2026-08-07** by the disposition pass, which executed the arithmetic
  rather than reading it. **Both defects hold; the worked example does not, and a
  third outcome was missed.**
  - **The dead-field claim is exact.** `ProcessResult` appears three times in the
    package — its declaration (`:568`), `runGit`'s return type (`:644`), and the
    promise type (`:645`) — and `.stderr` appears only in the collector and the
    assignment. There is no consumer anywhere in `packages/workspace`.
  - **The padding is real; the number is wrong.** Running the exact code from `:667`
    and `:684`, a 60 KiB write followed by a 10 KiB write retains 61,440 bytes, asks
    `Buffer.concat` for 65,536, and yields **4,096** NUL bytes — not 5,536. The
    finding's figure mixes a decimal 60,000 with the binary `64 * 1024` cap; read
    consistently in KiB it is 4,096.
  - **A third outcome the finding does not name.** If the *first* chunk alone exceeds
    the cap, nothing is retained, and `Buffer.concat([], 65536)` returns an **empty**
    buffer — Node ignores `totalLength` for an empty list — so the result is total
    loss rather than padding. Recorded for completeness, **not** claimed reachable: a
    single pipe read will not exceed 64 KiB, so reaching it needs a first chunk larger
    than any the OS will deliver.
- **Disposition:** fixed — attach the captured stderr to
  `GitInspectionError('git-inspection-failed')` (`:679`) and drop the padding
  arithmetic. **The evidence rule picks the branch**: "stop collecting it" is what the
  padding bug alone argues for, but the second defect carries the only consequence
  with a named future cost — every `git` failure is currently unexplainable from the
  error, during exactly the packages (**P16C**, **P19**) that will be reading these
  errors. So the collection stays and finally gains a consumer.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-07 by [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md)

#### W-09 — `runGit` has no timeout

- **Module / file:** Workspace — `packages/workspace/src/workspaceEvidence.ts:645`–`:691`
- **Category:** durability
- **Severity:** low
- **Evidence:** The promise settles only on `close` or on the child's `error`
  event. There is no timer and no `AbortSignal`, so a `git` process that never
  exits leaves the caller waiting forever. The environment is well hardened
  against the usual causes — `processEnvironment` (`:624`–`:634`) sets
  `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`,
  `GIT_PAGER=cat`, and `LANG`/`LC_ALL=C` — which is why this is low rather than
  medium: the realistic hang causes are already closed off. It is the same
  missing-deadline shape as **W-03** and should be settled with it as one policy
  rather than twice.
- **Re-verified 2026-08-07** by the disposition pass. **The absence is exact** — no
  `setTimeout`, `clearTimeout`, `AbortSignal`, `AbortController`, or `signal:` occurs
  anywhere in `workspaceEvidence.ts`, so the promise really can settle only on `close`
  or the child's `error`.
- **Disposition:** fixed — a deadline on `runGit`, surfaced as a distinct
  `GitInspectionError` reason, repaired **inside W-07's edit**. The ticket asked
  whether this is one repair with **W-07** or one policy with **W-03**; it is the
  former. **W-07** and this are the same function and the same promise, so a fixer
  attaching the `stdin` error listener is already holding every line the timer needs.
  **W-03** is a different mechanism entirely — a worker-thread message port with no
  child process — and shares no implementation with this, only an error *vocabulary*.
  Settling the two "as one policy" would couple this ticket to
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md),
  which is the coupling the split existed to prevent. **Coordination, not
  dependency:** whatever distinct code **W-03** chooses for "the store is not
  responding", this deadline should reuse its shape rather than invent a second
  vocabulary for the same idea. Neither decision waits on the other.
- **Rank:** Workspace / first — **not** on its own severity, which is genuinely low
  and stays low. It ranks with **W-07** because it is repaired in **W-07**'s edit, and
  scheduling it as ordinary work would open `runGit` a second time for three lines.
- **Decided:** 2026-08-07 by [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md)

#### W-10 — `sameDiffLine` copies both lines on every LCS comparison

- **Module / file:** Workspace — `packages/workspace/src/reviewing.ts:1397`–`:1399`,
  called from `:1478`, `:1492`, `:1579`, `:1587`
- **Category:** performance
- **Severity:** medium
- **Evidence:** `sameDiffLine` is
  `Buffer.from(left.bytes).equals(Buffer.from(right.bytes))`, and
  `Buffer.from(uint8Array)` **copies**. The call at `:1478` is the LCS matrix
  fill — the O(oldLines × newLines) inner loop — which `MAX_LCS_CELLS` permits to
  run to 4,000,000 iterations. That is up to **8 million short-lived buffer
  allocations for a single file's diff**, purely to compare bytes that are
  already in memory. The same helper is then used again in the backtrack (`:1492`)
  and the prefix/suffix trim (`:1579`, `:1587`).
  This is on the path the user waits on: HANDOFF records that Diff rendering
  responsiveness already failed a human gate once and was brought from ~18.7 s to
  ~8.4 s. This allocation churn is in the part that remains.
- **Re-verified 2026-08-07** by the disposition pass, which **benchmarked the two
  proposed fixes instead of ratifying them**. Every claim of fact holds. **The
  proposal does not**: it offers two repairs as interchangeable and they differ by
  4–11×.
  - **Every count is exact.** `sameDiffLine` is at `:1397`–`:1399` and is called
    from `:1478`, `:1492`, `:1579`, `:1587` — four sites, confirmed.
    `MAX_LCS_CELLS` is `4_000_000` (`:503`) and the guard at `:1445` is
    `(oldLines.length + 1) * (newLines.length + 1) > MAX_LCS_CELLS`, so a 2,000 ×
    2,000 line comparison sits exactly at the cap and runs 4,000,000 iterations —
    8,000,000 `Buffer.from` copies, as stated.
  - **Measured at the cap** (2,000 × 2,000, 40-byte lines, Node 26.5.1, macOS),
    mixed line lengths: current `Buffer.from` ×2 **422 ms**; the proposed
    `Buffer.from(buffer, byteOffset, byteLength)` view **381 ms** (**1.11×**);
    direct `Uint8Array` comparison with a length precheck **34 ms** (**12.4×**,
    and zero heap delta against 2.1 MiB).
  - **Worst case, where the length precheck cannot short-circuit** (all lines the
    same length, differing in the final byte): 395 ms / 351 ms (**1.13×**) / 92 ms
    (**4.3×**). The ordering is robust; only the margin moves.
  - **So the cost is Buffer *object construction*, not the byte copy.** The view
    still allocates 8,000,000 Buffer objects and recovers ~11% of the available
    win. A fixer taking the finding's second option — the more surgical-sounding
    one, and the one it describes in most detail — would capture **a tenth of the
    win and conclude the finding was overstated.**
  - **The line's own `digest` cannot be used as a shortcut.** `DiffLineSlice`
    carries `digest` (`:1360`), but `diffLines` (`:1368`) takes one digest
    parameter for the whole side and stamps every line with it — at `:1570`/`:1574`
    it is `contentIdentity.value`, the *file's* identity. Comparing digests would
    compare files, not lines. Recorded because it is the obvious optimisation and
    it is wrong.
- **Disposition:** fixed — compare the `Uint8Array`s directly, with a
  `byteLength` precheck before the byte loop. **The `Buffer.from(buffer,
  byteOffset, byteLength)` alternative is withdrawn from the proposal**: it is
  measurably close to no change at all, and leaving it in the ledger as an equal
  option is how the repair gets made without the benefit.
- **Rank:** Workspace / first — a measured 4–12× on the path HANDOFF records as
  having already failed a human gate once, and the repair is three lines that
  depend on no other decision on this map.
- **Pulled ahead:** before P16B — **P16B does not rewrite this code; it re-runs
  it.** Live Changes is a continuously updated projection driven by invalidation
  hints, so it multiplies how often this loop executes while changing nothing
  about it. P16C, which owns the Workspace repairs, depends on P16B, so without a
  pull-forward Live Changes ships continuous re-diffing over the unfixed path.
- **Decided:** 2026-08-07 by [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md)

#### W-11 — The per-file diff row limit is checked only after every row is built

- **Module / file:** Workspace — `packages/workspace/src/reviewing.ts:1632`–`:1636`,
  bound at `:502`
- **Category:** performance
- **Severity:** medium
- **Evidence:** `MAX_DIFF_ROWS_PER_FILE` is 250,000, and the check is
  `if (rows.length > MAX_DIFF_ROWS_PER_FILE)` placed *after* the whole `rows`
  array has been constructed — it then returns
  `{ status: 'unavailable', reason: 'comparison-limit' }, rows: []` and throws the
  array away. So the limit protects the *consumer* from a huge payload but does
  nothing for the producer: peak memory is already at full size before the
  rejection, which is the opposite of what a bound is for.
  A precheck is available: the row count cannot exceed
  `oldLines.length + newLines.length` plus context, and both are known before the
  build starts.
- **Re-verified 2026-08-07** by the disposition pass, which tested the limit's
  reachability and the proposed precheck's arithmetic. **Both hold, and the
  finding understates its own cost.**
  - **The limit is reachable, by the branch the finding does not mention.**
    `MAX_DIFF_ROWS_PER_FILE` is `250_000` (`:502`) and the check at `:1632` is
    after the build, as stated. Reaching it needs `oldLines + newLines > 250,000`,
    and captured content is capped at `maxCapturedContentBytes = 50 * MEBIBYTE`
    (`workspaceEvidence.ts:14`) — roughly 210 bytes per line at the threshold, so
    ordinary source clears it. At that size the LCS guard at `:1445` has already
    failed, so the rows come from the fallback at `:1447`–`:1469`, which pushes
    every old line as a deletion and every new line as an addition. **The limit is
    reached precisely when the LCS is skipped**, which is the opposite of where a
    reader would look.
  - **The proposed precheck is sound, and tighter than proposed.** The finding
    says the row count "cannot exceed `oldLines.length + newLines.length` plus
    context". There is no plus: a context row consumes one line from *each* side
    and emits one row, so context makes the total strictly smaller. Prefix
    (`:1596`), middle (`:1610`), and suffix (`:1617`) together are bounded by
    `oldLines.length + newLines.length` exactly, and both counts are known before
    the build starts. The precheck is simpler than the finding claims.
  - **The waste is CPU, not only memory.** Every discarded row was built by
    `projectedDiffRow` (`:1401`), which computes a **`sha256` per row** for its
    `rowIdentity` (`:1410`–`:1422`). Tripping the limit therefore burns 250,000+
    digests and 250,000+ objects and throws all of it away. "Peak memory is
    already at full size" is true and is the smaller half.
- **Disposition:** fixed — reject from `oldLines.length + newLines.length` before
  building, keeping the same `comparison-limit` outcome. No context term is
  needed in the precheck.
- **Rank:** Workspace / normal — the repair is small and the reasoning is settled,
  but the trigger needs a single file above ~250,000 lines, which is rarer than
  **W-10**'s, so it does not earn the band ahead.
- **Note for P16B, not an obligation:** Live Changes re-runs this builder on every
  invalidation hint, so a repository containing one such file pays the discarded
  build repeatedly rather than once. This raises the value of the repair; it does
  not change its disposition, and P16B rewrites none of this code.
- **Decided:** 2026-08-07 by [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md)

#### W-12 — The `bytesBase64` codec is hand-rolled at ~20 sites, and validated at one

- **Module / file:** Workspace — `projection.ts:723`, `:963`, `:976`, `:1845`,
  `:2399`; `reviewing.ts:1909`, `:2032`; `workspaceEvidence.ts:1508`, `:2382`;
  `authoritativeStateWorker.ts:213`, `:216`;
  `harness-interaction/harnessInteraction.ts:1211`–`:1213`, `:2291`; Application —
  `reviewingApplication.ts:1095`, `:1141`; `reviewingView.ts:489`, `:546`, `:707`,
  `:730`
- **Category:** duplication
- **Severity:** low
- **Evidence:** The `bytesBase64` wire shape is encoded and decoded by hand at
  roughly twenty call sites across six files and two packages, with no shared
  codec — every one spells out `Buffer.from(x.bytesBase64, 'base64')` or
  `bytes.toString('base64')` inline.
  The asymmetry is the interesting part: exactly one site,
  `harnessInteraction.ts:1211`–`:1213`, checks that the encoding is **canonical**
  by re-encoding and comparing
  (`bytes.toString('base64') === anchor.lineContent.bytesBase64`). The other
  decode sites accept any accepted-by-`Buffer` variant without noticing. That one
  guarded site is the one that matters today — it protects exact Anchor line
  content, where two spellings of the same bytes must not be treated as different
  — so this is duplication and inconsistency rather than a live defect.
- **Re-verified 2026-08-07** by the disposition pass, which enumerated the codec
  sites rather than accepting the count. **The approximate count survives; the
  specific list does not** — and the list is what a sweep-shaped fix is worked
  from.
  - **The asymmetry claim holds exactly.** Sweeping active source for a
    re-encode-and-compare, `harnessInteraction.ts:1213` is the **only** site that
    validates canonical encoding. Confirmed as the whole of it.
  - **"Roughly twenty" is right: 21.** But they sit in **seven** files, not six.
  - **Two named sites are not this codec.** `authoritativeStateWorker.ts:213` and
    `:216` are `Buffer.from(record.payload).toString('base64')` inside a checksum
    canonicalization (`:206`–`:218`); no `bytesBase64` field is involved, and they
    have no canonical-form obligation. Converting them would be a change to a
    durable checksum's input for no reason.
  - **Three real sites are missing:** `reviewingModel.ts:320`,
    `reviewingView.ts:734`, and `reviewingView.ts:1414` — the finding names four
    `reviewingView` sites where there are six, and names `reviewingModel` not at
    all.
  - **Net:** of 19 line references, 17 are correct, 2 belong to something else,
    and 3 are absent. Same shape as **W-14**'s error last session — the proposed
    fix's scope is narrower than the finding's own subject — and the same
    consequence: a fixer working the list leaves three sites hand-rolled while
    editing two that should not be touched.
- **Disposition:** fixed — one encode/decode pair owning the canonical form, so
  validation is the default rather than one site's special care, applied to **the
  21 sites enumerated above** rather than the finding's original list. The two
  `authoritativeStateWorker.ts` sites are explicitly **out of scope** for this
  repair.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-07 by [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md)

#### W-13 — Validation and digest helpers are copied across modules, and two `sha256`s disagree

- **Module / file:** `isRecord` in `reviewing.ts`,
  `harness-interaction/harnessInteraction.ts`, `local-runtime/src/lifecycle.ts`,
  `local-runtime/src/protocol.ts`, `apps/neoflow/src/userConfiguration.ts` (5
  copies); `hasOnlyKeys` in the first four of those (4 copies); `deepFreeze` in
  `projection.ts`, `reviewing.ts`, `workspaceEvidence.ts`,
  `harnessInteraction.ts` (4 copies, all inside one package); `validText` in
  `authoritativeState.ts` and `authoritativeStateWorker.ts`; `sha256` in
  `reviewing.ts:515`, `workspaceEvidence.ts:578`, `harnessInteraction.ts:272`,
  and `pi-adapter/src/piAdapter.ts:94`
- **Category:** duplication, correctness
- **Severity:** medium for semantic validation; low for helper duplication and
  digest behavior. The digest hazard moved down on 2026-08-07 when its stated
  silent call failed to compile; the validation half moved to medium on 2026-08-09
  when a malformed durable Snapshot passed its parser.
- **Evidence:** Five small helpers are re-declared per module rather than shared —
  most strikingly `deepFreeze`, which exists four times *within a single package*.
  Most of this is harmless boilerplate.
  The hazard is `sha256`. Three of the four copies are byte-identical
  (`createHash('sha256').update(value).digest('hex')`), but the fourth,
  `piAdapter.ts:94`, is **a different function wearing the same name**: it takes
  `...parts` and appends `'\0'` after each one, so `sha256('abc')` differs
  between the two packages.
  Neither is wrong today. Workspace gets its separator discipline one level up
  instead, in `stableIdentity` (`harnessInteraction.ts:277`) and
  `reviewingRecordIdentity` (`reviewing.ts`), both of which prefix a domain tag
  and join with `\0` — so there is no identity-collision bug in either package,
  and no value is digested in one and verified in the other.
  The risk is what happens next. `createHash().update(value)` silently ignores
  extra arguments, so if an identity builder is ever moved from Pi Adapter into
  Workspace, `sha256(a, b)` keeps compiling and quietly digests only `a` —
  collapsing distinct inputs to one identity with no error. Two functions sharing
  a name while disagreeing on arity is the whole hazard.
- **Re-verified 2026-08-07** by the disposition pass, which compiled the hazard
  instead of reasoning about it. **Every count is correct — the first finding in
  this ledger whose completeness claims all survive intact. The mechanism is
  not**, and correcting it changes what the repair has to be.
  - **All five copy counts hold exactly**, enumerated across active source:
    `isRecord` 5 (`userConfiguration.ts:89`, `lifecycle.ts:134`,
    `protocol.ts:197`, `harnessInteraction.ts:312`, `reviewing.ts:564`);
    `hasOnlyKeys` 4; `deepFreeze` 4, all inside the Workspace; `validText` 2;
    `sha256` 4. The arity disagreement is real — `piAdapter.ts:94` is
    `(...parts: readonly string[])` against the Workspace's
    `(value: string | Uint8Array)`.
  - **The collapse is real at runtime.** Under the unary Workspace `sha256`,
    `('user','admin')`, `('user','guest')` and `('user','anonymous')` produce
    **one** digest for three distinct inputs, because `update(data, inputEncoding)`
    reads the second argument as an encoding and discards it. `update('a','b')`
    and `update('a')` are byte-identical. Confirmed.
  - **But the call the finding describes does not compile.** `sha256(a, b)`
    against the Workspace signature is `error TS2554: Expected 1 arguments, but
    got 2` — `tsc --strict` exits 2. So "`sha256(a, b)` keeps compiling and
    quietly digests only `a`" is **false**, and with it the *silence* that made
    this a medium-severity hazard rather than a naming collision.
  - **The silent path exists, and it is a different one.** A unary function
    satisfies a variadic type, so `const d: (...parts: readonly string[]) => string
    = sha256` and passing `sha256` as a callback to anything expecting the Pi
    contract both compile clean (`tsc --strict`, exit 0) and silently drop every
    argument after the first. The hazard is **not** the direct call the finding
    names; it is that the Workspace `sha256` *satisfies the Pi Adapter's contract
    while not honouring it*.
  - **That constrains the fix.** A variadic multi-part helper would still be
    satisfiable by a unary function and would leave the silent path open. The
    shared helper's multi-part form must take an **array** parameter, not
    varargs.
  - **One wording correction:** the three Workspace copies are semantically
    identical but not "byte-identical" — `workspaceEvidence.ts:578` names its
    parameter `bytes` and orders the union `Uint8Array | string`. Immaterial.
  - **Severity corrected to low throughout.** "Low, with one medium-severity
    hazard" rested on the silent direct call, which does not exist. The surviving
    hazard is narrower and needs a seam to be written before it can fire.
- **Amended 2026-08-07** by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md):
  one of the five `isRecord` copies is **already exported and already unused as an
  export** — `packages/local-runtime/src/protocol.ts:197` publishes it, and
  `packages/local-runtime/src/lifecycle.ts:134` declares its own copy in the *same
  package* without importing `protocol.js` at all. So the consolidation this finding
  proposes has a home that exists today rather than one that needs inventing, and at
  least one copy can go without any new shared module. That lowers the cost of the
  `accepted` half enough to be worth re-weighing at disposition. (The count of five
  active-source copies is correct; four further copies live in legacy packages.)
- **The amendment's claim was tested and holds.** `protocol.ts:197` exports
  `isRecord`; `lifecycle.ts` uses its own copy at `:134` (referenced `:164`,
  `:185`) and **never imports `protocol.js` at all**; `index.ts` does not re-export
  the protocol surface. So the export has no cross-module consumer today.
- **Reopened 2026-08-09 by
  [Replace repeated isRecord validation with owner-local codecs](../../.issues/WF-078-revisit-active-input-codecs.md),
  after the owner challenged both the repeated predicate and the manual decoder
  pattern. The earlier "no defect" premise is now false.**
  - Active source contains five exact definitions participating in 95 calls. The
    five files expose 38 parser/normalizer functions and contain 49
    `as unknown as` casts; Workspace also has analogous object guards with different
    return conventions.
  - On Node 26.5.1, the current compiled `parseReviewSnapshot` accepted a payload
    with valid outer identities and `basis: {}`, `comparedState: {}`, and
    `manifest: {}`, returning it as `ReviewSnapshotPayload`. Those nested fields
    have required structure and are dereferenced downstream. A non-array-object
    check plus a whole-object cast therefore reports malformed durable state as a
    trusted type.
  - The defect is medium: semantic validation is bypassed and malformed state
    reaches workflow logic, but the probe did not establish durable mutation, data
    loss, or a false truth-critical status.
- **Disposition:** fixed for `sha256` and semantic validation; accepted for the
  unrelated consolidation.
  - **`sha256` — fixed.** One shared digest helper whose multi-part form takes an
    **array**, so the two contracts stop sharing a name *and* the unary form stops
    satisfying the variadic one. The array parameter is a requirement of the fix,
    not a style preference; varargs leaves the only surviving hazard open.
  - **Validation — fixed.** Each active package has at most one private structural
    object guard. Reviewing records, Harness Interaction records and inputs, Local
    Runtime frames, and User Configuration use owner-specific codecs that validate
    the complete structure they promise and construct compiler-checked results.
    `as unknown as T` cannot stand in for validation. Opaque semantic payloads stay
    opaque where the receiving Module does not own them, and malformed nested-value
    tests include the exact Snapshot case above.
  - **`deepFreeze` and `validText` — accepted.** No defect traces to their copies,
    and this ruling does not create a generic cross-package utility programme.
    Deletion-bound legacy validation remains untouched.
- **Rank:** Workspace / first — Live Changes changes the exact durable Snapshot
  family whose parser reproduced the defect; its compiler guard must exist before
  that rewrite. Local Runtime and Application execute their codec work in normal
  P16C package order.
- **Pulled ahead:** before P16B — otherwise whole-object casts continue compiling
  while P16B changes Snapshot lineage, Versions and Anchors, and codecs written
  afterwards can only describe what the rewrite happened to produce.
- **Pi Adapter inheritance, recorded here because no later ticket revisits it:**
  the Pi Adapter owns `piAdapter.ts:94` and must adopt the shared helper's
  array-form contract when it lands, since it is the copy whose semantics the
  shared helper has to preserve.
- **Unexplained observation, recorded not chased:**
  [Research unused-export and dead-code detection tooling](../../.issues/WF-063-research-unused-export-detection-tooling.md)
  measured knip's entire report across the four active roots as 13 type re-exports
  in `authoritativeState.ts`. `protocol.ts:197` is an export with no cross-module
  consumer and is not among them. The discrepancy was not investigated here and
  does not affect that ticket's adoption ruling; worth one probe if the tooling
  question is ever reopened.
- **Decided:** 2026-08-09 by
  [Replace repeated isRecord validation with owner-local codecs](../../.issues/WF-078-revisit-active-input-codecs.md),
  amending the 2026-08-07 ruling in
  [Disposition the Workspace reviewing and diff findings](../../.issues/WF-073-disposition-workspace-reviewing-and-diff-findings.md)

#### W-14 — `git` is resolved through `PATH`, which is what caps the supported Node range

- **Module / file:** Workspace — `packages/workspace/src/workspaceEvidence.ts:646`
  and `packages/workspace/src/workspaceIdentity.ts:210`
- **Category:** performance
- **Severity:** low today, medium as the Node 26 LTS blocker
- **Provenance:** not from the P16A sweep. Established while resolving
  [Decide whether the OpenTUI renderer choice survives public distribution](../../.issues/WF-059-decide-renderer-survives-public-distribution.md)
  and filed here because the code is live and the fix belongs to **P16C**.
- **Evidence:** Both of the Workspace's two `runGit` functions name the executable
  by bare word, so every invocation pays a `PATH` lookup:
  `spawn('git', [...arguments_], …)` at `workspaceEvidence.ts:646`, and
  `execFileAsync('git', ['-C', canonicalStart, 'rev-parse', argument], …)` at
  `workspaceIdentity.ts:210`.
  On its own this is unremarkable. It becomes load-bearing because of the measured
  `child_process` regression introduced in Node 26.6.0, recorded in
  [Decide the declared Node version range](../../.issues/WF-056-decide-declared-node-version-range.md):
  resolving a command through `PATH` costs roughly 47ms instead of 12ms, while
  spawning by absolute path is barely affected. The Workspace shells out to `git`
  constantly, so the v1 suite runs about 5× slower and times out on 26.6.0, and
  26.7.0 fails 3 to 5 tests per run. That is the entire reason root
  `engines.node` is bounded above at `<26.6.0`.
  So the declared Node ceiling is a consequence of this call shape, not of the
  renderer. The fix is available and local: resolve `git` once to an absolute path
  and pass that to both sites. The pattern already exists in one of the same
  files — `workspaceIdentity.ts:481` passes an absolute `/bin/ps` rather than
  `ps`, and is therefore unaffected by the regression. `PATH` is reachable from
  both call sites: `processEnvironment()` (`workspaceEvidence.ts:624`) spreads
  `process.env`, and `gitEnvironment()` (`workspaceIdentity.ts:189`) copies every
  non-`GIT_` entry.
  The severity rises on a date rather than on a package. Node 26 becomes LTS in
  October 2026 at a patch well above 26.5.1, so a consumer installing "Node 26
  LTS" lands above the tested window. Until this is fixed, that consumer either
  gets a degraded tool or has to be refused.
  Two things are **not** established. Whether the absolute-path fix restores
  enough timing for the full suite to pass on 26.6.0 and 26.7.0 — WF-056's rule
  holds, so only a full suite run on the candidate version is evidence, never a
  spawn probe. And whether 26.7.0's 3 to 5 failures are all timeout-driven or
  include a second cause.
- **Re-verified 2026-08-07** by the disposition pass, which **counted the spawns**
  instead of accepting the attribution. The production enumeration is exact and the
  causal claim is now quantified — but the *fix scope* is too narrow to produce the
  evidence the finding itself asks for.
  - **The two production sites are the only two, confirmed.** A sweep of every
    `spawn`/`execFile`/`exec` call across the four active packages finds bare-word
    `git` at `workspaceEvidence.ts:646` and `workspaceIdentity.ts:210` and nowhere
    else. The `/bin/ps` precedent (`workspaceIdentity.ts:481`) is confirmed absolute,
    and `PATH` is confirmed reachable from both environments — `processEnvironment()`
    spreads `process.env`, `gitEnvironment()` copies every non-`GIT_` entry.
  - **The causal claim holds, and now has a number.** The full v1 suite spawns
    **1,034 `git` processes**, measured by resolving `git` to a counting shim: about
    **790 from production** (785 `workspaceEvidence` `runGit`, ~5 `workspaceIdentity`)
    and **244 from test-harness setup**. At WF-056's measured **+35 ms** per
    PATH-resolved spawn on 26.6.0 (47 ms against 12 ms) that is roughly **36 s of
    added latency** against a suite that completes in **17.2 s on 26.5.1**. This
    independently corroborates WF-056's "≈5× slower and times out" without re-running
    its measurement, and it is the first time the ceiling has been tied to a count
    rather than to an impression.
  - **The proposed fix cannot answer its own open question.** "One shared resolver,
    both call sites" leaves the **244 harness spawns untouched** — the test helpers
    spawn bare-word `git` at eight sites (`workspaceEvidence.test.ts:30`,
    `workspaceIdentity.test.ts:36`, `workspaceRuntime.test.ts:17`,
    `workspaceProjection.test.ts:33`, `workspaceReviewing.test.ts:24`,
    `harnessInteraction.test.ts:58`, and `reviewingApplication.test.ts:173`, `:177`),
    and the risk probes at seven more (`probe-dogfood-v1.mjs`,
    `probe-local-runtime-v1.mjs:78`). Fixing production alone removes about **76%** of
    the penalty and leaves roughly **8.5 s** of PATH cost on 26.6.0. Since the
    finding's own evidence gate for moving the ceiling is *a full suite run*, and the
    suite's timing is contaminated by a source the fix does not address, the gate
    would return an unclean answer.
  - **Timing caveat, recorded as confounded.** The 17.2 s figure was measured with
    every `git` call routed through an `sh` shim, so the true unshimmed suite is
    faster. The **count** is unaffected; the runtime is an upper bound.
- **Disposition:** fixed — one shared resolver, applied to **both production sites and
  the eight test-harness sites**, with the risk probes following if the ceiling
  question is ever put to them. The scope reaches outside `packages/workspace` into
  `apps/neoflow/test` and `scripts/`; that is one repair with one purpose, not a
  cross-package obligation to decide, because it follows necessarily from the evidence
  gate rather than from a fresh judgement. **Justified without the ceiling moving**: a
  measured regression, a local repair, and an existing in-repo precedent are enough on
  their own.
- **The ceiling question is severed from this disposition and stays open.** Whether
  `engines.node` can be raised is **not** decided here and is not decidable on this
  map, since proving it needs the fix in place and this map changes no code. It is
  owned by **P16C** — land the resolver, then run the full v1 suite on 26.6.0 and
  26.7.0 — paired with **A-04**. **Decided without running the suite on either
  version.** The suite was run on **26.5.1** (17 files, 85 tests, all passing) to take
  the spawn census, not to test the ceiling. If **P16C** slips past roughly September
  2026 the October 2026 Node 26 LTS date turns this into a scheduling question for
  [Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md),
  not a disposition question for this ledger.
- **Rank:** Workspace / first — the only Workspace finding whose repair is gated by a
  dated external constraint, and the only one that must land *before* the measurement
  that answers a still-open question can be taken at all.
- **Decided:** 2026-08-07 by [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md)

#### W-15 — Thirteen of `authoritativeState.ts`'s twenty-five re-exports have no consumer

- **Module / file:** Workspace — `packages/workspace/src/authoritativeState.ts:20`–`:46`
- **Category:** maintainability
- **Severity:** low
- **Provenance:** established 2026-08-07 by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md).
  It is the **entire** unused-export result for the four active packages.
- **Evidence:** `authoritativeState.ts` re-exports 25 type names from
  `authoritativeStateProtocol.js`. Thirteen of them reach no consumer through that
  path: `ImmutableStateRecordWrite`, `RevisionedStateRecordWrite`,
  `StateCommandResultEnvelope`, `StateContentReference`, `StateContentWindow`,
  `StateContentWindowAvailable`, `StateContentWindowRequest`,
  `StateContentWindowUnavailable`, `StateContentWrite`, `StateQuarantineReason`,
  `StateQuarantineReport`, `StateRecordClass`, `StateRecoverySummary`.
  The **types are alive**; only the re-export is dead. `StateQuarantineReport`, for
  instance, has 13 references — one is this re-export, three are its declaration in
  `authoritativeStateProtocol.ts`, and nine are real uses inside
  `authoritativeStateWorker.ts`.
  Two checks rule out the innocent explanations. This is **not a published
  Interface**: `packages/workspace/src/index.ts` re-exports nothing from
  `authoritativeState.ts` at all, so these names never reach a package consumer.
  And it is **not a deliberate pass-through** of the protocol vocabulary: the
  protocol module exports 33 types and this block forwards a selected 25, omitting
  eight (`StateWorkerData`, `StateWorkerRequest`, `StateWorkerResponse`,
  `StateCommitAccepted`, `StateCommandIdentityConflict`, `StateRecordConflict`,
  `StateRevisionConflict`, `StateVersionMismatch`). A curated list that has drifted
  is accretion, not a contract.
- **Re-verified 2026-08-07** by the disposition pass, by enumerating all six
  importers of `authoritativeState.js` rather than re-running the tool. **Both
  innocence checks hold, the protocol arithmetic holds exactly, and the headline
  count is one short.**
  - **It is fourteen, not thirteen. `StateMigrationCheckpoint` is the fourteenth.**
    No importer of `authoritativeState.js` pulls it. It appears in that file three
    times, and none is the re-export doing work: `:9` is the file's **own**
    `import type` from the protocol, which is what its uses at `:73`, `:75` and
    `:102` are bound to, and `:35` is the re-export. `authoritativeStateWorker.ts`
    imports it straight from the protocol module. So the name is used, and the
    re-export of it still reaches nobody — **the finding's own "through that path"
    criterion, applied correctly to twenty-four names and slipped on the one where
    a local import made the re-export look consumed.** The recurring error again: a
    necessary condition read as a sufficient one.
  - **Trim to eleven, not twelve.** Union of what the six importers actually take:
    `AuthoritativeStateErrorCode`, `StateRecord`, `StateCommitResult`,
    `StateRecordWrite`, `StateCommitRequest`, `StateTestFailpoint`,
    `StateContentReadRequest`, `StateContentReadResult`, `StateReadRequest`,
    `StateReadResult`, `StateStatus`. (`AuthoritativeState`,
    `AuthoritativeStateError` and `openAuthoritativeState` are declared in this file,
    not re-exported, so they are outside the twenty-five.)
  - **Seven of the eleven survivors are consumed only by tests**, which import
    `../../src/authoritativeState.js` directly rather than through the package
    Interface and could equally import the protocol module. Only **four** —
    `AuthoritativeStateErrorCode`, `StateRecord`, `StateCommitResult`,
    `StateRecordWrite` — have a production consumer. The block advertises a
    contract not twice the real one but **six times** its production size.
  - **Not a published Interface:** confirmed, `packages/workspace/src/index.ts`
    names `authoritativeState` nowhere. **Not a deliberate pass-through:** confirmed
    by count — the protocol module exports exactly **33** types, this block forwards
    25, and all eight named omissions are real exports of it.
- **Disposition:** fixed — trim to the **eleven** with consumers. Type-only, so the
  compiler proves the change safe and no runtime behaviour can move. The value is
  that the module stops advertising a contract six times the size of its production
  one; the cost is fourteen deleted lines in a single block.
- **Rank:** Workspace / normal
- **Decided:** 2026-08-07 by
  [Disposition the Workspace state and projection findings](../../.issues/WF-072-disposition-workspace-state-and-projection-findings.md)

### `packages/local-runtime`

#### L-01 — A comment denies the acknowledgement the code implements

- **Module / file:** Local Runtime — `packages/local-runtime/src/client.ts:190`–`:192`,
  contradicted by `:181`–`:186`
- **Category:** maintainability
- **Severity:** low
- **Evidence:** The comment reads "Unsubscribe has no server acknowledgement. An
  update already queued by the server may therefore arrive after local
  cancellation…". Twelve lines above it, the client handles a
  `workspace.unsubscribed` frame and treats an unrecognized subscription id in it
  as a `#protocolFailure()` — so unsubscribe **does** have a server
  acknowledgement, and the client depends on it strictly enough to fail the
  protocol when it does not match. `HANDOFF.md` records that acknowledgement as a
  settled guarantee.
  The surviving-updates behavior the comment describes is still real and still
  implemented (`:193`), so the code is correct; only its first sentence is false.
  It is worth fixing precisely because this is the mechanism the checkpoint claims
  as proven — a reader who trusts the comment will conclude the guarantee is
  weaker than it is.
- **Confirmed 2026-08-07** by the disposition pass, which took the question back to
  the source rather than ratifying it, because only one of the two answers is cheap.
  **The comment is the wrong one.** `server.ts:606`–`:622` sends
  `workspace.unsubscribed` on **every** unsubscribe — unconditionally, outside the
  `if` that detaches the subscription — and carries its own comment stating the
  guarantee: *"This acknowledgement follows every previously queued update on the
  server-to-client stream, allowing the client to retire its race tombstone."* Two
  comments in one protocol thus describe the same mechanism and contradict each
  other, and the server's is the true one.
  **The tombstone the false comment guards is still required**, for a reason that
  comment never states: not that there is no acknowledgement, but that the
  acknowledgement is *ordered after* updates the server had already queued. That
  distinction is the whole content of the repair.
- **Disposition:** fixed — one comment, and it must be **rewritten, not deleted**.
  Replace the false premise ("Unsubscribe has no server acknowledgement") with the
  true one: the acknowledgement arrives *after* any already-queued update, which is
  precisely why `#retiredSubscriptions` exists. Deleting the comment would satisfy
  this finding's literal complaint while destroying the only written rationale for
  the tombstone, leaving the next reader to rediscover it from the server's side.
- **Rank:** Local Runtime / normal
- **Decided:** 2026-08-07 by
  [Disposition the Local Runtime and Pi Adapter findings](../../.issues/WF-066-disposition-local-runtime-and-pi-adapter-findings.md)

#### L-02 — Frame reassembly re-copies the whole buffer per chunk

- **Module / file:** Local Runtime — `packages/local-runtime/src/framing.ts:94`
- **Category:** performance
- **Severity:** low
- **Evidence:** `#accept` begins with
  `this.#buffer = Buffer.concat([this.#buffer, chunk])` on **every** `data`
  event, so reassembling one frame from *n* chunks copies the accumulated bytes
  *n* times — O(total²) rather than O(total). With `MAX_FRAME_BYTES` at 1 MiB
  (`protocol.ts:18`) and typical 64 KiB socket chunks, a maximal frame costs
  roughly 8 MiB of copying to assemble 1 MiB.
  It is bounded and therefore low, not medium: the frame cap makes the worst case
  finite and small in absolute terms. The consumption side is already efficient —
  `:106` advances with `subarray`, which is a view rather than a copy.
  Second-order note on that same view: the leftover buffer keeps the whole
  1 MiB allocation alive until the next `concat` replaces it.
- **Confirmed 2026-08-07** by the disposition pass. Both halves re-read at source:
  the `Buffer.concat` runs on every `data` event before any newline search
  (`:94`), and the consumption side does advance by `subarray` views (`:105`–`:106`),
  so the asymmetry the finding describes is real as stated. Ratified unchanged.
- **Disposition:** fixed — hold the chunks in a list and concatenate once when a
  newline is found. A newline is a single byte and cannot straddle a chunk
  boundary, so each arriving chunk can be scanned on its own and the list
  concatenated only when one is found; this is a self-contained rewrite of one
  method.
  **One part of it is not mechanical, and it is the part that matters.** The
  overflow guard at `:99` reads `this.#buffer.byteLength` — the very field the
  rewrite removes — so the chunk list must carry a running byte total or the
  `MAX_FRAME_BYTES` check silently stops enforcing anything. That limit is the
  frame-too-large protection, not a performance nicety, so a rewrite that drops it
  trades a bounded copy cost for an unbounded buffer. Whoever executes this should
  treat the running total as the requirement and the copy saving as the benefit.
- **Rank:** Local Runtime / normal
- **Decided:** 2026-08-07 by
  [Disposition the Local Runtime and Pi Adapter findings](../../.issues/WF-066-disposition-local-runtime-and-pi-adapter-findings.md)

#### L-03 — The Workspace seam is typed as `unknown` behind a double cast

- **Module / file:** Local Runtime — `packages/local-runtime/src/server.ts:93`–`:97`,
  `:789`
- **Category:** maintainability
- **Severity:** medium
- **Evidence:** The server reaches the Workspace through
  `interface DynamicWorkspace { execute(command: unknown): Promise<unknown>;
  read(request: unknown): Promise<unknown>; subscribe(scope: unknown, …) }`, and
  obtains it at `:789` via `request.workspace as unknown as DynamicWorkspace` —
  the strongest available type-safety escape, used exactly at the seam that most
  needs checking. JSON-parsed `frame.payload` is then handed straight to
  `execute`/`read` (`:534`–`:535`) with no compile-time relationship to the
  Workspace's real command and request types.
  Runtime safety is not the issue: the Workspace validates everything it receives
  (`validateCommit` in `authoritativeState.ts`, the normalizers in `reviewing.ts`
  and `harnessInteraction.ts`) and rejects fail-closed. The cost is that the
  compiler cannot see a mismatch at all. **P16C** is about to change Workspace
  command shapes; with this seam, nothing will fail to build — the mismatch will
  appear as a runtime rejection inside a probe, which is a far more expensive way
  to learn about it.
- **Disposition:** fixed — type the seam against the real Workspace Interface so
  the build catches drift. Ratified: the cost named here is a *lost compiler*,
  not a runtime hole, and that cost is paid by every package that changes the
  command surface afterwards.
- **Rank:** Local Runtime / first — it is pulled ahead, so it heads the package
  by construction.
- **Pulled ahead:** before P16B — **the ledger's stated deadline was too late,
  and this is the one correction to the pull-forward argument.** The Summary and
  this finding both name **P16C** as what the seam should precede. But **P16C**
  depends on **P16B**, so P16B lands first, and P16B changes the same surface:
  its recorded outcome adds Versions navigation as a bounded read-only
  Projection and explicit continuation for frozen range Reviews, both of which
  cross this seam as new request and command shapes. The finding's own argument
  — that a mismatch shows up as a runtime rejection inside a probe rather than a
  build failure — applies to P16B in full. Typing the seam after P16B would mean
  the largest semantic change on the roadmap is the one change it never
  guarded.
- **Decided:** 2026-08-07 by
  [Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md)

#### L-04 — The bootstrap parser manufactures a literal version type it never verified

- **Module / file:** Local Runtime — `packages/local-runtime/src/protocol.ts:96`–`:97`,
  `:213`, `:373`–`:374`, `:382`; the checks it undermines at
  `packages/local-runtime/src/client.ts:440`–`:441` and
  `packages/local-runtime/src/harnessAdapter.ts:402`–`:403`
- **Category:** maintainability
- **Severity:** low
- **Provenance:** established 2026-08-07 while working
  [Decide the linter and formatter posture](../../.issues/WF-055-decide-linter-formatter-posture.md).
  It is the only finding that ticket's linter probe produced, and it was produced
  by a rule the same ticket rejected.
- **Evidence:** `BootstrapAcceptedFrame` declares both negotiated versions as
  *literal* types — `protocolVersion: typeof LOCAL_RUNTIME_PROTOCOL_VERSION` and
  `workspaceInterfaceVersion: typeof WORKSPACE_INTERFACE_VERSION` (`:96`–`:97`).
  Its parser proves something much weaker. `parseBootstrapAcceptedFrame` guards
  both fields with `isSafeVersion` (`:373`–`:374`), which is
  `Number.isSafeInteger(value) && value >= 0` (`:213`) — *any* non-negative
  integer passes — and then returns `value as unknown as BootstrapAcceptedFrame`
  (`:382`). The double cast manufactures the literal type from a check that never
  established it, so a peer announcing `protocolVersion: 7` yields a value the
  compiler believes is `1`.
  Nothing is broken today, because the real check lives at the call sites:
  `client.ts:440`–`:441` and `harnessAdapter.ts:402`–`:403` compare both fields
  against the constants and reject the handshake on mismatch. Those comparisons
  are the **only** enforcement of the negotiated version on the accept path.
  The hazard is that they do not look like enforcement to anything reading the
  declared type. Run over this package,
  `@typescript-eslint/no-unnecessary-condition` reports all four as dead code —
  *"comparison is always false, since `1 !== 1` is false"* — with no autofix and
  no suggestion, so the deletion would be a human acting on an authoritative-looking
  report. Removing them would strip the sole version check from a socket handshake
  while every gate in the repository stayed green.
  This is the inverse of **L-03** and the two are worth reading together: there
  the seam's type is *weaker* than reality, so the compiler cannot catch drift;
  here the type is *stronger* than the parser proved, so the compiler vouches for
  something unverified.
- **Swept 2026-08-07** by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md).
  The original entry left the file's other casts unchecked; all six narrowly-typed
  version fields have now been read, and they fall into **three grades — including
  the correct one, which is already in this file**:
  1. **Correct.** `HarnessAdapterEstablishFrame` and `HarnessAdapterEstablishedFrame`
     declare `adapterProtocolVersion: typeof HARNESS_ADAPTER_PROTOCOL_VERSION` and
     **validate it against the constant inside the parser** (`:314`, `:530`). This is
     precisely what the disposition below asks for, written by the same author in the
     same file, a few lines away.
  2. **Unverified, but aspirationally right.** The `BootstrapAcceptedFrame` pair above.
     A successful handshake *should* only ever carry our own version, so the literal
     type states a real intent; it is simply proved somewhere else.
  3. **Semantically wrong.** `BootstrapRejectedFrame.supportedProtocolVersion?` and
     `.supportedWorkspaceInterfaceVersion?` (`:106`, `:108`) are also declared as the
     literal, and validated at `:413`–`:418` only by `isSafeVersion`. But these fields
     exist to carry **the peer's** supported version on an incompatibility rejection —
     a value whose entire purpose is to differ from ours. The type says it can only
     ever equal ours, which contradicts the field's reason for existing. No defect
     follows today, because both consumers (`client.ts:278`–`:295`,
     `harnessAdapter.ts:102`–`:117`) only forward the runtime value into a diagnostic
     and never branch on it — but any future comparison against the constant would be
     reported by the compiler as always true.
  For completeness: `BootstrapFrame`'s own version fields are declared `number`, which
  is honest, and are compared against the constants by the server at `server.ts:365`
  and `:375`. The remaining casts in the file carry no narrowly-typed field and do not
  over-claim.
- **Re-verified 2026-08-07** by the disposition pass, which tested the sweep's
  completeness claim and grade 3's semantic claim rather than ratifying them. One
  held, one did not, and a fourth site turned up that neither had counted.
  - **The completeness claim holds.** "All six narrowly-typed version fields" is
    exactly right: `typeof …VERSION` appears at `:64`, `:96`, `:97`, `:106`, `:108`
    and `:168` and nowhere else in the file, and the nineteen `as unknown as` casts
    carry no other narrowly-typed field. The three grades partition all six.
  - **Grade 3's reason is wrong and is withdrawn.** The sweep said the two
    `BootstrapRejectedFrame` fields "exist to carry **the peer's** supported version
    … a value whose entire purpose is to differ from ours." The only producer is
    `server.ts:254`–`:278`, which writes `supportedProtocolVersion:
    LOCAL_RUNTIME_PROTOCOL_VERSION` and `supportedWorkspaceInterfaceVersion:
    WORKSPACE_INTERFACE_VERSION` — **our own constants**. On the wire `supported`
    means *the sender's* version, and the sender is us; the honest companion fields
    `receivedProtocolVersion?: number` (`:107`) and `receivedWorkspaceInterfaceVersion?`
    (`:109`) are the ones carrying the peer's value, and they are already `number`.
    The field's purpose is not to differ.
    **The correct reason is sharper and more general: one interface serves both
    directions, so a literal type can be true in only one of them.** The literal is
    true where the frame is *written* (`server.ts`) and false where it is *read* —
    and `parseBootstrapRejectedFrame` (`:413`–`:418`) is the read side, which is
    exactly why it can prove nothing. Both consumers confirm the reader's vantage:
    `client.ts:284` and `harnessAdapter.ts:107` take `frame.supportedProtocolVersion`
    and forward it as the diagnostic's `receivedVersion` — the peer's number, under
    a type that says it can only be ours. The conclusion the sweep drew survives; the
    argument for it does not.
  - **A fourth defective site, inside this finding's declared scope.**
    `harnessAdapter.ts:403` checks `accepted.workspaceInterfaceVersion === 1` — a
    **hardcoded literal** where the sibling check at `client.ts:441` uses
    `WORKSPACE_INTERFACE_VERSION`. This finding already names those call sites as the
    **sole** enforcement of the negotiated version on the accept path, so one of the
    four not tracking the constant is the same defect one layer out. The constant is
    `packages/workspace/src/workspace.ts:211`, `export const
    WORKSPACE_INTERFACE_VERSION: 1 = 1`, and it is owned by the Workspace. Bump it to
    `2` and `client.ts` follows correctly while `harnessAdapter.ts` silently keeps
    demanding `1` — every harness-adapter bootstrap against a correct runtime is then
    refused, and refused into the generic `invalid-runtime-bootstrap` diagnostic that
    says nothing about versions. Asymmetric, silent, and hard to trace back to a
    stale literal.
  - **One evidence detail corrected.** The quoted linter message — *"comparison is
    always false"* — fits the two `!==` comparisons in `client.ts:440`–`:441`. The
    `harnessAdapter.ts:402`–`:403` pair are `===` inside a conjunction, so the rule
    reports them as always **true**. The hazard is unchanged (a human deleting an
    authoritative-looking always-constant condition); only the message differs, and
    it matters because a reader checking the quote against the second pair would
    otherwise conclude the finding had misread its own tool.
  - **The proposed fix is behaviour-preserving, which was checked rather than
    assumed.** Moving the version comparison into `parseBootstrapAcceptedFrame` makes
    it return `undefined` for a mismatched peer, so control falls past the accept
    branch — and both call sites then land on the *same* diagnostic they produce
    today: `client.ts:462`–`:465` and `harnessAdapter.ts:416`–`:419` both fall back to
    `{ code: 'invalid-runtime-bootstrap' }`, which is precisely what `client.ts:445`–
    `:448` already returns on a version mismatch. No diagnostic is lost or changed.
- **Disposition:** fixed — **and the answer to the question this finding left open is
  that grade 1 is the pattern, but the three grades are not one fix. They are three
  edits, and two of them move in opposite directions.**
  1. **Grade 2 adopts grade 1.** Compare both versions against the constants inside
     `parseBootstrapAcceptedFrame`, matching `:314` and `:530`. That makes the literal
     type true where it is asserted and the four call-site checks genuinely redundant.
  2. **Grade 3 moves the other way: widen `BootstrapRejectedFrame`'s two fields to
     `number`.** Validating them against the constants — the "one fix for all three"
     reading — would be actively wrong, because the read side is where the parser
     lives and the peer's version is not ours there. This is the whole reason the
     grades had to be separated, and it survives the correction above even though the
     original argument for it did not.
  3. **Replace the hardcoded `1` at `harnessAdapter.ts:403` with
     `WORKSPACE_INTERFACE_VERSION`.** One token, and it is the only one of the three
     that can fail on its own schedule rather than a reader's.
  Small in lines; the reasoning is the deliverable, because one file holds all three
  grades, only one is right, and the two wrong ones are wrong in opposite senses.
- **Rank:** Local Runtime / first — not for size, and not for taste. The four
  call-site comparisons are the sole version enforcement on the accept path, and the
  tool that reports them as always-constant has **no autofix and no suggestion**, so
  the deletion hazard is a human acting on an authoritative-looking report. That
  report has a named and *endorsed* trigger:
  [Decide the linter and formatter posture](../../.issues/WF-055-decide-linter-formatter-posture.md)
  concluded these tools are "worth an occasional probe run outside the repository",
  so the next probe run is the next chance to delete a socket handshake's only
  version check with every gate green. Edit 3 adds a second, independent clock.
- **Not pulled ahead — but P16B inherits an obligation from edit 3.** No later
  package makes this repair dearer, so no pull-forward is claimed. The exposure is
  conditional, and the condition belongs to another package: **if P16B bumps
  `WORKSPACE_INTERFACE_VERSION`, the hardcoded `1` must be updated in the same
  change**, because bumping a version constant obliges updating every site that
  compares against it. That is P16B's own housekeeping, not a scheduling dependency
  on this ledger, and it is recorded here because the stale literal is invisible from
  the Workspace package where the constant lives. Whether P16B bumps the constant at
  all is not established here and is P16B's call.
- **Decided:** 2026-08-07 by
  [Disposition the Local Runtime and Pi Adapter findings](../../.issues/WF-066-disposition-local-runtime-and-pi-adapter-findings.md)

### `packages/pi-adapter`

#### P-01 — Three unguarded async paths can crash the user's Pi session

- **Module / file:** Pi Adapter — `packages/pi-adapter/src/extension.ts:141`,
  `:157`, `:163`–`:165`; compare the guarded sibling at `:166`
- **Category:** correctness
- **Severity:** medium
- **Evidence:** This file runs **inside the user's Pi process**, so an unhandled
  rejection here takes down their coding agent, not Neoflow. Node's default
  `unhandledRejection` behavior is to throw. Three paths are unguarded:
  1. `:141` — `await bootstrapped.workspace.read({ kind: 'workspace.identity' })`
     inside the `async` `session_start` handler, with no `try`. `bootstrapWorkspace`
     is carefully written to *return* `{ status: 'rejected' }` rather than throw
     (`:137`), but `workspace.read` rejects with `AuthoritativeStateError` on any
     state failure, and nothing catches it. Whether that becomes an unhandled
     rejection depends on whether Pi awaits its handlers' promises — which is
     the host's choice, not ours, and so not something to rely on.
  2. `:157` — `next.loop = attachLoop(ctx, next)` stores the promise without
     attaching a handler. A `.catch` is attached only much later, in
     `session_shutdown` (`:166`). Since `attachLoop` awaits socket I/O, any
     rejection lands many ticks after `:157`, when the promise still has no
     handler. `attachLoop` awaits `adapter.runtimeConnected` (`:117`) and
     `adapter.runtimeDisconnected` (`:122`), both of which reach the Workspace and
     can reject.
  3. `:163`–`:165` — `await closing.adapter.sessionEnding()` and
     `await closing.connection?.dispose()` in the `session_shutdown` handler,
     neither guarded.
  The tell is `:166`: `await closing.loop?.catch(() => undefined)` shows the
  author applying exactly the right guard one line below two paths that lack it,
  and `lifecycle.ts:558`–`:559` wraps its own `dispose()` calls the same way. This
  reads as three omissions, not a considered choice.
- **Re-verified 2026-08-07** by the disposition pass, which tested the count and the
  stated failure mechanism instead of ratifying them. **Both were wrong, in opposite
  directions: the count is too low and the mechanism is too generous.** The
  disposition survives; almost none of the evidence for it does.
  - **There are six unguarded paths, not three, and they span two files.**
    `extension.ts:130` calls `bindPiReviewedAdapterEvents`, and
    `piNativeEvents.ts` registers three more `async` handlers on the same Pi
    instance, each awaiting an adapter method with no `try`: `before_agent_start`
    (`:24`–`:29`), `agent_start` (`:31`–`:33`), and `agent_settled` (`:37`–`:39`).
    All three reach `beforeAgentStart` (`piAdapter.ts:306`), `agentStarted` (`:322`)
    and `agentSettled` (`:360`), which are `async` and reach the same internals as
    the three the finding already names. `agent_settled` carries an extra source the
    others do not: it calls `sessionEntries(ctx)` — `ctx.sessionManager.getBranch()`,
    a synchronous **host** call — inside the `async` handler at `:38`, so a throwing
    host turns into a rejected promise with nothing attached. The remaining
    registrations are not exposed: `input` (`:16`) and `tool_call` (`:35`) call
    synchronous methods (`onInput` at `piAdapter.ts:287`, `onToolCall` at `:345`),
    and the three `session_before_*` handlers are synchronous throughout.
  - **The stated mechanism is wrong for two of the original three.** The finding says
    `runtimeConnected` and `runtimeDisconnected` "reach the Workspace and can reject."
    They reach the Workspace only through `#emit`, and **`#emit` is the one path that
    cannot propagate a Workspace failure**: it wraps `sink.accept` in `try`/`catch`
    and queues the evidence instead (`piAdapter.ts:731`–`:744`), and `#flushEvidence`
    does the same (`:782`–`:786`). A hostile or failing sink produces no rejection at
    all. The real sources in those two methods are uncaught **host** calls and local
    work: `#native.isIdle()` at `:449` and `:470`, and `#scheduler.clear` inside
    `#finishActive` (`:678`). `sessionEnding` (`:492`) is the same shape.
  - **The first path is the one whose stated mechanism holds.**
    `extension.ts:141`'s `workspace.read` reaches
    `authoritativeState.ts:234` with no swallow layer between, and that class rejects
    with `AuthoritativeStateError` at `:271`, `:283`, `:366` and `:370`. This is the
    only one of the six where "the Workspace can fail" is the true story.
  - **Why the mechanism correction is not bookkeeping.** A fixer who believes the
    Workspace is the fault source will validate the new guards with a failing sink,
    observe no rejection on five of the six paths, and reasonably conclude the guards
    are dead code. The faults to inject are a throwing Pi host (`isIdle`, `abort`,
    `getBranch`) and a failing `workspace.read` — not a failing evidence sink.
  - **Neither file is covered by any test.** `extension.ts` and `piNativeEvents.ts`
    are imported only by `src/index.ts`, the package entry the Pi host loads; the
    package's sole contract test imports `capability.js` and `piAdapter.js` and
    touches neither file, and no test in the repository mentions `session_start`,
    `session_shutdown`, `before_agent_start` or `agent_settled`. So all six paths sit
    in files with **no automated coverage of any kind**, which is a stronger statement
    than the finding's original one and settles the second question below.
- **Disposition:** fixed — scope widened from three paths in one file to **six across
  two**, and the blast-radius argument is untouched: this code runs inside the user's
  Pi process, so an unhandled rejection takes down their coding agent rather than
  Neoflow.
- **The obligation question is answered: yes, and it is discharged structurally
  rather than by a test.** Route every `pi.on` registration through a single wrapper
  that catches, so a handler cannot be registered unguarded, and delete the per-site
  guards it subsumes. Three facts pick this over the alternatives. Nothing mechanical
  catches the defect — the linter posture decision measured `no-floating-promises`
  and `no-misused-promises` at zero hits and confirmed neither reports it — and now
  nothing behavioural does either, since no test imports either file. A regression
  test would need a Pi host double that does not exist, costing more than the six
  guards it protects and still covering only the six. And the author's own record is
  the decisive evidence: the correct guard appears at `extension.ts:166` and
  `lifecycle.ts:558`–`:559` and is **missing at six of the eight opportunities in the
  same code**, so per-site discipline has a measured failure rate here rather than a
  suspected one. A wrapper makes the omission impossible by construction and carries
  to handlers not yet written, which is the only property that outlives this repair.
- **Rank:** Pi Adapter / normal — and the band is **vacuous here**, which is worth
  recording once for the passes that follow. This is the package's only finding, so
  there is no ordinary work for a `first` band to precede; claiming `first` would
  assert an ordering that does not exist, and the format requires a written reason
  that could only be "it is the only one". A single-finding package should take
  `normal`.
  **This rank is not derived from the expiry.** The ledger records that nothing
  imports the Pi Adapter yet, and that fact makes today's blast radius zero — but it
  is stated as an expiry precisely because it lapses the moment something imports the
  package, and P16C is where that becomes likely. The band above would be the same if
  the package were imported tomorrow.
- **Decided:** 2026-08-07 by
  [Disposition the Local Runtime and Pi Adapter findings](../../.issues/WF-066-disposition-local-runtime-and-pi-adapter-findings.md)

### `apps/neoflow`

#### A-01 — The question-card scroll offset is unbounded, and the footer reports the unclamped value

- **Module / file:** Application — `apps/neoflow/src/reviewingModel.ts:1056`–`:1060`;
  `apps/neoflow/src/reviewingView.ts:762`, `:1264`
- **Category:** correctness
- **Severity:** medium
- **Evidence:** This single root cause is what both the "unbounded scroll" and
  "question card offset" leads were pointing at.
  The model clamps the offset only at the bottom:
  `questionCardScrollOffset = Math.max(0, questionCardScrollOffset ± 8)`. There is
  no upper bound anywhere in the model — `grep` finds resets to `0` (`:1230`,
  `:1672`, `:1727`) and this one mutation, and nothing that compares the offset to
  the content length.
  The **view** compensates, but only for itself:
  `const offset = Math.min(state.questionCardScrollOffset, maximumOffset)`
  (`reviewingView.ts:762`) clamps into a local variable and never writes the
  corrected value back to the model. So rendering is correct while the model's
  number drifts arbitrarily high.
  The footer then prints that drifting number directly:
  `` `discussion ${state.questionCardScrollOffset + 1} · …` `` (`:1264`). Holding
  PageDown on a three-line discussion leaves the content correctly parked at the
  end while the progress indicator counts on — `discussion 40`, `discussion 48` —
  and the user must then press PageUp exactly as many times as they overshot
  before the content moves at all.
  Both halves matter: the indicator states a position that is not the position,
  and this is the "long discussions show line progress" behavior that
  `HANDOFF.md` records as human-accepted at Gate A.
- **Disposition:** fixed — but **not the repair proposed**, and the evidence above is
  corrected in three places first.
  **The enumeration is wrong: there are two raising mutations, not one.** Alongside
  `:1056` (keyboard `PageDown`/`Ctrl+J`), `reviewingModel.ts:1180` sets
  `questionCardScrollOffset = Math.max(0, target.offset)` on a
  `question-card-page` pointer target. The finding's *conclusion* survives — neither
  mutation has an upper bound — but a repair that clamped only `:1056` would leave
  the second path open, so the corrected count is load-bearing on the fix.
  **The pointer path is nevertheless already bounded, at its producer.**
  `reviewingView.ts:813` dispatches `Math.min(maximumOffset, offset + 8)`, computed
  from the view's own clamped `offset`, so the mouse path cannot drift and in fact
  *repairs* an already-drifted model value on the first click. Only the keyboard
  drifts. That asymmetry is the finding's own objection in miniature: the pointer
  path is correct solely because the view guards it, exactly as rendering is correct
  solely because of the view's `Math.min`.
  **The proposed repair names a quantity the model does not hold.** `maximumOffset`
  is `detailRows.length - visibleDetailRows`, where `detailRows` is
  `wrappedRows(question, contentWidth)` at
  `contentWidth = Math.max(12, estimatedPaneWidth - 4)` and `visibleDetailRows`
  derives from `cardHeight`, `hasPaging`, `embeddedHeight` and
  `availableHeight = state.height - 11` (`reviewingView.ts:682`–`:762`, `:1120`–`:1130`).
  The model holds `width` and `height` (`:186`–`:187`, `:438`–`:441`) but none of the
  card's layout constants and not `wrappedRows`. "Clamp in the model against the
  known content length" therefore means copying the view's wrapping and card
  arithmetic into the model, where any drift between the two copies reproduces
  **W-13**'s defect class — two implementations of one derived quantity that
  disagree — to remove a `Math.min`.
  **So the repair is re-scoped:** bound the keyboard mutation, and make the footer
  stop reporting a number the card has already corrected. The card's own
  `bottomTitle` (`reviewingView.ts:783`) prints `Detail rows N-M/total` from the
  clamped offset while the footer (`:1264`) prints `discussion N` from the raw one,
  so during drift **one screen states the same position two different ways** — which
  is the user-visible defect, sharper than "the indicator counts on". Either have
  the view write its clamped value back, or have the footer read what the card
  computed. Both are smaller than moving layout maths into the model, and neither
  leaves the view's `Math.min` load-bearing for correctness of the *displayed* number.
  **Gate A did not accept this.** The finding reads `HANDOFF.md` as recording the
  drift as human-accepted; what `HANDOFF.md:31` records is that acceptance passed
  "through correction cycle 10, including … long Question-card paging" — that paging
  *works* on long cards, not that a counter may run past the end. There is no record
  that the drift was seen. The acceptance also cannot cover the case the finding
  describes: on a three-line discussion `maximumOffset` is `0`, the paging row is not
  rendered at all (`:793`), so the mouse escape hatch does not exist and `PageDown`
  still increments the model — the one configuration in which the defect both bites
  hardest and is unreachable by the pointer.
  **The regression test is an addition to a test that already sits on this code.**
  `apps/neoflow/test/scenarios/reviewingApplication.test.ts:1269`–`:1286` drives this
  exact surface through both the pointer and keyboard paths, and asserts only on the
  card's clamped `Detail rows` title; at `:1282`–`:1286` it presses `PageDown` twice
  more and then asserts a bare `toContain('Detail rows ')`. It walks straight through
  the overshoot and checks the one indicator that hides it. Asserting the footer's
  `discussion N` beside the existing `Detail rows N-M` fails against the unfixed code.
- **Rank:** Application / normal
- **Decided:** 2026-08-08 by
  [Disposition the Application bounds and checks findings](../../.issues/WF-077-disposition-application-bounds-and-checks-findings.md)

#### A-02 — No-color filtering is stateless but applied per stream chunk

- **Module / file:** Application — `apps/neoflow/src/noColorOutput.ts:58`, using
  `removeAnsiStyles` at `:12`
- **Category:** correctness
- **Severity:** low — **corrected from medium on 2026-08-08**, once the trigger was
  measured rather than estimated. The scale reserves medium for conditions "this
  product will actually meet", and the split needs a terminal of roughly 62,000
  character cells; the leak it produces costs clarity rather than behaviour, which
  is the low row as written. See the measurement in the evidence below.
- **Evidence:** `removeAnsiStyles` itself is sound. It was extracted and run
  against 17 edge cases — style-only, style at head/tail, adjacent styles,
  multi-parameter styles, empty-parameter and `0` resets, two resets, a style
  between resets, truncated `ESC [`, and the non-SGR sequences that must survive
  (`ESC[?1049h`, `ESC[2J`, `ESC[10;20H`) — and **all 17 produced the expected
  output**. The documented contract, "removes complete SGR styles while retaining
  reset and all non-style control sequences", holds exactly.
  The defect is in how it is used. The function keeps no state between calls, but
  `createNoColorOutput` applies it to each `write` chunk independently
  (`:58`). Feeding `ESC[31mRED` as one chunk yields `RED`; feeding the same bytes
  split after the third byte yields **`ESC[31mRED`** — the style passes straight
  through. Verified directly:
  `whole="RED"` versus `streamed="ESC[31mRED"`.
  Reachability depends on OpenTUI's write granularity, which this audit did not
  measure — a renderer that emits one `write` per frame never splits a sequence,
  while one that emits fixed-size buffers eventually will. The consequence is
  bounded (a colour escape leaking into no-colour output, not data loss), but
  no-color/ASCII PTY behavior is explicitly gated: Gate B re-proved packed
  no-color PTYs.
  **Measured on 2026-08-08, closing the "did not measure" gap above.** The
  granularity is not a mystery and it is not per-frame-arbitrary. A renderer given
  a stream other than `process.stdout` pipes its bytes through a `NativeSpanFeed`
  (`@opentui/core` `renderer.d.ts` constructor note), whose defaults are
  `chunkSize: 64 * 1024`, `growthPolicy: "grow"` and `autoCommitOnFull: true`
  (`zig-structs.d.ts:149`–`:164`), and the feed's data handler issues **exactly one
  `write` per span** (`index.node.js:7221`–`:7225`). Three things follow, each run
  against the real renderer with an instrumented stream:
  - **The boundary does not accumulate across frames.** 100 successive frames of
    2,616 bytes — 261,600 bytes, four times the chunk — produced **100 writes, one
    per frame, none of them 65,536**. A steady stream of small frames never splits,
    which is the reading that would have made this defect continuous.
  - **A single frame larger than the chunk does split, at exactly 65,536.**
    450×110 renders a 52,674-byte frame in **one** write; 500×130 and 600×160 each
    render **two writes per frame, the first exactly 65,536 bytes**. The cut is a
    byte offset and knows nothing about sequence boundaries.
  - **The trigger is therefore a terminal size, and it is a large one.** No-color
    frames cost 1.0–1.36 bytes per cell (2,616 B at 80×24; 11,434 at 200×50; 42,884
    at 400×100; 52,674 at 450×110), so the split needs roughly **62,000–65,000
    character cells** — about 500×130 or 640×100, some eight times the area of an
    ordinary terminal.
  Two facts worth keeping alongside. **No-color frames really do carry styles to
  strip**, so this filter is not vestigial: a 200×50 frame holds **148 SGR
  sequences, 12.03% of its bytes**, because OpenTUI emits explicit
  `ESC[38;2;255;255;255m` and `ESC[49m` even when the application sets no colour at
  all — the file's own comment about the missing terminal-default mode is accurate.
  And **the end-to-end leak was not reproduced**: 20 frames at 500×130, driven
  through the real `createNoColorOutput`, leaked zero styles. That is **one sample,
  not twenty** — the frame's byte layout is fixed frame to frame, so the cut lands
  at the same structural position every time. It is recorded as not established
  rather than as a negative result.
- **Disposition:** fixed — carry the incomplete trailing sequence over to the next
  chunk, in `createNoColorOutput` alone. The repair is unchanged by the
  measurement; what changed is that it now removes a **measured** dependency on a
  third party's chunking rather than a suspected one. The proposed first step —
  measure OpenTUI's chunking — is done, and its result is above.
- **Rank:** Application / last — the only Application finding whose trigger is
  measured to need a terminal roughly eight times the area of a standard one, so it
  is the one repair in this package that no ordinary session will exercise.
- **Decided:** 2026-08-08 by [Disposition the Application text-filtering findings](../../.issues/WF-075-disposition-application-filtering-findings.md)

#### A-03 — Each suite builds its own scripted doubles

- **Module / file:** `apps/neoflow/test/scenarios/reviewingApplication.test.ts` (3),
  `packages/local-runtime/test/contracts/harnessAdapterRuntime.test.ts` (2),
  `packages/pi-adapter/test/contracts/piAdapter.test.ts` (2),
  `packages/workspace/test/scenarios/harnessInteraction.test.ts` (1),
  `packages/local-runtime/test/contracts/localRuntime.test.ts` (1)
- **Category:** duplication
- **Severity:** low
- **Evidence:** Nine scripted/timed/fake double classes are defined inline across
  five suites, and only `packages/workspace` has an extracted harness
  (`test/scenarios/driver.ts`, with its own `driver.test.ts`). Together with the
  four duplicated `waitFor` helpers in **X-06**, this is the substance of the
  test-harness duplication lead.
  This one deserves caution rather than enthusiasm: the v1 dependency firewall
  (`scripts/check-v1-dependencies.mjs`, which passes) constrains what may be
  shared across package boundaries, so some of this separation is likely
  deliberate rather than accidental. Consolidation *within* a package —
  `apps/neoflow`'s three doubles, following the `driver.ts` precedent — is the
  part with no such constraint.
- **Measured 2026-08-08 by
  [Disposition the Workspace test-source findings](../../.issues/WF-074-disposition-workspace-test-source-findings.md),
  which settled the same constraint for **X-06**: the condition this finding's
  proposal is written around resolves the opposite way.** The firewall **does**
  permit a shared test package. The real `scripts/check-v1-dependencies.mjs` was run
  against a synthesized tree containing a fifth package `packages/test-support`
  imported from a `packages/workspace` test by bare specifier and by relative path;
  neither was flagged, while a planted `@neoflow/local-runtime` import from the same
  directory was. The firewall checks four hardcoded package roots, so a fifth
  directory under `packages/` matches none of its rules. **This is a fact for this
  finding's disposition pass to rule on, not a ruling** — but the clause "unless the
  firewall permits a shared test package" can no longer be ratified as written, and
  an `accepted` here needs a cost argument rather than a prohibition. X-06 declined
  the same consolidation on cost: `packages/workspace` is declared to depend on
  nothing, and a shared test package gives it an edge the firewall cannot see.
  The cross-reference to "the four duplicated `waitFor` helpers in **X-06**" below is
  **correct** and was the count X-06's own heading disagreed with until it was fixed.
- **Counted 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md),
  and the nine came from a name pattern rather than from the subject.** Every class
  declared in the four active test roots is **13**, not nine, across the same five
  suites: `apps/neoflow/test/scenarios/reviewingApplication.test.ts:63`, `:238`,
  `:317`, `:385`;
  `packages/local-runtime/test/contracts/harnessAdapterRuntime.test.ts:93`, `:117`;
  `packages/local-runtime/test/contracts/localRuntime.test.ts:49`, `:129`;
  `packages/pi-adapter/test/contracts/piAdapter.test.ts:26`, `:48`, `:89`;
  `packages/workspace/test/scenarios/harnessInteraction.test.ts:125`, `:353`.
  Twelve are doubles of a production Interface; the thirteenth (`RawPeer`) is an
  inline socket harness. **The nine are exactly those whose names begin `Scripted`
  or `Timed`** — the four missed are `StressWorkspace`, `AppliedEvidenceSink`,
  `FaultingState` and `RawPeer`. The finding's own wording says
  "scripted/timed/**fake**" and no class in the repository is named `Fake*`, so that
  arm of the enumeration returned nothing while four fakes existed. The
  `apps/neoflow` half is therefore **four** doubles, not three, and the uncounted
  one is the largest inline double in the repository: `StressWorkspace` is **264
  lines** against `TimedWorkspace`'s 31.
- **Measured in the same pass: there is no duplication here to consolidate.** The
  category is duplication, but the evidence establishes only that doubles are
  defined *inline* — never that any two of them are similar — and the two
  comparisons that most look like duplication both fail. The four `apps/neoflow`
  doubles are four distinct mechanisms: a terminal stub, a scripted adapter, a
  **delegating spy** over a real `Workspace` (`TimedWorkspace`, which forwards
  `execute`, `read` and `subscribe` to a delegate while recording timings and
  in-flight reads), and a **standalone canned fake** with no delegate
  (`StressWorkspace`). What was counted is co-location. And the two classes that
  share a name across packages share only that name and their Interface:
  `ScriptedAdapter` is **23** lines in `packages/local-runtime` and **54** in
  `packages/workspace`, where it adds an options constructor, an `observations` log
  and an `onPerform` hook. Consolidating them means building a superset, not
  extracting a common part.
- **The `driver.ts` precedent is weaker than it reads.** It is 69 lines exporting
  one function, and exactly **one** of the seven `packages/workspace` scenario
  suites imports it (`workspaceProjection.test.ts:22`).
- **Disposition:** accepted, both halves. The cross-boundary half is accepted **on
  cost rather than on the prohibition it was written around**: the firewall permits
  a shared test package, so that clause is withdrawn, and **X-06**'s cost argument
  stands in its place — plus a second cost the firewall question had hidden, that
  the two same-named `ScriptedAdapter`s are not near-duplicates, so a shared one is
  a superset nobody needs today. The within-`apps/neoflow` half is declined on this
  ledger's own evidence rule: its four doubles duplicate nothing measurable, so
  `fixed` here would rest on taste. The one genuinely duplicated thing in this area
  is **X-06**'s four `waitFor` helpers, two of them byte-identical, which X-06
  already owns and has already split.
- **Rank:** n/a — `accepted`.
- **Decided:** 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md)

#### A-04 — The launcher's Node gate is looser than every other bound, and starts on known-broken versions

- **Module / file:** Application — `apps/neoflow/src/developerExecutable.ts:18`–`:24`,
  message at `:63`
- **Category:** correctness
- **Severity:** medium
- **Provenance:** not from the P16A sweep. Established while resolving
  [Decide whether the OpenTUI renderer choice survives public distribution](../../.issues/WF-059-decide-renderer-survives-public-distribution.md),
  which accepted the replacement rule this finding proposes.
- **Evidence:** Three places state the supported Node range and all three
  disagree:
  - root and per-package `engines.node` say `>=26.4.0 <26.6.0`;
  - `scripts/check-node-version.mjs` reads that exact range and, at `:47`, prints
    the measured spawn-regression reason for 26.6.0 and above;
  - `developerExecutable.ts:23` returns `major === 26 && minor >= 4` — no upper
    bound at all — and its failure message at `:63` states a third range,
    `>=26.4.0 <27`.
  The loosest of the three is the only one a consumer reaches. `check-node-version.mjs`
  guards `pnpm` scripts, not the executable; a published `bin` runs
  `developerExecutable.ts` directly. So the launcher starts happily on 26.6.0 and
  26.7.0, which are measured as unusable — about 5× slower with suite timeouts on
  26.6.0, 3 to 5 test failures on 26.7.0 — and it will start on any future Node 26
  patch, tested or not, while its own error text promises a `<27` bound it does not
  enforce.
  This matters more than an internal inconsistency because
  [Shape packaging, setup, and release topology](../../.issues/WF-050-shape-packaging-setup-release.md)
  ships v1 as a public npm preview whose users supply their own Node. The gate is
  the only thing standing between a consumer and a runtime nobody tested.
  The two directions are not symmetric, which is why a single range check is the
  wrong repair. Below the floor the FFI flag genuinely does not exist and nothing
  can be attempted. Above the ceiling the version is merely untested, and Node
  patches roughly fortnightly, so an exclusive upper bound would refuse users on
  the newest patch until a Neoflow release caught up.
- **Disposition:** fixed, as proposed — refuse below the floor; above the ceiling
  warn, naming the tested version, and run; refuse only versions on an explicit
  known-bad list carrying the measured reason `check-node-version.mjs:47`–`:53`
  already writes, a version leaving that list when a full suite run passes on it;
  and correct the `<27` message. **The scope is narrowed and the enumeration
  corrected**, both from documents outside the code.
  **The naming binds, and it binds here.** The **P54 amendment of 2026-08-06** in
  [Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md)
  states that "the launcher's own gate is repaired earlier, at **P16C**, as ledger
  finding **A-04**; this package owns only the manifest wording the warning quotes."
  So this is not re-openable as a question of *whether* to fix — a later package's
  acceptance evidence already depends on it having been fixed — and the amendment
  simultaneously **removes half of the proposed repair from this finding**.
  "Single-source the bounds" spans the support manifest, and the manifest is P54's:
  the same amendment obliges it to "name one exact tested Node version a consumer
  can install, not only the declared range". A-04 owns the launcher gate and its
  message; it does not own the manifest wording.
  **There are four statements of the supported range, not three, and the fourth is
  the loosest.** `support/manifest.json:10` declares
  `sourceRequirements.node: ">=22.19.0"`, four majors below the floor every other
  statement names, and it is **pinned by an assertion** —
  `scripts/smoke-build-v1.mjs:132` asserts that exact string, so a naive
  single-sourcing edit turns the build smoke red. The finding's *conclusion* survives
  the correction, because this fourth statement is not a gate: the manifest carries
  `status: "unreleased-source-island"` and an explicitly empty `supportedNodeRanges`
  array, so it declares what the source tree needs rather than what a consumer may
  run. It is recorded because "single-source the bounds" cannot be executed without
  meeting it, and because that empty `supportedNodeRanges` field is the natural home
  for the single source P54 will populate.
  **The finding's own strongest support is one it does not cite.**
  [Decide the declared Node version range](../../.issues/WF-056-decide-declared-node-version-range.md)
  probed directly that pnpm 11.10.0 "does not fail the install on the root project's
  own `engines`, and it does not fail even with `engine-strict=true`". So
  `engines.node` is advisory as a measured fact, not merely as a convention, and
  `check-node-version.mjs` guards `pnpm` scripts rather than the executable. That
  leaves `developerExecutable.ts:23` as the **only** enforcement of any kind that a
  consumer meets — which is what makes its missing upper bound the whole of the
  problem rather than one inconsistency among three.
  **Today's exposure is narrower than the finding implies, and this does not change
  the ruling.** `apps/neoflow/package.json` is `"private": true` at version `0.0.0`
  with `releaseCoordinates.applicationPackage: null`, so the `neoflow-v1-dogfood`
  bin reaches developers, not consumers. The finding is correctly argued from
  [Shape packaging, setup, and release topology](../../.issues/WF-050-shape-packaging-setup-release.md)'s
  future public preview, and P54's amendment is that future arriving in writing.
  **The ceiling question is not answered here.** Whether `<26.6.0` can move is
  **W-14**'s, severed and left open for P16C by
  [Disposition the Workspace evidence and git findings](../../.issues/WF-071-disposition-workspace-evidence-and-git-findings.md).
  This repair is deliberately shaped not to wait on it: a known-bad list plus a
  warning needs no agreed ceiling, and absorbs a moved one without a code change.
- **Rank:** Application / normal
- **Decided:** 2026-08-08 by
  [Disposition the Application bounds and checks findings](../../.issues/WF-077-disposition-application-bounds-and-checks-findings.md)

#### A-05 — The revise-question editor is wired end to end but unreachable, and could not save if it were reached

- **Module / file:** Application — `apps/neoflow/src/reviewingModel.ts:275`–`:279`,
  `:154`–`:162`, `:872`–`:904`;
  `apps/neoflow/src/reviewingApplication.ts:307`–`:311`, `:1114`–`:1161`
- **Category:** maintainability
- **Severity:** low
- **Provenance:** not from the P16A sweep. Established while resolving
  [Decide whether the `reviewingModel` refactor is in scope](../../.issues/WF-058-decide-reviewingmodel-refactor-scope.md).
  It **corrects** this ledger's own earlier ruling that no dead
  `ReviewingModelEffect` variant exists; that entry is kept, marked wrong, in the
  `apps/neoflow` part of **Ruled out**.
- **Evidence:** The earlier ruling tested the wrong direction. It established that
  all 14 declared variants have an `effect.type === '…'` dispatch arm in
  `#runEffects`, which is the *consumer* side. A variant is dead when nothing
  **constructs** it, and a handler with no producer is exactly what unreachable
  code looks like.
  Counting constructions instead: `git grep` for the literal `load-question-editor`
  across every tracked file returns two code sites only — the union member
  (`reviewingModel.ts:276`) and the dispatch arm (`reviewingApplication.ts:307`).
  Nothing creates it. The two other variants with no producer inside the model,
  `copy-question-selection` and `copy-review-selection`, are constructed by the
  **view** (`reviewingView.ts:2297`, and `:2279`, `:2324`) and are live, so the
  producer sweep has to cover the view as well as the model; `load-question-editor`
  has no producer in either.
  What sits behind it is a whole feature path. The dispatch arm calls
  `#loadQuestionEditor` (`:1114`–`:1161`, a paged `review.question-body` read with a
  `stateVersion` restart loop), whose success branch at `:1151` is the only caller
  of `openReviseEditor` (`reviewingModel.ts:872`–`:904`), which is in turn the only
  writer of a `revise-question` editor — the `ReviseQuestionEditor` interface at
  `:154`–`:162`, one of the two members of `LocalQuestionEditor` at `:164`. The
  sibling is the contrast: `create-question` is entered from a keybinding,
  `data.text === 'q'` while `focus === 'diff'` (`:1146`).
  It is unfinished, not merely unbound. Two guards refuse a revise editor on the way
  out: `submitEditor` returns `[]` for any editor whose kind is not
  `create-question` (`:2367`), and `editorCommand` refuses the same (`:2389`).
  Adding the missing entry point would therefore open an editor that silently
  cannot save — which is what makes this dead code rather than a one-line gap.
  **100 lines** are unreachable: 5 (union member) + 5 (dispatch arm) + 48
  (`#loadQuestionEditor`) + 33 (`openReviseEditor`) + 9
  (`ReviseQuestionEditor`).
- **Amended 2026-08-07** by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md):
  **the path's Workspace end is dead too, and was not in the 100-line count.** The
  producer sweep found `review.question-draft.revise` constructed by nothing in any
  package, including tests, while it remains declared
  (`packages/workspace/src/reviewing.ts:114`), validated (`:733`), given a dispatch
  arm (`:1689`), and listed among the projected action kinds
  (`projection.ts:206`). This does not change the disposition — the same product
  decision governs both ends — but whoever executes the deletion should know it spans
  two packages, not one, and that the Workspace half is what a reader of
  `reviewing.ts` alone would take for a live command.
- **Measured 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md).**
  The Application count is **exact**: 9 + 5 + 5 + 48 + 33 = 100, every span boundary
  re-read, and `load-question-editor` still returns exactly two code sites. Two
  facts strengthen the Application half. The save path is refused **three** ways,
  not two — beyond the two kind guards, `submitEditor` hardcodes
  `const actionKind: ReviewProjectedActionKind = 'review.question.ask'` (`:2368`),
  so deleting both guards would build an *ask* command from a revise editor rather
  than a revise command; there is no wrong-but-present save path, there is none at
  all. And nothing upstream is orphaned: `review.question-draft.revise` reaches
  `projection.ts` only as a member of `ReviewProjectedActionKind` (`:206`) and is
  passed to `projectedAction` nowhere, so the projection never advertises a revise
  action.
  **The Workspace end the amendment added has now been counted: 106 lines.**
  `reviewing.ts:113`–`:121` (`ReviseReviewQuestionDraftCommand`, 9), `:191`–`:197`
  (`ReviewQuestionDraftRevised`, 7), `:232` (its member of
  `ReviewingCommandAccepted`, 1), `:733`–`:761` (validation, 29), `:1689`–`:1690`
  (dispatch, 2), `:2390`–`:2444` (`#reviseDraft`, 55), plus `projection.ts:206`,
  `index.ts:141` and `workspace.ts:152`, one line each. **So the deletion as
  proposed is 206 lines across two packages, not 100**, and three of them sit on the
  Workspace's published Interface.
- **Disposition:** split — **fixed** for the Application half (delete the five
  spans; that collapses `LocalQuestionEditor` to its single live member and retires
  both kind guards and the hardcoded action kind with it, changing no behavior
  because no path reaches any of it, and orphaning nothing because the
  `review.question-body` read is shared with the live question-discussion path at
  `reviewingApplication.ts:1079`), and **accepted** for the Workspace half.
  **This overturns the proposal and the ticket's instruction to decide the deletion
  as one act**, because the two ends fall on opposite sides of the rule this pass
  had to state — recorded in full on **X-08**, which is the finding this one
  contradicts. The Application end fails it on every count: no `CONTEXT.md` term, no
  entry in the blueprint seam, no step in the chosen dogfood slice, and three
  refusals in its own file. The Workspace end passes it. `review.question-draft.revise`
  is the durable expression of **Annotation Draft** (`CONTEXT.md:327`) — "Mutable,
  local feedback… **It remains editable until the user deliberately commits it**" —
  and its sibling `review.question-draft.create` is **step 3** of the chosen slice
  ([Choose the first dogfoodable vertical slice](../../.issues/WF-047-choose-first-dogfood-slice.md))
  as well as a surface **X-08** keeps. Deleting revise while create stays would
  leave a draft that can be created and never edited, contradicting the domain term
  the Workspace exists to serve — which is X-08's "deleting them would destroy
  intended work", in reverse.
- **Obligation on the accepted half: it inherits X-08's coverage argument.**
  `#reviseDraft` is 55 lines of state mutation with no producer and no test, the
  same shape X-08 refuses to leave uncovered, and **X-09** routed "the revise pair"
  to this finding rather than to X-08. Cover it alongside `#requestInterruption` —
  same package, same suite.
- **Rank:** Application / normal — the deletion is mechanical once the split is
  decided, and no later package makes it dearer.
- **Decided:** 2026-08-08 by
  [Disposition the Application unreachable-surface and test-double findings](../../.issues/WF-076-disposition-application-unreachable-surface-findings.md)

#### A-06 — Every visible current Review re-runs three `git` processes every 750 ms, forever

- **Module / file:** Application — `apps/neoflow/src/reviewingApplication.ts:43`,
  `:555`–`:572`, `:574`–`:609`; Workspace —
  `packages/workspace/src/projection.ts:1303`–`:1364`,
  `packages/workspace/src/workspaceEvidence.ts:2420`, `:857`–`:885`
- **Category:** performance
- **Severity:** medium
- **Provenance:** not from the P16A sweep. Established on 2026-08-06 while working
  [Re-verify the ledger's ruled-out leads](../../.issues/WF-062-re-verify-ruled-out-leads.md).
  It **corrects** this ledger's own ruling that no polling exists in
  `apps/neoflow/src`; that entry is kept, marked wrong, in the `apps/neoflow` part
  of **Ruled out**.
- **Evidence:** `#scheduleCurrentSourceVerification` arms a
  `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS = 750` timer (`:43`, `:567`–`:571`), and
  `#verifyVisibleCurrentSource` re-arms it from its own `finally` (`:607`)
  regardless of outcome. That is a self-rescheduling poll, not a one-shot timer,
  and it runs for as long as the route is a Review whose header retention is
  `current` (`:558`–`:566`). It is first armed after the initial Review read
  (`:465`).
  Each tick costs more than one read. The callback issues
  `review.manifest` with `limit: MANIFEST_WINDOW_SIZE` (64,
  `reviewingModel.ts:42`) through `Projection.read`, which runs `#readOnce` **and**
  a second `#state.read` to confirm the state version, retrying up to four times
  (`projection.ts:1120`–`:1140`). `#readOnce` reaches `#snapshotStatus`
  (`:1303`), whose `#snapshotStatusReads` entry is deleted in a `finally`
  (`:1313`–`:1315`) — so that map dedupes only *concurrent* callers and never
  caches across ticks. For a current-retention Snapshot `#readSnapshotStatus`
  issues `workspace.current-changes.verify` (`:1341`), which reaches
  `WorkspaceEvidence.#verify` and calls `inspect` (`workspaceEvidence.ts:2420`).
  `inspect` (`:857`–`:885`) spawns **three** `git` processes in sequence:
  `rev-parse --show-object-format` (`:861`), `rev-parse --verify --quiet
  HEAD^{commit}` (`:865`), and a whole-working-tree `status --porcelain=v2`
  (`:877`). Nothing is cached between ticks, and there is no backoff when the
  answer does not change — the loop is what *detects* working-tree drift, because
  a working-tree edit bumps no state version and so publishes no Projection
  update.
  Net cost while a user simply reads a current Review: three `git` spawns plus a
  full `status` walk plus two state-worker round trips, every 750 ms, whether or
  not anything changed.
  It also changes the exposure of two existing findings. **W-09** (`runGit` has no
  timeout) and **W-07** (high — `git` stdin has no error listener, so the
  output-limit `SIGKILL` can raise an unhandled `EPIPE` and terminate the process)
  both describe this exact `runGit` path. W-07's likelihood was assessed against
  user-initiated reads; this loop re-enters the same path unattended, 80 times a
  minute, for the whole time a Review is on screen.
- **Disposition:** deferred to **P16B — Implement the accepted Live Changes design**
  of
  [Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md),
  named explicitly as the ledger's disposition scale requires. **The deferral is
  ratified on the reasoning the proposal gave, reproduced here because it holds:**
  this loop *is* the machinery that maintains the stale blocker, and the accepted
  design in
  `docs/research/live-working-tree-review-refresh-and-anchors-2026-08-05.md`
  replaces it wholesale: live working-tree state becomes "a Workspace-owned
  projection … updated from invalidation hints plus authoritative verification",
  which moves detection out of the Application and off a fixed cadence, and that
  document states plainly that "the current Gate A implementation still uses one
  immutable Snapshot and a stale blocker". Under this map's rule that a finding in
  code Live Changes will rewrite is deferred rather than decided here, that is the
  ruling.
  **The proposal also recorded an interim mitigation against the deferral, on the
  premise that "the owning package is at P19/P22 and this ships before it". That
  premise is false, and the mitigation is withdrawn.** The argument it made is kept
  below because the reasoning that overturns it is the useful part: the cadence
  alone is one constant. The loop consumes only
  `header.snapshotStatus` (`:598`), so neither the 64-file manifest window nor the
  750 ms interval is load-bearing, and backing the interval off while the status is
  unchanged would cut the unattended re-entry of **W-07**'s crash path without
  touching the mechanism Live Changes will replace. Whether the fixed cadence was
  ever a deliberate product choice is recorded nowhere in `docs/` or `CONTEXT.md`,
  which is itself part of the finding.
  **Why that premise is false, and why it strengthens the deferral rather than
  weakening it.** The withdrawn note defers "because the owning package is at
  P19/P22 and this ships before it". P16B
  is not at P19/P22. Its stated dependency is **P16A — Audit architecture and risk
  across every package**, the audit that produced this ledger and is already
  complete; and **P16C — Deepen the active Modules** declares its own dependency as
  "Implement the accepted Live Changes design". So the order is
  **P16A → P16B → P16C**, and the package that deletes this loop runs *before* the
  package in which every other finding on this ledger is repaired. The later
  packages the note is reaching for — P19 Complete Change Set and Review Snapshot
  evidence, P22 Implement complete Reviewing Annotation authority — complete the
  Live Changes *semantics*; they are not the package this finding names. The same
  fact was already visible from the other side of the ledger: all four pull-forwards
  it carried at that point were recorded as `before P16B`, which is only a meaningful instruction
  because P16B is early.
  Everything the mitigation was for therefore evaporates. It exists to shorten a
  window that closes at the very next package, and it would be spent on code
  scheduled for deletion in that package.
  **Two further reasons not to touch the cadence, either of which would be enough.**
  First, **the loop has no test coverage of any kind**: neither
  `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS` nor `#verifyVisibleCurrentSource`
  appears anywhere under `apps/neoflow/test/`. Changing the refresh cadence of the
  Application's automatic liveness path would be an unverifiable change to
  untested code, and the freshness latency it alters is user-visible. Second, the
  crash path it protects is **already scheduled ahead of it**: **W-07** and **W-09**
  are both settled `fixed` and both ranked `Workspace / first`, the head of the
  first band of P16C. Whichever way the two packages interleave, the unattended
  re-entry this finding correctly identifies ends at the next package — either
  because P16B deletes the loop, or because W-07's `stdin` listener makes the
  re-entered path safe. It cannot outlive both.
  **The exposure argument was real and is recorded as answered, not dismissed.**
  Neither W-07's nor W-09's rank reasoning cites this loop — W-07 ranks first as the
  only `high` with a small repair, W-09 because it rides inside W-07's edit — so
  this finding's contribution is genuinely new information about their exposure. It
  changes neither rank, because both are already as early as the scale allows.
  **The mechanism was re-verified rather than taken on trust, and it is exactly as
  described.** `#verifyVisibleCurrentSource` re-arms from its own `finally`
  (`:607`), so it is self-rescheduling rather than a one-shot; it consumes only
  `snapshotStatus` (`:598`); and `inspect` (`workspaceEvidence.ts:857`–`:885`) does
  spawn three `git` processes in sequence — `rev-parse --show-object-format`,
  `rev-parse --verify --quiet HEAD^{commit}`, and `status --porcelain=v2`.
  **Two accuracy corrections to the evidence, neither changing the disposition.**
  The timer is `unref`ed (`:571`), so "forever" means for as long as the Review is on
  screen in a process that is running anyway — the loop does not by itself keep the
  process alive. And the empty `catch` (`:601`–`:605`) is **capability-shaped, not an
  accident**: `CONTEXT.md:296`–`:297` defines Snapshot Status as current, stale, or
  unverified and lists `_Avoid_: Git error means stale, assumed current`, so
  swallowing a transient verification failure rather than publishing a false state is
  the canonical rule being obeyed. Recorded so it is not re-filed as a finding later.
  **The "intent recorded nowhere" claim survives a stricter test than it was made
  against.** The finding checked `docs/` and `CONTEXT.md`. Extending the search to the
  third source the capability rule on **X-08** requires — the package outcomes and
  **amendments** in
  [Design the solo-developer execution plan](../../.issues/WF-051-design-solo-developer-execution-plan.md)
  — also finds no statement of a refresh cadence. Nothing anywhere records 750 ms as a
  product choice. P16B inherits that question with the code.
- **Rank:** n/a — `deferred`. The finding leaves the Application band with its code,
  so a band within a package that will not work it carries no instruction.
- **Decided:** 2026-08-08 by
  [Disposition the Application bounds and checks findings](../../.issues/WF-077-disposition-application-bounds-and-checks-findings.md)

### Root scripts and configuration

#### R-01 — `@types/node` was four majors behind the declared runtime

**Heading corrected on 2026-08-09.** The finding was true when filed and was
repaired before this disposition pass.

- **Module / file:** root — `package.json` `devDependencies`
  (`"@types/node": "^22.10.2"`, resolving to 22.20.0);
  `apps/neoflow/package.json` (`"node": ">=26.4.0 <27"`)
- **Category:** maintainability
- **Severity:** low
- **Evidence:** The type definitions describe Node 22 while the Application
  declares Node `>=26.4.0 <27` and the accepted candidate was proved on exactly
  26.4.0 with `--experimental-ffi`. So every `node:` API in the active source is
  typechecked against a surface four majors older than the one it runs on: the
  compiler cannot see APIs added since 22, and may still permit behavior that
  changed by 26.
  Two things keep this low rather than higher. There are **zero** type escapes in
  the entire active source — no `as any`, no `: any`, no `ts-expect-error`, no
  `ts-ignore` — so nothing has been worked around to satisfy the stale types;
  `node:sqlite`'s `DatabaseSync`, the newest API in use, typechecks cleanly. And
  the mismatch is a build-time concern only: runtime behavior is proved by the
  probes and gates.
  Worth noting alongside it, the machine this audit ran on reports **Node
  v24.18.0** — neither the declared 26.4.0 nor the typed 22. Together these are
  three different Node versions in play for one repository.
  This is evidence for
  [Decide the declared Node version range](../../.issues/WF-056-decide-declared-node-version-range.md)
  rather than an independent decision; that ticket already owns the `engines`
  spread (root and every legacy package declare none, the three active packages
  declare `>=22.19.0`, the app declares `>=26.4.0 <27`).
- **Discharged before disposition.** The Node-range decision changed the repository's
  sole `@types/node` declaration to `^26.1.2`, fixed the real optional
  `process.disconnect` call the new types exposed, and passed the complete
  verification route on 26.5.1. A manifest sweep confirms there is no second
  declaration to leave stale.
- **Disposition:** fixed — by
  [Decide the declared Node version range](../../.issues/WF-056-decide-declared-node-version-range.md).
  The disposition describes the defect's state; it does not require a fifth
  “fixed elsewhere” state. W-14 and A-04 are unaffected by that bookkeeping rule
  because each retains a repair independent of the part the same waiver touched.
- **Rank:** n/a — there is no remaining P16C work to order.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### R-02 — The four risk probes are outside the canonical verification route

- **Module / file:** root — `package.json` scripts `verify`, `v1:verify`,
  `legacy:verify` versus `v1:risk:state`, `v1:risk:runtime`, `v1:risk:pi`,
  `v1:risk:dogfood`
- **Category:** testing
- **Severity:** low
- **Evidence:** `verify` expands to
  `legacy:test && legacy:typecheck && legacy:build && legacy:smoke:build` then
  `v1:check:dependencies && v1:test:full && v1:typecheck && v1:build &&
  v1:smoke:build`. None of the four `v1:risk:*` probes appears anywhere in that
  chain, so **`pnpm verify` can pass while every risk probe is unrun**.
  The split is defensible and probably deliberate — `v1:risk:pi` needs a live
  authenticated Pi and `v1:risk:dogfood` needs `--experimental-ffi`, neither of
  which belongs in a routine typecheck-and-build loop. The cost is that the
  acceptance bar for **P16C** and **P16E** is "canonical verification and all four
  risk probes pass", which is two commands with nothing tying them together; the
  probes are exactly the checks a tired session skips.
  Note that the dependency firewall *is* wired in, as `v1:check:dependencies`
  inside `v1:verify` — so the good pattern is already present for one of these.
- **Amended 2026-08-07** by
  [Audit dead code, unused exports, and test quality](../../.issues/WF-060-audit-dead-code-and-test-quality.md),
  which was asked whether this weakens the suite. **It does, but not in the way the
  finding implies, and the aggregate would not fix it.** The four probes plus the
  dogfood probe are 1,627 lines carrying 136 assertions — real weight sitting outside
  the route. But they construct only kinds the unit tests already exercise
  (`review.current-changes.start`, `review.question.ask`, `review.questions`,
  `review.snapshot`, `workspace.home`, `workspace.identity`), so what the route misses
  by omitting them is **integration-level confirmation of paths that are already
  unit-covered**, not coverage found nowhere else. The genuine hole is **X-09**, and
  the probes miss it as completely as the suite does. Wire the aggregate for the
  reason this finding gives — a single gate command — but do not book it as closing a
  coverage gap, because it closes none.
- **Tested 2026-08-09 — one operational premise is false and the proposed ruling
  contradicts itself.** `v1:risk:pi` launches the real pinned Pi executable but
  registers `neoflow-p14-probe/deterministic` with a local `streamSimple`; it uses no
  authenticated provider. More importantly, a `verify:gate` script is a change while
  `accepted` means no change. The 1,627 lines are the **four** probe files including
  dogfood, not “four probes plus the dogfood probe”. The quoted **136 assertions** is
  also a grep-line count rather than an assertion count: it includes four `assert`
  import lines. The executable population is **116 `assert` calls plus 16 explicit
  `throw new Error` checks = 132**. No package result has omitted a required probe,
  and the earlier sweep established that they add integration depth, not a unique
  path that only an aggregate can protect.
- **Disposition:** accepted — keep the probes outside the routine canonical route and
  keep P16C/P16E's acceptance language explicit: `pnpm verify` **and all four named
  probes**. The proposed aggregate is withdrawn; absent a measured omission, it is
  convenience rather than an evidence-backed repair.
- **Rank:** n/a — accepted, so there is no work to order.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

### Legacy packages

Scope is deliberately narrow, per **P16D**: correctness, security, migration, and
deletion blockers only. The legacy surface is 41 files / ~7,600 lines across
`apps/tui`, `apps/cli`, `packages/core`, `packages/ai-harness`, and
`packages/pi-connector`. Everything not recorded below is **deletion-bound**, and
polishing it is explicitly out of scope.

#### LG-01 — The two legacy durable data locations, recorded for the P17 importer

- **Module / file:** `apps/tui/src/review/persistence.ts:165`, `:200`, `:205`;
  `apps/tui/src/review/receipts.ts:494`, `:547`, `:552`
- **Category:** migration
- **Severity:** not a defect — a fact the importer depends on
- **Evidence:** The legacy queue is
  `<git-root>/.neoflow/review.json` (`persistence.ts:165`) and the legacy receipt
  history is
  `<XDG_STATE_HOME|~/.local/state>/neoflow/workspaces/<sha256(canonical-git-root)>/review-receipts.json`
  (`receipts.ts:494`). Both are created with directory mode `0o700` and file mode
  `0o600` (`persistence.ts:200`/`:205`, `receipts.ts:547`/`:552`), so the private
  permissions the HANDOFF claims are real, and no legacy user data sits
  world-readable.
  These are exactly the inputs **P17**'s read-only importer must discover and
  preserve byte-for-byte. Recording them here means P17 does not have to
  rediscover them, and gives the legacy-cutover package a concrete list of what
  must survive deletion.
- **Corrected 2026-08-09 — the locations and file mode hold; the directory claim
  is too strong.** Both writers create a fresh temporary file with `mode: 0o600`
  and atomically rename it, so bytes produced by either save path are private.
  Both call recursive `mkdir(..., { mode: 0o700 })`, but — as S-04 records for the
  same primitive — that mode applies only when the directory is created and is not
  re-asserted on a pre-existing path. Neither legacy writer checks owner or mode.
  This does not change P17: its accepted design already treats legacy files as
  potentially planted input, captures exact bytes, and infers no authority from
  filesystem permissions.
- **Disposition:** accepted as a recorded fact. No code change; the two locations
  and their exact-byte treatment are already carried to P17 and to
  [Define legacy deletion, cutover, and data migration](../../.issues/WF-049-define-legacy-cutover-migration.md).
  A fact still takes one of P16E's four classifications; no fifth “record” state is
  needed.
- **Rank:** n/a — accepted.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### LG-02 — The known oversized-diff failure is still live in the legacy TUI

- **Module / file:** `packages/core/src/git.ts` (`getGitDiff`), consumed by
  `apps/tui/src/App.tsx`
- **Category:** correctness
- **Severity:** medium in legacy terms; the unsafe residue is fixed and the
  superseded Interface is deletion-bound
- **Evidence:** This is the defect already diagnosed and written up in
  `HANDOFF.md` §"Oversized-diff diagnosis and privacy boundary": one aggregate
  `git diff` with `maxBuffer` of only `maxBytes + 1024`, so a tracked aggregate
  slightly over 512 KiB fails before any file can be shown; untracked files each
  get only the remaining aggregate budget, so one large untracked file aborts the
  whole Changes refresh; and `getGitDiff` can only return a string or throw, so
  the TUI cannot distinguish a complete diff from a bounded partial one.
  The audit confirms it is unchanged and still reachable. It is **not** a blocker
  under P16D's test: it fails visibly and loudly, mutates nothing, and loses no
  durable data — the user sees an error instead of a diff. The replacement route
  already exists in the v1 island (P09's Workspace Evidence with a complete
  manifest and per-side limitations), and the plan states explicitly that this
  Interface must not be patched out of sequence.
- **Corrected 2026-08-09 — the user sees an error *with the prior diff*, not
  instead of a diff.** `refreshGitDiff` replaces `gitDiff` only on success
  (`App.tsx:247`). Its catch sets `Git diff failed: …` at `:252` but never clears the
  previous state, and `ChangesPanel` continues parsing and rendering that old string
  while showing the error in its red footer. This is precisely the stale-diff risk
  the finding's cited HANDOFF section records at line 532, and it crosses P16D's
  “unsafe to leave running” bar: a review surface may remain old after the source
  changed. The error is visible, so this is not silent; the stale code is still
  actionable on the same screen.
- **Disposition:** split.
  - **fixed** — on any refresh failure, clear `gitDiff` before reporting the error so
    stale content cannot remain presented. This is a narrow Application-state repair,
    not a change to `getGitDiff`; under P16D's learning gate it adds no capability,
    refactor, or new legacy test.
  - **deletion-bound** — the 512 KiB aggregate failure, untracked-file budgeting,
    and string-or-throw Interface remain unchanged. The v1 Evidence route already
    supplies complete manifests and per-file degradation, and transplanting that
    architecture into legacy would create the forbidden second implementation stream.
- **Rank:** Legacy / normal — after LG-01's accepted fact this is the band's only
  executable work, so `first` would claim an ordering that does not exist.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### LG-03 — Legacy private-path writers follow symlinked owned directories

- **Module / file:** `apps/tui/src/review/persistence.ts` (`loadReviewAnnotations`,
  `saveReviewAnnotationsSync`); `apps/tui/src/review/receipts.ts`
  (`loadReviewReceiptsSync`, `saveReviewReceiptsSync`); and
  `apps/tui/src/bridge/server.ts` (`startBridgeServer`)
- **Category:** security
- **Severity:** high — the legacy process can replace or remove a file outside its
  intended queue/state root, which crosses the durable-data-loss threshold
- **Evidence:** All three paths construct an application-owned child path and then
  use filesystem calls that follow an existing directory symlink. Disposable
  P16D probes established the concrete effects without touching repository data:
  - a checkout whose `.neoflow` is a directory symlink caused
    `saveReviewAnnotationsSync` to replace the target directory's existing
    `review.json`;
  - a state base whose `neoflow` child is a directory symlink caused bridge startup
    to chmod the target directory, unlink its regular `socket` file, and create the
    listening socket there; and
  - the same state layout caused `saveReviewReceiptsSync` to create the hashed
    receipt tree outside the configured Neoflow state root.
  Bridge startup performs its mutation automatically. Queue mutation requires an
  explicit legacy annotation operation, but the symlink can come from the hostile
  repository class already named by the threat model. Existing `0o600` temporary
  files do not constrain where the rename lands, so LG-01's file-mode fact remains
  true but does not close this path-identity defect.
- **Disposition:** fixed — P16D makes every application-owned queue/state directory
  fail closed when it is a symlink or non-directory before chmod or write; queue and
  receipt reads reject symlink source files; and bridge startup refuses a non-socket
  endpoint instead of unlinking it. Configured base directories may retain their
  operator-selected location, existing regular legacy bytes remain untouched, and
  no importer, migration, or new legacy capability is added.
- **Rank:** Legacy / first — it is the legacy band's only destructive finding and
  must close before the normal stale-rendering repair.
- **Provenance:** Confirmed on 2026-08-27 by P16D's blocker-only review after the
  original two-entry legacy sweep explicitly warned that its thin count was not
  evidence of a clean tree.
- **Decided:** 2026-08-27 by
  [Audit the retained legacy blocker surface](../../.issues/WF-136-audit-retained-legacy-blocker-surface.md)

### Security posture and supply chain

Owner ticket:
[Audit the local security posture and dependency supply chain](../../.issues/WF-061-audit-security-posture-and-supply-chain.md).

**The assumed attacker.** Neoflow is a local single-user developer tool, so the
operator is trusted: they already have shell access to their own machine, and
"the user could do this themselves" is never a finding. What counts is untrusted
*input* reaching a trusted decision. Four inputs were treated as hostile: a
repository the operator did not author (its contents, its branch and path names,
and — where the operator obtained the directory rather than cloning it — its own
`.git/config`), a malformed or malicious Pi response, terminal input including
bracketed paste, and a corrupted or planted file in durable state. A later reader
judging this sweep's reach should judge it against exactly that list.

#### S-01 — `git status` executes a command named by the repository's own config

- **Module / file:** Workspace —
  `packages/workspace/src/workspaceEvidence.ts:877`–`:892`, spawning through
  `runGit` at `:646`
- **Category:** security
- **Severity:** medium
- **Evidence:** `inspect` runs
  `git -c core.quotePath=false -c core.fileMode=true status --porcelain=v2 -z
  --untracked-files=all --find-renames=50% --` with `cwd` set to the checkout.
  Git consults `core.fsmonitor` from the repository's local `.git/config` when it
  refreshes the index, and runs its value as a command. Reproduced on Git 2.51.2
  with that exact argument vector against a fresh repository whose
  `.git/config` set `core.fsmonitor` to a shell script: the script ran on all
  three of three runs. Adding `-c core.fsmonitor=` to the same invocation
  suppressed it, so the fix is one argument. Two neighbouring vectors were
  checked and are **not** exposed: `diff-tree -r --raw` and `cat-file --batch`
  do not invoke `diff.external`, and `rev-parse` and `log --graph` never query
  `core.fsmonitor` at all. `GIT_PAGER=cat` and `GIT_TERMINAL_PROMPT=0` are
  already set in `processEnvironment` (`:624`–`:634`), so the pager and prompt
  vectors are closed; the index-refresh hook is the one that is not.
  Reachability is narrower than it first appears: `git clone` does not carry
  `.git/config` from the remote, so this needs the operator to obtain a
  repository *directory* with its `.git` intact — an extracted archive, a copied
  or synced folder, a restored backup — and then open it in Neoflow. Git's
  dubious-ownership check blocks the variant where the directory belongs to
  another user, but not the variant where the operator now owns what they
  extracted.
- **Second vector, established 2026-08-07 while dispositioning this finding.**
  `core.fsmonitor` is **not** the only key on this path, and the proposed
  one-argument fix does not close the other one. Reproduced on the same Git
  2.51.2 with the same argument vector: a repository whose tracked
  `.gitattributes` sets `* filter=<name>` and whose `.git/config` sets
  `filter.<name>.clean` to a shell command runs that command during `status`.
  Adding `-c core.fsmonitor=` does not suppress it. Three properties make this
  the worse of the two vectors:
  - **It fires on an unmodified working tree.** The clean filter runs whenever
    the index stat cache is invalid, not only when content changed — verified by
    running `status` against a tree whose files had just been rewritten to their
    committed contents. Extracting or copying a directory gives every file a
    fresh mtime, so the *first* `status` on exactly the hostile input this
    finding describes re-hashes the tree and runs the filter. The fsmonitor
    vector needs an index refresh to happen; this one is what an index refresh
    does.
  - **The driver name is chosen by the attacker**, so the per-key blanking that
    fixes `core.fsmonitor` has nothing to enumerate. `-c filter.<name>.clean=`
    does suppress it when the name is known (verified), which is no help.
  - **A name-independent suppression exists but is not free.**
    `GIT_ATTR_SOURCE=<empty tree>` suppresses it (verified), by making Git read
    no attributes at all. What that costs a repository that uses filters
    legitimately is **not established**: the probe that tried to measure it was
    confounded, because `status` already reports a legitimately-filtered file as
    modified when its cleaned content matches the index exactly. That is a
    pre-existing Git behaviour, not a consequence of the hardening, and it means
    the false-positive question is still open.
  Two neighbouring keys were checked and are **not** reached by this invocation,
  confirming the original entry: `diff.external` (status runs no diff) and
  `core.pager` / `core.editor` (already closed by `processEnvironment`).
- **Disposition:** fixed — but **wider than proposed, and no longer a
  one-argument change.** Ratified as a real defect worth repairing in the gate;
  overturned on scope. `-c core.fsmonitor=` is still correct and still cheap, and
  it is now a *partial* fix rather than a closure. P16C owns a class-wide
  mechanism covering checkout-controlled executable effects, not merely a second
  clean-filter fix; choosing it means settling the behavioural cost above. The
  sentence this entry previously carried — that one argument "closes the only
  confirmed path from repository content to command execution" — was wrong and is
  withdrawn.
- **Rank:** Workspace / first — the fsmonitor half is a two-element change with
  no design question attached and no reason to sit behind nineteen other
  findings, while the class-wide mechanism needs to be chosen before ordinary
  Workspace work can presume Git inspection is safe.
- **Not pulled ahead.** No later package makes this repair dearer or is made
  safer by having it done; it was grouped with the pull-forwards for value, not
  for sequence. Explicitly recorded because the ledger's framing invited the
  opposite reading.
- **Severity holds at medium.** The second vector widens the fix, not the
  reachability — both still require the operator to obtain a repository
  *directory* with its `.git` intact and open it in Neoflow.
- **Execution obligation added 2026-08-09.**
  [The standing policy](../../.issues/WF-070-decide-checkout-git-config-trust.md)
  treats checkout-controlled Git configuration as untrusted for executable
  effects. It applies before the first Git invocation and covers both
  `workspaceIdentity.ts` and `workspaceEvidence.ts`; opening the directory is not
  consent. P16C must support closure with a class-level completeness argument,
  regress both confirmed vectors, and re-measure attribute suppression before
  assigning it a behavioural cost. A seam carve-out needs affirmative evidence.
  If transparent class-wide hardening cannot preserve required repository
  behavior, the Workspace fails closed or requires explicit checkout-specific
  trust rather than silently falling back to a known-key list. This policy does
  not select the implementation mechanism or declare all structural Git
  configuration semantically irrelevant.
- **Decided:** 2026-08-07 by
  [Disposition the findings best decided ahead of the rest](../../.issues/WF-064-disposition-do-first-findings.md)

#### S-02 — The dependency cooldown the workspace appears to configure is not on

- **Module / file:** Root configuration — `pnpm-workspace.yaml:10`–`:23`
- **Category:** security
- **Severity:** medium
- **Evidence:** `pnpm-workspace.yaml` carries a `minimumReleaseAgeExclude` list
  of fourteen exact `name@version` entries — the Pi packages, all eight
  `@opentui/core-*` platform natives, and `@opentui/core@0.5.1`. Nothing sets
  `minimumReleaseAge`. It appears in no file in the repository, there is no
  `.npmrc` at the root, and `pnpm config get minimumReleaseAge` reports
  `undefined`. pnpm's cooldown defaults to disabled, so the exclusion list
  governs a policy that is not running: every dependency, excluded or not,
  installs at whatever age it happens to be. The cost is not only the missing
  cooldown but the misreading — the file states an intent a reviewer will credit,
  and the exclusions are the strongest evidence that somebody meant the cooldown
  to be on.
- **History settles which branch of the proposal is honest.** The four Pi entries
  arrived in **Checkpoint attached harness and review workflow**, the same commit
  that introduced the exact Pi 0.80.6 dependency, and the nine OpenTUI entries
  arrived in **Complete Gate A OpenTUI reviewing candidate**, the same commit that
  pinned 0.5.1. The grouping and exact `name@version` form match pnpm 11.10.0's
  strict release-age approval path, which persists an intentionally selected
  immature version into `minimumReleaseAgeExclude`. These are reviewed exceptions
  left without their policy, not a list whose deletion expresses the repository's
  intent.
- **Disposition:** fixed — set `minimumReleaseAge: 1440` in
  `pnpm-workspace.yaml`, retaining the fourteen exact exceptions. The unit is
  minutes: ordinary new versions wait **24 hours**, while the Gate-proved Pi and
  OpenTUI pins remain installable. One day is proportional for a solo project: it
  makes a same-day replacement observable without forcing routine updates to wait
  several days, and pnpm's strict interactive approval can still record an exact
  urgent exception. Do not add `minimumReleaseAgeStrict`; pnpm 11.10.0 defaults it
  to true when `minimumReleaseAge` is explicitly set, so restating it would add no
  policy.
- **Rank:** Root / first — the only medium root finding and the only one governing
  what code a future dependency resolution may admit. It is not pulled ahead:
  nothing establishes that P16B or an earlier P16C package will resolve a new
  dependency.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### S-03 — The v1 dependency firewall does not police third-party dependencies

- **Module / file:** Root scripts — `scripts/check-v1-dependencies.mjs:113`–`:121`
- **Category:** security
- **Severity:** low
- **Evidence:** `v1:check:dependencies` is the workspace's only automated
  dependency gate. `checkSpecifier` rejects imports of the five legacy package
  names and outward imports across v1 package boundaries, then reaches
  `} else { return; }` for every bare specifier that is neither — so any
  third-party package name passes unexamined. The `allowedV1Dependencies` sets
  list only `@neoflow/*` names; `apps/neoflow` already declares `@opentui/core`
  as a runtime dependency and the check has nothing to say about it. Adding a
  new npm dependency to a v1 package therefore passes `pnpm verify` silently.
  The check does enforce that all four v1 packages stay `private: true`
  (`:86`–`:88`), which is real and is what keeps S-06's exposure unpublished.
- **The proposal's own expiry condition has fired.** It says the gap starts to
  cost when “an agent can edit a manifest”; this map and the execution packages are
  being worked by coding agents with exactly that access. `private: true` prevents
  accidental publication but does not prevent an unreviewed dependency from entering
  a manifest, the integrity-pinned lockfile, or the local process. The self-hosted
  registry proxy does not alter that conclusion: integrity protects the selected
  bytes, while this gate decides which package names may be selected at all.
- **Current allowlist enumerated.** Among production `dependencies`, Workspace and
  Local Runtime have no external package, Pi Adapter has only internal packages,
  and Application has `@opentui/core`. The separately host-loaded Pi Adapter also
  imports and declares `@earendil-works/pi-coding-agent` as a peer/dev dependency.
  Test source adds `vitest`, and Application tests use `@opentui/core/testing`.
  Those are the complete intentional bare-package surfaces today; `node:` built-ins
  are not third-party dependencies.
- **Disposition:** fixed — extend `check-v1-dependencies.mjs` with an explicit
  per-package external allowlist, including the peer and test-only distinctions the
  current tree needs, and reject every other bare package in both manifest fields and
  module specifiers. Keep this in the existing firewall rather than creating a new
  script or Interface. An allowed package subpath inherits only its allowed top-level
  package; adding a new name requires changing the reviewed policy beside the existing
  `allowedV1Dependencies` sets.
- **Rank:** Root / normal — the condition is live and the repair belongs in P16C,
  but every current package is private and the intentional set is small and pinned,
  so it does not outrank S-02's active medium policy failure.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### S-04 — The User Configuration directory is the one durable root never verified

- **Module / file:** Application — `apps/neoflow/src/userConfiguration.ts:469`
- **Category:** security
- **Severity:** low
- **Evidence:** Every other durable root re-asserts its permissions on an
  existing directory rather than trusting `mkdir`, because `mkdir` applies its
  `mode` only to directories it creates:
  `packages/workspace/src/authoritativeStateWorker.ts:1225`–`:1228` follows
  `mkdirSync` with four explicit `chmodSync(…, 0o700)` calls;
  `packages/workspace/src/workspaceIdentity.ts:792`–`:793` follows `mkdir` with
  `chmod(stateDirectory, 0o700)`; and
  `packages/local-runtime/src/runtimeLocation.ts:89`–`:110` goes furthest,
  `lstat`-ing the directory, rejecting a symlink, asserting the owning uid, and
  re-verifying the mode after its own `chmod`. `userConfiguration.ts:469` calls
  `fs.mkdir(directory, { recursive: true, mode: 0o700 })` and stops: a
  pre-existing `~/.config` or `~/.config/neoflow` keeps whatever mode and owner
  it already had, and neither is checked. The exposure is bounded — the config
  file itself is written `mode: 0o600` with `flag: 'wx'` (`:475`–`:478`) and
  `rename` preserves that mode, so the contents stay private even under a
  loose directory, and the contents are theme and layout preferences rather
  than secrets. What leaks is the file's existence and name.
- **Disposition:** accepted. **The conditional resolves against the fix.** The
  proposal defers to "unless the disposition decision prefers consistency for its own
  sake", and this map's rule already answers that: consistency for its own sake *is*
  taste, and a finding supported only by taste is `accepted`, not `fixed`. Nothing
  else supports a repair here — the exposure is the existence and name of a file
  holding theme and layout preferences, the file itself is written `0o600` with
  `flag: 'wx'` through a mode-preserving `rename` (`:475`–`:478`), and no threat this
  product meets is changed by hardening the directory around it.
  **The sibling claim was enumerated and it holds — on four sites, not three.**
  Every `mkdir` with a `mode` in v1 source is: `userConfiguration.ts:469` (the
  subject), `authoritativeStateWorker.ts:1225`, `workspaceIdentity.ts:792`,
  `runtimeLocation.ts:92`, and two the finding does not name —
  `authoritativeStateWorker.ts:871` and `workspaceIdentity.ts:719`. The first of
  those **strengthens** the finding: the quarantine root at `:871` follows its
  `mkdirSync` with `chmodSync` on *both* the leaf and its parent (`:872`–`:873`), a
  fourth durable root that re-asserts, and the most thorough of them after
  `runtimeLocation`. The second is not a counter-example: `workspaceIdentity.ts:719`
  creates a **lock** directory, and is deliberately **not** `recursive`, so a
  pre-existing directory raises `EEXIST` and is routed to
  `removeAbandonedRegistryLock` as contention rather than silently inherited. It
  cannot proceed on a directory it did not create, which is the property the
  `chmod` calls buy elsewhere, obtained a different way.
  So "every other durable root re-asserts its permissions" is **true**, and rests on
  four sites rather than three. This is the ledger's completeness class coming out
  the other way for once: the enumeration was short, and correcting it made the
  finding's claim stronger rather than weaker.
  **Recorded for whoever revisits this:** the reason to keep the finding is
  unchanged and is not a defect claim. It documents that the "every durable root is
  verified" invariant has exactly one exception, so a later reader who finds
  `userConfiguration.ts:469` and assumes the invariant holds everywhere learns here
  that it does not, and that the gap was measured rather than missed.
- **Rank:** n/a — `accepted`.
- **Decided:** 2026-08-08 by
  [Disposition the Application bounds and checks findings](../../.issues/WF-077-disposition-application-bounds-and-checks-findings.md)

#### S-05 — Pasted text is filtered by a weaker rule than typed text

- **Module / file:** Application — `apps/neoflow/src/reviewingInput.ts:135`–`:151`
  and `:169`–`:177`; `apps/neoflow/src/reviewingModel.ts:482`;
  `apps/neoflow/src/reviewingView.ts:125`–`:130` and `:241`–`:244`
- **Category:** security
- **Severity:** low
- **Evidence:** Typed input is strict: `printableSequence` accepts a key
  sequence only if every code point is `>= 0x20` and the sequence contains no
  `U+001B`. Pasted input takes a different route —
  `stripAnsiSequences(decodePasteBytes(event.bytes))` — and OpenTUI's
  `stripAnsiSequences` is `strip-ansi@7`, whose regex matches only OSC and CSI
  *sequences*. Run against the real export, `ESC [31m`, `ESC ]52;c;…BEL` and
  `ESC c` are all stripped, while lone `BEL`, backspace, carriage return,
  vertical tab and `NUL` all survive unchanged. Those characters land in
  `editor.body` and are rendered by `TextareaRenderable`
  (`reviewingView.ts:2446`, `:2470`), which is the one text path that does not
  pass through `label()` — and `label()` is where `safeText` strips C0 and C1
  centrally, so every *other* rendered string, including hostile commit
  subjects and branch names, is already neutralised. `NUL` has a second
  consequence: `synchronizeQuestionEditor` returns `false` for any body
  containing it (`reviewingModel.ts:482`), so pasting a `NUL` makes the model
  stop tracking the textarea rather than reject the paste, and the two diverge
  silently. Whether a surviving control character can reach the terminal
  uninterpreted depends on how OpenTUI's native renderer writes cells, which
  was **not** confirmed — the confirmed defect is the asymmetry between the two
  input routes and the divergence on `NUL`, not a demonstrated escape.
  **Corrected on 2026-08-08. The asymmetry is real; three of the four claims
  around it are not.** Taken in the order they matter:
  - **The route named here is dead at the site the damage lands.** `#onPaste`
    (`reviewingView.ts:2343`–`:2348`) returns early whenever the composer textarea
    exists, with the reason written in the code — the textarea handles bracketed
    paste itself. So while the composer is open, `reviewingInputFromPasteEvent`
    **is never called**. The outcome above is still right, because OpenTUI's
    `TextareaRenderable.handlePaste` applies the *identical* expression —
    `insertText(stripAnsiSequences(decodePasteBytes(event.bytes)))`
    (`index.node.js:8379`–`:8381`) — but the filtering that reaches `editor.body`
    belongs to the renderer, not to this Module.
  - **"The two diverge silently" is false.** `synchronizeQuestionEditor` has
    exactly one caller, and when it returns `false` that caller **rolls the
    textarea back** to `editor.body` and restores the cursor
    (`reviewingView.ts:2400`–`:2413`). Model and widget re-converge. The real
    defect is a **silent discard**: the whole paste is reverted with no notice,
    where the neighbouring 64 KiB rejection (`reviewingModel.ts:483`–`:486`) sets
    one. The finding read the model and inferred the consequence without reading
    its only caller.
  - **The proposed repair is a no-op for the defect it targets.** Changing
    `reviewingInputFromPasteEvent` reaches only the two consumers that *are* live
    on that route — Review search and the comparison input — and **both already
    strip for themselves**: `reviewingModel.ts:2090` removes
    every `[\u0000-\u001f\u007f]`, and `:2169`–`:2170` allow-lists to digits or to
    `[A-Za-z0-9._/@+-]`. The asymmetry is thus already closed everywhere the named
    route runs, and cannot be closed there for the composer.
  - **And it is not implementable verbatim.** `printableSequence` does not filter,
    it **rejects the whole sequence** if any code point is below `0x20`. Run
    against realistic pastes it accepts a plain one-liner and drops two-line text,
    indented code, anything with a trailing newline, and anything with a `NUL`. The
    two routes cannot share one rule; the repair has to be *strip*, not *reject*,
    following the pattern this codebase already uses at `:2090`.
  Three smaller measurements taken while re-running the filter. A **lone `ESC`
  consumes the character after it** (`A<ESC>B` yields `"A"`), so it destroys data
  rather than merely surviving. **C1 CSI (`U+009B`) is stripped but C1 OSC
  (`U+009D`) is not**, so "matches only OSC and CSI sequences" is not symmetric
  across the C1 introducers. And the asymmetry is sharper than stated in one
  direction: the composer binds `return`, `kpenter` and `linefeed` to `submit`
  (`reviewingView.ts:2453`–`:2457`), so **typing can never introduce any control
  character at all**, while paste can introduce `LF`.
- **Disposition:** fixed — strip control characters from text entering the
  composer, at the boundary the Application owns: the body handed to
  `synchronizeQuestionEditor`, or `#onPaste` taking the paste back from the
  textarea. **Not** in `reviewingInputFromPasteEvent`, which cannot see this path.
  Strip rather than reject, matching `:2090`. **The ticket's question — whether one
  repair covers both halves — answers yes for this repair and no for the proposed
  one:** stripping `NUL` at the composer boundary makes the `NUL` branch at
  `reviewingModel.ts:482` dead, while the proposed change leaves both halves
  untouched. Whether the silent discard should also raise a notice is a UX call for
  **P16C**, named here rather than decided.
- **Rank:** Application / normal
- **Decided:** 2026-08-08 by [Disposition the Application text-filtering findings](../../.issues/WF-075-disposition-application-filtering-findings.md)

#### S-06 — What the v1 application actually trusts, recorded

- **Module / file:** `apps/neoflow/package.json`; `pnpm-lock.yaml`;
  `@opentui/core@0.5.1`
- **Category:** security
- **Severity:** not a defect — the exposure this ticket was chartered to record
- **Evidence:** The v1 application's production closure is **24 packages**.
  Nine are `@opentui/*` (core plus eight platform natives, of which only
  `@opentui/core-darwin-arm64` is materialised on this machine); the rest are
  `bun-ffi-structs`, `diff`, `marked`, `string-width`, `strip-ansi`,
  `emoji-regex`, `get-east-asian-width`, `ansi-regex`, and the peer
  `web-tree-sitter`. `@opentui/core` is the **only** third-party runtime
  dependency any v1 package declares. The remaining ~270 entries of the 292 in
  the lockfile are development tooling and the legacy packages, and leave with
  them at cutover. The trusted-code surface is dominated by one artifact:
  `libopentui.dylib`, 4.8 MB, loaded by `node:ffi` `dlopen` (the
  `--experimental-ffi` flag every v1 script sets), which bundles libwebp,
  lcms2, stb and wuffs — image codecs, in a terminal tool, with a CVE history —
  and which no Node-level sandbox or permission model constrains once loaded.
  `web-tree-sitter` adds a second native/WASM surface. Install-time execution
  is well controlled: `pnpm-workspace.yaml` limits builds to `esbuild` through
  both `allowBuilds` and `onlyBuiltDependencies`, and no package in the v1
  runtime closure declares an `install`, `preinstall` or `postinstall` script.
  On the public-preview question the answer today is that there is nothing to
  trust: all nine workspace packages are `private: true`, and
  `check-v1-dependencies.mjs` enforces that for the four v1 ones, so no
  publishable artifact exists.
- **Recounted 2026-08-09 — “24 packages” is pnpm's tree-occurrence count, not 24
  distinct external identities.** `pnpm --filter @neoflow/app-source list --prod
  --depth Infinity` still reports 24 dependency nodes. Three are local-workspace
  occurrences (`local-runtime` and `workspace`, with Workspace reached twice).
  The remaining 21 occurrences are **20 distinct third-party package-version
  identities**, because `ansi-regex@6.2.2` is reached through both
  `strip-ansi@7.1.2` and `strip-ansi@7.2.0`. The original list omitted both the
  second `strip-ansi` version and `typescript@5.9.3`, auto-installed as
  `bun-ffi-structs`' peer. Nine of the twenty identities remain `@opentui/*`; only
  the Darwin ARM64 native is materialised on this machine. The trust conclusion is
  unchanged, but the count's unit is now explicit.
  `@opentui/core` is the only third-party name in an active package's production
  `dependencies`; the separately host-loaded Pi Adapter declares its Pi host as a
  peer rather than bundling it into this Application closure. The FFI flag is set
  on the routes that load OpenTUI, not “every v1 script”. The native artifact is
  exactly **4,830,592 bytes**, and the sweep again found no `preinstall`, `install`,
  or `postinstall` script in the materialised closure.
- **Disposition:** accepted as a corrected fact. Choosing or replacing OpenTUI is
  outside this map and was settled by
  [Decide whether the OpenTUI renderer choice survives public distribution](../../.issues/WF-059-decide-renderer-survives-public-distribution.md).
  A fact takes `accepted`, one of P16E's four classifications; no fifth state is
  needed.
- **Rank:** n/a — accepted.
- **Decided:** 2026-08-09 by
  [Disposition the root configuration and legacy findings](../../.issues/WF-068-disposition-root-and-legacy-findings.md)

#### S-07 — Box titles reach the renderer unfiltered

**Heading corrected on 2026-08-08**, from "Box titles are the one rendered text the
view never filters". The uniqueness it asserted is contradicted by this finding's
own evidence body, which positions box titles as a *second* path alongside
**S-05**'s textarea — the same defect X-06 carried, a heading that fails
independently of the evidence under it. Closed tickets quoting the old wording are
left as the historical record.

- **Module / file:** Application — `apps/neoflow/src/reviewingView.ts:779`,
  `:1390`, `:265`–`:283`; the defence that currently covers it is Workspace —
  `packages/workspace/src/workspaceEvidence.ts:1493`–`:1511`
- **Category:** security
- **Severity:** low
- **Provenance:** not from the P16A sweep. Established on 2026-08-06 while working
  [Re-verify the ledger's ruled-out leads](../../.issues/WF-062-re-verify-ruled-out-leads.md).
  It **corrects the reasoning** of this ledger's ruling on escape-sequence
  injection through rendered repository content — the conclusion stands, the stated
  mechanism does not. That entry is re-ruled in **Security posture and supply
  chain** under **Ruled out**.
- **Evidence:** The ruling held that `label()` is the single primitive the view
  builds text with, and that `TextareaRenderable` (**S-05**) is the only path
  outside it — which is what licensed skipping a per-call-site audit. There is a
  second path. `borderedBox` (`:265`–`:283`) spreads its caller's `options`
  straight into `Box`, so a `title` prop reaches the renderer without passing
  `safeText` (`:125`–`:130`). Three `title` props exist; two are literals
  (`:1977`, `:2043`), and the third interpolates repository-derived text:
  `` title: ` Question composer … ${editor.fileLabel} …` `` (`:1390`), where
  `fileLabel` is `review.diff?.file?.displayPath` (`reviewingModel.ts:2221`) — a
  path out of the user's repository. The surrounding editor is the reachable
  `create-question` composer, not the dead revise path of **A-05**.
  **Count corrected on 2026-08-08: there are four `title` props, and two of them
  carry repository text, not one.** The fourth is the expanded question card
  (`:779`), whose title is built at `:764`–`:766` from `location`, which is
  `questionFileLabel(...)` (`:494`–`:501`) — the selected file's `displayPath`
  again, reached through the manifest rather than through the diff. Same source,
  same exposure, and it is the *more* reachable of the two, since reading a
  Question thread needs no composer open. So "one call site changes behaviour
  today" is **two**.
  **And `title` is not the only text-bearing prop on that door.** `BoxOptions`
  declares both `title` and `bottomTitle` (`@opentui/core` `renderables/Box.d.ts:13`–`:17`),
  and the view uses `bottomTitle` at `:784`. It is a literal today, so it is not a
  vector — but a repair that routes only `title` through `safeText` closes half of
  the class this finding says it is closing.
  **Where the fix lands is confirmed and its blast radius is bounded.** All four
  titles and the one `bottomTitle` sit inside `borderedBox` calls (`:556`, `:767`,
  `:1378`, `:1964`, `:2029`), so `borderedBox` does cover every one of them. The
  file's other 33 `Box(` constructions carry no title at all — verified — which is
  what makes the class-closing claim true today and also names the door the fix
  leaves open: a title added to a bare `Box` tomorrow bypasses it.
  **It is not exploitable today, and the reason is in another package.** Every
  path string is normalised by `evidencePath` (`workspaceEvidence.ts:1493`–`:1511`)
  before it leaves the Workspace: C0 and DEL are rewritten to visible escapes, so
  `ESC` arrives as the four characters `\x1b` and cannot terminate a sequence. That
  filter — not `label()` — is what protects the title, and the ruling never
  mentions it.
  What makes it worth recording is the margin. Unfiltered repository text does
  exist in the system: a commit subject is decoded raw at
  `workspaceEvidence.ts:1005`–`:1008` with only trailing newlines stripped, and is
  safe solely because it renders through `label()`. Any future title carrying a
  subject, a branch decoration, or a search query is a live injection with no
  second line of defence, and the ruling's stated premise says no audit is needed
  to be sure it is not.
  **The two filters were run against each other on 2026-08-08, and neither
  contains the other.** This finding reads as though `safeText` is the strong
  filter and `evidencePath` a lucky upstream substitute. They are not comparable
  that way — each catches exactly what the other misses:

  | | `safeText` (Application) | `evidencePath` (Workspace) |
  | --- | --- | --- |
  | `LF` `U+000A` | **survives** | neutralised |
  | `CR` `U+000D` | **survives** | neutralised |
  | C1 `U+0080`–`U+009F` | neutralised | **survives** |
  | all other C0, `DEL` | neutralised | neutralised |

  `CONTROL_PATTERN` (`:122`) omits `U+0009`, `U+000A` and `U+000D`; tab is handled
  separately by `.replaceAll('\t', '  ')`, but **`CR` and `LF` are handled
  nowhere** and pass through `safeText` unchanged. `decodeDiffRow` (`:488`–`:492`)
  appending `.replaceAll('\n', ' ')` is the codebase compensating for that gap at
  exactly one of the many `label()` call sites. Two consequences. **Routing `title`
  through `safeText` is a trade, not a superset** — it adds C1 coverage and gives
  up `CR`/`LF` coverage, and a `CR` in a box title is a layout-breaking character.
  **So `evidencePath` stays load-bearing after this finding is fixed**, which is a
  stronger cross-package obligation than "the defence currently lives elsewhere":
  it does not expire with the repair. Whether a surviving `CR` is interpreted by
  the terminal or absorbed by OpenTUI's cell layout is the same render-time
  question **S-05** left unconfirmed, and it is left unconfirmed here rather than
  assumed either way.
- **Disposition:** fixed — route `title` **and `bottomTitle`** through `safeText`
  inside `borderedBox` rather than trusting each caller. **Two** call sites change
  behaviour today (`:779`, `:1390`), both for paths already escaped upstream. The
  repair must not be read as retiring the Workspace's escape: on the measurement
  above the two filters are complementary, and dropping `evidencePath` would open
  `CR` and `LF` on exactly these titles.
- **Rank:** Application / normal — and the tie with **S-05** is meant. Both are
  view-boundary filtering repairs, and the evidence separates them on nothing; the
  format's own rule is that a rank supported only by taste is the same defect as a
  disposition supported only by taste.
- **Decided:** 2026-08-08 by [Disposition the Application text-filtering findings](../../.issues/WF-075-disposition-application-filtering-findings.md)

## Ruled out

<!-- a lead that failed confirmation, with the reason, so it is not investigated twice -->

### Cross-cutting

- **Domain terms in the active source no longer match `CONTEXT.md`** — largely
  not confirmed, with one exception recorded as **X-07**. Of the 145 canonical
  terms, every concept that is actually implemented is spelled canonically and
  used heavily: `reviewSnapshot` (247), `workspaceIdentity` (291), `anchor`
  (166), `reviewBatch` (142), `authoritativeState` (64), `currentReview` (52),
  `reviewResponse` (35), `commitmentReceipt` (28), `changeSet` (25),
  `workspaceVerification` (24). A sweep for the distinctive terms `CONTEXT.md`
  explicitly says to avoid — multi-writer store, last-write-wins, session
  replay, lifecycle board, recency feed, storage browser, cache cleanup,
  activity feed, unread notification, harness replacement, chat mode — found
  **zero** uses in the active source. The canonical terms with no code presence
  (`liveChanges`, `workflowArchive`, `workflowTrash`, `portableWorkflowBundle`,
  `codeInquiry`, `inquiryBatch`, `planRevision`) are concepts deliberately not
  implemented yet, each owned by a later package, so their absence is sequence,
  not drift.
- **Empty `catch` suppression across the active source** — not confirmed. There
  are zero empty `catch` blocks in the active source: a brace-matching sweep of
  all 4 active source roots found none, and every one of the ~160 catch sites
  either rethrows, translates to a domain problem type
  (`WorkerProblem`, `BootstrapProblem`, `HarnessStateProblem`), narrows on an
  `errno`, or carries a comment explaining the deliberate suppression. The
  19 `.catch(() => undefined)` sites are best-effort cleanup on paths that are
  already failing for a reported reason, and the four in
  `packages/local-runtime/src/server.ts` (`:477`, `:506`, `:552`, `:636`)
  convert failure into `this.#peer.destroy()`, which the client observes as a
  disconnect. The one genuine silent-suppression site is recorded separately as
  **X-02**, on its own evidence.
- **Flaky-test concurrency from shared fixtures** — not confirmed as a
  fixture-sharing problem. Every active scenario suite allocates its own root
  with `mkdtemp`, and there are no fixed ports, no fixed socket paths, and no
  shared on-disk fixture that two suites write. The genuine timing and
  isolation weaknesses found instead are recorded as **X-04** and **X-05**.
- **Unbounded polling in test helpers** — not confirmed, and re-verified with a
  corrected count. There are **six** wait helpers in the active suites, not the
  four this entry first claimed: `waitFor(predicate)` in
  `packages/workspace/test/scenarios/workspaceProjection.test.ts:121`,
  `packages/local-runtime/test/contracts/localRuntime.test.ts:223` and
  `packages/local-runtime/test/contracts/harnessAdapterRuntime.test.ts:158`, plus
  `waitFor`, `waitForOutput` and `waitForInitialReviewReconciliation` in
  `apps/neoflow/test/scenarios/reviewingApplication.test.ts:212`, `:224` and `:349`.
  Every one is bounded and throws on exhaustion, so the conclusion is unchanged:
  five are attempt-bounded (`attempts = 1_600` in the apps helper, which
  `waitForOutput` delegates to), and `waitForInitialReviewReconciliation` is
  deadline-bounded instead — `performance.now() + 10_000` (`:352`) — which the
  original "attempt-bounded" wording did not cover. No active suite contains a
  `while (true)`, `for (;;)` or `while (1)`. Their duplication is recorded as
  **X-06**, which counts the **four** predicate pollers rather than all six — the
  other two are Application compositions that duplicate nothing. *Corrected
  2026-08-08: this sentence read "the three identical predicate helpers", which was
  a re-reading of X-06's then-incorrect heading rather than of its evidence. Two of
  the four are byte-identical and a third differs by one integer literal.*

### `packages/workspace`

- **Unbounded caches `#captures`, `#searchIndexes`, `#snapshotStatusReads`** —
  not confirmed; all three are bounded. `#captures` is capped at 2 with FIFO
  eviction (`workspaceEvidence.ts:2140`, `:2165`), `#searchIndexes` is capped at
  4 with FIFO eviction (`projection.ts:2013`–`:2015`) and additionally deletes
  its own entry when index construction rejects (`:2019`), and
  `#snapshotStatusReads` is cleared wholesale on every committed version
  (`projection.ts:1163`) and deletes each entry in a `finally` when its read
  settles (`:1313`–`:1315`). The fourth cache named in the same lead,
  `#snapshotEvidenceIdentities`, **is** unbounded and is recorded as **W-01** —
  one of four, which is why the remaining leads deserve the same case-by-case
  check rather than acceptance as a group.
- **Worker startup deadlock in `authoritativeState.ts`** — not confirmed, and
  the design actively prevents it. Every SQLite handle is opened with
  `PRAGMA busy_timeout = 0` (`authoritativeStateWorker.ts:267`, `:274`, `:938`)
  and the writer-lease database with `timeout: 0` (`:930`), so lock contention
  raises immediately instead of blocking; `isBusyError` (`:921`) translates it to
  a `writer-lease-unavailable` `WorkerProblem`, which the startup `catch`
  (`:1953`) reports as `startup-failed`. A second process holding the lease
  therefore fails fast rather than deadlocking. What remains is slowness, not
  deadlock — a large migration or integrity check — recorded on its own evidence
  as **W-04**.
- **Request-ID leak in `authoritativeState.ts`** — not confirmed.
  `#nextRequestId` is a monotonically increasing integer, never recycled, so ids
  cannot collide. Every branch of the worker's `handleRequest`
  (`:1918`–`:1947`) replies with the id it received — including the `close`
  fallthrough (`:1942`) and the `catch` (`:1945`) — so a live worker never leaves
  a request unanswered. On the main thread `#receive` deletes the entry whenever
  it settles it (`authoritativeState.ts:299`), `#send` deletes it if
  `postMessage` throws (`:282`), and `#failAll` clears the map and latches
  `#closed` on both `error` and `exit` (`:311`–`:317`), after which `#send`
  rejects immediately (`:270`). No path adds an entry that nothing removes. The
  absence of a deadline means a hypothetical lost reply *would* leak
  permanently, which is part of why **W-03** proposes one — but no such path
  exists in the current code.
- **LCS cell bounding missing in `reviewing.ts`** — not confirmed; the bound
  exists and degrades correctly. `MAX_LCS_CELLS = 4_000_000` (`:503`) is checked
  as `(oldLines.length + 1) * (newLines.length + 1) > MAX_LCS_CELLS` *before* any
  matrix is allocated (`:1442`–`:1446`), and the over-limit branch falls back to
  emitting every old line as a deletion and every new line as an addition — a
  correct, bounded degradation that simply loses intra-hunk matching. The two
  genuine problems found in the same area are the cost of each comparison
  (**W-10**) and the placement of the *row* limit (**W-11**), not the cell bound.
- **A possible diff-builder bug** — not confirmed, and it should not be
  re-investigated without a concrete symptom. The lead named no reproduction, so
  the prefix/suffix trim and its hand-off to the LCS
  (`reviewing.ts:1575`–`:1622`) were inspected directly. The suffix loop's guards
  (`suffix < oldLines.length - prefix`, `suffix < newLines.length - prefix`) make
  overlap with the prefix region provably impossible on both sides, so the
  `slice(prefix, length - suffix)` calls at `:1614`–`:1615` can never invert.
  Three cases were traced by hand end to end: identical files, an equal-length
  substitution (`[A,X,B]` vs `[A,Y,B]`), and an asymmetric deletion (`[A,B,C]` vs
  `[A,C]`, which exercises the differing `length - suffix` arithmetic on the two
  sides). All three produce the correct row sequence, including the empty-middle
  and one-side-empty fallbacks. No defect was found. This is corroborated
  independently by the scripted coverage recorded in `HANDOFF.md` — exact
  1,000-file and 620,000-row targets — and by human acceptance of the Diff
  surface at Gate A.
- **Unbounded scroll (Workspace side)** — not confirmed in this package. Every
  windowed Projection request passes through `assertWindow`
  (`projection.ts:747`–`:753`), which rejects any `limit` above an explicit
  per-request maximum: `MAX_HOME_REVIEWS`, `REVIEW_MANIFEST_WINDOW_FILES`,
  `REVIEW_DIFF_WINDOW_ROWS`, `MAX_QUESTION_ITEMS`, and
  `MAX_REVIEW_SEARCH_RESULTS` at `:764`–`:846`. `offset` is checked only for safe
  integrality, which is harmless — a far-past-the-end offset returns an empty
  window rather than allocating. Scroll state itself lives in the Application, so
  the lead is carried there and assessed under `apps/neoflow`.

### `packages/local-runtime`

- **`pendingEvidence` map growth in `harnessAdapter.ts`** — not confirmed; it is
  explicitly bounded. `acceptEvidence` refuses with
  `status: 'refused', reason: 'state-unavailable'` as soon as
  `this.#pendingEvidence.size >= 64` (`harnessAdapter.ts:270`), deletes the entry
  on acknowledgement (`:234`), deletes it if the send fails (`:288`), and drains
  every remaining entry — resolving each as refused — in `close`
  (`:302`–`:305`). No path grows it without limit.
- **Unbounded lifecycle growth in `harnessAdapter.ts`** — not confirmed. Neither
  `harnessAdapter.ts` nor `lifecycle.ts` holds an accumulating collection:
  `#pendingEvidence` above is the only map in the adapter, and `lifecycle.ts`
  contains a single `new Set` used for one-shot key validation (`:142`) with no
  `push`, array accumulation, or long-lived map anywhere in its 564 lines.
- **Pending operations left unclosed on server close** — not confirmed. `#close`
  chains completion onto the in-flight work rather than abandoning it:
  `#closeComplete = this.#operationTail.then(() => this.#remoteAdapter?.disconnect())
  .catch(…).then(() => this.#onClosed())` (`server.ts:634`–`:637`), and it first
  unsubscribes every active subscription (`:631`–`:632`) and clears the bootstrap
  timer (`:627`–`:630`). The server's own teardown uses the awaiting path —
  `#disposeOnce` calls `connection.disposeGracefully()` (`:717`), which awaits
  `#closeComplete` (`:330`–`:333`). Each queued operation still settles its
  `finally`, decrementing `#pendingOperations` and releasing its request id
  (`:547`–`:550`); its reply is simply dropped by `send` because the peer is
  destroyed, which the client observes as a disconnect. The related bounds are
  enforced too: `MAX_PENDING_OPERATIONS` at `:522` and `MAX_SUBSCRIPTIONS` at
  `:565`.

### `packages/pi-adapter`

- **Flaky runtime startup timeout in `piAdapter.ts`** — not confirmed; the timeout
  is deterministic by construction. The adapter never calls `setTimeout` directly
  for this: it goes through an injected `PiAdapterScheduler`
  (`piAdapter.ts:600`–`:602`, using `noStartTimeoutMs` from the frozen Capability
  Snapshot), whose production implementation is `defaultScheduler`
  (`:120`–`:129`). The contract suite injects a `ScriptedScheduler` instead
  (`piAdapter.test.ts:110`–`:130`) and advances it explicitly with
  `await noStart.scheduler.fire()` (`:445`), so the no-start case is driven by an
  event rather than by elapsed wall-clock. The injection seam exists precisely to
  remove this flakiness, and it is used.

### `apps/neoflow`

- **Dead `ReviewingModelEffect` variants** — **this ruling was wrong, and is kept
  here only so the mistake is not repeated. The finding is confirmed as A-05.**
  What it got right: the union (`reviewingModel.ts:238`) declares exactly 14
  variants — `stop`, `show-home`, `show-review`, `show-review-diff`,
  `load-commit-graph`, `preview-comparison`, `search-review`,
  `preview-search-result`, `load-question-editor`, `load-question-discussion`,
  `copy-question-selection`, `copy-review-selection`,
  `save-reviewing-preferences`, `execute` — and every one has at least one
  `effect.type === '…'` dispatch arm in `#runEffects`
  (`reviewingApplication.ts:273`); `show-home` and `show-review` have three each.
  What it got wrong: it concluded "zero variants are unreachable" from that. A
  dispatch arm is the *consumer* side, and dead means never **constructed**. The
  one variant with a handler and no producer anywhere — `load-question-editor` — is
  dead precisely *because* it has an arm and nothing that reaches it, so the test
  used could not have detected it. **The generalisable error:** for a discriminated
  union of commands or effects, reachability has to be counted from the producers,
  and the producer sweep must cover every module that constructs one, not just the
  module that declares the type — here the view constructs two live variants the
  model never does. Recorded on 2026-08-06 while resolving
  [Decide whether the `reviewingModel` refactor is in scope](../../.issues/WF-058-decide-reviewingmodel-refactor-scope.md).
- **An idempotency bug in command normalization** — not confirmed. There is no
  command normalization in this package: the only `normaliz*` symbol in the whole
  of `apps/neoflow/src` is `normalizedName` (`reviewingInput.ts:110`), which maps
  keyboard key aliases to canonical names. It is a pure `switch` over
  `name.toLowerCase()` whose canonical outputs map to themselves — e.g.
  `'pageDown'` lowercases to `'pagedown'`, which returns `'pageDown'` — so it *is*
  idempotent. Command normalization proper lives in the Workspace
  (`normalizeManifest` and peers in `harnessInteraction.ts`); the real finding
  there is the key-order dependency recorded as **X-01**.
- **Manifest polling in `userConfiguration.ts`** — **the file-scoped half of this
  ruling is right; the package-wide half was wrong, and is kept here so the mistake
  is not repeated. The polling is confirmed as A-06.**
  What it got right: `userConfiguration.ts` does not poll. It holds one
  `fs.readFile` (`:331`) and no timer of any kind; configuration is read once and
  written on explicit change, so nothing observes *that* file over time. The
  "configuration safety" half of the same lead is real and is recorded under
  **W-06**, which covers this file's missing fsync and its post-rename `access`
  check.
  What it got wrong: the sentence "no polling exists", and the `grep` result it
  rested on. The claim was that `setInterval`, `poll`, `watch`, `interval`, `mtime`
  and `stat(` return nothing across all of `apps/neoflow/src`. `interval` returns
  two hits — `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS` at
  `reviewingApplication.ts:43` and `:570` — and they name a real 750 ms
  self-rescheduling loop that re-reads `review.manifest` and, underneath it, runs
  `git status` (**A-06**). The search was evidently case-sensitive against a
  SCREAMING_SNAKE constant, and its negative was written up as absolute.
  **The generalisable error:** a token `grep` establishes the absence of a *token*,
  never the absence of a *behaviour*. Polling does not need `setInterval` — a
  `setTimeout` that re-arms in its own `finally` is a poll — so the search has to be
  for the shape (a timer whose callback schedules the next one), and any negative
  result has to state its case sensitivity. Two further habits would each have
  caught this alone: run the search case-insensitively, and, when a lead names a
  file, answer the *phenomenon* the lead names as well as the file, because a lead
  that mis-attributes a real behaviour still describes it correctly.

### Legacy packages

- **A security or injection blocker in the legacy surface** — none found. The two
  process-spawning sites are the editor launchers in `apps/tui/src/App.tsx:749`
  and `:771`. Neither uses a shell: `grep` for `shell: true` across the entire
  repository returns nothing, and both pass arguments as an array, so no argument
  is shell-interpreted. The editor command comes from `NEOFLOW_NVIM_SERVER`,
  `NEOFLOW_EDITOR`, or `EDITOR` — the user's own environment, which is the normal
  configuration channel for this, not an attacker-controlled input. Legacy
  on-disk data is private (`0o700` directories, `0o600` files — see **LG-01**).
  The only cosmetic weakness is `editor.split(/\s+/)` (`:756`), which cannot
  express an editor path containing spaces; that is deletion-bound.

### Security posture and supply chain

Ten leads from the S-sweep that did not confirm. Several are places the code is
actively well defended, and those are written up at the same length as the
defects so a later reader can tell "checked and sound" from "not checked".

- **Git argument injection through a user-supplied revision** — not confirmed,
  and closed by construction. `normalizeReviewComparisonSelection`
  (`packages/workspace/src/workspaceEvidence.ts:908`–`:963`) is the only door
  a caller-supplied revision passes through, and its validator requires the
  first character to match `[A-Za-z0-9._/@+]`. A leading `-` is therefore
  impossible, which is the whole of the argument-injection risk for a value
  placed after `rev-parse --verify --quiet`. It additionally bounds the length
  to 256 bytes, requires the value to equal its own `trim()`, and rejects `..`,
  `//` and a `.lock` suffix. Everything downstream is stricter still: resolved
  object identities are re-validated against `/^[0-9a-f]{40,64}$/u` before being
  used as arguments (`:983`, `:1000`), `--max-count=${n}` interpolates only a
  bounded safe integer (`:2072`–`:2078`), and every argument vector that can
  take a pathspec ends in `--`. The `head-ancestry` selector builds `HEAD~n`
  from a `Number.isSafeInteger` value between 1 and 10,000, so it cannot carry
  text at all.
- **SQL injection in the state worker** — not confirmed, extending the ticket's
  established fact from `exec` to the rest of the seam. Beyond the static
  `PRAGMA`/DDL blocks already recorded, a search for interpolation in any
  `prepare()` call across `authoritativeStateWorker.ts` returns nothing: no
  prepared statement in the file is built from a template literal. Every other
  `exec` call is a bare `BEGIN IMMEDIATE`, `COMMIT` or `ROLLBACK` string.
- **Path traversal out of the private state directory** — not confirmed. Three
  separate values could in principle escape `path.join`, and all three are
  anchored regexes checked *before* the join. `data.workspaceIdentity` is tested
  against `WORKSPACE_ID_PATTERN` (`:44`, enforced at `:1239`–`:1241`) before
  `ensurePrivateDirectories` runs at `:1243`, so the ordering is right and not
  merely present. The `CURRENT` pointer — the planted-file input this sweep was
  asked to assume — is parsed by `readCurrent` (`:358`–`:373`), which requires
  exactly one trailing newline and then tests the remainder against
  `GENERATION_PATTERN` (`:45`–`:46`), so a `../` pointer is rejected before it
  reaches `path.join` at `:1280`. Directory listings are filtered through the
  same pattern (`:1233`–`:1237`), so `preserveFailedGeneration` receives only
  validated names.
- **Path traversal through a hostile file name in the working tree** — not
  confirmed. `absolutePath` (`:848`–`:850`) concatenates the checkout and a
  repository-relative path with no normalisation, which looks fragile, but every
  value reaching it comes from `git status --porcelain=v2` output, and Git does
  not emit `..` components or absolute paths in that format. The symlink case,
  which is the one that would escape, is handled: `lstat` classifies the entry
  (`:1376`–`:1379`) and `readWorkingSide` calls `readlink` on a symlink rather
  than reading through it (`:1468`–`:1472`), so a symlink to `/etc/shadow` is
  recorded as a link with a target, never followed. A TOCTOU race between the
  `lstat` and the later `createReadStream` exists in principle but needs write
  access to the operator's own working tree, which is outside the assumed
  attacker.
- **Escape-sequence injection through the OSC 52 clipboard write** — not
  confirmed. **Re-ruled on 2026-08-06 with different evidence; the conclusion is
  unchanged and the original evidence did not support it.**
  The conclusion: `#copySelection` (`apps/neoflow/src/reviewingApplication.ts:343`)
  passes the selected text to `Clipboard.copyToClipboardOSC52`, which UTF-8 encodes
  it and hands the bytes to the native library; the native
  `copyToClipboardOSC52` calls a base64 encoder before writing the sequence, and
  base64 output cannot contain `BEL` or `ESC`, so the payload cannot terminate its
  own sequence. The framing lives in native code, not in JavaScript: `]52;` and the
  exported `_copyToClipboardOSC52`, `_terminal.writeClipboardSequence` and
  `_base64.Base64Encoder.encode` symbols are all in
  `@opentui/core-darwin-arm64@0.5.1`'s `libopentui.dylib`, and disassembling the
  exported entry point shows it calling `_base64.Base64Encoder.encode` directly.
  That the copied text is attacker-influenced is inherent to a copy feature, not a
  defect.
  **What the original evidence proved, and what it claimed.** It rested on the
  base64 *alphabet string* being present in the dylib. A binary that encodes base64
  must contain that alphabet, so its presence is a necessary condition — but a
  string in a 2 MB library says nothing about whether *this* function encodes
  *this* input before framing it. This is the same necessary-reported-as-sufficient
  error as the dead-variant ruling above, in a different costume: a grep over a
  binary is not a call graph. The residual gap is stated rather than hidden — the
  entry point dispatches on a terminal-capability byte, and only the branch that
  reaches the encode call was traced, so the tmux/screen passthrough branch is
  unverified. Settling it needs a behavioural probe against a real terminal, not
  more disassembly, and none was run.
- **Escape-sequence injection through rendered repository content** — not
  confirmed, and this is the strongest defence found. `label()`
  (`apps/neoflow/src/reviewingView.ts:221`–`:244`) applies `safeText` to every
  string it renders, and `safeText` (`:125`–`:130`) replaces the whole of C0
  except newline and tab — `ESC` at `U+001B` included — plus DEL and C1. Because
  `label()` is the single primitive the view builds text with, hostile commit
  subjects (`:1730`, `:1751`), branch decorations, file paths and diff rows
  (`decodeDiffRow`, `:488`–`:492`) are all covered without needing a
  per-call-site audit. The `StyledText` branch that bypasses `safeText` is
  unreachable: `StyledText` appears in the file only as a type in that
  signature, and no `StyledText` value is constructed anywhere in the
  application.
  **Re-ruled on 2026-08-06: the conclusion holds, the stated mechanism does not.**
  `TextareaRenderable` is **not** the one path outside `label()`, as this entry
  claimed when recording it as **S-05**. A `title` prop on `borderedBox`
  (`reviewingView.ts:265`–`:283`) is a second unfiltered path, and one title
  interpolates a repository file path (`:1390`). Nothing is exploitable through it
  today, but the reason is a filter in another package — `evidencePath`
  (`packages/workspace/src/workspaceEvidence.ts:1493`–`:1511`) escapes C0 and DEL
  out of every path string before it leaves the Workspace — and not `label()` at
  all. Recorded as **S-07**.
  **Corrected twice more on 2026-08-08 while settling S-07, in the same direction
  both times — this entry keeps understating the surface it describes.** First,
  **two** titles interpolate a repository path, not one: `:1390` and `:779`. The
  re-ruling found the composer title and stopped, which is the very move it
  diagnoses one paragraph below. Second, `safeText` does **not** replace "the whole
  of C0 except newline and tab": it also lets **`CR` (`U+000D`)** through, and tab
  is converted to two spaces rather than preserved. Measured against
  `evidencePath`, the two filters are complementary rather than ranked — `safeText`
  covers C1 and misses `CR`/`LF`; `evidencePath` covers `CR`/`LF` and misses C1 —
  so the Workspace escape is not a stopgap this Application repair retires. The
  sentence about the `StyledText` branch being unreachable was re-verified this
  session and stands: no `StyledText` value is constructed anywhere in `apps` or
  `packages`.
  **The generalisable error:** "X is the single primitive, therefore no call-site
  audit is needed" is a claim about *every* call site, so it is exactly as strong as
  the sweep that enumerated them — and the sweep here missed a prop that carries
  text without looking like text. When a ruling's value is that it makes an audit
  unnecessary, the enumeration behind it is the finding-grade claim and has to be
  evidenced like one; naming one exception is evidence that the search ran, not that
  it was complete.
- **A hostile Pi response reaching a dangerous operation** — not confirmed.
  **Re-ruled on 2026-08-06: the conclusion holds today for a reason this entry
  never stated, and that reason expires.**
  What it established: `packages/pi-adapter/src` contains no `fetch`, no `http`, no
  `spawn` or `exec`, no `eval` or `new Function`, and no filesystem access at all.
  What it concluded: a hostile response "reaches no privileged operation". Those are
  different claims. The adapter having no sinks of its own says nothing about where
  its output *flows* — the lead is about a value crossing a module boundary, and the
  check stayed inside the declaring module. Sinks certainly exist downstream: `git`
  argument construction and `path.join` both live in the Workspace.
  What actually makes the conclusion true: **nothing imports the adapter.**
  `@neoflow/pi-adapter-source` is referenced only by build, typecheck and probe
  scripts in `package.json` and by `tsconfig.v1-tests.json`; no file in
  `packages/workspace`, `packages/local-runtime` or `apps/neoflow` imports it, and
  `support/manifest.json` carries `"piAdapterPackage": null`. The consumer set is
  empty, so the flow question has no instances yet.
  **This ruling therefore has an expiry date.** The first commit that wires the
  adapter into the Application invalidates it, and the re-check then is a *forward*
  trace — every value a Pi response contributes, followed to each sink it can
  reach — not another sweep of the adapter's own imports. **P-01** already records
  three unguarded async paths in this package, so the module is not otherwise
  assumed clean.
- **The Local Runtime socket being reachable by another local user** — not
  confirmed, and this is the most carefully defended surface in the repository.
  The transport is a Unix domain socket, not a TCP port, so there is no network
  exposure to begin with. `runtimeLocation.ts` chmods the endpoint to `0o600`
  and then re-`lstat`s it to assert it is a socket, is not a symlink, is owned
  by the current uid, and actually carries mode `0o600` (`:214`–`:224`) — it
  verifies after acting rather than trusting the call. The containing directory
  is checked the same way (`:98`–`:133`), and endpoint removal is guarded by the
  device and inode captured at bind time, so a swapped path cannot be deleted by
  mistake. The window between `server.listen` (`server.ts:744`), which creates
  the socket at the umask default, and the `chmod` that follows is real but not
  exploitable: the parent directory is `0o700` and owner-verified, so no other
  user can traverse to the endpoint during it.
- **Install-time code execution from a dependency** — not confirmed.
  `pnpm-workspace.yaml` restricts builds to `esbuild` alone through both
  `allowBuilds` and `onlyBuiltDependencies`, and `@google/genai` and
  `protobufjs` are explicitly denied. No package in the v1 runtime closure
  declares `install`, `preinstall` or `postinstall`; the only lifecycle script
  anywhere in that closure is a `prepack` in `web-tree-sitter`, which runs when
  publishing that package, never when installing it. This is the reason S-02 is
  medium rather than high — the cooldown is off, but the blast radius of a
  compromised publish is limited to code that has to be *imported* to run.
- **The registry the workspace resolves against not being pinned in-repo** —
  real, but not a finding. There is no `.npmrc` in the repository, so the
  registry comes from the machine's own configuration, and this machine's
  `~/.npmrc` points at a third-party proxy rather than `registry.npmjs.org`.
  The lockfile is host-agnostic in pnpm v9 — it records `integrity` hashes and
  no URLs — which cuts both ways: the resolving host varies by machine, but all
  292 locked entries carry a sha512 integrity hash, so no host, proxy or
  registry can alter the contents of an already-locked package without the
  install failing. Choosing whether to pin the registry is a packaging decision
  for
  [Shape packaging, setup, and release topology](../../.issues/WF-050-shape-packaging-setup-release.md),
  not a defect in this code.
