# Active v1 anti-pattern audit — 2026-09-01

## Verdict

The active v1 implementation is still organized as four deep packages in the
intended direction, and the accepted P16E experience is not invalidated. The
audit did not find an unbounded projection, a new generic registry, a shallow
public Interface, a replay path, or a reason to undo WF-166's read cohorts.

It did confirm **five release-blocking defects** at existing private seams:

1. Workspace Identity can publish its authoritative marker without making the
   new directory entry durable.
2. Workspace Identity still starts two classes of subprocess without a finite
   deadline, including repository-aware Git processes introduced after W-09 was
   closed.
3. Local Runtime can forget an abort between socket connection and bootstrap
   acceptance and return a live session to an already-aborted caller.
4. Pi Adapter's no-start timer is outside the callback-failure containment
   established by WF-116 and can produce an unhandled rejection.
5. Neoflow Application dispatches Home navigation reads as an unobserved
   Promise; an ordinary read failure can produce an unhandled rejection rather
   than a truthful failed view.

One additional source site is **already owned**, not a new finding: W-06's
settled Application-side deletion of the post-rename `fs.access` check was never
applied. That closure discrepancy must be completed before WF-140 closes, but it
is kept under W-06 rather than assigned a new audit finding.

No production change belongs to WF-167. Each blocking correction is small and
owner-local, preserves current package Interfaces and wire/durable shapes, and
must be implemented through a focused child after that child is committed and
pushed.

## Scope and method

### Baseline

- Implementation baseline:
  `79cc4ec00004b4aee89ded0c11c238d14e700321`.
- `git diff --name-only <baseline> -- <scoped production/config/script paths>`
  returned no path. The only baseline difference in the worktree is the
  unrelated one-line root `package.json` package-manager bump; it was neither
  staged nor used as audit evidence.
- Runtime evidence used Node `26.5.1`. OpenTUI evidence additionally used
  `NODE_OPTIONS=--experimental-ffi`.

### Inventory

- 46 active TypeScript production files / 36,005 lines:
  `packages/workspace/src`, `packages/local-runtime/src`,
  `packages/pi-adapter/src`, and `apps/neoflow/src`.
- 15 v1-owned manifests/configuration files / 3,188 lines, including the lockfile,
  four package manifests and tsconfigs, root v1 tsconfigs, Vitest configuration,
  and workspace configuration.
- Eight root `v1:*` policy, fixture, build, and risk-probe scripts / 2,434 lines.
- Active tests were consulted only for claimed invariants or missing regression
  evidence.
- Excluded: `dist`, dependencies, generated output, all prototype subtrees and
  branches, temporary helpers, and deletion-bound legacy (`apps/tui`,
  `apps/cli`, `packages/core`, `packages/ai-harness`,
  `packages/pi-connector`, and `nvim`).

The review searched process and socket lifetimes, abort/listener handoff,
fire-and-forget Promises, timers, retries, operation ordering, bounds, filesystem
publication, diagnostics, version ownership, representation seams, manifests,
compiler policy, and dependency enforcement. A lead was promoted only when an
execution path and consequence survived reconciliation with the pre-P17 ledger
and WF-094–WF-166.

## Confirmed blockers

### AV-01 — Workspace marker publication stops before the directory durability barrier

- **Classification:** confirmed blocker
- **Severity:** medium (durability and availability)
- **Owner:** Workspace / Workspace Identity marker-publication seam
- **Primary source:**
  `packages/workspace/src/workspaceIdentity.ts:954`–`:999`, especially the
  file `sync()` at `:975`, hard-link publication at `:980`, and return at `:981`
- **Contrasting owner invariant:** the same module syncs the registry's containing
  directory at `workspaceIdentity.ts:1100`–`:1138`, especially `:1130`–`:1132`

#### Execution path and consequence

`installMarker` writes and syncs a same-directory temporary file, then atomically
links it to `neoflow-workspace-identity.json`. It never syncs the marker's Git
administration directory. File sync makes the inode bytes durable; it does not
make the new directory entry durable. A crash or power loss after `link` can
therefore leave a successfully returned Workspace identity with no marker after
recovery.

