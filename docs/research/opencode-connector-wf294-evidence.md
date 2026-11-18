# WF-294 evidence: OpenCode connector, point by point

Per-point evidence for [the WF-294 note](./opencode-connector-wf294.md), which
holds the verdict, versions examined, kit requirements and experiments. Paths
are relative to `packages/` at OpenCode `v2.3.0` (`a6b15d3`) unless noted.

## 1. Connect

- A server part registers commands whose executor receives
  `{ sessionID, prompt, delivery }`:
  `plugin/src/promise/command.ts:7-26`. The docs show the same thing at
  `build/plugins/server.mdx:387-447`.
- The TUI sends `/name args` to `session.command` when `name` is in the
  location's command list, with the arguments as `text`:
  `tui/src/component/prompt/index.tsx:1150-1153,1315-1331`. The server runs the
  callback **immediately**, not through the inbox ("Execute a slash command
  callback immediately", `protocol/src/groups/session.ts:364-383`;
  `core/src/session/command.ts:11-37`). So `/buildframe`, `/buildframe status`
  and `/buildframe disconnect` work even while the session is busy, and running
  the command creates no user message.
- To bind the repository, the plugin reads the session's location through
  `ctx.session.get` or `ctx.location.directory` (`build/plugins/server.mdx:37-61`)
  and then runs `bootstrapWorkspace` as Pi does. The local runtime applies "one
  session per repository, newest wins", as today.
- The server part has **no UI**. A `/buildframe` reply, such as "attached" or
  "runtime unavailable", needs either a TUI part (`./tui`: toasts and footer
  slots, `build/plugins/cli.mdx:283-310,369-450`) told through the plugin's RPC
  events (`build/plugins/rpc.mdx`), or a thrown error that the TUI shows as
  "Failed to run command" (`tui/.../prompt/index.tsx:1329-1331`). Pi uses
  `ctx.ui.notify` and Claude uses `$.ui.toast`.

## 2. Exact delivery

- **Caller-chosen ID.** `POST /api/session/:sessionID/prompt` accepts an
  optional `id` (a `Session.Message.ID`, which must start with `msg_`;
  `schema/src/session-message.ts:21-28`) along with `text`, `files`, `agents`,
  `skills`, `metadata`, `delivery` and `resume`
  (`protocol/src/groups/session.ts:342-363`). The core uses that ID as the
  message ID (`core/src/session/session.ts:155-189`).
- **Idempotent receipt.** Admission reconciles by ID. The same ID with the same
  item returns the existing admission. A mismatch is a `PromptConflictError`,
  returned as HTTP 409 (`core/src/session/inbox.ts:191-225`;
  `server/src/handlers/session.ts:289-320`). The docs say: "Retrying an ID
  already pending or delivered returns the original admission without rerunning
  hooks" (`build/plugins/server.mdx:1392-1433`). Neither Pi nor Claude offers
  this.
- **Bytes.** The text goes through the `session` `prompt` hook and is persisted
  as `UserPayload.text` (`core/src/session/prompt.ts:34-90`). It becomes the
  model message as `Message.text(message.text)` with no templating
  (`core/src/session/runner/to-llm-message.ts:260-263`). Templating and
  `@file` expansion belong to commands and the TUI, not to `session.prompt`.
- Caveats, all of which also apply to a prompt the user types:
  - **Any installed plugin's `prompt` hook can rewrite the text.** "Edits become
    the canonical persisted user input" (`build/plugins/server.mdx:1392-1433`).
    The `context` hook can also edit model-bound messages. BuildFrame can detect
    a rewrite by comparing the admitted `SessionInbox.User` text and the
    `inbox.enqueued` item with the text it sent. It must then report the result
    as unknown, not as delivered exactly.
  - A prompt **commits a staged revert** before admission
    (`core/src/session/session.ts:172-173`).
  - The default delivery is `steer` (`core/src/session/prompt.ts:52`), so
    BuildFrame must choose the delivery explicitly (see point 5).

## 3. Turn lifecycle

