---
id: WF-068
title: "Disposition the root configuration and legacy findings"
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

Settle the disposition and the rank of the **8** remaining ledger findings: the
six owned by root scripts and configuration, and the two owned by the legacy
packages.

Root: **X-05**, **R-01**, **R-02**, **S-02**, **S-03**, **S-06**.
Legacy: **LG-01**, **LG-02**.

Two clusters share one ticket on size, not on kinship — they have different
consumers, and the ranks stay separate. Root findings are executed by **P16C**
as its last package; legacy findings are executed by **P16D**, whose own rule
already narrows them: fix what blocks the importer or the hard cutover, or what
is unsafe to leave running, and everything else is `deletion-bound`.

Three carry a question the audit left open:

1. **S-02** — the dependency cooldown the workspace appears to configure is not
   on: `minimumReleaseAgeExclude` is set while `minimumReleaseAge` is not set at
   all. Decide the cooldown value, because switching it on requires choosing one,
   and the exclude list already implies someone intended a policy.
2. **R-01** — `@types/node` is four majors behind the declared runtime. **The
   finding's text is stale**: the Node range decision moved it under an explicit
   waiver, and `package.json:42` now carries `^26.1.2`, which is the only
   declaration of it in any manifest in the repository. So the substance looks
   discharged, and the decision is a bookkeeping one — whether a finding repaired
   by a different ticket is recorded `fixed` with that ticket named, or whether
   the ledger needs a fifth state for it. Whatever this picks applies again to
   the parts of **W-14** and **A-04** the same waiver touched.
3. **LG-02** — the known oversized-diff failure is still live in the legacy TUI,
   medium, proposed `deletion-bound`. Decide whether "still live in code we are
   deleting" clears **P16D**'s "unsafe to leave running in the meantime" bar. That
   is the one place the legacy rule is genuinely ambiguous.

## Established facts

- **Two of the eight record a fact rather than a defect.** **LG-01** is the two
  legacy durable data locations, recorded for the P17 importer; **S-06** is what
  the v1 application actually trusts. Both are proposed `accepted`. Decide
  whether a fact-record needs a disposition at all, or whether the ledger should
  mark them as records and exclude them from the "no finding left unclassified"
  count that **P16E** checks — because that gate will otherwise ask for a
  classification these two cannot meaningfully carry.
- **By severity: 2 medium** (**S-02**, **LG-02**), **4 low**, **2 facts**.
- **Proposals: 3 `fixed`** (**X-05**, **R-01**, **S-02**), **4 `accepted`**
  (**R-02**, **S-03**, **S-06**, **LG-01**), **1 `deletion-bound`** (**LG-02**).
  This is the only ticket carrying a `deletion-bound` proposal.
- **R-02 was already answered directly** by the dead-code and test-quality sweep:
  the four risk probes do weaken the canonical route, but the proposed aggregate
  closes no coverage gap, because the probes only re-cover what the unit tests
  already hold. Its `accepted` proposal therefore arrives with its argument
  finished; ratify rather than re-derive.
- **S-03 is that the v1 dependency firewall does not police third-party
  dependencies.** Proposed `accepted`. The machine's `~/.npmrc` points the
  default registry at a self-hosted proxy rather than `registry.npmjs.org`, which
  is why **S-06** names the lockfile's integrity hashes as the thing that
  actually protects content. Any disposition that leans on registry identity
  needs to account for that.
- **Legacy packages were never swept for dead code**, by that sweep's own scope
  note. **LG-01** and **LG-02** are the whole legacy result and they came from the
  first audit, so a thin legacy count is not evidence of a clean legacy tree.
- **The two `tsconfig` flags are decided but unimplemented.** `noUnusedLocals` and
  `noUnusedParameters` on `tsconfig.v1.json`, decided by the linter posture
  ticket, inseparable from deleting 18 declarations across Gate-proved source,
  and nobody has run `pnpm verify` with them on. That is an execution obligation
  rather than a ledger finding — decide here whether it needs a ledger entry so
  **P16E** can see it, or whether the closed ticket is record enough.

## Blocked by

- [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)

## Resolution comment

All eight entries are settled, with no severity change, no pull-forward, no new
finding, and no code change. The root and legacy seam fit in one pass as the ticket
predicted. The ledger is now **45 of 46 settled**; only **X-07** still carries a
proposal.

The rulings are:

| Finding | Disposition | Rank |
| --- | --- | --- |
| X-05 | `fixed`, repair narrowed to documenting the short runtime root | Root / normal |
| R-01 | `fixed`, already discharged by the Node-range decision | n/a |
| R-02 | `accepted`, proposed aggregate withdrawn | n/a |
| S-02 | `fixed`, 24-hour cooldown | Root / first |
| S-03 | `fixed`, overturning the proposal | Root / normal |
| S-06 | `accepted` as a corrected fact | n/a |
| LG-01 | `accepted` as a corrected fact | n/a |
| LG-02 | split: stale rendering `fixed`, oversized Interface `deletion-bound` | Legacy / normal |

### The three open questions

**S-02: switch the policy on at 24 hours and keep the exact exceptions.** Git
history resolves which branch is honest. The four Pi exclusions arrived in the
same commit that introduced the exact Pi 0.80.6 dependency; the nine OpenTUI
exclusions arrived in the same commit that pinned OpenTUI 0.5.1. Their grouping and
exact `name@version` shape match pnpm 11.10.0's strict release-age approval path,
which persists an intentionally selected immature version as an exclusion.
Deleting them would erase reviewed exceptions, not clarify an abandoned policy.

P16C sets `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`. The value is minutes,
so ordinary versions wait 24 hours while the Gate-proved exact pins continue to
resolve. One day is the proportionate solo-project choice: it makes same-day
replacement observable without imposing a multi-day tax on routine upgrades, and
pnpm's strict interactive path remains available for an urgent exact approval.
Do not also set `minimumReleaseAgeStrict`: in pnpm 11.10.0, explicitly setting the
age defaults strict mode to true.

**R-01: use `fixed`; do not add a fifth state.** A disposition says what happened
to the defect, not which ticket happened to do it. The Node-range decision changed
the repository's sole declaration to `^26.1.2`, exposed and fixed the optional
`process.disconnect` call, and passed the full route. The rank is `n/a` because
P16C has no remaining work to order. This bookkeeping rule does not automatically
discharge W-14 or A-04: the same waiver touched part of each, but both retain
independently ruled repairs.

**LG-02: split the finding at its unsafe residue.** The aggregate 512 KiB failure,
per-untracked-file remaining budget, and string-or-throw Interface are
`deletion-bound`. They fail visibly, mutate nothing, lose no durable data, and have
already been superseded by the v1 Evidence route; reproducing per-file degradation
in legacy would violate P16D's ban on a second implementation stream.

The consequence used to justify that ruling was nevertheless false. On refresh
failure, `App.tsx` sets a red `Git diff failed` footer but does not clear `gitDiff`,
so `ChangesPanel` keeps rendering and accepting navigation over the prior diff.
The user sees an error **with an old diff**, not an error instead of one. That is
exactly the stale-diff risk in the HANDOFF section LG-02 cites, and it crosses
P16D's “unsafe to leave running” bar. P16D fixes only that residue by clearing the
old diff on failure. Per P16D's learning gate, the repair adds no legacy feature,
refactor, or test.

### The other five rulings

**X-05 is right about `/tmp` and wrong about isolation.** Vitest 3.2.7 currently
defaults to forks, isolation, and file parallelism, but the two Local Runtime files
do not rely on those defaults. Both restore `XDG_RUNTIME_DIR` after every test,
and Vitest runs one task at a time per worker. The two files passed together twice
under configurations designed to remove the claimed protection:

- `--no-isolate --no-file-parallelism`: 2 files, 9 tests passed;
- `--pool=threads --no-isolate`: 2 files, 9 tests passed.

The hardcoded path is load-bearing for another reason. A fixture under this
machine's `os.tmpdir()` produces an 80-byte base, putting the Unix endpoint beyond
`MAX_UNIX_ENDPOINT_BYTES = 100`; `runtimeLocationForWorkspace` then silently uses
its shared `/tmp/neoflow-<uid>` fallback outside the fixture. The hardcoded `/tmp`
base keeps the endpoint at 84 bytes and inside it. The repair is two explanatory
comments. Pinning `pool`, `isolate`, and `fileParallelism` is withdrawn because it
would freeze unrelated defaults without closing a failure. The heading is corrected
to name the surviving short-root dependency.

**R-02 is accepted without the aggregate it proposed.** “Accepted, with a new
script” was internally contradictory. The test-quality sweep already established
that the probes add integration depth but close no unique coverage gap, and no
package result has omitted probes it was required to run. A convenience aggregate
therefore lacks measured support under this map's rule. P16C and P16E continue to
state the bar honestly as canonical verification **and all four named probes**.