The marker is explicitly the identity authority. Once the registry records that
administration generation, `resolveUnderLock` treats a missing marker as
`workspace-marker-missing` rather than minting or reconstructing authority
(`workspaceIdentity.ts:1333`–`:1357`). The failure mode is consequently not a
benign retry: the Workspace becomes unavailable until an operator resolves the
ambiguous durable state.

The temporary marker is already created in `path.dirname(markerFile)`, so the
hard link does **not** assume that the user state directory and repository share a
filesystem. A disposable APFS cross-volume check was run to eliminate that false
lead; bootstrap succeeded because publication is correctly same-directory.

#### Reconciliation

W-06 and WF-102 established the exact target strength for identity-bearing
publication: sync complete bytes, publish atomically, then sync the containing
directory before reporting ready. WF-102 applied that strength to the registry
but did not include the authoritative marker. This is new source evidence at the
same Module, not a reopening of the accepted no-fsync policy for portable User
Configuration.

#### Smallest credible correction and missing evidence

Keep the hard-link race semantics and marker bytes unchanged. Make successful
marker installation cross a marker-directory sync after the final directory
operations and before returning authority. Do not introduce a filesystem
Interface or shared durability abstraction.

A missing Workspace Identity scenario must inject failure specifically at the
marker directory's `FileHandle.sync()`, observe
`workspace-authority-unavailable` / `write-marker` instead of `ready`, then
remove the fault and prove one identity is recovered without replacement. The
existing WF-102 directory-sync test faults only the later registry barrier
against current source and therefore cannot catch AV-01.

### AV-02 — Workspace Identity subprocesses bypass finite lifecycle ownership

- **Classification:** confirmed blocker
- **Severity:** medium (startup availability)
- **Owner:** Workspace / Workspace Identity process seam
- **Primary source:**
  - repository inspection: `packages/workspace/src/workspaceIdentity.ts:205`–`:219`
  - Darwin process-identity inspection: `workspaceIdentity.ts:580`–`:592`
  - existing bounded Git owner:
    `packages/workspace/src/gitProcess.ts:165` and `:192` onward

#### Execution path and consequence

Workspace Identity calls promisified `execFile` directly for each hardened
`git rev-parse` and for `/bin/ps` on Darwin. Both calls bound output, but neither
sets `timeout` or otherwise owns a deadline. A child that does not exit leaves
`resolveWorkspaceIdentity` pending indefinitely. That path precedes Local
Runtime's launch-convergence deadline, so neither `startupTimeoutMilliseconds`
nor the caller's abort signal retires it.

The repository-aware commands are argument-only and run under the reviewed
inspection environment, which rules out command injection; Node's `maxBuffer`
limits their retained output. Those invariants narrow this finding to lifetime
ownership rather than security execution or memory growth. They do not provide
a finite settlement guarantee.

A disposable Node 26.5.1 bootstrap put an operator-owned Git wrapper first on
`PATH`. The wrapper delegated every preparation command to `/usr/bin/git` but
replaced `rev-parse` with a 60-second sleep. The bootstrap was still live after
the settled Git deadline had elapsed:

```json
{"pendingAfterSeconds":31,"settledGitDeadlineSeconds":30,"bounded":false}
```

The process group and disposable checkout were then killed and removed. No real
repository or user State was used.

#### Reconciliation

W-09/WF-094 established a 30-second owner deadline and claimed every Workspace
Git process was bounded. `workspaceIdentity.ts`'s `runGit` was added later as
part of the WF-096 identity-side hardened inspection and does not use
`runGitProcess`. The `/bin/ps` path is not a Git process and was never covered by
W-09, but it has the same cold-start consequence in the same Identity operation.
This finding therefore records one post-W-09 regression and one previously
unowned fixed-system-process site; it does not change W-04's separately accepted
migration-startup disposition.

#### Smallest credible correction and missing evidence

Route Identity's Git calls through the existing package-private bounded Git
process owner, retaining exact arguments, hardened environment, output ceiling,
and diagnostics. Give the fixed `/bin/ps` call an explicit local deadline; do not
create a generic process framework.

