---
id: WF-060
title: "Audit dead code, unused exports, and test quality"
status: closed
labels:
  - wayfinder:task
parent: WF-053
assignee: juanan
blocked_by: [WF-063]
created: 2026-08-06
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Two classes of problem that
[Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md)
did not sweep, confirmed into the same ledger with the same evidence standard:

1. **Dead code and unused exports.** Which of the active source's exports has no
   consumer, and which code is unreachable? Nothing in the repository currently
   catches either class.
2. **Test quality.** Do the 18 active test files earn the confidence the gates
   place in them — coverage gaps against each Module's Interface, assertions that
   cannot fail, shared-fixture coupling, and the scripted-double duplication the
   first audit already glimpsed.

## Blocked by

- [Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md)

## Established facts

- **The first audit did not cover either class.** Its 31 findings carry the
  categories correctness (8), maintainability (6), duplication (5), performance
  (4), durability (4), testing (3), and migration (1). Its **Coverage** table
  reports every area `done`, so this ticket is a second sweep on new axes, not
  unfinished business from the first.
- **Nothing catches unused *exports* today, and the linter decision did not change
  that.** [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
  measured and rejected both a linter and a formatter, and established that no rule
  in `recommendedTypeChecked` or `strictTypeChecked` reports a cross-file unused
  export at all — it is a different class of tool, now under
  [Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md).
  Unused **locals and parameters** are a solved and separate problem: two `tsconfig`
  flags own them on the canonical route, with a known backlog of 8 in active source
  and 10 in tests. Do not enumerate those here.
- **Volume, measured 2026-08-06:** the four active roots hold **29,076** source
  lines with **516** `export` declarations, and **18** active test files totalling
  **7,353** lines. The largest test file is
  `apps/neoflow/test/scenarios/reviewingApplication.test.ts` at 1,561 lines.
- **The three existing testing findings are the starting thread, not the whole
  answer:** `X-05` (test isolation depends on unpinned Vitest defaults), `X-06`
  (three near-duplicate `waitFor` helpers), and `A-03` (each suite builds its own
  scripted doubles).
- The dogfood probe and the four risk probes sit outside the canonical
  verification route — `R-02`. Whether that weakens the suite is in scope here.

## Notes

- **Blocked on the tooling research, deliberately.** If a tool that reports unused
  exports turns out to be usable here, hand-enumerating them into the ledger is
  wasted work and the disposition changes from a list of findings to a tool
  obligation. Take this ticket only after that research lands. The block moved from
  the linter decision to the research ticket when the former closed, because the
  linter turned out not to be the thing that could answer it.
- **Unused exports arrive measured, not blank.** The research resolved to *run `knip`
  once from outside the repository, and do not add it to `package.json`*. Its recipe
  and the three-line external config are in
  [`docs/research/unused-export-detection-tooling-2026-08-07.md`](../docs/research/unused-export-detection-tooling-2026-08-07.md);
  the run costs nothing and leaves no trace in the tree. Re-run it rather than
  hand-enumerating, then spend the judgement where the tool cannot help.
- **The unused-export candidate set is 13, in one block, and the tool cannot decide
  them.** `knip` reports the type re-exports at `authoritativeState.ts:22`–`:43` and
  nothing else across the four active roots. It proves only that they are
  *unreferenced*; whether that block is a deliberate Interface is precisely the
  judgement reserved above, and is the substance of this half of the ticket.
- **A separate real observation is available but suppressed by default.** 75 further
  exports are used only within their own declaring file — `ignoreExportsUsedInFile`
  hides them. That is not dead code, it is an unnecessary `export` keyword, and it is
  worth deciding as its own class rather than folding into the 13.
- **One thread is already waiting.** **L-04** records that `protocol.ts` uses the
  `as unknown as` cast 19 times and that exactly two of those fields were checked,
  where the declared type over-claimed what the parser proved. The other 17 are
  unswept and belong to this ticket.
- **Same ledger, same standard.** Findings go to
  `docs/audit/pre-p17-codebase-findings.md` as they are confirmed, never held
  until the end — a crashed session already lost roughly thirty minutes of
  analysis by holding them in context. Add the two new axes to the **Coverage**
  table rather than starting a second document.
- **Count reachability from producers, not from handlers, and sweep every module
  that constructs one.** This is the method error that made the first audit rule out
  a real finding, corrected in
  [Decide whether the `reviewingModel` refactor is in scope](./WF-058-decide-reviewingmodel-refactor-scope.md).
  For a discriminated union of commands or effects, a member with a dispatch arm and
  no construction site is dead *because* it has an arm — checking handlers cannot
  detect it. The sweep also has to cross module boundaries: in `apps/neoflow` the
  view constructs two effect variants the model never does, so a model-only sweep
  would report three false positives beside the one true one.
- **`apps/neoflow`'s effect union is already swept; do not re-derive it.** **A-05**
  is the whole of that result — the unreachable revise-question path, 100 lines,
  proposed fixed.
- **An unused export is not automatically dead.** The package Interfaces are
  deliberately wider than today's callers in places, and `index.ts` re-exports
  are the package's public surface. An export with no internal consumer that
  belongs to a published Interface is **accepted**, not removed. Distinguish
  genuinely unreachable code from a deliberately public surface before writing a
  finding.
- **Legacy packages are near-out-of-scope.** Dead code in source scheduled for
  deletion is not worth enumerating; the map already limits the legacy review to
  blockers. Record a legacy finding only if it blocks the P17 importer.
- The evidence-driven rule holds with full force. A test that merely looks thin is
  **accepted**; a test that cannot fail, or an Interface path with no coverage at
  all, is a finding.
- No code changes. This ticket confirms and dispositions; the **Deepen the active
  Modules** and **Pass the codebase deepening quality gate** packages of
  [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
  execute.

## Resolution comment

**Three findings — X-08, X-09, W-15 — and four amendments to existing ones. The two
axes came out lopsided: there is essentially no dead code, and the test suite has a
hole shaped like the end of a Review.**

### The dead-code axis is nearly empty, and that is the answer

Across **516 exports in 29,076 lines** of active source, the whole unused-export
result is **W-15** — thirteen re-exports in one block in `authoritativeState.ts`,
where the types themselves are alive and only the forwarding is dead. Two checks
ruled out the innocent readings: `index.ts` re-exports nothing from that module, so
it is not a published Interface; and the block forwards a selected 25 of the
protocol's 33 types, so it is not a deliberate pass-through either. Curated, then
drifted.

The producer-side sweep — **A-05**'s method, reachability counted from construction
sites across every module — read all **88** discriminant values in the four active
packages and found **five** never constructed in production. Four were already
known: two belong to **A-05**'s revise path, two to the interruption and handoff
surface now recorded as **X-08**.

**So the deepening gate should not budget for dead-code cleanup.** That is a useful
negative and it is the main output of this half.

### The test-quality axis is where the weight is

**X-09**, the only new medium. Of the 56 command and view-request kinds declared,
13 appear in no test at all, and six of those form one coherent gap: the Review
lifecycle's terminal operations. The Application constructs `review.complete`,
`review.cancel`, and `review.question.disposition.set` in shipped code; the Workspace
dispatches all three; and every test file in the repository contains **zero**
occurrences of any of them, in command or result form. **The suite can start a Review,
capture evidence, create drafts, and commit a batch. It can never end one.**

The obvious objection — that the out-of-route probes cover it — was checked and does
not hold. `scripts/*.mjs` is 1,627 lines and 136 assertions, and contains none of the
three kinds either. Every automated check in this repository stops before the Review
ends.

**X-08** is the companion: the Workspace publishes a command surface with no producer.
Five variants, three kept alive only by tests, and one — `harness.invocation.interruption.request` —
backed by an **87-line state-mutating handler** (`harnessInteraction.ts:2813`–`:2899`)
that no producer and no test has ever executed, reached by fallthrough from a
two-armed dispatch. The seven test references to "interruption" all declare the
capability and none exercises it. **This is capability-shaped, not accident-shaped** —
direct review handoff and interruption are designed v1 behaviours whose Application
end is unwired — so the disposition is *cover it*, not *delete it*, and deleting any
of it is a product decision outside this map.

### What the mechanical checks cleared

- **No test lacks an assertion.** 85 tests, 562 assertions, 6.6 per test.
- **All eight conditional assertions are sound.** Each is either the assert-then-narrow
  pattern (`expect(x.status).toBe('available')` immediately before
  `if (x.status === 'available')`, so the guard cannot be false without the test
  already having failed) or a platform guard on `process.getuid`. No assertion in the
  suite can silently skip.

### Four amendments, because the sweep sharpened findings it did not create

- **A-05** — the revise path's **Workspace end is also dead and was not in the
  100-line count**. `review.question-draft.revise` is declared, validated, dispatched,
  and constructed by nothing. Same disposition; the deletion spans two packages.
- **L-04** — the file's other casts are now swept, and they fall into **three grades,
  one of which is correct and already present**: the harness-adapter parsers validate
  their literal version against the constant inside the parser, which is exactly what
  L-04 asks for. Worse, `BootstrapRejectedFrame`'s two `supported*Version` fields are
  not merely unverified but **semantically wrong** — they carry *the peer's* version,
  whose whole purpose is to differ from ours, and are typed as a literal equal to ours.
  The fix is now a consistency repair rather than a judgement call.
- **W-13** — one of the five `isRecord` copies is **already exported and already
  unused as an export**, and `lifecycle.ts` re-declares it in the same package without
  importing it. Consolidation has a home that exists today, which lowers the cost of
  the `accepted` half enough to re-weigh at disposition.
- **R-02** — asked directly whether the out-of-route probes weaken the suite. **They
  do, but not as the finding implies, and the proposed aggregate would not fix it**:
  the probes construct only kinds the unit tests already cover, so what the route
  misses is integration-level confirmation of already-covered paths, not unique
  coverage. Wire the aggregate for the single-gate reason; do not book it as closing a
  coverage gap.

### Method notes

The `knip` run followed the recipe from
[Research unused-export and dead-code detection tooling](./WF-063-research-unused-export-detection-tooling.md)
— one-shot, from outside the repository, nothing installed, `git status` unchanged.
Its 13-candidate result reproduced exactly.

The union sweep's first pass produced **ten** candidates and half were false. A
`kind: 'literal'` regex cannot see a discriminant built by a ternary
(`? 'review.current-changes.started' : 'review.comparison.started'`,
`reviewing.ts:2191`–`:2192`) or assembled from an expression (the diff-row kinds).
Each candidate was taken back to the code before being believed, which is the only
reason the count is five and not ten.

### What this ticket did not cover

- **Assertion *quality* was not audited, only assertion *presence* and reachability.**
  Whether the 562 assertions check the right things is a judgement per test that this
  sweep did not make.
- **Shared-fixture coupling was not systematically assessed.** The two known threads —
  **X-06** (six near-duplicate wait helpers) and **A-03** (each suite builds its own
  scripted doubles) — stand as written and were not re-derived.
- **The suite was never run.** No `pnpm verify`, no `v1:test:full`. Every claim here is
  static.
- **Legacy packages were not swept**, per this ticket's own scope note.
- **`knip` does not read tsconfig `customConditions`** and resolves this repository
  correctly for the wrong reason. Re-measure if the build layout changes.
