---
id: WF-064
title: "Disposition the findings best decided ahead of the rest"
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

Four findings the ledger itself flags as worth settling *before* the packages
that would otherwise carry them. Decide each one's disposition, and — because
this ticket goes first — decide **how a settled disposition and a rank are
recorded in the ledger**, so the five package tickets behind it inherit a format
rather than each inventing one.

The four:

1. **W-01** — `#snapshotEvidenceIdentities` grows without bound. The ordering
   argument: **P16B** Live Changes changes its growth rate from one entry per
   Review to one per edit, so the bound is cheaper to add before that package
   than after it.
2. **L-03** — the Workspace seam is typed as `unknown` behind a double cast. The
   ordering argument: **P16C**'s command-shape changes will not fail to build
   while the cast stands, so every later package loses its compiler.
3. **S-01** — `git status` executes a command named by the repository's own
   `.git/config`. Reproduced, and one argument fixes it. Its finding also raises
   a second question the disposition decision was asked to settle rather than
   the audit — resolve that here.
4. **X-09** — no test in this repository ever finishes a Review. The fixtures
   that start and populate one already exist, so these are endings for scenarios
   already written.

Two of the four (**W-01**, **L-03**) carry a real ordering dependency; the other
two are here because they are cheap and high-value rather than because anything
sequences them. Say which of the four are genuinely pulled ahead of **P16B** and
**P16C** and which merely rank first inside their own package, because that
distinction is what the execution packages act on.

## Established facts

- **All four are proposed `fixed`.** Three are medium (**L-03**, **S-01**,
  **X-09**) and one is low (**W-01**). No finding in this group is contested on
  severity or on category.
- **The pull-forward argument for W-01 and L-03 is already written down** in the
  ledger's Summary, under "Two findings are worth doing *before* the packages
  that follow, rather than in sequence with them". This ticket ratifies or
  overturns that, and adds the two the Summary does not name.
- **Nothing here decides how the fix is built.** This map changes no code; the
  repair belongs to **P16B**, **P16C**, or their pull-forward.
- **The cross-package order is not a free variable.** **P16C** already fixes it
  as Workspace, Local Runtime, Pi Adapter, Neoflow Application, then root
  scripts, packaging, and configuration. Ranking is therefore *within* a
  package, and the only cross-package scheduling act available to this map is
  the pull-forward this ticket decides.
- **The ledger currently records no rank at all.** Each finding carries Module,
  file, category, severity, evidence, and one proposed disposition — no rank
  field, and no marker distinguishing a proposal from a ruling beyond the
  ledger's own header note. Whatever format this ticket picks has to survive the
  header note being retired once every finding is settled.

## Resolution comment

**All four are `fixed`. Three are pulled ahead of P16B, not two. One of the four
turned out to be wrong about its own scope, and finding that out is the main
result of this ticket.**

### The record format the five package passes inherit

Written into the ledger under **How a settled finding is recorded**, so it is
read where the work happens rather than here.

Settling a finding replaces its `**Proposed disposition:**` line with
`**Disposition:**`, `**Rank:**`, an optional `**Pulled ahead:**`, and
`**Decided:**`. The presence or absence of the word "Proposed" is the only marker
distinguishing a ruling from the audit's suggestion — which means the ledger's
header note retires by deletion once the last finding is settled, with nothing to
migrate. That was the constraint this ticket was given, and it is met by not
introducing a second marker.

**Rank is a band within the owning package** — `first`, `normal`, or `last`, with
a written reason required for `first` and `last` and none for `normal`. Ties are
expected and mean nothing. This was the one question put to the owner, against a
strict 1..N ordering, and bands were chosen. The reasoning is the ledger's own
evidence rule turned on ranking: ordering nineteen findings takes eighteen
judgements and the evidence supports about three, so a total order would
manufacture precision that nothing in the ledger backs. A rank supported only by
taste is the same defect as a disposition supported only by taste.

**`Pulled ahead` is a separate axis from rank**, because the ticket asked for that
distinction specifically and the two are genuinely independent: a pull-forward
must happen before a *named package* starts, while a `first` band is just the head
of that package's own queue. A finding can be `first` without being pulled ahead —
**S-01** now is — and the execution packages act on the two differently.

**The P16E worry is unfounded and needs no ticket.** The flagged risk was that
**LG-01** and **S-06** record a fact rather than a defect and so could not carry
one of the four dispositions, leaving P16E's "no finding left unclassified"
unsatisfiable. Both already carry `accepted`. It is the **severity** scale that has
no row for them — they read "not a defect" — and P16E says nothing about severity.
Recorded in the format section so it is not re-raised.

### The four dispositions

**W-01** — `fixed`, Workspace / `first`, **pulled ahead of P16B**. Ratified as
written. The growth is real, the three bounded sibling caches settle the pattern
without inventing one, and an evicted entry already degrades gracefully, so the
bound costs no correctness. P16B changes the arrival rate from one-per-Review to
one-per-edit, so the same map costs far more afterwards while the repair gets no
easier for waiting.

