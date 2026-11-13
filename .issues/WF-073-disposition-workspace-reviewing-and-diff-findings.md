---
id: WF-073
title: "Disposition the Workspace reviewing and diff findings"
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

Settle the disposition and the within-package rank of the **5** Workspace
findings that own reviewing, diffing, and the helpers copied around them.

**X-03**, **W-10**, **W-11**, **W-12**, and **W-13**.

One of four tickets from the split of
[Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its
resolution comment. **Rank within the Workspace band, not within this ticket.**

Every one is proposed `fixed`, so the decision on each is whether that survives
the map's evidence rule — a finding supported only by taste is `accepted`, not
`fixed` — and whether **P16B** Live Changes rewrites the code anyway, in which
case it is `deferred` to that package rather than decided here.

One carries a question the audit explicitly left to this decision:

1. **W-13** — the consolidation it proposes has a home that already exists, and
   two `sha256` implementations disagree. Decide whether consolidating is
   evidence-driven repair or the tidiness this map forbids. Note that its own
   `accepted` half was flagged as worth re-weighing here, and that **the
   disagreeing `sha256` pair is a defect on its own terms** regardless of how
   the consolidation question lands — do not let one answer swallow the other.

## Established facts

- **This ticket owns the two findings that reach outside the Workspace**, and it
  is now the only place either is decided.
  - **X-03**'s fourth `JSON.stringify` comparison site is in the **Pi Adapter**.
  - **W-13**'s copied helpers may reach the Pi Adapter too.
  [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
  **closed on 2026-08-07 without pre-empting either**, and said so explicitly, so
  nothing has been decided about the sibling package's sites. They are
  dispositioned here because the Workspace holds the canonical copy; **record
  what the Pi Adapter inherits** as part of the ruling, since no later ticket
  will revisit it.
- **A-05's dead path has a Workspace end** outside its own 100-line count, and it
  lands on this surface. The Application pass on
  [Disposition the Application findings](./WF-067-disposition-application-findings.md)
  owns the decision; the deletion is one act across two packages, so **do not
  decide the Workspace side independently** — record any obligation instead.
- **Two of the five are medium** (**W-10**, **W-11**), both performance, both in
  the diff path, and both bounded. Weigh them against the map's rule that
  evidence, not taste, carries a `fixed`.
- **W-12 is the `bytesBase64` codec, hand-rolled at ~20 sites and validated at
  one.** The site count is a completeness claim; test it before ruling on it.

## Method

**A ratification pass is not a reading pass.** Where a finding's disposition
rests on a claim of completeness — "the only", "all", "no other", or a site
count — that claim is the thing to test, because completeness claims are where
this ledger has already been shown to fail three times: once in a ruling, once in
**S-01**, and twice in
[Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md),
which also found a finding naming a fault source that could not actually
propagate. Test the mechanism as well as the count. **This ticket has more
countable claims than any of the other three.**

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` —
with a written reason required for `first` and `last` only, and ties carry no
meaning.

## Resolution comment

**All five `fixed`, one pulled ahead, one ranked `first`, and the count stays at
46.** The five settled findings are in `docs/audit/pre-p17-codebase-findings.md`;
this comment records what the pass decided and what it had to overturn to get
there.

### The headline: two findings were wrong about their own repair

Last session's rule was *test the proposed evidence, not only the proposed fix*.
This pass found the next variant: **test the proposed fix against its own
alternative**, because a finding that offers two repairs as interchangeable has
made a claim, and claims fail.

**W-10 offers two fixes joined by "or", and they differ by 4–11×.** Benchmarked at
`MAX_LCS_CELLS` (2,000 × 2,000 = 4,000,000 comparisons, 40-byte lines, Node
26.5.1): the current `Buffer.from(l).equals(Buffer.from(r))` costs **422 ms**; the
finding's `Buffer.from(buffer, byteOffset, byteLength)` **view** costs **381 ms**
— **1.11×**; a direct `Uint8Array` comparison with a length precheck costs **34
ms** — **12.4×**, with zero heap delta against 2.1 MiB. Worst case, where the
length precheck cannot short-circuit, the spread narrows to 1.13× and 4.3× but the
ordering is unchanged. **The cost is Buffer object construction, not the byte
copy**, which is why the view — the more surgical-sounding option, and the one the
finding describes in most detail — recovers about a tenth of the available win. A
fixer taking it would have concluded the finding was overstated. The view is
**withdrawn from the proposal**; leaving it in as an equal option is how the
repair gets made without the benefit.

One trap recorded because it is the obvious optimisation and it is wrong:
`DiffLineSlice` carries a `digest` field, but `diffLines` stamps every line on a
side with the *file's* content identity, so comparing digests would compare files,
not lines.

**W-13's hazard does not compile.** Its stated mechanism is that moving a Pi
Adapter identity builder into the Workspace leaves `sha256(a, b)` compiling and
quietly digesting only `a`. The runtime half is real — `update(data,
inputEncoding)` discards the second argument, and three distinct input pairs
sharing a first element collapse to one digest. **The compile half is false**:
`tsc --strict` rejects that call with `TS2554: Expected 1 arguments, but got 2`,
exit 2. The silence the medium-severity annotation rested on is not there.

The silent path *does* exist and is a different one: **a unary function satisfies a
variadic type**, so assigning `sha256` to `(...parts: readonly string[]) => string`
or passing it as a callback to anything expecting the Pi contract compiles clean
(exit 0) and drops every argument after the first. The real hazard is that the
Workspace `sha256` **satisfies the Pi Adapter's contract while not honouring it**.
That constrains the repair: the shared helper's multi-part form must take an
**array**, not varargs, or the same silent drop returns through the new helper.
Severity corrected to **low throughout**.

### X-03's boundary with X-01 was drawn on syntax, and a class fell through it

X-03 names five locations containing seven comparison expressions while saying
"six sites" — the fourth arithmetic slip in this ledger, and the least of it.
Sweeping every `JSON.stringify` in active source turned up **three durable
comparison sites it misses**: `harnessInteraction.ts:3635`, `:1598`, and
`reviewing.ts:1761`, each comparing a freshly computed `JSON.stringify` against
**one persisted in Authoritative State earlier**, to decide whether a replayed
command is the same command. They are neither X-03's in-process pairs nor X-01's
`sha256(JSON.stringify(…))` digests. **The two findings partitioned the hazard by
syntax rather than by mechanism, and the class between them belongs to neither.**

The mechanism was probed, not argued, and the two sibling normalizers **disagree**:
`reviewing.ts:659` rebuilds every command from a fixed source literal, discarding
caller key order; `harnessInteraction.ts:585` returns
`cloneFrozen({...value, anchor: …})`, and `cloneFrozen` is
`deepFreeze(structuredClone(value))` — both spread and `structuredClone` preserve
caller key order. Two semantically identical commands differing only in caller key
order therefore produce different normalized strings under one and identical ones
under the other. The consequence is a false `command-identity-conflict`: a replay
of a command that **already committed** is reported as an identity reused for a
different command.

**It is not reachable today, and the ruling says why rather than leaving it
implied.** `commandIdentity()` is a fresh `randomUUID()` per command, so no
producer re-presents an identity with an independently built object, and the one
retry path reuses the same in-memory string. Severity stays **low**. Raising it on
an unreachable path is the error W-07's trigger correction warned against last
session. What raises it is named instead: a producer that reuses a
`commandIdentity` across separately constructed objects — which is what an
idempotency key is *for*, and two of the three harness commands have no producer
at all (**X-08**), so the first real one inherits this.

The repair is structural rather than by producer discipline — the **P-01**
precedent — and cheap, because the correct pattern already exists at one of the
two sites in the same package.

### The two remaining findings held, with their own evidence sharpened

**W-11** is right, and understates itself twice. The 250,000-row limit is
reachable, but by the branch the finding never mentions: at that size the LCS
guard has already failed, so the rows come from the all-deletions-plus-all-
additions fallback — **the limit is reached precisely when the LCS is skipped**,
which is the opposite of where a reader would look. Its proposed precheck is
sound and **tighter than proposed**: there is no "plus context", because a context
row consumes one line from each side and emits one, so context makes the total
strictly smaller. And the waste is CPU, not only memory — every discarded row was
built by `projectedDiffRow`, which computes a **`sha256` per row**.

**W-12**'s approximate count survives and its specific list does not, which
matters because the fix is a sweep. "Roughly twenty" is **21**, across **seven**
files rather than six. Two named sites are **not this codec** —
`authoritativeStateWorker.ts:213`/`:216` are base64 inside a checksum
canonicalization with no `bytesBase64` field and no canonical-form obligation, and
converting them would change a durable checksum's input for no reason. Three real
sites are **missing**: `reviewingModel.ts:320`, `reviewingView.ts:734`, `:1414`.
Of 19 line references, 17 are correct, 2 belong elsewhere, 3 are absent. Same
shape as W-14's error last session: **the proposed fix's scope is narrower than
the finding's own subject.** Its one interesting claim — that exactly one site
validates canonical encoding — holds as the whole of it.

### The deferral question this ticket was asked, answered once for all five

None of the five is `deferred`. **P16B does not rewrite this code; it re-runs
it.** Live Changes is a continuously updated projection driven by invalidation
hints — it changes which evidence is diffed and when, not how rows are built. So
Live Changes *multiplies* W-10's and W-11's costs rather than removing them, which
strengthens `fixed` instead of weakening it.

That is also the whole of W-10's pull-forward. P16C owns the Workspace repairs and
**depends on P16B**, so a `first` band alone would still land the fix after Live
Changes ships continuous re-diffing over a path measured at 400 ms per large file
comparison — on the surface HANDOFF records as having already failed a human gate
once. W-11 is **not** pulled ahead: its trigger needs a single file above ~250,000
lines, which is rare enough that the repeat cost does not clear the bar.

### The cross-package obligations, decided here because nothing later revisits them

- **X-03 / Pi Adapter.** `markerMatches` is the Pi Adapter's own site and the Pi
  Adapter fixes it; nothing about it waits on the Workspace, and it carries no
  obligation in the other direction. Its half of the finding is the one thing in
  this pass that verified **exactly** — five scalar fields confirmed against
  `PiCorrelationMarker`, both marker constructions in the same literal key order,
  written at the cited line, round-tripped only through Pi's storage.
- **W-13 / Pi Adapter.** `piAdapter.ts:94` must adopt the shared helper's
  array-form contract when it lands, since it is the copy whose semantics the
  helper has to preserve. The Pi Adapter's `isRecord`-family copies are `accepted`
  on the same reasoning as the Workspace's.
- **X-01, owned by [state and projection](./WF-072-disposition-workspace-state-and-projection-findings.md).**
  The three durable sites are ruled here and closed by the normalizer repair, so
  **X-01 should not assume its canonical-serializer decision covers them, and need
  not widen to reach them.** If it does adopt a canonical serializer they become
  redundant rather than conflicting.
- **A-05's Workspace end** was left untouched, as this ticket required. The
  Application pass owns it and the deletion is one act across two packages.

### The consolidation question, answered without letting it swallow the defect

The ticket warned against one answer eating the other, and they did land
differently. `sha256` is **fixed**. The other four helpers are **accepted**: no
defect traces to any of them and the diff is wide across source Gate A and Gate B
just proved. The amendment's cost argument was tested and holds —
`protocol.ts:197` exports `isRecord`, `lifecycle.ts` declares its own copy and
never imports `protocol.js`, and `index.ts` does not re-export the protocol
surface — but **a cheaper version of an unevidenced change is still unevidenced**.
The single exception is allowed only because it is free: `lifecycle.ts:134` may
delete its copy and import the export that already exists in its own package. If
that does not fall out of the `sha256` work naturally, it is not worth a visit.

**All five copy counts hold exactly** — 5 / 4 / 4 / 2 / 4 — making W-13 the first
finding in this ledger whose completeness claims all survive intact. Recorded
because the pattern until now has been the reverse, and a clean one is evidence
about the audit's reliability too.

### Amendment, 2026-08-09 — W-13's validation half is reopened and fixed

The owner challenged both the repeated `isRecord` predicate and the manual
`isRecord`/field-check/cast decoder pattern while the map was closing. The concern
was tested rather than treated as taste. On Node 26.5.1,
`parseReviewSnapshot` accepted valid outer identities with empty `basis`,
`comparedState`, and `manifest` objects and returned the malformed value as a
trusted `ReviewSnapshotPayload`. The accepted half above therefore rested on a
false premise: a defect now traces directly to the pattern.

[Replace repeated isRecord validation with owner-local codecs](./WF-078-revisit-active-input-codecs.md)
is the later ruling. W-13's validation half is now `fixed` at medium severity:
one private structural object guard per active package, owner-specific codecs
that construct compiler-checked values, no whole-object cast standing in for
validation, and malformed nested-value regression coverage. Workspace's durable
codec work is pulled ahead of P16B because Live Changes changes the exact Snapshot
shape that reproduced the defect. `deepFreeze` and `validText` remain accepted;
the array-form `sha256` ruling and Pi Adapter obligation are unchanged. This
amendment changes no code.

### Rules the remaining passes inherit

1. **Where a finding proposes two repairs as alternatives, that is a claim, and
   claims fail.** Benchmark them against each other, not just against the current
   code. W-10's two options differ by an order of magnitude.
2. **Two findings can partition a hazard by syntax and leave a class between
   them.** X-01 took the digests, X-03 took the in-process pairs, and the durable
   string comparisons belonged to neither. When two findings share a mechanism,
   check the boundary rather than the interiors.
3. **A `deferred` question is usually one question, not one per finding.** Asking
   whether P16B rewrites this code answered it for all five at once, and the
   answer inverted the expected direction: it re-runs the code, so deferral was
   never available and the pull-forward case got stronger.
4. **An unreachable defect is still worth ruling, provided the ruling names the
   condition that would reach it.** X-03's durable sites stay `low` with the
   trigger written down, rather than being either inflated or dropped.

### One observation recorded, not chased

[Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md)
measured knip's entire report across the four active roots as 13 type re-exports
in `authoritativeState.ts`. `protocol.ts:197` is an export with no cross-module
consumer and is not among them. The discrepancy was not investigated and does not
affect that ticket's adoption ruling — 13 items in one file is still a one-time
cleanup, not a curve — but it is worth one probe if the tooling question reopens.

**Ledger now 18 of 46 settled.** A naive
`grep -c '^- \*\*Disposition:\*\*'` still returns 19; the format example in the
ledger's header matches, so anchor past the first `#### ` heading.

**No code was changed.** The four probes ran outside the repository, in the
session scratchpad, and are described above in enough detail to rebuild.