Three factual corrections accompany that ruling. The 1,627 lines are the four probe
files **including** dogfood, not “four probes plus the dogfood probe”. The quoted
136 assertions are lines matching `assert|throw new Error` and include four import
lines; the exact executable population is 116 `assert` calls plus 16 explicit
throws, or 132 checks. And `v1:risk:pi` does not require authentication: it launches
the real pinned Pi binary with a locally registered deterministic provider and a
probe key. That makes a future aggregate operationally possible, but possibility is
not evidence that it is needed.

**S-03 is fixed because its own expiry condition has fired.** Its proposal says
the gap starts to cost when “an agent can edit a manifest”; coding agents are
working this map and the execution plan with exactly that access. `private: true`
prevents accidental publication, not a dependency entering source, lockfile, or a
local process. The self-hosted registry proxy does not close the gap either:
integrity identifies selected bytes, while this policy decides which package names
may be selected.

P16C extends the existing dependency firewall with a reviewed per-package external
allowlist and rejects every other bare package in manifests and module specifiers.
The current intentional surface was enumerated: production `dependencies` admit
only `@opentui/core` externally; the separately loaded Pi Adapter admits its Pi
peer/dev host; tests admit `vitest` and Application tests the existing OpenTUI
testing subpath. `node:` built-ins are not third-party. The rule belongs beside
`allowedV1Dependencies`, not in a new script or Interface. Severity remains low:
the current set is small, exact or peer-scoped, integrity-pinned, and unpublished.

**S-06 remains an accepted fact after correcting the unit of its headline
number.** `pnpm --filter @neoflow/app-source list --prod --depth Infinity` reports
24 dependency-tree occurrences. Three are local-workspace occurrences, including
Workspace twice. The other 21 occurrences are 20 distinct third-party
package-version identities because `ansi-regex@6.2.2` is reached twice. The old
list also omitted `typescript@5.9.3`, auto-installed as a peer, and the fact that
both `strip-ansi@7.1.2` and `7.2.0` are present. Nine of the twenty identities are
still OpenTUI packages, and only the Darwin ARM64 native is materialised here.

The material conclusion holds: the native library is exactly 4,830,592 bytes, no
materialised production package declares a preinstall/install/postinstall script,
all nine workspace packages remain private, and the dependency firewall enforces
that for all four active roots. The FFI flag is on routes that load OpenTUI, not on
“every v1 script”. The settled renderer-distribution ticket's Established fact is
corrected to carry the same count and unit.

**LG-01 remains an accepted importer fact after narrowing its permission claim.**
The two locations exactly match the already-decided P17 discovery paths. Both save
routes create a fresh temporary file at `0o600` and rename it, so bytes they produce
are private. Their recursive `mkdir(..., mode: 0o700)` calls do not re-assert mode
or owner on a directory that already exists. This is the same primitive caveat S-04
records. It does not create a new importer obligation: P17 already treats these
files as potentially planted input, captures exact bytes, and infers no authority
from filesystem permissions.

### Classification, ranking, and the two non-findings

Fact records take `accepted`. That is already one of the four classifications P16E
requires, so adding “record” would create a fifth state only to exclude it again
from the gate. Both accepted fact entries rank `n/a`, as do R-02 and the already
completed R-01.

Root has one `first`: S-02, the band's only medium and the only root finding that
governs what code a future resolution may admit. X-05 and S-03 are `normal`.
Legacy has one executable finding after its accepted fact, so LG-02 is `normal`;
calling it `first` would claim an order that does not exist. None is pulled ahead:
no evidence says an earlier package will resolve a dependency, and P16D already
follows P16C.

The unimplemented `noUnusedLocals`/`noUnusedParameters` decision remains an
execution obligation, not a 47th finding. It is already recorded in the ledger's
Summary with its current eight-error precondition and owned by the closed linter
posture decision. Duplicating it here would give one decision two owners and would
not help P16E, which checks ledger findings rather than every execution obligation.

Legacy's thin two-entry result still says nothing about dead-code cleanliness: the
legacy packages were outside the dead-code sweep, and P16D still performs its
blocker-only review. This pass found no new fog and opened no ticket.

### Verification

No source, manifest, lockfile, script, or configuration file changed. The full v1
suite passed on Node 26.5.1: **17 files, 85 tests, 14.25 seconds**. Before that run,
the two X-05 hostile-config probes each passed all 9 targeted tests. Ledger
arithmetic closes at **46 total = 45 settled + 1 proposed**; severity remains 1 high,
16 medium, 27 low, and 2 fact records. `git diff --check` passes.