**L-03** — `fixed`, Local Runtime / `first`, **pulled ahead of P16B**. The
disposition is ratified; **the deadline is moved earlier**. The ledger's Summary
and the finding both name P16C as what the seam should precede. But P16C
*depends on* P16B, so P16B lands first — and P16B changes the same surface, adding
Versions navigation as a bounded read-only Projection and explicit continuation
for frozen range Reviews, both crossing this seam. The finding's own argument, that
a mismatch surfaces as a runtime rejection inside a probe instead of a build
failure, applies to P16B in full. Typing the seam only before P16C would leave the
largest semantic change on the roadmap as the one change the compiler never
guarded.

**X-09** — `fixed`, Workspace / `first`, **pulled ahead of P16B**. This overturns
the framing that put it here for being cheap and valuable rather than sequenced.
It carries the strongest ordering argument of the four: P16B is the largest
rewrite of the Review lifecycle on the roadmap, and nothing in the suite, the four
risk probes, or the dogfood probe would catch it breaking Review completion or
cancellation. A test written after a rewrite cannot catch that rewrite's
regressions — it can only describe what the rewrite produced. And the tests
survive the package that motivates them, which is what makes this cheap rather
than merely urgent: P16B changes Snapshot creation, Anchors, and Versions
navigation, and does not redefine the terminal transitions.

**S-01** — `fixed`, Workspace / `first`, **not pulled ahead**, severity holds at
medium — **and its scope is overturned.** See below.

### S-01 was wrong about being closed, and the second question is answered

The finding proposed `fixed` on the grounds that one argument "closes the only
confirmed path from repository content to command execution." Rather than ratify
that sentence, it was tested. It is false, and it is withdrawn.

Reproduced on Git 2.51.2 against the exact argument vector at
`workspaceEvidence.ts:877`: a repository whose tracked `.gitattributes` sets
`* filter=<name>` and whose `.git/config` sets `filter.<name>.clean` to a shell
command **runs that command during `status`**, and `-c core.fsmonitor=` does not
suppress it. It is the worse of the two vectors on all three properties that
matter. It fires when the index stat cache is invalid rather than only when
content changed — so the *first* `status` after an archive extraction or a
directory copy, which is precisely the delivery method S-01 describes, runs it
across the whole tree. The driver name is attacker-chosen, so per-key blanking has
nothing to enumerate. And the name-independent suppression that does work,
`GIT_ATTR_SOURCE=<empty tree>`, has an **unmeasured** behavioural cost: the probe
built to price it was confounded, because `status` already reports a
legitimately-filtered file as modified when its cleaned content matches the index
exactly. That is pre-existing Git behaviour, not a consequence of the hardening,
and the honest state is that the false-positive question is open. It is recorded
as open rather than resolved by assertion.

The audit's two neighbouring-key checks were re-run and both confirm: `diff.external`
is not reached (status runs no diff) and `core.pager`/`core.editor` are already
closed by `processEnvironment`.

**The disposition survives — `fixed` — but as a partial fix rather than a closure.**
The fsmonitor argument is still correct and still cheap. The clean-filter vector
needs a different mechanism, and choosing it means paying a behavioural cost
knowingly, which belongs to **P16C** as the owner of the repair, not to this map.

**The second question this ticket was asked to settle — whether the same hardening
belongs on any future index-refreshing call — is answered, and the answer is that
the question was framed too narrowly.** The rule is not a property of the
subcommand. Every `git` call reads the checkout's `.git/config`; `status` is
merely where two keys have been *confirmed*. Enumerating the Workspace's git
surface shows only `status` refreshes the index today — the rest is `rev-parse`,
`show -s`, `diff-tree`, `cat-file`, and `log --graph`, on both `runGit`
implementations — so per-subcommand hardening has exactly one site and would
generalize to nothing. What actually needs deciding is the posture toward the
configuration itself, which is now
[Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](./WF-070-decide-checkout-git-config-trust.md).

**Two vectors found by two people thinking of them is not an enumeration**, and
the error that produced the original sentence is one this ledger has already
named: the Ruled-out re-verification found that its recurring mistake was
**reporting a necessary condition as a sufficient one**. Checking two neighbouring
keys and concluding the path was closed is that same mistake, made in a finding
rather than in a ruling. Recorded in the Summary, because the pattern is worth
more than the vector.

### What execution inherits

The execution plan has **no package between P16A and P16B** for the three
pull-forwards to sit in. They either need one, or they run at the head of P16B
before its own changes begin. Whoever opens P16B owns that call; it is a
scheduling detail for execution, not a decision this map owes, and it is recorded
in the ledger's Summary so it is not discovered late.

**P16C must not ship the S-01 fix presuming the narrow rule** while
[Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](./WF-070-decide-checkout-git-config-trust.md)
is open.

### Assets

- `docs/audit/pre-p17-codebase-findings.md` — the format under **How a settled
  finding is recorded**, the four settled findings, and the two corrected Summary
  paragraphs.
- The three probe scripts were written to the session scratchpad and are gone.
  Each is a short `bash` script that builds a throwaway repository, sets one
  `.git/config` key, and runs the `status` vector from `workspaceEvidence.ts:877`
  with and without hardening, touching a marker file from the configured command.
  Cheaper to rewrite than to recover; the reproduction steps above are complete.

## Blocks

- [Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md)
- [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)
- [Disposition the Application findings](./WF-067-disposition-application-findings.md)
- [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- [Decide whether the Workspace Writer vocabulary drift obliges a rename](./WF-069-decide-workspace-writer-rename.md)
