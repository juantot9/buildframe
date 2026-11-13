---
id: WF-061
title: "Audit the local security posture and dependency supply chain"
status: closed
labels:
  - wayfinder:task
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-06
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Two sweeps, confirmed into the same ledger with the same evidence standard:

1. **Local threat model.** Where can untrusted input — repository contents,
   branch and path names, `git` output, Pi responses, terminal input, durable
   state on disk — reach a decision it should not? Named surfaces: path handling
   and traversal, `git` argument injection, the SQLite worker seam, file
   permissions on durable state, and OSC 52 clipboard writes.
2. **Dependency supply chain.** What is the exposure of the five root
   devDependencies and of OpenTUI's native FFI surface, and what would a consumer
   of the public npm preview be trusting?

## Established facts

All measured from the source on 2026-08-06.

- **The first audit found no security problems, because it did not look for
  any.** Its 31 findings carry the categories correctness, maintainability,
  duplication, performance, durability, testing, and migration — there is no
  security category. This is clean new ground, not a re-sweep.
- **Shell metacharacter injection is not the risk.** There is no `shell: true`
  anywhere in the repository. `git` is invoked argv-form —
  `spawn('git', [...arguments_])` at `packages/workspace/src/workspaceEvidence.ts:646`
  — so the surface to examine is **argument** injection: a ref, path, or
  user-supplied string that `git` interprets as an option. Do not spend the
  session re-confirming the absence of shell interpolation.
- **SQL injection is not the risk either.** Every `database.exec` template
  literal in `authoritativeStateWorker.ts` (`:262`, `:272`, `:284`, `:934`) is a
  static `PRAGMA`/DDL block with no interpolation. Parameterisation of the
  non-`exec` paths is still worth confirming.
- **Durable state permissions look deliberate and consistent.** Files are
  `chmod 0o600` and directories `0o700` across `authoritativeStateWorker.ts`
  (`:392`, `:404`, `:425`, `:871`–`:873`, `:882`, `:891`, `:914`, `:932`,
  `:1116`) and `apps/neoflow/src/userConfiguration.ts` (`:469`, `:477`). The open
  question is whether any durable path is *missed*, not whether the mode is right.
- **OSC 52 clipboard writes are live**, via OpenTUI's `copyToClipboardOSC52` at
  `apps/neoflow/src/reviewingApplication.ts:343`, carrying Question and Review
  text. What reaches a terminal escape sequence, and whether it is neutralised
  first, is in scope.
- **Root devDependencies are exactly five:** `@opentui/core`, `@types/node`,
  `tsx`, `typescript`, `vitest`. Root declares `packageManager: pnpm@11.10.0`.
- **OpenTUI `0.5.1` loads native code through `--experimental-ffi`** on Node 26.
  That is the repository's largest trusted-code surface and the one a public
  consumer inherits.
- **`W-07` is adjacent but already recorded.** The unguarded `child.stdin` write
  in `runGit` can terminate the process on a large repository. It is the audit's
  single high finding and is categorised correctness; do not re-file it. Whether
  it has a security dimension — a repository whose contents can kill the tool —
  may be noted on the existing finding rather than as a new one.

## Notes

- **Unblocked, and takeable now.** Nothing this ticket needs is pending.
- **Same ledger, same standard.** Findings go to
  `docs/audit/pre-p17-codebase-findings.md` as they are confirmed, never held
  until the end. Add a `security` category and extend the **Coverage** table
  rather than starting a second document.
- **The supply-chain half feeds
  [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md),
  which lives on the other open map.** Deliberately not wired as a blocking edge:
  WF-059 can be decided without this, and the two maps are treated as one
  frontier. If this sweep produces a fact that bears on the renderer decision,
  record it in WF-059's **Established facts** as well as in the ledger.
- **The threat model is a local single-user developer tool, not a server.** The
  operator already has shell access to their own machine, so "the user could do
  this themselves" is not a finding. What matters is untrusted *input* reaching a
  trusted decision: a hostile repository, a hostile branch or file name, a
  malformed Pi response, a corrupted state file. State the assumed attacker
  before writing findings, and record it in the ledger so a later reader can
  judge the sweep's reach.
