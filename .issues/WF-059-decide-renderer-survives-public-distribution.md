---
id: WF-059
title: "Decide whether the OpenTUI renderer choice survives public distribution"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: []
created: 2026-08-06
assets: []
---

## Question

[Shape packaging, setup, and release topology](./WF-050-shape-packaging-setup-release.md)
ships Neoflow v1 as a public npm preview whose users supply their own Node
runtime. The accepted renderer needs `--experimental-ffi`, which exists only on
Node 26, and the tested Node window is now three patch releases on a line that is
not yet LTS. Does the renderer choice hold for public v1 distribution — and if
the upper bound has not reopened by the time packaging starts, what is the
fallback?

## Established facts

All of these are measured or quoted, not assumed.

- The tested range is `>=26.4.0 <26.6.0`: **26.4.0, 26.5.0, and 26.5.1** each pass
  the full v1 suite 85/85 in about 14 seconds. Recorded in
  [Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md).
- **Node 26.6.0 and 26.7.0 are unusable.** A `child_process` spawn regression
  introduced in 26.6.0 makes resolving a command through `PATH` cost roughly 47ms
  instead of 12ms. The Workspace shells out to `git` constantly, so the scenario
  tests run about 5× slower and time out; 26.7.0 fails 3 to 5 tests depending on
  the run. Spawning by absolute path is barely affected, and `node:sqlite`,
  `crypto`, and file I/O are identical across versions.
- **Node 26 is not LTS.** It is the Current line; v24 "Krypton" is LTS. Node 26
  becomes LTS in October 2026, roughly two months after this ticket was written.
- WF-050 rules out shipping a runtime: "Do not add Homebrew, standalone Node
  bundles, platform binaries, containers, or a self-updater in v1." The curl path
  "neither installs Node" and only "checks for a supported Node".
- WF-050 also requires that every release ship a support manifest naming "exact
  supported Node and package-manager versions", and that "an unknown newer
  truth-critical host or protocol is unsupported until tested and released".
- The renderer itself is settled evidence, not a guess: OpenTUI `0.5.1` under
  Node `26.4.0 --experimental-ffi` passed Gate A's human visual acceptance and
  Gate B's source promotion, both on 2026-08-05.
- The application is `7,285` lines across five files, of which `reviewingView.ts`
  is `2,539` and `reviewingModel.ts` is `2,414`.
- **The whole third-party runtime surface is one declared dependency.**
  `@opentui/core` is the only third-party name in an active package's production
  `dependencies`, and the separately host-loaded Pi Adapter declares its Pi host
  as a peer instead. Recounted 2026-08-09: pnpm reports **24 production dependency
  tree occurrences**, of which three are local-workspace occurrences and 21 are
  external. Those 21 are **20 distinct third-party package-version identities**:
  nine `@opentui/*`, two `strip-ansi` versions, a duplicated `ansi-regex` edge, an
  auto-installed TypeScript peer, and the remaining small libraries including
  `web-tree-sitter`. The other ~270 lockfile entries are development tooling and
  the legacy packages, and leave at cutover. The corrected count and its unit are
  recorded as **S-06** in
  [the pre-P17 finding ledger](../docs/audit/pre-p17-codebase-findings.md).
  A replacement is judged against this closure, not against the 292-entry lockfile.
- **The trusted-code surface is one 4.8 MB binary.** `libopentui.dylib` is
  loaded by `node:ffi` `dlopen` — that is what `--experimental-ffi` buys — and
  bundles libwebp, lcms2, stb and wuffs. Image codecs, in a terminal tool, with
  a CVE history, and nothing at the Node level constrains them once loaded. This
  is exposure a consumer of a public build inherits and cannot opt out of; it is
  recorded, not judged, since choosing dependencies is out of WF-061's scope.
- **Nothing is publishable today, so no exposure has shipped.** All nine
  workspace packages are `private: true`, and `scripts/check-v1-dependencies.mjs`
  enforces that for the four v1 ones. Whatever this ticket decides, it decides
  before any consumer exists.

