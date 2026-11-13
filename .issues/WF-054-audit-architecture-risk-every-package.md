---
id: WF-054
title: "Audit architecture and risk across every package"
status: closed
labels:
  - wayfinder:task
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-05
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

What confirmed correctness, durability, concurrency, performance, security, testing, duplication, and maintainability problems exist across every package and its Interface—`packages/workspace`, `packages/local-runtime`, `packages/pi-adapter`, `apps/neoflow`, the root scripts and configuration, and the legacy packages—and which suspected problems can be ruled out?

## How this ticket is worked

- This is the same work as the **Audit architecture and risk across every package** package of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md). It runs once, and both records point at the same ledger.
- The ledger is `docs/audit/pre-p17-codebase-findings.md`. Every finding names its owning Module and file, its category, its severity, the exact evidence that establishes it, and a proposed disposition of fixed, accepted, deferred, or deletion-bound.
- Findings are written to the ledger **as they are confirmed**, never held until the end. A previous session lost roughly thirty minutes of analysis by holding all of it in context until that context died.
- A lead that fails confirmation is recorded as ruled out with its reason, so the same suspicion is not investigated twice.
- Change no code. This ticket's outcome is a document, and an obvious one-line fix is still a fix.
- Ranking the ledger and deciding each finding's disposition are **not** part of this ticket. See **Not yet specified** on [Chart the pre-P17 codebase deepening plan](./WF-053-pre-p17-codebase-deepening-plan.md).
- If the audit finds a defect that makes the current pushed source unsafe to keep as the checkpoint, raise it immediately as its own decision rather than repairing it inside this read-only ticket.

## Resolution comment

The ledger exists at `docs/audit/pre-p17-codebase-findings.md` and covers all
seven areas: cross-cutting sweeps, `packages/workspace`,
`packages/local-runtime`, `packages/pi-adapter`, `apps/neoflow`, the root scripts
and configuration, and the legacy packages. No code changed; the only files added
are the ledger and these tracker records.

**31 findings** confirmed — 1 high, 12 medium, 17 low, plus one recorded
migration fact. **18 suspected problems ruled out**, each with its reason in the
ledger's own **Ruled out** section so none is re-investigated.

### The one high finding

**W-07** — `runGit` (`packages/workspace/src/workspaceEvidence.ts:646`–`:691`)
writes the whole request with `child.stdin.end(...)` but installs no error
listener on `child.stdin`, and there is no `process.on('uncaughtException')`
anywhere in the active source. Its own output-limit path `SIGKILL`s the child
while that write may still be draining, so a large repository — many object ids
*and* output over the cap — can raise an unhandled `EPIPE` and terminate the
process instead of degrading to `git-output-limit`.

**This does not make the pushed source unsafe to keep as the checkpoint**, so it
was not raised as a separate decision. The crash occurs during read-only Git
inspection with no durable write in flight, Authoritative State is untouched, and
recovery from process death is already proven by the dogfood probe. It is a
**P16C** fix.

### Two findings worth doing before the packages that follow

- **W-01** — `#snapshotEvidenceIdentities` (`projection.ts:1112`) has only a
  `get` and a `set`; no delete, no clear, no cap, unlike all three of its
  bounded siblings. **P16B** Live Changes changes its growth rate from
  one-per-Review to one-per-edit, so bounding it is cheaper before P16B than
  after.
- **L-03** — the Workspace seam is `execute(unknown)`/`read(unknown)` reached
  through `request.workspace as unknown as DynamicWorkspace`
  (`server.ts:93`–`:97`, `:789`). **P16C** changes Workspace command shapes and
  nothing will fail to build; the mismatch would surface as a runtime rejection
  inside a probe.

### What was ruled out, and why that matters

Close to half the recovered leads did not survive confirmation, and several that
did were narrower or wider than described:

- The four "unbounded caches" are **one**. `#captures` (cap 2),
  `#searchIndexes` (cap 4), and `#snapshotStatusReads` (cleared per commit and
  per settle) are all bounded; only `#snapshotEvidenceIdentities` is not.
- Both `authoritativeState.ts` concurrency leads were unfounded — no startup
  deadlock (`busy_timeout = 0` and `timeout: 0` make lock contention fail fast)
  and no request-ID leak (every worker branch replies with the id it received,
  and every map entry has a remover). A different real problem was found there
  instead: **no request has a deadline** (**W-03**).
- "Unbounded scroll" and "question card offset bug" are **one defect**
  (**A-01**): the model never upper-bounds `questionCardScrollOffset`, the view
  clamps only locally, and the footer prints the unclamped number as line
  progress.
- **Empty `catch` suppression** — zero empty catch blocks exist; all ~160 sites
  rethrow, translate, narrow on `errno`, or carry a comment. One genuine silent
  suppression was found on its own evidence (**X-02**).
- **Domain terms no longer matching `CONTEXT.md`** — largely false. Every
  implemented concept is spelled canonically and used heavily, and zero avoided
  terms appear. One exception (**X-07**): Workspace Writer is spelled
  `WorkspaceRuntimeOwner`, `authorityUnavailable`, and `holderIsGone`, never
  `Writer`.
- **A `removeAnsiStyles` correctness bug** — not in the function. It was
  extracted and run against 17 edge cases and passed all 17. The defect is that
  it is stateless while applied per stream chunk, so a sequence split across two
  writes leaks through (**A-02**, verified directly).
- **Flaky runtime startup timeout in `piAdapter.ts`** — the timeout is driven by
  an injected `ScriptedScheduler` and advanced explicitly with
  `scheduler.fire()`; it is deterministic by construction.
- **Dead `ReviewingModelEffect` variants** — there are none. This is the count
  the crashed session was in the middle of: 14 variants declared, all 14
  dispatched in `#runEffects`.
- **No security or injection blocker** exists in the legacy surface: no
  `shell: true` anywhere in the repository, arguments passed as arrays, and
  legacy on-disk data at `0o700`/`0o600`.

### Facts other tickets should take from this

- [Decide whether the `reviewingModel` refactor is in scope](./WF-058-decide-reviewingmodel-refactor-scope.md)
  narrows: there are **no dead effect variants to remove**, so only the
  state-machine/view ownership half of its question remains. **A-01** is also
  evidence for it — the scroll-offset defect is exactly a case of view concerns
  living in the model.
- [Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md)
  gains **R-01**: `@types/node` resolves to 22.20.0 while `apps/neoflow`
  declares `>=26.4.0 <27`, and the machine this audit ran on reports Node
  v24.18.0 — three Node versions in play for one repository.
- [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
  gains a data point: the active source contains **zero** type escapes — no
  `as any`, no `: any`, no `ts-expect-error`, no `ts-ignore` — so a linter would
  not be earning its place by catching those. Several findings (**W-02**,
  **W-12**, **W-13**, **X-06**) are duplication a linter would not catch either,
  being cross-file.
- [Decide whether to break the `packages/workspace` import cycle](./WF-057-decide-workspace-import-cycle.md)
  is unblocked and unchanged by the audit: the cycle remains `import type` in
  both directions with no runtime edge.
- The `CONTEXT.md` vocabulary fog patch on the map is now answerable — the
  evidence is **X-07** plus the ruled-out entry above.
