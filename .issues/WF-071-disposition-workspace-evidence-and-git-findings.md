---
id: WF-071
title: "Disposition the Workspace evidence and git findings"
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
findings that own evidence capture and the `git` surface.

**W-02**, **W-07**, **W-08**, **W-09**, and **W-14**.

One of four tickets from the split of
[Disposition the Workspace findings](./WF-065-disposition-workspace-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its
resolution comment. **Rank within the Workspace band, not within this ticket** —
the four split tickets share one package and therefore one band, so a `first`
here means first in the Workspace, not first in this group.

Every one is proposed `fixed`, so the decision on each is whether that survives
the map's evidence rule — a finding supported only by taste is `accepted`, not
`fixed` — and whether **P16B** Live Changes rewrites the code anyway, in which
case it is `deferred` to that package rather than decided here.

One carries a question the audit explicitly left to this decision:

1. **W-14** — `git` resolved through `PATH` is *why* the supported Node ceiling
   exists. Its fix is unproven across six handoffs; nobody has run the full v1
   suite on 26.6.0 or 26.7.0 with `git` resolved to an absolute path, and a
   spawn probe is **not** evidence of support. Decide whether it is `fixed`, or
   `accepted` with the declared range standing as the mitigation. Deciding this
   without running the suite is legitimate — but say which was done.

## Established facts

- **This ticket holds the ledger's only high finding.** **W-07** — `runGit`
  writes to `child.stdin` with no error listener, so the module's own
  output-limit path (`SIGKILL` mid-write) can raise an unhandled `EPIPE` and
  terminate the process on a large repository.
- **W-07 is already judged not to unsettle the pushed Gate B checkpoint**, for
  reasons recorded in the finding. That judgement is **not reopened here**; what
  is open is its rank and its disposition as a **P16C** fix.
- **W-02 was missing from the original ticket's own split seam**, which named
  eighteen of its nineteen findings. It is placed here because it lives in
  `workspaceEvidence.ts`'s capture paths, alongside **W-07**–**W-09**. Noted
  because the omission is the same completeness-claim failure this map keeps
  finding, this time in a ticket rather than a finding.
- **S-01 is Workspace-owned, settled, and adjacent to this ticket's surface** —
  it is the `git status` invocation in `workspaceEvidence.ts`. It was settled on
  [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)
  and is **not reopened**, but its unresolved half constrains this ticket: the
  clean-filter vector has no chosen mechanism, and
  [Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](./WF-070-decide-checkout-git-config-trust.md)
  owns the standing rule. **Do not settle a `git`-surface finding here in a way
  that presumes that ticket's answer.**
- **W-09 (`runGit` has no timeout) and W-07 are the same call path.** Decide
  whether they are one repair or two before ranking them.

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

**All five `fixed`, none pulled ahead, three of the five ranked `first`, and this
is the first pass that settled findings by running code rather than by reading
it.** That is the headline: the ledger's only high finding was **reproduced**, and
two of the five turned out to be right about the defect while wrong about the
evidence that was supposed to establish it — the same split this map has now seen
in **S-01**, **P-01**, and **L-04**.

### What was tested, and what it cost

Four probes and one suite run, all on Node 26.5.1, macOS, Git 2.51.2. **The suite
was run** — 17 files, 85 tests, all passing, closing a gap the last two handoffs
carried. It was run to take a census, **not** to test the Node ceiling.

### The high finding: right defect, wrong trigger

**W-07** claimed the crash arrives through the module's own output-limit path —
stdout over the cap, `SIGKILL`, `EPIPE` on a still-draining `stdin`. **That path
cannot fire at either of the two call sites that pass stdin.** Both budget 256
stdout bytes per object; the real output measures **49 bytes/object** for
`cat-file --batch-check` and **50 bytes/object of overhead beyond content** for
`cat-file --batch`, and `readGitObjects`'s budget is not an estimate — `planCapture`
admits sides only while their exact `byteLength` fits, and the callers sum those
same lengths. The cap sits about **5× above** the output it bounds.

The defect is nonetheless real, and now measured rather than inferred: a harness
mirroring `runGit` exactly dies with `Unhandled 'error' event … write EPIPE`. The
reachable trigger is **any early `git` exit while a large stdin drains**,
reproduced against a non-repository checkout. That is worse than the trigger the
finding named, because it is exactly the unstable-checkout case `#capture`'s retry
loop exists to survive: instead of retrying, the process dies.

Two numbers came out of the sweep. The **64 KiB / ~1,600 object id** threshold the
finding states is confirmed **to the id** — 1,590 survives, 1,600 crashes — and it
is not Linux-specific as written. And the finding's claim that no large-repository
test exists is **false**: one captures 1,000 files and 50 MiB. It genuinely does not
cover this defect, but because its files are *untracked* and never become `cat-file`
stdin — conclusion right, reason wrong.

**This changes the repair.** The proposal's parenthetical "stop killing before the
write settles" is withdrawn as scoped to a trigger that cannot fire, and the
regression test needs ≥1,600 **object ids** plus a forced early exit. A test built
from the existing 1,000-file fixture — the obvious move — would pass against
unfixed code.

### The `git` ceiling: claim confirmed, fix scope too narrow

**W-14** is the map's longest-running open question, and its causal claim now has a
count instead of an impression. Routing `git` through a counting shim, the full v1
suite spawns **1,034 `git` processes** — ~790 production, 244 test-harness. At
WF-056's measured +35 ms per PATH-resolved spawn on 26.6.0 that is **~36 s of added
latency** against a **17.2 s** suite, independently corroborating "≈5× slower and
times out" without re-running WF-056.

**But the proposed fix cannot answer its own open question.** "Both call sites"
leaves the 244 harness spawns untouched — bare-word `git` at **eight test-helper
sites** and seven more in the risk probes — so fixing production alone removes ~76%
of the penalty and leaves ~8.5 s of PATH cost. The finding's own evidence gate is
*a full suite run*; a gate contaminated by a source the fix does not address returns
an unclean answer. The disposition therefore widens the scope to the harness sites.

**The ceiling question is severed and stays open**, because it is not decidable on a
map that changes no code: proving it needs the resolver in place. **P16C** owns it,
paired with **A-04**. **Decided without running the suite on 26.6.0 or 26.7.0** — the
ticket permits that provided the ruling says which was done, and this says it. If
P16C slips past roughly September 2026, October's Node 26 LTS turns it into a
scheduling question for the execution plan rather than a ledger question.

### The other three

- **W-02** — the one finding whose evidence held **exactly**: byte-identical blocks
  (298 bytes each), the only two in any active `src` tree, and the two writers are
  the Map's only two producers. `fixed`, but scoped honestly — **the named constant
  is the half the evidence supports**; extracting the helper is tidiness riding along
  because it is free once the constant moves. Not a `WorkspaceEvidenceLimits` field:
  that interface is exported and normalized, and nothing argues the bound is tunable.
- **W-08** — dead-field claim exact, padding real, **worked example wrong**: 4,096
  NUL bytes, not 5,536, which came from mixing a decimal 60,000 with the binary cap.
  A third outcome was missed — an oversized first chunk retains nothing and
  `Buffer.concat([], n)` returns **empty**, total loss rather than padding — recorded
  but explicitly **not** claimed reachable, since no single pipe read is that large.
  The evidence rule picks the branch: attach stderr to the error rather than stop
  collecting, because only that half carries a named future cost.
- **W-09** — the ticket's question answered: **one repair with W-07, not one policy
  with W-03.** Same function, same promise; a fixer attaching the `stdin` listener
  already holds every line the timer needs. **W-03** is a message port with no child
  process and shares no implementation, only an error *vocabulary* — and settling
  them together would couple this ticket to
  [Disposition the Workspace state and projection findings](./WF-072-disposition-workspace-state-and-projection-findings.md),
  which is the coupling the split existed to prevent. Recorded as **coordination, not
  dependency**. Ranked `first` for the shared edit, explicitly **not** for its own
  severity, which stays low.

### Rules the remaining passes inherit

1. **A completeness claim and a mechanism claim fail independently — and so do a
   mechanism claim and a *coverage* claim.** **W-07** got its threshold exactly right,
   its trigger wrong, and its coverage right-for-the-wrong-reason, all in one finding.
   Verifying any one of the three says nothing about the other two.
2. **A finding that names the evidence needed to close it can be wrong about *that*,
   too.** **W-14**'s "run the full suite" is the right gate pointed at a scope too
   narrow to make it clean. Test the proposed *evidence*, not only the proposed fix.
3. **Where a probe reproduces the defect, the trigger it reproduces is worth more
   than the trigger the finding argued.** Two of the corrections here exist only
   because something was executed.

### Constraints honoured

**S-01** was not reopened, and nothing here presumes
[Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](./WF-070-decide-checkout-git-config-trust.md):
resolving `git` to an absolute path is about `PATH`, not about a repository's own
config, and the two do not interact. **W-07**'s Gate B checkpoint judgement was not
reopened. No code was changed.

### Ledger state

**13 of 46 settled, 33 proposals remaining.** One counting trap for the next
session: a naive `grep -c '^- \*\*Disposition:\*\*'` returns **14**, because the
format example in the ledger header matches too.

### Not verified

Node 26.6.0 and 26.7.0 were not exercised — **keep both installed**. The 17.2 s
suite figure is **confounded**: every `git` call ran through an `sh` shim, so it is
an upper bound. The spawn *count* is unaffected. The ~5 attribution of
`workspaceIdentity` spawns is approximate; the production/harness split is not
sensitive to it.