## Notes

- **The question is distribution, not the renderer's quality.** Gate A and Gate B
  are not reopened by this ticket. What is in question is whether a renderer
  requiring an experimental flag on a pre-LTS line can be handed to users who
  must install that runtime themselves.
- **Timing is the real tension.** Nothing is blocked today, and two external facts
  may resolve this without a decision: Node 26 reaches LTS in October 2026, and
  the spawn regression is recent enough that an upstream fix could reopen the
  upper bound. The argument for deciding now rather than at packaging time is
  that a negative answer is much more expensive after the **Deepen the active
  Modules** and **Pass the codebase deepening quality gate** packages of
  [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
  have grown the OpenTUI application further.
- A legitimate outcome is **accepted with a recheck obligation** rather than a
  change: name the conditions under which the renderer choice would be revisited,
  and attach the recheck to a packaging milestone the way WF-050 already attaches
  the npm coordinate recheck. Deciding to decide later is a decision, provided
  the trigger is written down.
- Do not treat "the upstream bug will probably be fixed" as a fact. If the
  decision depends on it, that is a `research` question against Node's issue
  tracker and release notes, not an assumption.
- Widening the supported range requires a full suite run on the candidate
  version. A passing spawn probe is not evidence of support — that rule was set
  in WF-056 and holds here.
- Out of scope: npm coordinates, the support manifest's format, and release
  channel mechanics. Those remain settled by WF-050.

## Resolution comment

**The renderer choice holds for public v1 distribution. It is accepted with a
recheck obligation, not changed.**

OpenTUI `0.5.1` under Node 26 with `--experimental-ffi` stays the v1 renderer.
The ticket's two worries — the experimental flag and the narrow tested window —
turn out to be different in kind, and neither is a reason to replace the
renderer.

### The flag costs a consumer nothing

`apps/neoflow/src/developerExecutable.ts:26` already re-executes
`process.execPath` with `--experimental-ffi --disable-warning=ExperimentalWarning`
when the flag is absent, forwarding `SIGINT`/`SIGTERM` and the child's exit code.
A user never types the flag and never sees the experimental warning. The re-exec
spawns by absolute path, so it is not itself exposed to the 26.6.0
`PATH`-resolution regression described below.

"Requires an experimental flag" is therefore an upstream-stability fact, not a
distribution ergonomics problem. It is recorded as a recheck trigger rather than
as a cost.

### The floor and the ceiling have different owners

Two constraints were being read as one:

- **The floor — Node 26 — is the renderer's demand.** `node:ffi` `dlopen` is what
  `--experimental-ffi` buys, and it does not exist below 26.
- **The ceiling — excluding 26.6.0 and above — is not.** It is a measured
  `child_process` regression that makes resolving a command through `PATH` cost
  roughly 47ms instead of 12ms. It bites Neoflow because the Workspace resolves
  `git` through `PATH`. That is Neoflow's call shape, not OpenTUI's.

A ceiling caused by our own code cannot be evidence against the renderer.

**Node 26 reaching LTS in October 2026 makes the ceiling more urgent, not less.**
The LTS release will be a patch well above 26.5.1, so a consumer who installs
"Node 26 LTS" — the obvious thing to do once it exists — lands *above* the tested
window. Waiting for LTS does not dissolve this problem; it is what makes it
matter.

### The ceiling is ours to fix

`git` is invoked through `PATH` at exactly **two** sites, both named `runGit`, in
different modules:

- `packages/workspace/src/workspaceEvidence.ts:646` — `spawn('git', …)`
- `packages/workspace/src/workspaceIdentity.ts:210` — `execFileAsync('git', …)`

Both inherit `process.env` — `processEnvironment()` at `:624` spreads it,
`gitEnvironment()` at `:189` copies every non-`GIT_` entry — so `PATH` is
available to a resolver in both. A third `execFileAsync` at
`workspaceIdentity.ts:481` already passes an absolute `/bin/ps` and is
unaffected: the pattern the fix should copy already exists in the same file.

Resolving `git` once to an absolute path and passing that to both sites should
restore the fast path on 26.6.0 and above with no upstream change. Filed as
**W-14** on the pre-P17 ledger.

**This is not proven yet.** Per
[Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md),
a passing spawn probe is not evidence of support — widening the declared range
requires a full suite run on the candidate version. Two things stay open until
that run happens: whether the fix restores the timing enough for the suite to
pass, and whether 26.7.0's 3 to 5 failures are all timeout-driven or include
something else.

### What the launcher does outside the window

`developerExecutable.ts:23` currently accepts `major === 26 && minor >= 4`, so it
launches on known-broken 26.7.0, while root `engines.node` says
`>=26.4.0 <26.6.0` and the gate's own error text at `:63` says `<27`. Three
bounds, three values, and the loosest of them is the only one a consumer reaches.

The accepted rule separates two states that are not symmetric:

- **Below the floor — refuse.** The flag does not exist; there is nothing to
  attempt.
- **Above the ceiling — warn and run.** Untested is not the same as broken, and
  Node patches roughly fortnightly. A hard exclusive ceiling would refuse users
  on the newest patch until a Neoflow release caught up.
- **Known-bad versions — refuse**, carrying the measured reason, as
  `scripts/check-node-version.mjs:47` already does for 26.6.0 and above. A
  version leaves that list when a full suite run passes on it.

Filed as **A-04**.

### Fallback if the window is still narrow at packaging

The support manifest WF-050 already requires names an exact tested version, and
the launcher's warn-above message points at it. No new machinery, no bundled
runtime — WF-050 forbids one — and "unsupported until tested and released" stays
literally true while a consumer still has a version known to work.

Replacing the renderer is explicitly **not** the fallback for a narrow window.
The cost, measured: the Gate A swap, commit **Complete Gate A OpenTUI reviewing
candidate**, rewrote nine files under `apps/neoflow/src` at +3,676/−1,756, and
the pre-OpenTUI private renderer now survives only in that commit's parent.
Undoing it is a rewrite, not a revert, and **P16C** and **P16E** widen the gap
further. Renderer replacement is reserved for trigger 1 below.

### Recheck triggers

Revisit this decision if any of these becomes true:

1. `--experimental-ffi` is removed or renamed in Node 27, or FFI is still
   experimental when Node 28 ships. This is the only trigger that forces the
   expensive renderer replacement.
2. Resolving `git` to an absolute path fails to make the Node 26 patch that
   becomes LTS pass the full v1 suite — meaning the ceiling was not ours after
   all.
3. `@opentui/core` `0.5.1` stops installing or running on that patch. The version
   is pinned exactly, so this would be an install-resolution or ABI break.

Node 26's LTS date slipping past packaging was considered and deliberately **not**
made a trigger. It would mean consumers install a non-LTS runtime, which is
uncomfortable but changes nothing the answers above settled.

### Where the work lands

- **W-14** and **A-04** on
  [the pre-P17 finding ledger](../docs/audit/pre-p17-codebase-findings.md), both
  proposed **fixed**, actioned in **P16C**. They go to the live deepening gate
  rather than to packaging so the version gate stops contradicting itself now,
  roughly 38 packages before P54.
- The **support-manifest obligation and the warn-above wording** attach to
  **P54**, recorded as an amendment on its card in
  [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md).
  That amendment also retires P54's stale "imports under Node 22.19.0"
  acceptance evidence, which the void 22.19.0 floor left behind.
- Nothing in this ticket changes code. The two findings are proposals for
  WF-053's disposition decision, exactly like every other ledger entry.

### Not answered here

Whether an upstream fix for the spawn regression exists or is coming. The
decision was built so that it does not depend on that fact — the fix is ours
either way. If a later session wants the answer, it is a `research` question
against Node's issue tracker and release notes, not an assumption.