Missing evidence is an Identity-level hung-child regression proving bootstrap
settles with the existing bounded authority diagnostic, the child is gone before
settlement, and a subsequent normal bootstrap remains usable. Existing
`gitProcess` timeout tests prove the helper but not this caller's routing, and no
current Identity test exercises a hung `rev-parse` or `ps`.

### AV-03 — Abort ownership is dropped during Local Runtime bootstrap

- **Classification:** confirmed blocker
- **Severity:** medium (lifecycle correctness and resource retention)
- **Owner:** Local Runtime / client and Harness Adapter connection lifetime
- **Primary source:**
  - Workspace client socket handoff:
    `packages/local-runtime/src/client.ts:307`–`:345` and `:483`–`:509`
  - mirrored Harness Adapter handoff:
    `packages/local-runtime/src/harnessAdapter.ts:341`–`:373` and `:505`–`:531`

#### Execution path and consequence

`connectSocket` listens for abort only while establishing the transport. Its
`onConnect` cleanup removes that listener. The client then waits for bootstrap
without an abort owner and installs the session-lifetime listener only after
acceptance. If the signal aborts in that interval, adding a listener to an
already-aborted `AbortSignal` does not replay the event. The function returns
`connected`, and the socket/session stays live despite the caller having ended
its lifetime. The Harness Adapter has the same listener gap before it installs
the disposal callback.

A disposable compiled-process reproduction used a private valid endpoint that
connected immediately, delayed `bootstrap.accepted` for 80 ms, and aborted at
20 ms. On Node 26.5.1 it printed:

```json
{"aborted":true,"status":"connected"}
```

The assertion deliberately expected this current incorrect result; the process
and socket were then explicitly cleaned up. This is not the already-handled
pre-aborted case at `client.ts:358`.

#### Reconciliation

WF-110 centralized accepted-version validation, WF-111 proved ordered
unsubscribe acknowledgement, WF-134 covered endpoint hardening convergence, and
WF-166 changed post-bootstrap operation ordering. None owns the signal between
transport connection and bootstrap/session handoff. Existing Local Runtime
contracts create controllers for connected-session cleanup but do not abort a
pending bootstrap.

#### Smallest credible correction and missing evidence

Give one private connection attempt continuous abort ownership from before
socket creation through bootstrap and session handoff, with an immediate aborted
recheck at ownership transfer. Preserve diagnostics, timeout values, roles,
frames, and graceful close. Apply the same owner rule to both Local Runtime
connection Interfaces without adding a public lifecycle abstraction.

Missing semantic socket regressions must hold valid bootstrap acceptance, abort
in the gap, and prove a cancelled rejection plus peer close for both the
Workspace client and Harness Adapter. They must fail against current source and
must not replace the existing post-connect session-abort checks.

### AV-04 — Pi's scheduled no-start callback escapes callback containment

- **Classification:** confirmed blocker
- **Severity:** medium (host-process stability and unresolved invocation truth)
- **Owner:** Pi Adapter / no-start scheduler callback seam
- **Primary source:**
  `packages/pi-adapter/src/piAdapter.ts:585`–`:610` and `:636`–`:650`

#### Execution path and consequence

The scheduler invokes `() => void this.#noStartTimeout(active)`. The async method
calls the native host and has no rejection observer. If `ctx.isIdle()` throws as
the host/session is being retired, or another unexpected failure escapes that
method, the returned rejected Promise is discarded. Node observes an
`unhandledRejection`; under normal default handling that can terminate the Pi
host while the invocation remains unresolved.

A disposable public-Adapter reproduction captured the scheduled callback and
made the native host's later `isIdle()` call throw. Node 26.5.1 observed:

```json
{"event":"unhandledRejection","message":"injected host failure from timeout","idleCalls":3}
```

No private field was inspected and no user Pi session was used.

#### Reconciliation

P-01/WF-116 correctly contains all ten Pi extension event registrations and
attaches the runtime-loop rejection handler at task creation. The no-start
scheduler is a separate callback creation site and was not routed through that
containment. The finding extends the same settled host-boundary policy; it does
not reopen Pi's accepted best-effort disconnect/replay limitations or alter
retry counts.

