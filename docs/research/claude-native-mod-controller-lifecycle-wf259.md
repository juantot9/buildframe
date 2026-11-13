# WF-259 — nonblocking session-controller lifecycle

## Outcome — 2026-10-15

Isolated source **`820c4a8`**, branch
`prototype/wf259-controller-nonblocking-lifecycle`, based on `b9870b4`.
Worktree: `/private/tmp/neoflow-wf259-controller-nonblocking-lifecycle`.
Source/captures: `packages/claude-adapter/prototypes/wf259-plannotator-session-controller/`.

Question: can the unavailable Plannotator-shaped scaffold preserve ordinary
startup and truthful local state when metadata/registration stalls, clocks fail,
and old operations settle in a new window? **Yes in the synthetic entrypoint
controls below.** This is local lifecycle work, NOT native trust or delivery proof.

## Three prior faults reproduced, then fixed

The unchanged `b9870b4` entrypoint was imported under a fake Engine (not modified):

1. Startup waits for metadata before `next`, so a stalled read blocks forwarding.
2. The startup ticket is consumed before command registration. Registration
   rejection then cannot fail that ticket, leaving the local phase `unpaired`.
3. A timer cancellation throw also throws from hook fallback, preventing end
   forwarding even though the controller was already fenced.

Captured in `evidence/baseline-faults.json`. These are forced synthetic source
faults, not newly observed native engine behavior or an upstream report.

### Implementation

- Startup now schedules observations/registration and forwards without awaiting
  them. Only clock scheduling happens before `next`; actual native scheduler/API
  liveness is not proved. Connect work remains outside its command handler.
- `prepareStartup` checks candidate scope but retains the pending exact ticket
  through registration. Only its settled return can complete that local operation;
  rejected/lost/timed-out registration fences. No authenticated readiness follows.
- Each operation owns a work object and its deferred/deadline timer handles.
  Invalidate before disposal, unlink handles before cancellation, tolerate throws.
  Exact-ticket checks reject late callbacks. An old finally cannot clear a new
  operation's deadline. Reentrant cancellation sees the invalidated ticket first.
- Throwing observation getters are sampled once, become invalid observation and
  consume/fence the ticket instead of escaping in a misleading pending phase.
- A3000ms **cooperative host-clock watchdog** covers metadata/registration and
  starved deferred work. It does not prove genuine time, a protected lease,
  cancellation, local publication refusal or `proven-not-dispatched` evidence.
  If the host withholds clock delivery, the explicit control remains observing
  and unavailable; no expiry is invented. Native callback concurrency/timeliness
  remains unproved. A timed-out registration might still install a command; its
  handler remains fenced, not an Attachment or authority to publish.
- Uncorrelated framework `.catch` conservatively fences the entire local module.
  Only exact-ticket continuations can safely ignore their own stale results.

## Captures

- **3** prior-source fault reproductions.
- **14** current-entrypoint fault snapshots, including hangs/rejections, both
  timer-creation failures, throwing/reentrant cancellation, stale registration
  finally/rejection, hostile getter, withheld clock and status failure.
- **20** prior logical lifecycle scenarios rerun with the driver adapted to deferred
  startup/separate deadlines. This is not byte-identical driver compatibility;
  `evidence/controller.json` supersedes the old branch's capture on this branch.
- **4** pinned pure Plannotator source controls rerun, unchanged attribution/license.
- Strict exact291 declaration typecheck, interactive/piped/EOF checks pass.
- First adapted driver assumed a microtask count and hung (Node unsettled-await13).
  Replaced that timing guess with an explicit synthetic probe-entry signal. This
  is driver debugging, not native evidence. Existing60 production tests not rerun.

```sh
P=/private/tmp/neoflow-wf259-controller-nonblocking-lifecycle/packages/claude-adapter/prototypes/wf259-plannotator-session-controller
sh "$P/run" --faults
sh "$P/run" --proof
sh "$P/run" --compare
sh "$P/run" --typecheck
# --baseline needs the unchanged b9870b4 worktree, optional NEOFLOW_BASELINE_CONTROLLER.
# No flags: interactive synthetic lifecycle; [s] observes pending, [t] runs work.
```

## Upstream checkpoint and boundaries

Anonymous public issue reads at **2026-10-15T20:11:03Z**:

| Issue | State/comments | updatedAt |
| --- | --- | --- |
| [#101742 submit→turn](https://github.com/anthropics/claude-code/issues/101742) | OPEN/0 |2026-10-13T10:46:27Z |
| [#102463 bootstrap](https://github.com/anthropics/claude-code/issues/102463) | OPEN/0 |2026-10-15T15:35:04Z |

Two HTTP GETs, no comments requests needed, no credentials or public write.
Snapshot: `/private/tmp/neoflow-wf259-upstream-controller-followup.json`.
This supersedes earlier last-poll timestamps, not the facts from their checkpoints.

All snapshot authenticated/attached/available/publisher/admission fields remain
false. No receiver, root/key enrollment, caller context, signer, queue/retry,
Workflow reconstruction, native submission, input/turn/tool/permission interception
or assistant capture was added. Owning committed occurrence `4c01d63` remains
unconnected to an untrusted Mod endpoint. Semantic Interface/Directive unchanged.

0 native/model/publication/network/Workflow-write calls in runnable captures;
public issue reads are separate.40 protected main Workspace files hash-identical,
including main Harness Interaction. No native CLI validation, real user data,
transcript/credentials, package installation, permissions/policy/profile/version
change, production merge/push or workflow dispatch.8/8 funded turns stay exhausted.
Native bootstrap/UI/facts/profile lease and engine-owned occurrence→turn join still
require credible contracts and separately scoped operational proof before enabling
Direct; fixing local async behavior is not authority to bypass either gate.

## Recovered-session continuation — startup confirmation (2026-10-15)

Source **`7a450ed`**, branch `prototype/wf259-controller-startup-confirmation`,
based on unchanged `820c4a8`. Worktree:
`/private/tmp/neoflow-wf259-controller-startup-confirmation`.
Same prototype directory and thin entrypoint/controller shape; no production code.

**Question:** should diagnostic startup finish merely because registration returned,
even if its reply names another command or reported scope changed during the await?
**No.** Both behaviors reproduced against the actual unchanged `820c4a8` entrypoint
under a synthetic Engine; `evidence/confirmation-baseline.json` captures them. This
is not a reproduced native engine fault or evidence that native lifecycle events
were omitted. The earlier framework `.catch` forwarding was not changed: retained
official docs explicitly describe cached `next(e)` in a fallback, so a fake driver
without that contract would not establish duplicate native forwarding.

### Candidate change

- Validate exact291's declared registration result shape/name,
  `{ command: 'neoflow-connect' }`, before continuing. An unconfirmed reply fences.
- Reread reported session/root/version after registration using the SAME ticket,
  deferred task and cooperative deadline. Only an equal one-use prepared scope
  can finish local startup. No new command, executor, retry, queue or clock.
- Reject scope drift, lost/unsupported observations and late results. Do not even
  inspect a stale reply after end/new startup. Invalid preparation samples getters
  once rather than parsing again through the completion path.
- Keep the native method call and result handling in `register.ts`; the pure owner
  handles only local lifecycle and reported-scope comparison. Workspace/Directive/
  Adapter Interfaces, authority flags and publication remain unchanged/false.

### Captures and commands

**18** new controls pass:8 bad reply shapes/names/getters; matching confirmation
stays pending through recheck with ordinary input unaffected/no queued intent;
3 reported-scope drifts; recheck rejection; timeout/new-window late returns;
stale reply never inspected; single-read invalid preparation; mandatory one-use
prepared startup. Capture: `evidence/startup-confirmation.json`.

**14** previous fault controls, **20** lifecycle scenarios, **4** unchanged pure
Plannotator controls, exact291 strict declaration typecheck and interactive/EOF
controls pass. The fake registration now returns the declared `{ command }` instead
of `undefined`, and the pure-owner driver prepares startup before completion.
The20 are therefore adapted logical regressions, not a byte-identical old driver
or evidence about real native method behavior. Original3 baseline faults still
reproduce on `b9870b4`. No production regression suite is claimed as rerun.

```sh
P=/private/tmp/neoflow-wf259-controller-startup-confirmation/packages/claude-adapter/prototypes/wf259-plannotator-session-controller
sh "$P/run" --confirmation
sh "$P/run" --confirmation-baseline # unchanged820c4a8 worktree required
sh "$P/run" --faults
sh "$P/run" --proof
sh "$P/run" --compare
sh "$P/run" --typecheck
# no flags: interactive synthetic lifecycle; no native CLI
```

### Limits / recovery checkpoint

This confirms ONLY consistency of hook-mediated diagnostic replies. Matching
values are neither authentic nor an atomic native snapshot: another Mod may supply
the same false values, and scope may change and return between reads. A matching
reply does not prove native installation, genuine consent, protected lease/root,
existing-session Attachment, dispatch provenance or occurrence-to-turn custody.
The command may already have been installed when later confirmation fails; no
native removal, cancellation or successful enrollment is asserted.

All40 pre-existing main Workspace file hashes match the recovered checkpoint.
Prior `820c4a8` and `b9870b4` worktrees are unchanged; current prototype committed
and clean.0 native/model/publication/network/Workflow-write calls, no native CLI,
real user state/transcript/credential reads, installation or permission/policy/
version changes, production merge/push or workflow dispatch. No additional issue
poll was made; the20:11:03Z checkpoint above is NOT refreshed by this continuation.
The8/8 funded budget remains exhausted. Continue from `7a450ed`, not by connecting
an untrusted receiver: genuine native bootstrap and engine-owned submit→turn
contracts remain independent blockers requiring separately approved native proof.

## Read-only upstream recheck — 2026-10-19

Anonymous GitHub REST issue reads begun at **2026-10-19T08:30:25Z**:

| Primary source | State/comments | updated_at |
| --- | --- | --- |
| [#101742 submit→turn](https://github.com/anthropics/claude-code/issues/101742) ([API](https://api.github.com/repos/anthropics/claude-code/issues/101742)) | OPEN/0 |2026-10-13T10:46:27Z |
| [#102463 protected bootstrap](https://github.com/anthropics/claude-code/issues/102463) ([API](https://api.github.com/repos/anthropics/claude-code/issues/102463)) | OPEN/0 |2026-10-15T15:35:04Z |

Two public HTTP GETs, no credentials, comment fetches or external writes. Both
issue bodies still ask for the missing contracts; neither has an answer on its
thread. This refreshes the issue-status checkpoint only, not official documentation
or exact-build declarations, and does not establish that no supported contract
exists elsewhere. Local response capture:
`/private/tmp/neoflow-wf259-upstream-contract-recheck.json`.

**Disposition:** park the completed `7a450ed` diagnostic. Further registration or
reported-scope confirmation cannot authenticate bootstrap facts or supply an
engine-owned submission-to-turn association. Resume implementation only for a
concrete bounded question supported by new evidence; review an authoritative
answer or an explicitly approved deployment-policy change before proposing native
proof. Existing-session/native execution still requires separate explicit approval.

Main remains at `a48220c`; the `7a450ed` prototype is committed and clean. All40
protected Workspace hashes match the retained manifest. No source changes, test
reruns, native CLI/model/publication/Workflow calls, production merge, push or
workflow dispatch in this recheck. Receiver/publisher and Direct admission remain
disabled; the8/8 funded-turn allowance remains exhausted.

**Subsequent owner-directed review (2026-10-19):**
[Challenge the trust and turn-custody assumptions](claude-native-mod-assumptions-review-wf259.md)
supersedes the blanket park recommendation, not the issue-status capture above.
The owner subsequently confirmed trusting our reviewed code while authenticating
incoming callers, with other Mods treated as a compatibility/trust dependency,
not a hostile isolation target. See that review's owner-confirmed minimal pairing
and loss design. This is a candidate design basis, not a deployed policy change.
External caller authentication and exact Send→turn custody remain independent
requirements; no native execution or production admission follows.

## Control-only integration checkpoint — 2026-10-19

Current isolated source **`6a16bd8`**, `prototype/wf259-control-pairing-integration`.
[Integration findings/commands](claude-native-mod-control-pairing-integration-wf259.md)
capture actual privately enrolled writer control paired with synthetic-Engine Mod
callbacks, SAME-codec WebCrypto↔Node interoperability and lifecycle loss fencing.
15 integration scenarios plus16 enrollment/18+14+20 original-scaffold controls and
11 Local Runtime fast tests pass; public-declaration check, not exact291/native
validation. Native sending/authority/admission remain disabled; genuine native UI/
crypto/API proof requires separate approval and Send→turn custody remains open.
Continue from that committed clean branch; the `7a450ed` worktree stays unchanged.

**Current operator-flow preparation (2026-10-21):**
[`448d0ed` and actual next prerequisite](claude-native-mod-control-pairing-integration-wf259.md#real-operator-flow-preparation--2026-10-21)
replace user-driven JSON simulation with a readable, guarded native-trial flow.
Claude was NOT launched. The formerly used frozen2.1.291 executable is now missing;
no version substitution or newer-build review is authorized implicitly. Old scratch
custody manifests are also missing; the current note distinguishes a fresh40-file
private baseline from historical hash continuity. Next worktree:
`/private/tmp/neoflow-wf259-native-control-ui`, not a production merge.

**Superseding contract review (2026-10-21):**
[`b222f1c` installed2.1.306 findings](claude-native-mod-installed-306-contract-review-wf259.md)
locate the current native CLI and validate the source, but expose the unsupported
Mod-side crypto key owner. Earlier DOM typing masked SDK limits; checking now
fails honestly and both trial entrypoints are withheld. Next is trusted Node-child
key custody, not a version-only change or another user-driven simulation. No live
conversation/model call occurred; Send→turn remains unproved.