The events carry a per-session durable `seq`, so order and gaps are observable
(`schema/src/event.ts:17-43`):

| Fact | Event (`schema/src/session-event.ts`) | Carries BuildFrame's ID? |
| --- | --- | --- |
| Admitted | `session.inbox.enqueued {inboxID, item}` :220 | **yes** |
| Withdrawn before delivery | `session.inbox.cancelled {inboxID}` :230 | **yes** |
| Delivered to the model loop (start) | `session.inbox.delivered {inboxID}` :213 | **yes** |
| Execution started | `session.execution.started {sessionID}` :245 | no |
| Steps | `session.step.started/ended/failed {assistantMessageID, finish, error}` :333-405 | no (assistant ID only) |
| Normal end | `session.execution.succeeded {sessionID}` :248 | no |
| Failure | `session.execution.failed {sessionID, error}` :251 | no |
| Interruption | `session.execution.interrupted {sessionID, reason: user\|shutdown\|superseded\|inactivity}` :258 | no |

- OpenCode defines a turn as an execution: "every step since the previous
  [idle] marker belongs to one turn, including prompts steered in while it was
  busy" (`schema/src/session-message.ts:293-304`). Execution publishes "one
  terminal observation per busy period, covering every coalesced drain"
  (`core/src/session/execution.ts:149-172`).
- A **queued** input that is pending at the idle boundary also runs inside the
  **same** execution: the drain promotes it and goes on instead of completing
  (`core/src/session/runner/llm.ts:100,120,177,198`; test
  `core/test/session-runner.test.ts:1734-1765`).
- **Correlation rule** (deterministic, from IDs and ordering, not from text or
  timing): BuildFrame's turn starts at `inbox.delivered(own)`. The next
  `execution.{succeeded,failed,interrupted≠shutdown}` is its outcome **only if
  no other `inbox.delivered` came after the own delivery**. In every other case
  the outcome is unknown. The normal-end answer is the text of the steps between
  the own delivery and the terminal event.