#### Smallest credible correction and missing evidence

Make the scheduled callback non-rejecting at creation, converting unexpected
host failure into the existing conservative correlation-loss/unresolved path
where possible and always restoring/retiring owner state exactly once. Do not
add an event bus, generic scheduler, retry, or new evidence kind.

A missing Pi Adapter contract must trigger the captured timer with a throwing
native host, fail against current source via the unhandled rejection, and prove
current tool restoration, one conservative terminal semantic outcome, and no
live timer/active invocation after correction.

### AV-05 — Home navigation launches a rejecting read Promise without an owner

- **Classification:** confirmed blocker
- **Severity:** medium (Application process stability and truthful failure UI)
- **Owner:** Neoflow Application / model-effect execution seam
- **Primary source:**
  `apps/neoflow/src/reviewingApplication.ts:273`–`:318`, especially
  `void this.#showHome(...)` at `:277`–`:285`; the unguarded read is at
  `:390`–`:399`

#### Execution path and consequence

Application startup awaits `#showHome` under a catch, and Review loading owns a
local `try/catch`. Later Home effects do neither: `#runEffects` discards the
Promise returned by `#showHome`, whose first Workspace read can reject after a
runtime disconnect, protocol failure, or State loss. The rejection bypasses the
model's failed screen and becomes process-level unhandled rejection. Superseded
route-generation checks occur only after the awaited read, so they cannot
contain a rejected obsolete read either.

A disposable OpenTUI Test Renderer reproduction loaded a valid 65-item retained
history, entered Previous Reviews, sent `G` to request the second bounded Home
window, and made that Workspace read reject. Node 26.5.1 with experimental FFI
observed:

```json
{"event":"unhandledRejection","message":"injected Home read failure","reads":3}
```

The stack passed through `#showHome`, `#runEffects`, and the real Reviewing View.
No production data or renderer substitute was used.

#### Reconciliation

WF-161's bundle work and WF-166's transport work preserve failures from
Workspace reads; they do not promise reads cannot reject. Other Application
background reads either catch and render a bounded warning/failure or are
contained inside their route method. Projection's settled error semantics do
not justify discarding the transport rejection at this outer seam.

#### Smallest credible correction and missing evidence

Own the Home route Promise where it is launched (or make `#showHome` itself
non-rejecting after startup), ignore only stopped/superseded generations, and
render the existing semantic Home-unavailable failure for an active route. Do
not add a generic task runner or renderer abstraction.

A missing scripted-Terminal regression must reject a post-start Home pagination
read, prove no unhandled rejection, and assert a stable visible failed frame. It
must separately prove that a superseded failed read cannot replace the newer
route.

## Already-owned source discrepancy

### W-06 — post-rename User Configuration `fs.access` remains present

- **Classification:** already owned; not a new AV finding
- **Severity:** low runtime consequence, release-gate reconciliation required
- **Owner:** Application / User Configuration save seam
- **Source:** `apps/neoflow/src/userConfiguration.ts:524`–`:539`, especially
  `:534`; user-facing consequence at
  `apps/neoflow/src/reviewingApplication.ts:374`–`:383`

W-06 explicitly settled this check as `fixed`, separately from the accepted
choice not to fsync portable presentation preferences. A same-directory rename
is the save's commit point. A later access-policy quirk can make `save` return
`rejected` and the Application say “Layout was not saved” even though the new
file is already the visible configuration. The check and its `constants` import
remain in baseline source, and no WF-094–WF-166 child records implementing that
Application half.

Do not relabel this as a new anti-pattern or add preference fsync. Complete the
existing two-line W-06 obligation in its own Application child and add the
missing regression that faults only post-rename access while proving the
committed bytes remain readable and the save is not falsely rejected.

## Confirmed non-blocking debt

No new unowned source defect met this category. Two future items remain explicit
without revoking accepted evidence:

- Scenario A settlement is accepted as “better but not perfect”; WF-147 and
  WF-165 retain future performance work. WF-166's 313–354 ms production p95 is
  within the ordinary-view budget and does not justify speculative caching,
  prefetch, telemetry, or extra concurrency.
