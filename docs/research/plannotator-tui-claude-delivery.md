# Plannotator TUI: delivery into an open Claude conversation

## Question and scope

How does [plannotator-tui](https://github.com/plannotator/plannotator-tui) send review feedback to a running Claude Code conversation, and does it supply Neoflow's Pi-like Direct attachment contract?

Follow-up: how does the main [Plannotator Claude plugin](https://github.com/backnotprop/plannotator) work without Herdr? **The initial TUI-only investigation missed its newer native Claude mod route.** The two repositories have different delivery implementations; see the follow-up below.

The initial investigation was source inspection only; no binaries installed, source scripts executed, Claude sessions launched, transcripts read, or live delivery tested. The2026-10-15 follow-up below additionally executes ONLY a pinned pure bookkeeping module with synthetic inputs, not the plugin/CLI/native engine. Public repositories were cloned into disposable `/private/tmp` directories. No background-agent tool was available, so this investigation was performed directly.

Frozen sources:

- Plannotator TUI `59fa0af536260b54b4a6341ab306c9e6c93d9a55` (release `0.9.4`).
- Herdr `3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df` (current source inspected, not the older `0.8.2` used in Plannotator's historical live note).
- Main Plannotator `e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39` (follow-up inspection).
- Anthropic's public Claude Code declarations `8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6`; official live Mods documentation was also read. These declarations can lag a released CLI; build-generated declarations are authoritative for that build. [A1]

These source snapshots are not reviewed Neoflow compatibility versions.

## Answer

**Plannotator TUI sends into the existing interactive conversation by automating the terminal, not through a Claude-native message injection Interface.** This finding is specific to the TUI; the main Plannotator plugin now has a native Mods route, described below. Inside Herdr, Plannotator invokes:

```text
herdr agent prompt <pane> <feedback>
```

Herdr encodes feedback as a terminal paste, then sends an encoded Enter. Claude receives input through its ordinary interactive terminal. Outside that terminal host, Plannotator's default delivery is the clipboard. This is neither the rejected Claude peer inbox nor an independently hosted Agent SDK conversation. [P1][P2][H1][H2]

The UX therefore resembles the user's requirement: keep Claude open, review beside it, press Send, and feedback enters that conversation. The mechanism does **not** establish the provenance, exact-session commitment, or correlated Invocation guarantees needed by Neoflow. [P1][P2][P3][H1][H3][N1][N2]

## Traced delivery path

1. **Choose a pane.** The launcher/app uses explicit `PLANNOTATOR_TUI_DELIVER_TO`, otherwise the invoking plugin context's focused pane if an agent was present. The app does not send to its own `HERDR_PANE_ID`. This is a captured terminal target, not a durable Neoflow Attachment. [P3]
2. **Choose delivery.** Interactive execution inside Herdr with a target constructs `HerdrAgent`; otherwise the app uses `Clipboard`. Headless execution uses `Discard`. [P2]
3. **Submit feedback.** `HerdrAgent::deliver` starts the Herdr executable with four arguments: `agent`, `prompt`, pane, and the complete feedback string. It judges delivery by process exit status and classifies error envelopes. It does not call the Claude CLI, Claude Channels, or a Claude SDK for this operation. [P1]
4. **Validate the terminal occupant.** Current Herdr source rejects an empty prompt, missing agent/pane, detected blocked UI, pending managed launch, or a foreground process that no longer matches the expected agent. It does not require idle and does not bind this request to a supplied Claude session ID or canonical checkout. [H1]
5. **Write terminal input.** Text is wrapped in `ESC[200~` / `ESC[201~` when live bracketed-paste mode is enabled; otherwise raw UTF-8 is used. Enter is encoded separately. A PTY submission queues text and delayed Enter, with a 300 ms delay. Successful non-wait submission is PTY completion evidence, not a Claude-correlated prompt-start receipt. [H1][H2][H4]
6. **Update local review state.** Plannotator records sent annotations/history after transport success. Blocked/unavailable delivery may copy feedback to the clipboard and leave it available for retry. This is materially different from Neoflow's Durable Commit-before-effect and no-silent-fallback contract. [P4][N2]

## What the connection really means

Plannotator delegates ongoing terminal/process hosting to Herdr. Its `HerdrAgent` stores an executable path, pane selector, and optional agent label, and starts a fresh CLI request for each Send. There is no Pi-style in-process Claude extension connection in this delivery implementation. [P1][P3][H1]

Herdr's Claude `SessionStart` hook reports session ID and transcript path to Herdr for session association. It is not the message-ingress mechanism. Plannotator's optional `last` workflow reads agent transcripts; its optional terminal-review workflow reads pane output. Those features must not be imported into Neoflow's non-transcript Review bridge. [P5][H5][N2]

## Evidence limitations

Plannotator's design record says its historical live verification used Herdr `0.8.2` with **a `cat` process renamed `claude`**, demonstrating multiline terminal delivery and pane placement. That note does not prove exact Claude prompt bytes, permission-dialog races, or provenance. The separate Herdr-integration spec explicitly lists live Claude multiline submission among things to confirm. [P6][P7]

Current Herdr documentation also states that `agent prompt --wait` **does not track individual turns**. If the agent is already working, completion of that active turn may satisfy the wait. Plannotator's actual invocation does not use `--wait` at all. Neither path supplies Neoflow Invocation settlement by itself. [P1][H3]

## Native Dispatch Provenance assessment

The reviewed Herdr API source sets its Unix socket to owner-only `0600`, parses an ordinary JSON request, and routes `agent.prompt`. The inspected request path does not authenticate a Neoflow-specific origin. Its documented audience includes scripts and agents. Consequently, this source does not establish a distinction between authorized Neoflow Sends and other same-user callers capable of controlling the terminal. Claude receives terminal input, not authenticated Neoflow origin evidence. [H1][H6][H7]

This is a different mechanism from WF-258's confused-deputy peer inbox: it does not need a setup instruction granting authority to peer-framed messages. Nevertheless, **a different transport is not proof of Native Dispatch Provenance**. The current source provides no basis to waive Neoflow's pre-authority gate. This is a source-based limitation, not a reproduced adversarial exploit against Herdr. [H1][H2][H6][N1][N2]

Further unproved requirements include:

- exact Review Message bytes after Claude's interactive editor processes the paste, including pre-existing draft text and control-sequence material;
- exact conversation/checkout revalidation on every Send, not merely agent type and pane;
- prompt/dialog/focus changes between validation, paste, and delayed Enter;
- an exclusively authorized ingress despite other same-user tools and agents;
- start/terminal correlation, single-flight, disconnect ambiguity, and no replay;
- compatibility with exact reviewed Claude versions and the configured gateway.

These are proposed evaluation gates derived from the observed transport and Neoflow's existing contracts, not claims that each race was reproduced. [P1][P3][H1][H2][H3][N1][N2]

## Follow-up: main Plannotator without Herdr

### Modern route: a native Claude mod

The main Plannotator plugin's `hooks/hooks.json` declares `"modules": ["./mod/register.ts"]`. Claude loads that module inside the running session. On `session.start` it establishes a session-bound controller, registers commands/tool behavior, and starts background watching; `session.end` disposes the old controller. The implementation rechecks `$.session.id()` when accessing the current controller because `/clear` and in-process resume do not raise another `session.start`. [P8][P9]

Review UI processes run detached. When one publishes a decision, the controller reads it, renders feedback, serializes delivery, and calls its `Host.submit`. That closure calls the native method:

```ts
await $.prompt.submit({ text })
```

There is **no Herdr pane paste, private Claude inbox, or separate Agent SDK conversation** in this submission path. The module submits to its own running Claude session, and the person can keep chatting while the browser review stays open. Plannotator's default call produces a plugin-framed turn, not an indistinguishable typed-user message. [P9][P10][P11]

Anthropic independently documents this mechanism:

- Mods are on by default in terminal Claude Code `2.1.287+`; the official changelog records their introduction in `2.1.287`. [A2][A3]
- `$.prompt.submit({ text })` waits until the session is idle, starts a turn, and resolves when it starts, not when the turn ends. The model normally reads the text after a sentence naming the mod. [A4]
- A `prompt.submit` hook can return `{ drop: reason }` before the prompt enters. Official declarations distinguish engine-set `composer`, `plugin`, `peer`, `peer-send-message`, and `unclassified` origins; `PromptSubmitArgs` excludes caller-supplied origin, and the declarations say a hook cannot set another origin. This is materially stronger evidence than arbitrary native peer sender labels, though it is not yet an admitted Neoflow trust contract. [A1][A5]
- Mods can run background timers and reach processes, files, and HTTP through the native Interface. They are trusted code with the user's permissions, not sandboxed plugins. Organization policy can disable them or restrict which mods load. [A2][A4]

Plannotator itself enables this implementation only for interactive sessions with `/bin/sh`, leaving its classic route for `-p`/SDK and Windows or when switched off. That is Plannotator's implementation restriction, not a claim that all Claude mods share it. [P9][P11]

### Classic route: feedback returned to an invocation already waiting

Without the mod, plan review uses a blocking `PermissionRequest` hook on `ExitPlanMode`. The hook starts a local review server, waits for the reviewer, then returns JSON to Claude on stdout. Denial carries the feedback in `decision.message`; approval allows the original tool call and may apply a selected permission mode. Review/annotate skills similarly launch a Bash command and receive feedback as its stdout/tool result. These paths need neither Herdr nor arbitrary external message injection, but do not provide an always-connected independent Send route. [P11][P12][P13]

### Important differences from Neoflow

Do not copy Plannotator's whole implementation:

- Its feedback renderer adds headings and launch identifiers, and can move feedback over 12 KiB to a file for Claude to read. That is not Neoflow's exact outgoing Review Message contract. [P14][N2]
- It reads session messages and streams answers for its optional last-message/Ask-this-session features. Neoflow must continue excluding transcript and assistant-text capture. [P9][N2]
- Its Plan flow can select permission modes; Neoflow's Review integration must leave normal Claude permissions untouched. [P12][N2]
- A native mod origin does not authenticate every external request the mod might receive. A Neoflow Adapter still needs a reviewed connection and pre-submit authorization mechanism. Plannotator's result-file handoff is not proof of such a mechanism. [P10][N1]

### Exact-version uncertainties

The live official API guide documents `submit({ text, asUser: true })` for sending without the native plugin sentence. The frozen GitHub declarations inspected do **not** include `asUser` in `PromptSubmitArgs`; Anthropic explicitly warns that GitHub types may lag the installed build. Plannotator does not use this option. If marker-free normal-user presentation is required, inspect the exact candidate's generated declarations and documented behavior before relying on it. Do not infer it works on `2.1.287` merely because Mods began there. [P9][A1][A4]

The current changelog also records a `2.1.290` fix for Mods remaining off behind `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` gateways without an Anthropic account. This makes gateway admission a specific version-dependent gate, not a generic claim that `2.1.287+` works for Neoflow. No CLI was updated or live-tested here. [A3]

## Updated recommendation for Neoflow

**Investigate a session-local Neoflow Claude mod first.** This is now a documented, plausible native ingress much closer to Pi's extension than terminal automation, Channels, or a separate SDK-owned conversation. It supersedes the TUI-only investigation's narrower list of candidates; it does not reopen the rejected private inbox. [P9][A2][A4]

The candidate shape is one explicit attachment command in the Claude session, a persistent Adapter connection to Neoflow, revalidated exact session/checkout, and only committed authorized Messages submitted through `$.prompt.submit`. This is a proposed design to investigate, not an implementation decision or guarantee established by Plannotator.

Before production: establish Native Dispatch Provenance end to end, verify exact payload/presentation behavior, preserve native user turns and normal permissions, handle other mods and policy restrictions, prove start/terminal correlation and disconnect ambiguity, then run the exact-version gateway and adversarial matrices. The new native origin/drop documentation warrants a targeted research follow-up; it does not by itself satisfy every acceptance gate. [A1][A2][A3][A4][A5][N1][N2]

This Plannotator source inspection changed no reviewed Manifest or production code. The later approved native-Mod investigation is tracked in [WF-259](../../.issues/WF-259-prove-claude-direct-attachment-through-a-native-mod.md), with [15 passing offline engine checks](./claude-native-mod-direct-wf259.md). That follow-up observed `asUser: true` inside the exact `2.1.291` engine's plugin-origin metadata. Its separately approved live partial pass used 6 of 8 synthetic turns: exact native model-bound text, distinct duplicate turns, and corrected normal Read/Write pass on 291. The initial peer control did not execute because its native worker changed to 292 and the Mod refused startup. A later foreground follow-up at `773dabd` uses the final two approved turns (8 total): exact native291, a real peer consumed before context, and a CLI-startup composer control preserving the same fixture bytes. The owned PTY receives no injected input; this is not a production terminal/CLI delivery route. Full framing/adversarial provenance, foreground attachment, and runtime authorization remain unproved; no production route/version was admitted.

## Current Plannotator follow-up — 2026-10-15

After explicit owner direction to post the bootstrap question and keep working,
[Anthropic#102463](https://github.com/anthropics/claude-code/issues/102463) was posted
with only the approved sanitized body. Readback2026-10-15T15:32:43Z: OPEN,0 comments,
body SHA256 `0bf140dc27b4e09476dca1ee444e7599e45831869cdb4e961859bbc06a4fcb18`.
No private paths/artifacts/session IDs/credentials uploaded, no workflow dispatch.
This is separate from#101742 submit→turn association, not an authoritative answer.

Fresh public clone pins **`773a923917cd5876c8aa0f62a6fc770e1119b91b`**, version0.28.21,
commit time2026-10-15T08:03:05-04:00. Native integration still uses:

- [`register.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/register.ts):
  thin `$` closures (`hostOf`,113–115 submits), persistent controller, scoped command
  handlers and synchronous session-end disposal. `currentMod`186–218 lazily makes/
  restores a controller when the reported session changes after clear/resume.
- [`host.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/host.ts):
  injectable native methods, including submit, transcript/answer and abort features.
- [`controller.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/controller.ts#L1440-L1480):
  serializes delivery through `host.submit`, with restored launch/watcher/settlement
  state. Return/error handling is NOT Neoflow's durable native causal evidence.
- [`bridge.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/bridge.ts)
  and [`inbox.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/inbox.ts):
  bearer/loopback/registry transports, recovery/lease handling and question/reply
  turns. These are Plannotator features, NOT proof of Neoflow root enrollment or
  committed authority. Its named Inbox is not being substituted for our Adapter.
- [`turns.ts`](https://github.com/backnotprop/plannotator/blob/773a923917cd5876c8aa0f62a6fc770e1119b91b/apps/hook/hooks/mod/turns.ts):
  text-based `sameQuestion`,16-entry foreign-body buffer and pending ask/dropText
  bookkeeping; this is NOT a newly discovered engine-owned receipt→turn join.

### Concrete implementation continuation

Source **`b9870b4`**, `prototype/wf259-plannotator-session-controller`, based on
`4c01d63`, at `packages/claude-adapter/prototypes/wf259-plannotator-session-controller/`.
**Follow the thin entrypoint/persistent controller seam, not every trust assumption.**
No production source/Workspace/Adapter contract changes. The actual new native-
shaped `register.ts` runs under a SYNTHETIC Engine; strict typecheck uses retained
exact291 declarations (hash `c05419…ce`). No native CLI validation or process ran.
All native `$` calls stay in the entrypoint, and a small controller owns local
operation tickets/lifetime. Only start, exactly matched connect command and end
hooks exist; no input/receive/turn/tool/permission interception or answer capture.
Connect work is deferred outside the command handler via clock, matching the
background shape rather than holding the turn.

**20 scripted lifecycle snapshots pass:** installation unpaired; noninteractive
inert;9 normal/identical-body input/receive/turn/tool/permission passthrough controls;
unrelated commands unchanged; non-composer/missing sources refuse; single-flight/
no queue; intent returns unavailable; end/clear/resume fence, no lazy adoption;
reported session/root/version changes/invalid/lost facts fence; late awaits cannot
revive or overwrite current window; copied/consumed local tickets refuse;32 lifetime
intents bounded. Cancelled old callbacks cannot steal a fresh timer handle.
Interactive/piped/EOF and exact291 TypeScript checks pass.

Reported metadata/composer shape is NEVER treated as native authority/genuine
approval. Every snapshot remains authenticated/attached/available/publisher/admission
**false**. No receiver/keys/bearer/queue/store/Workflow reconstruction/native sender
exists; model-untouched generic status contains no IDs/roots/caller bytes. `/clear`
requires a fresh future pairing policy, not automatic destination recovery. This
is useful scaffold, NOT a native Attachment, transport or hidden successful grant.

### Why not copy its turn tracker

The captured branch vendors ONLY the pure `turns.ts` byte-for-byte with MIT license,
SHA256 `561ba75a9a809e80cbe74accb13d277be3244c816c1b239a46a7adaf68bbf6ab`.
Four Node controls execute it without Plannotator's plugin/CLI/scripts/native API:

1. An identical composer prompt still present in its foreign buffer is not owned.
2. A different middle sharing first/last lines can be marked the pending ask's turn.
3.16 later foreign prompts evict the identical composer entry, after which body
   matching can mark its synthetic turn as the ask's.
4. A cancelled pending text match can propose aborting a different-body turn.
   No native abort or API is called; only its pure return value is inspected.

These source counterexamples explain **why Neoflow cannot inherit that heuristic**.
They are not reproduced native events, an upstream security report, universal engine
behavior or native prompt acceptance. We do not capture assistant output or change
normal-user-input policy; no body/snippet/pending-slot attribution enters Neoflow.

```sh
sh /private/tmp/neoflow-wf259-plannotator-session-controller/packages/claude-adapter/prototypes/wf259-plannotator-session-controller/run --proof
# --compare: four pinned pure-source controls; --typecheck: exact291 declarations
# omit flags for interactive synthetic lifecycle state; NO native execution
```

**Safety:**0 native/model/native-publication/abort/external-network/workflow-write
calls in runnable captures; all40 main Workspace edits unchanged, including main
Harness Interaction. No process/server/writer left, key/credential/transcript/
assistant read, permission changes, dependency install, implementation merge/push
or workflow action. Public source clone and approved GitHub post/readback are
separate network actions. Existing60 regression tests were NOT claimed as rerun;
only prototype source changed.8/8 funded native turns remain exhausted.

**Next:** continue from this small scaffold once authentic native root/fact/UI/lease
and engine-owned occurrence→turn contracts have credible answers. Do not build an
unauthenticated receiver or enable publication merely because Plannotator uses a
token, native plugin origin, a body matcher or a restored session ID. The user's
Plannotator direction advances architecture/implementation, not implicit production
policy/version admission or approval for new funded/native operations.

### Subsequent nonblocking lifecycle work — 2026-10-15

Isolated **`820c4a8`**, `prototype/wf259-controller-nonblocking-lifecycle`, continues
this scaffold instead of adding receiver/signing layers.3 source faults reproduced
under a fake Engine: startup metadata blocks forwarding, registration rejection
leaves unpaired after its consumed ticket, timer cancellation throw breaks fallback.
Deferred startup, pending registration tickets and exact-work defensive disposal
fix these;14 fault/20 adapted lifecycle/4 unchanged pure-source controls plus exact291
compile and interactive/EOF pass. Native clock concurrency/timeliness remains open;
cooperative timeout is not a protected lease or native cancellation/refusal evidence.
[Full source/captures/limits](claude-native-mod-controller-lifecycle-wf259.md).
Both upstream questions OPEN/0 comments at20:11:03Z;0 native/model/publication calls,
40 main Workspace hashes unchanged, no production/semantic/policy/budget admission.

## Sources

Plannotator TUI, frozen commit `59fa0af536260b54b4a6341ab306c9e6c93d9a55`:

- [P1 — delivery implementation](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/crates/plannotator-tui/src/delivery.rs#L99-L166)
- [P2 — delivery selection](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/crates/plannotator-tui/src/cli.rs#L56-L68)
- [P3 — pane target/context](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/crates/plannotator-tui/src/herdr/context.rs)
- [P4 — send, post-delivery recording, clipboard fallback](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/crates/plannotator-tui/src/app/send.rs#L33-L93)
- [P5 — README: Herdr integration, agent replies, terminal review](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/README.md)
- [P6 — historical live evidence and delivery decisions](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/docs/decisions.md#L174-L248)
- [P7 — integration spec and outstanding live confirmation](https://github.com/plannotator/plannotator-tui/blob/59fa0af536260b54b4a6341ab306c9e6c93d9a55/docs/spec-herdr-integration.md)

Herdr, frozen commit `3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df`:

- [H1 — agent prompt validation/submission](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/app/api/agents.rs#L13-L269)
- [H2 — terminal paste and Enter encoding](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/app/api_helpers.rs#L25-L58)
- [H3 — documented automation and non-turn-correlated waits](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/docs/preview/website/src/content/docs/agent-automation.mdx#L60-L96)
- [H4 — PTY submission completion](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/pty/actor/unix.rs#L860-L898)
- [H5 — Claude SessionStart association hook](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/integration/assets/claude/herdr-agent-state.sh)
- [H6 — API listener permissions/request routing](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/api/server.rs)
- [H7 — local socket Interface for scripts and agents](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/docs/preview/website/src/content/docs/socket-api.mdx#L1-L18)

Main Plannotator, frozen commit `e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39`:

- [P8 — hooks module registration](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/hooks.json)
- [P9 — session-local mod, lifecycle, native submit, origin handling](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/mod/register.ts)
- [P10 — controller settlement and serialized submit](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/mod/controller.ts#L1400-L1455)
- [P11 — modern and classic Claude integration guide](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/marketing/src/content/docs/guides/claude-code.md)
- [P12 — classic PermissionRequest stdout](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/server/index.ts#L2935-L2983)
- [P13 — classic Review skill](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/skills/core/plannotator-review/SKILL.md)
- [P14 — feedback framing and overflow](https://github.com/backnotprop/plannotator/blob/e44ae1c071af3b43a8df2f01bfcca3ad7fac3d39/apps/hook/hooks/mod/delivery.ts)

Anthropic primary sources:

- [A1 — public Mods types](https://github.com/anthropics/claude-code/blob/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6/mods/types/claude-code.d.ts#L7021-L7263); [build-specific types/reference authority](https://code.claude.com/docs/en/plugins/mods/reference)
- [A2 — Mods overview, version requirements, trust and policy](https://code.claude.com/docs/en/plugins/mods/overview)
- [A3 — official changelog](https://github.com/anthropics/claude-code/blob/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6/CHANGELOG.md): `2.1.287` introduction, `2.1.290` gateway fix
- [A4 — native prompt submission and background work](https://code.claude.com/docs/en/plugins/mods/api#start-a-turn-from-a-background-job)
- [A5 — pre-turn prompt hooks and drop result](https://code.claude.com/docs/en/plugins/mods/reference#prompts-and-what-claude-reads)

Neoflow authority:

- [N1 — Native Dispatch Provenance](../../CONTEXT.md)
- [N2 — WF-258 safety amendment and constraints](../../.issues/WF-258-deliver-review-messages-through-a-managed-claude-direct-session.md)