- What makes the outcome unknown in OpenCode 2.3.0:
  - user input steered in (the TUI default);
  - queued input promoted behind BuildFrame's prompt;
  - **background subagent reports**, which arrive in the parent session as
    `synthetic` input with `steer` delivery
    (`core/src/session/execution/subagent-report.ts:82-93`; subagents always run
    in the background since 2.3.0,
    [release notes](https://github.com/anomalyco/opencode/releases/tag/v2.3.0));
  - other plugins' `experimental.idle` hooks that add input into the same
    execution (`plugin/src/promise/session.ts:184-199`);
  - `interrupted{reason:"shutdown"}`, after which a server restart resumes the
    turn while the plugin's in-memory state is gone
    (`core/src/session/execution.ts:75-82,155-159`);
  - the event subscriber's 4096-event buffer overflowing, which ends the stream
    with an error (`client/src/shared-events.ts:33,113-114`).

## 4. Interrupt

- `ctx.session.interrupt({ sessionID, resume? })` returns `{interrupted}`. It
  stops the session's active execution "owned by this OpenCode process", and the
  outcome is `execution.interrupted{reason:"user"}`
  (`protocol/src/groups/session.ts:679-697`;
  `core/src/session/execution.ts:179-196`). With `resume:false`, queued prompts
  stay parked.
- The interrupt is session-scoped, not turn-scoped. That is the same as Pi's
  `ctx.abort()` and coarser than Claude's `$.turn.abort({turnId})`. Before
  interrupting, the connector must check that the current execution is still
  BuildFrame's (the exclusive window from point 3). A race remains: the
  execution can end and a user prompt can start between that check and the
  interrupt. This is acceptable because any foreign delivery already makes
  BuildFrame's outcome unknown.
- An interrupt from the user (TUI Esc) is observed the same way, so an
  interrupted outcome is reported truthfully.

## 5. Concurrency

- Every input has an ID, so foreign input is always distinguishable from
  BuildFrame's.
- The **TUI submits with `steer` by default**
  (`tui/src/component/prompt/index.tsx:1094`). A user prompt typed during
  BuildFrame's turn is delivered at the next step boundary into the **same
  execution**, so BuildFrame's turn becomes unknown and the model's answer mixes
  both prompts.
- The plugin can influence other prompts through the `session` `prompt` hook. It
  runs on every user prompt, including the TUI's, and can change `delivery` from
  `steer` to `queue` (`build/plugins/server.mdx:1392-1433`). Queuing alone still
  merges the queued prompt into the same execution (point 3). The hook has "no
  typed rejection API", but a hook that throws stops admission ("If preparation
  fails ... OpenCode does not admit the prompt"). That would mirror Pi, which
  swallows other input while BuildFrame's turn runs
  (`packages/pi-adapter/src/piAdapter.ts:299-316`). The TUI would show "Failed
  to send prompt" and restore the composer
  (`tui/.../prompt/index.tsx:1355-1370`). Whether to do this is a UX decision.
  It needs an experiment and owner sign-off.
- Single flight: BuildFrame should refuse a Send unless the session is idle,
  meaning no active execution and no pending inbox items (`session.inbox.list`,
  `protocol/src/groups/session.ts:545-557`), as Pi and Claude already do.

## 6. Process model and transport

- **Where code runs.** By default one **shared background server per user**
  owns sessions, permissions and tool execution, and every local client,
  including the TUI and desktop, connects to it (`cli/index.mdx:46-67`). The
  server part of a plugin runs inside that server
  (`build/plugins/index.mdx:44-55`). The TUI part runs in the TUI process. The
  shipped binary is a Bun-compiled executable (`cli/script/build.ts:72,170-191`),
  and the plugin runtime requires Bun and supplies `effect` and
  `@opencode/plugin` itself (`plugin/src/runtime.ts:12-36`). Plugins are
  TypeScript or JavaScript ES modules.
- **Unix socket.** Bun's `node:net` is "Fully implemented, including ... Unix
  domain sockets", and its `node:fs` is "Fully implemented"
  ([Bun Node.js compatibility](https://bun.com/docs/runtime/nodejs-compat),
  fetched 2026-11-17). So `connectHarnessAdapterRuntime`
  (`packages/local-runtime/src/harnessAdapter.ts`) can run in-process. **No
  helper is needed**, unlike Claude Mods, which only have
  `$.http.fetch`/`$.process.run` (`packages/claude-adapter/plugin/hooks/register.js`).
- Constraints:
  - A plugin **must not bundle its own `effect` or `@opencode/plugin`**; loading
    either from the plugin's `node_modules` throws
    (`plugin/src/runtime.ts:27-34`).
  - The server process is detached and **inherits the environment of the client
    that first started it** (`client/src/service-contender.ts:14-24`). BuildFrame
    finds its socket through `XDG_RUNTIME_DIR` or `/tmp/buildframe-<uid>`
    (`packages/local-runtime/src/runtimeLocation.ts:64-80`), so a different
    `XDG_RUNTIME_DIR` would point the plugin at a different socket.
  - The server can be **remote** (`--server URL`, pairing or remote access;
    `cli/index.mdx:51-56`, `cli/web.mdx`). The plugin must refuse when it is not
    on the same machine and user as the repository.
  - The plugin can be **hot-reloaded** when its config changes
    (`plugins.mdx:123-133`), and `setup`'s cleanup runs on unload
    (`build/plugins/server.mdx:21-35`). A reload in the middle of a turn loses
    the connector's state.
  - One server process hosts plugin instances for many locations
    (`ctx.location`, `build/plugins/server.mdx:49-61`), whereas the Pi and
    Claude connectors each run once per process.

## 7. Install and versioning

- **Install.** Add `"plugins": ["<pkg>@x.y.z"]` to `opencode.json(c)`, or run
  `opencode plugin add <pkg>@x.y.z` for a global install. "Exact npm versions and
  full Git commit hashes stay pinned"; unpinned ones are checked for updates
  (`plugins.mdx:5-43,91-128`). One package can hold a server, TUI and RPC part
  (`build/plugins/index.mdx:22-55`).
- **Host version.** `ctx.app.{name, version, channel}`
  (`plugin/src/app.ts:1-5`; `build/plugins/server.mdx:21-35`). This replaces
  Pi's `discoverPiHostVersion` and Claude's `$.session.version()`.
- **No host-side compatibility gate in v2.** No `engines` handling was found in
  the v2 core (v1 had one: `packages/opencode/src/plugin/shared.ts:194-206` at
  v1.19.6). The docs only say to "use versions compatible with the OpenCode
  release you target" (`build/plugins/index.mdx:105-106`). BuildFrame must check
  the version itself, as `piHostCompatibility.ts` does, and refuse
  `/buildframe` outside the verified set.
- **Release pace.** The 2.2.x and 2.3.0 releases came out within roughly two
  weeks (GitHub releases, 2026-10-29 to 2026-11-13), and much of the session
  API is marked `experimental`. Expect a short verified-version list and
  frequent re-verification.

## 8. Permissions

- A prompt carries no agent or model. It runs with the session's selected agent
  and model (`session.switchAgent`/`switchModel` change them;
  `build/plugins/server.mdx:771-800`) and the session's permission rules. `ask`
  rules prompt the user through the normal permission flow
  (`build/plugins/server.mdx:725-770`). So the delivered turn runs with the
  user's normal permissions.
- The read-only authority (Pi's `discussion-only`) can be enforced only for
  BuildFrame's turn. Two hooks can do it: `ctx.permission.hook("evaluate")`,
  which may change `effect` to `deny` (but "an explicit configured deny is final
  and does not invoke the hook", `build/plugins/server.mdx:1737-1779`), or
  `ctx.session.hook("context")`, which can drop tools from a request (README
  example, `plugin/src/README.md`). Avoid `session.update({permissions})`: it
  persists on the session and children inherit it
  (`build/plugins/server.mdx:761-770`).
- If no client is viewing the session, an `ask` waits. Pi and Claude have the
  same property.

## OpenCode 1 (1.19.6) in brief

The v1 paths below are relative to `packages/` at `f4e363c`.

- Plugin `Hooks`: `event`, `chat.message`, `command.execute.before`,
  `tool.execute.before/after`, `permission.ask` and others
  (`plugin/src/index.ts:222-335`). **`permission.ask` is declared but never
  triggered**: a grep of the whole tree finds no trigger.
- **Connect: partial.** Server plugins cannot register a slash command that runs
  code. TUI plugins can (`keymap.registerLayer` with `slashName`;
  `tui/src/feature-plugins/system/diff-viewer.tsx:1052-1068`), but they take no
  arguments. A typed `/buildframe status` would be sent to the model as a prompt
  (`tui/src/component/prompt/index.tsx:1070-1124`).
- **Delivery: yes.** `client.session.promptAsync({ body: { messageID, parts } })`
  stores text parts verbatim (`opencode/src/session/prompt.ts:635-1050,1499-1525`;
  `web/src/content/docs/server.mdx:176-178`). But if no `agent` is passed, the
  prompt **switches the session to the default agent** (`prompt.ts:635-690`), and
  the deprecated `tools` field rewrites session permissions
  (`prompt.ts:1060-1067`).
- **Lifecycle: conditional.** Assistant messages carry `parentID` = user message
  ID, plus `finish` and `error` (`MessageAbortedError` on abort;
  `prompt.ts:1186-1211`). But a prompt sent while the session is busy joins the
  running loop, which then answers the newest user message
  (`opencode/src/effect/runner.ts:115-138`; `prompt.ts:1086-1130`). Auto
  compaction adds synthetic user messages (`session/compaction.ts:495-545`).
  `session.idle` has only `sessionID`.
- Abort is session-scoped: `POST /session/:id/abort`
  (`run-state.ts:77-86`). The process model is a TUI main thread plus a
  server-plus-plugins Bun worker (`cli/cmd/tui.ts:249`). The host version is
  `api.app.version` for TUI plugins only; npm plugins can declare
  `engines.opencode`.