- User Configuration intentionally omits file/directory fsync for portable
  presentation preferences. W-06 measured and accepted that weaker durability;
  AV-01 does not generalize marker authority's stronger rule to preferences.

## Ruled-out or retained prior leads

| Lead | Classification | Eliminating evidence |
| --- | --- | --- |
| Migration checkpoint as production progress / missing migration timeout | prior `accepted` disposition retained | `authoritativeStateWorker.ts:375`–`:384` emits only for an explicit test pause and then parks in `Atomics.wait`; ungating it would hang migration. Slow paths are format-1 migration only, no released build wrote format 1, and ordinary v2 startup uses quick validation. |
| WF-166 read concurrency weakened command ordering | ruled out | `RuntimeClientConnection` keeps reads behind the session mutation barrier and delivers correlated result/error frames through the ordered operation tail. `GatedOperationWorkspace` proves adjacent read overlap, exact read/command barriers, accepted frame order, and disposal. |
| Workspace views or Diff construction are unbounded | ruled out | Projection windows remain explicit; WF-103 rejects an over-limit Diff before row construction under a constrained heap; Live and historical bundle widths/read counts remain the accepted 8 and 6. No audit path bypassed those owners. |
| Pi callback failures are broadly uncontained | narrowed to AV-04 | `guardPiEvents` owns extension callbacks and `#emit` contains sink rejection. The demonstrated escape is the separately-created no-start timer only. |
| Pi pending evidence map necessarily grows past 128 | ruled out for production path | Availability entries are replaced, Direct invocation is single-flight, and an unresolved prior invocation blocks another Handoff. The apparent fallback branch cannot be driven repeatedly through the active Workspace/Pi assembly without violating those semantic gates; no production growth trigger was demonstrated. |
| Workspace marker hard link assumes State and checkout share a volume | ruled out | `installMarker` creates the temporary file in `path.dirname(markerFile)` (`workspaceIdentity.ts:960`–`:963`), not in the user State directory. A disposable cross-volume bootstrap succeeded. AV-01 concerns directory durability only. |
| Local Runtime framing copies fragments quadratically or counts newline in the body limit | ruled out | WF-113's fragment list tracks exact body bytes and concatenates once; `MAX_FRAME_BYTES` remains a body limit excluding newline and send-side `Buffer.concat` is retained. |
| Application bundle reads are accidentally serial again | ruled out | `#readReviewBundle` retains the WF-161 independent read cohort and Local Runtime now permits adjacent reads under WF-166's exact barriers. No new serial tail was found. |
| Large files, casts, nested model branches, or the private launcher test assembly are findings by themselves | ruled out | Public package surfaces remain narrow, package direction is unchanged, untrusted protocol values cross validating parsers, and no current semantic drift or false compiled probe was demonstrated from those shapes. No speculative renderer or generic task Interface is justified. |
| Root dependency/configuration policy admits an observed outward or legacy edge | ruled out | Manifests retain the intended Workspace ← Local Runtime ← Application direction with Pi Adapter attached inward; the AST-based policy covers static imports/exports, import types, literal dynamic imports and `require`, plus manifest lanes. The scoped dependency check passes. |

## Remediation order and gate effect

Follow package order and keep every correction focused:

1. Workspace marker durability (AV-01).
2. Workspace Identity subprocess deadlines (AV-02).
3. Local Runtime abort lifetime (AV-03).
4. Pi Adapter scheduled callback containment (AV-04).
5. Application Home navigation rejection ownership (AV-05).
6. Application completion of the already-settled W-06 `fs.access` deletion.

Each child must be linked, committed, and pushed before its implementation. The
corrections must preserve marker/registry bytes, State, wire frames, diagnostics
except where an existing bounded failure is selected, timeout/retry counts,
roles, commands, package Interfaces, and accepted UX semantics. After all six,
rerun focused regressions, canonical verification, the four compiled probes,
dependency/source inventories, and `git diff --check`. WF-167 may close on this
report and its child links; WF-140 and P17 remain blocked until the children and
final reconciliation close.