- The evidence-driven rule holds. A theoretical exposure with no reachable path
  is **accepted** with the reason recorded, not **fixed**. Speculative hardening
  is exactly the churn this map forbids.
- Judging whether a dependency should be *dropped or replaced* is out of scope —
  that is a packaging decision belonging to
  [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md).
  This ticket records exposure; it does not choose dependencies.
- No code changes. Confirm and disposition only.

## Resolution comment

**Both sweeps done. Six findings (S-01–S-06) and ten leads ruled out, all in
[the pre-P17 finding ledger](../docs/audit/pre-p17-codebase-findings.md).** No
code changed. The ledger now has a `security` category, two new **Coverage**
rows, and the assumed attacker written down at the head of the new section so a
later reader can judge the sweep's reach.

The ledger holds the evidence; this comment holds only what a reader of the map
needs.

### No high finding, and the reason is structural

The two mediums are the only places an outside input reaches a trusted decision:

- **S-01** — `git status` runs whatever `core.fsmonitor` names in the
  repository's own `.git/config`. Reproduced on Git 2.51.2 against the exact
  argument vector the code uses: the planted script ran three times out of
  three. `-c core.fsmonitor=` suppresses it, so the fix is one argument on one
  call site. Reachability needs the operator to obtain a repository *directory*
  with `.git` intact — an extracted archive, a synced folder, a restored backup
  — because `clone` does not carry config from the remote.
- **S-02** — `pnpm-workspace.yaml` lists fourteen packages under
  `minimumReleaseAgeExclude`, and nothing anywhere sets `minimumReleaseAge`.
  `pnpm config get minimumReleaseAge` returns `undefined`, and the default is
  disabled. The cooldown those exclusions exist to carve out is not running.

Everything else is low or a recorded fact. That is not luck: the reason no
finding is high is that the two designs most exposed to hostile input were built
defensively and hold up under examination. `label()` applies `safeText` to
every string the view renders, so hostile commit subjects and file paths are
neutralised centrally rather than per call site; and the Local Runtime endpoint
is a `0o600` Unix socket inside an owner-verified `0o700` directory, re-`lstat`ed
after every chmod to confirm the change took. Both are written up at length in
**Ruled out** so a later reader can tell "checked and sound" from "not checked".

### What the sweep changed elsewhere

- **Three facts went into
  [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md)'s
  Established facts**, per this ticket's Notes: the v1 production closure is 24
  packages with `@opentui/core` the only third-party runtime dependency; the
  trusted-code surface is one 4.8 MB `libopentui.dylib` loaded by `node:ffi`
  `dlopen`, bundling libwebp, lcms2, stb and wuffs; and nothing is publishable
  today, so that ticket decides before any consumer exists.
- **W-07 gained no security dimension and was not re-filed**, as instructed. A
  repository large enough to trigger it can crash the tool, but crashing a local
  single-user tool the operator is already running is not a privilege the
  assumed attacker lacks.
- **Two findings name
  [Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)
  as their owner** rather than proposing a fix here: S-02's choice between
  setting the cooldown and deleting the misleading exclusions, and S-03's
  question of whether third-party dependencies need a gate at all.

### What this ticket did not settle

Ranking these six and ruling on each disposition is not this ticket's job — it
belongs to the same **Not yet specified** entry on
[Chart the pre-P17 codebase deepening plan](./WF-053-pre-p17-codebase-deepening-plan.md)
that owns the other 31. Every `disposition` above is a proposal.

One thing is confirmed only partway, and is flagged as such in the finding
rather than smoothed over: **S-05** establishes that pasted text is filtered by
a weaker rule than typed text — `strip-ansi` removes OSC and CSI sequences but
leaves lone `BEL`, backspace, carriage return and `NUL` — and that those
characters reach the one text path `safeText` does not cover. Whether
`TextareaRenderable` can then emit them uninterpreted was **not** determined; it
depends on how OpenTUI's native renderer writes cells. The proposed fix makes
the question moot rather than requiring it to be answered.
