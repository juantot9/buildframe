---
id: WF-074
title: "Disposition the Workspace test-source findings"
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

Settle the disposition and the within-package rank of the **2** Workspace
findings that live in test source rather than production source.

**X-04** and **X-06**.

One of four tickets from the split of
[Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its
resolution comment. **Rank within the Workspace band, not within this ticket.**

Both are proposed `fixed`. The decision on each is whether that survives the
map's evidence rule — a finding supported only by taste is `accepted`, not
`fixed`.

## Established facts

- **This is the smallest ticket on the map**, and it is deliberately not merged
  into a neighbour: test source is the one surface where the map's
  no-code-changes rule and the deepening gate's own verification route meet, and
  the two findings share that context with each other rather than with any
  production finding.
- **The map's no-code-change rule covers test source identically.** A finding in
  a test file is still a disposition, never a repair made here.
- **X-04 is medium** — retired-stream guarantees asserted after a fixed sleep —
  and is the one of the two with a correctness argument rather than a
  duplication one. **X-06** is three near-duplicate `waitFor` helpers, and its
  count was already corrected once: the ruled-out re-verification found **six**
  wait helpers, not four, so **treat the "three" in this finding as a claim to
  test rather than a fact**.
- **Test quality was audited for assertion presence and reachability, not
  quality.** Whether the repository's 562 assertions check the right things is a
  per-test judgement nobody has made, and it is **not** this ticket's job —
  which covers two named findings, not the standing question.
- **X-09 is already settled and is the nearest neighbour** — no test ever
  finishes a Review, ruled `fixed` and **pulled ahead of P16B**. It is the
  strongest evidence about this suite's real gap, and it is **not reopened
  here**; read its ruling before ranking either finding.

## Method

**A ratification pass is not a reading pass.** Both findings here rest on a
count, and one of the two counts has already been wrong once. Test the count
before ruling on it — completeness claims are where this ledger has repeatedly
been shown to fail.

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` —
with a written reason required for `first` and `last` only, and ties carry no
meaning.

## Resolution comment

**Both findings `fixed` in substance, one of them split, and both were wrong about
their own subject while right about their disposition.** Neither is deferred, neither
is pulled ahead, and no severity moved. This closes the Workspace band: all 19
Workspace findings are now settled across the four tickets the split produced.

### X-04 — the count was exact, the characterisation was not

The completeness claim was tested before the disposition, as the ticket's Method
requires. A sweep of every `setTimeout` in the four active test roots returns nine:
five are poll bodies inside wait helpers, one is a scripted-timer yield in the Pi
Adapter suite, and the remaining three are exactly the three sites X-04 names. **The
count of three is right.** What is at those three sites is not what the finding says.

1. **`workspaceProjection.test.ts:219` is exactly as described.** 30 ms after an
   idempotent replay of an already-executed command, then `updates` is asserted to
   equal `[0, 1, 2]`. This is the pure form of the defect the finding describes.
2. **`localRuntime.test.ts:332` guards a different assertion from the one named.**
   The finding says the sleep precedes "asserting the version is still 2". That read,
   at `:333`–`:336`, **cannot fail either way**: `ScriptedWorkspace.publish` (`:105`)
   only calls subscribers, and `#stateVersion` (`:52`) moves only in `execute`
   (`:69`), so the projection reports version 2 whether or not the post-unsubscribe
   update was delivered. The absence assertion the sleep actually protects is
   `updates` equalling `[2, 3]`, three lines further down. A fixer following the
   finding's own wording would have hardened an assertion that asserts a constant.
3. **`localRuntime.test.ts:504` is not an assertion behind a sleep — there is no
   assertion.** The interval is 5 ms rather than 10; the order is reversed
   (unsubscribe, *then* sleep, *then* publish); and the test ends on
   `peer.socket.destroy()`. **Deleting its last seven lines would not change whether
   it passes.** The test is named *'sequences subscription updates and stops them
   after unsubscribe'*. The sequencing half is genuinely asserted at `:477`–`:498`.
   The half the name promises is checked nowhere.

Behind site 3 is the wider gap that site 3 was hiding: `:501` holds the **only**
occurrence of `workspace.unsubscribe` in any test file in the repository, and
`workspace.unsubscribed` — the acknowledgement the server sends at `server.ts:619`,
and precisely the frame `HANDOFF.md:16` means when it claims "subscriptions
acknowledge cancellation" — appears in **no test at all**.

**Severity stays medium**, and **X-09** is the reason rather than a judgement call: a
*total* coverage gap on the Review's terminal transitions is medium, so a partial gap
on subscription cancellation cannot exceed it. The gap here is also genuinely weaker
than X-09's — the client-level `unsubscribe()` at `:330` does execute `client.ts:134`
and `:181`, so the path runs under test and is merely never asserted, where X-09's
never runs at all.

**Disposition `fixed`, with the repair tripled.** The finding proposes one treatment
— drive the assertions from an observable event — and that treatment fits site 1
only. Site 2 additionally needs its dead read deleted or replaced. Site 3 needs the
assertions **written**, because they do not exist; "drive this from an observable
event" is not actionable against an absent assertion. **Rank `Workspace / normal`.**

**Pull-forward considered and rejected.** X-02's settled ruling makes the projection
subscription the sole freshness channel once P16B deletes A-06's poll, which is a
real argument that these tests matter more after P16B. It was rejected because it is
weaker than X-09's: P16B rewrites Snapshot, Anchors, and Versions, not the
local-runtime subscription transport where two of the three sites live, and site 1's
guarantee is command idempotence rather than freshness.

### X-06 — one finding, four counts, and a constraint that turned out not to exist

**The ledger had been carrying three different counts for this finding in four
places.** The heading said *three*; its own evidence body said *four*; **A-03**'s
cross-reference said *four*; the Ruled-out entry said *three of six*. Two closed
tickets carry *three* and *six* respectively.

The source settles it. There are **six** `wait*` helpers and **four** predicate
pollers, which is what this finding is about. `localRuntime.test.ts:223` and
`harnessAdapterRuntime.test.ts:158` are **byte-identical**;
`workspaceProjection.test.ts:121` differs from them by the single literal `200`; and
`reviewingApplication.test.ts:212` is genuinely different (async predicate, `label`,
parameterised attempts). The other two `wait*` helpers duplicate nothing —
`waitForOutput` has no loop and delegates, and `waitForInitialReviewReconciliation`
is a deadline-bounded settling heuristic.

**Every claim in the evidence body checked out exactly** — four helpers, 5 ms body,
deadlines of 200 / 100 / 100 / 1,600, no explanatory comment on any of them, and only
the Application copy carrying a `label`. **The heading was the only thing that was
wrong, and every downstream citation that disagreed with the body had been copied
from the heading.** The heading is corrected to four and the Ruled-out cross-reference
is corrected in place with the reason marked.

**One thing the finding does not notice, and it inverts the priority.** In wall-clock
the four budgets are ~1 s, ~500 ms, ~500 ms and ~8 s, against `testTimeout: 20_000`.
The two tightest budgets are the two **unlabelled** byte-identical copies; the one
generous budget is the copy that **has** a label. The diagnostic cost is therefore
worst exactly where a slow machine is likeliest to trip it, and what a maintainer
would have to diagnose reads `condition was not reached`.

**The firewall constraint was measured rather than assumed, and it resolves the
opposite way.** The real `scripts/check-v1-dependencies.mjs` was run against a
synthesized tree carrying a fifth package `packages/test-support`, imported from a
`packages/workspace` test by **bare specifier and by relative path**. Neither was
flagged. A planted control import of `@neoflow/local-runtime` from the same directory
**was** flagged — which also proves the firewall descends into `test/` and that the
probe could fail. The cause is structural: `v1Packages` is four hardcoded
directories, and a specifier is checked only against legacy names, those four names,
and paths resolving inside legacy or those four roots. A fifth package under
`packages/` matches none of them.

**Disposition `split`.** **Fixed** for the diagnostic half — give the three unlabelled
helpers a `label` argument and put it in the thrown message. That is a one-file,
no-import edit per site, it requires no sharing of any kind, and it repairs the half
with a measurable cost. **Accepted** for the consolidation half: permitted, but paid
for with an unpoliced dependency edge on `packages/workspace`, the one package the
firewall declares to depend on nothing — against a benefit this finding's own
evidence scopes as "consistency rather than reliability", which is the map's
definition of taste. The differing deadlines stay; nothing established that any is
wrong, only that none is explained. **Rank `Workspace / last`** — it is the only
Workspace repair with no defect behind it.

### The correction handed forward to the Application pass

**A-03 is written around a prohibition that does not exist.** Its proposed
disposition reads "accepted across package boundaries **unless the firewall permits a
shared test package**" — and the firewall permits it. The measurement is recorded on
A-03 as a **fact, not a ruling**, leaving its disposition to
[Disposition the Application findings](./WF-067-disposition-application-findings.md).
What that pass must not do is ratify the clause as written: an `accepted` there now
needs a cost argument, which X-06 supplies, rather than a prohibition. A-03's own
cross-reference to "the four duplicated `waitFor` helpers in X-06" was correct
throughout and is confirmed rather than changed.

### What was deliberately not done

- **The margins at sites 1 and 2 are not measured, and the reason is structural.** A
  false-pass defect is unfalsifiable by running the suite, because a green run is
  precisely what a silently-trivial absence assertion produces. Establishing whether
  30 ms and 10 ms are adequate means mutating the source and re-running, which the
  map's no-code-change rule puts outside a disposition pass. The full v1 suite was
  run and passes (17 files, 85 tests, 15.9 s, Node 26.5.1) — that is evidence about
  every other test in the repository and about neither of these two findings.
- **The firewall gap is recorded, not filed as a finding.** It is latent — it bites
  only if someone adds a fifth package — and the ledger's practice since **S-01** has
  been to fold facts into the findings that need them rather than inflate the count.
  It is recorded on both X-06 and A-03, which are the two places anyone would be
  standing when it matters. The count stays at 46.
- **The two closed tickets that cite the old counts are left as written.** The ledger
  is the canonical artifact; closed tickets are the historical record of what was
  believed at the time.

### Two rules the remaining passes inherit

- **A finding's heading is a claim, and it fails independently of its evidence.**
  This is the seventh axis. X-06's body was accurate in every particular while its
  title was not, and the error propagated by citation into three other documents
  before anyone opened the file. Check the heading against the body, then both
  against the source.
- **A constraint a finding names as blocking its own repair is a claim, not a
  premise.** A-03 and X-06 both routed around the dependency firewall for two
  sessions on the assumption it forbade a shared test package. One run of the real
  script disproved it. Run the guard rather than reading its intent.

Ledger now **27 of 46 settled**, 19 still carrying proposals — the naive
`grep -c '^- \*\*Disposition:\*\*'` returns 28 because the format example in the
ledger's own header matches.
