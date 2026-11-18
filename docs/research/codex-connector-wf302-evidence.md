# WF-302 evidence: Codex connector, point by point

Per-point evidence for [the WF-302 note](./codex-connector-wf302.md), which
holds the verdict, versions examined, kit requirements and experiments. Paths
are relative to `codex-rs/` at Codex `rust-v0.170.0` (`29eb79e`) unless noted.
"Docs" means the official pages fetched on 2026-11-19 (URLs in the note).

## 0. The shared thread (why the app-server route works)

- **The TUI is an app-server client.** It talks to an `AppServerTarget` of
  `Embedded`, `LocalDaemon{socket}`, `Remote` or `Cloud`
  (`tui/src/lib.rs:337-347`). With no `--remote`, it picks `LocalDaemon` when a
  default daemon socket answers and nothing excludes it
  (`tui/src/lib.rs:1098-1134`, probe at `:547-582`).
- **It starts the daemon by default.** `daemon_auto_start` is `Stage::Stable`,
  `default_enabled: true` (`features/src/lib.rs:1140-1145`). The TUI calls
  `codex_app_server_daemon::start_with_features_classified` and then attaches
  (`tui/src/startup_orchestration.rs:571-575,616-650`).
- **Exclusions run the TUI embedded** (unreachable from outside): `--no-daemon`,
  `--oss`, workload identity, `CODEX_EXEC_SERVER_URL`, `--profile`, most `-c`
  overrides, a custom config loader, `--strict-config` and
  `--dangerously-bypass-hook-trust` (`tui/src/daemon_startup.rs:61-129`). Also
  feature mismatches (`:156-243`), WSL DrvFS and GCP/gateway sign-in
  (`tui/src/startup_orchestration.rs:576-615`). A failed implicit attach falls
  back to embedded (`tui/src/lib.rs:599-628`;
  `app-server-daemon/README.md:22-29`).
- **Socket.** `$CODEX_HOME/app-server-control/app-server-control.sock`
  (`app-server-transport/src/transport/mod.rs:56-73`). Mode `0o600` and an owner
  check (`app-server-transport/src/transport/unix_socket.rs:34-35,85-95`). The
  transport is WebSocket over the Unix socket, one JSON-RPC message per text
  frame (`unix_socket.rs:1,180-245`; docs: "WebSocket connections over Codex's
  default app-server control socket"). `codex app-server proxy` only relays raw
  bytes (`cli/src/main.rs:650-651,1510-1518`; `stdio-to-uds/src/lib.rs:11-30`).
- **Several clients share one live thread.** `thread/resume` on a loaded thread
  "resume[s] an already running thread by sending the thread's history to the
  client and atomically subscribing for new updates"
  (`app-server/src/thread_state.rs:66-71`; handler
  `app-server/src/request_processors/thread_processor.rs:4666-4760`, which
  refuses only a stale path or injected history). Per-thread notifications go to
  every subscribed connection (`app-server/src/outgoing_message.rs:152-226`;
  `thread_state.rs:504-510`).
- **The daemon's environment is shared.** "Shared clients use the environment
  inherited when the daemon started" (`app-server-daemon/README.md:22-24`). It
  checks for updates hourly and restarts itself, "so active or queued work may be
  interrupted" (`:48-49,66-69`).

## 1. Connect

- **No custom slash commands.** A slash item is `Builtin` or `ServiceTier`
  (`tui/src/bottom_pane/slash_commands.rs:21-24`). An unknown name fails
  validation (`tui/src/bottom_pane/chat_composer/slash_input.rs:68-87`) and the
  composer prints "Unrecognized command '/name'" and keeps the draft
  (`tui/src/bottom_pane/chat_composer.rs:3150-3172`). Plugin "commands" are
  migrated into skills (`core-plugins/src/command_migration.rs:14`), and skills
  are model instructions.
- **`!` shell escape.** A user shell command runs with `SandboxType::None`
  (`core/src/tasks/user_shell.rs:224`) and an environment built by
  `create_env(policy, Some(session.thread_id))` (`:170-171`). That injects
  `CODEX_THREAD_ID` "even when `include_only` is set" (`core/src/exec_env.rs:30-31`).
  The command runs in the daemon (the core lives there), so it is local. Its
  output is persisted into history (`user_shell.rs:258,441`), so the model sees
  it on the next turn: keep it short. The helper must detach, because `!` waits
  for the command to exit.
- **Hook alternative.** `UserPromptSubmit` receives `session_id`, `turn_id`,
  `cwd` and `prompt`
  (`hooks/schema/generated/user-prompt-submit.command.input.schema.json`). It
  can return `decision:"block"` with a reason (output schema;
  `hooks/src/events/user_prompt_submit.rs:186-203`). A blocked input is not
  recorded, and a turn whose inputs are all blocked ends
  (`core/src/session/turn.rs:1037-1080`). `session_id` "is equal to the root
  thread's ID" (`core/src/session/session.rs:1055-1064`). Hooks need a one-time
  trust review: "Before a non-managed hook can run, Codex requires you to review
  and trust the exact hook definition" (docs, hooks). Plugins can bundle hooks
  (`plugin/src/manifest.rs:19-24`).

## 2. Exact delivery

- `TurnStartParams { threadId, clientUserMessageId?, input: [UserInput], … }`
  (`app-server-protocol/src/protocol/v2/turn.rs:181-189`). `UserInput::Text { text, text_elements }`
  (`:481-487`) becomes core input unchanged (`:519-527`), and then
  `ContentItem::InputText { text }` for the model (`protocol/src/models.rs:2313-2315`).
- The client ID is carried as `TurnInput::UserInput { content, client_id }`
  (`app-server/src/request_processors/turn_processor.rs:680-688`) and comes back
  on the item: `userMessage { id, clientId, content }`
  (`app-server-protocol/src/protocol/v2/item.rs:322-326,961-965`).
- **Not idempotent.** No deduplication by client ID was found in
  `turn_processor.rs`, `core/src/session/` or `ext/queue/src/service.rs`. A
  retried `turn/start` is a second message.
- The limit is `MAX_USER_INPUT_TEXT_CHARS = 1 << 20` characters
  (`protocol/src/user_input.rs:11`), above BuildFrame's 768 KiB.
- Caveats, all of which also apply to a prompt the user types:
  - **Any trusted `UserPromptSubmit` hook sees BuildFrame's text** and can block
    it (then no `userMessage` with our ID appears: report refused or unknown) or
    add developer context (`core/src/hook_runtime.rs:708-746`). It cannot
    rewrite the text (docs, hooks).
  - A `$name` in the text is parsed as a skill or tool mention
    (`skills/src/mentions.rs:41,84-89`), which may inject that skill's
    instructions. The text itself is unchanged.
  - A Stop hook can keep the turn going (`stop_hook_active` in
    `stop.command.input.schema.json`).

## 3. Turn lifecycle

| Fact | Notification | IDs |
| --- | --- | --- |
| Turn started | `turn/started {threadId, turn}` (`bespoke_event_handling.rs:163-190`) | turn ID (UUIDv7, `thread_data.rs:392-394`) |
| Our input entered | `item/started` / `item/completed` with `userMessage` (`item.rs:1430-1437`) | `turnId` **and our `clientId`** |
| Answer text | `agentMessage { id, text, phase }` items (`item.rs:335-348`) | `turnId` |
| Normal end / failure | `turn/completed {turn: {id, status: completed\|failed, error, items:[last agentMessage]}}` (`bespoke_event_handling.rs:1386-1430,1577-1600`) | turn ID |
| Interruption | `turn/completed {status: interrupted, error?}` (`bespoke_event_handling.rs:1271-1285,1606-1630`) | turn ID |

- `TurnStatus` is `completed | interrupted | failed | inProgress`
  (`v2/turn.rs:34-39`). The core abort reason (`Interrupted`, `Replaced`,
  `ReviewEnded`, `BudgetLimited`, `protocol/src/protocol.rs:4696-4701`) is
  collapsed into `interrupted`. Treat it as interrupted unless BuildFrame sent
  the interrupt itself.
- The final answer is the last agent message on `turn/completed`
  (`items_view: summary`) or the `agentMessage` item, both exact strings.
- `turn/start` returns the turn ID before or alongside `turn/started`
  (`turn_processor.rs:786-801`). The `userMessage` item ties our client ID to
  that turn either way.

## 4. Interrupt

- `TurnInterruptParams { threadId, turnId }` (`v2/turn.rs:368-371`). The server
  rejects it when the active turn differs or none is running, then submits
  `Op::Interrupt` and answers after `TurnAborted`
  (`turn_processor.rs:1504-1545`; docs: "the turn ends with `status: "interrupted"`").
  This is turn-scoped, which is finer than Pi or OpenCode.

## 5. Concurrency

- **User input during BuildFrame's turn.** When the TUI knows of an active turn,
  Enter calls `turn/steer` with `expectedTurnId`
  (`tui/src/app_server_session/user_message_submission.rs:134-160`). That input
  joins the active turn (`v2/turn.rs:328-356`). It arrives as a `userMessage` on
  BuildFrame's turn ID with the TUI's own `clientId`, so BuildFrame detects it
  exactly and reports `input` that `joins: 'this-turn'`. Queued input (Tab, or a
  slash command typed while busy) waits in the TUI's local queue and is sent
  only when idle (`tui/src/chatwidget/input_flow.rs:63-91,251-260`).
- **The TUI renders turns it did not send.** A committed user message whose
  client ID it does not recognise is still displayed
  (`tui/src/chatwidget.rs:1392-1426`). Whether its busy state follows foreign
  turns is experiment 1.
- **BuildFrame's input while the user's turn runs.** `turn/start` calls
  `start_or_steer_turn` and returns `Steered` when a turn is active
  (`turn_processor.rs:719-760`; field docs "Ignored when this request steers an
  already-active turn", `v2/turn.rs:190-206`). It would merge into the user's
  turn, so it must not be used blind.
- **Start-if-idle queue (experimental).** `thread/queue/add {threadId, input, clientUserMessageId}`
  (`v2/thread.rs:962-969`) stores a durable item. `thread/queue/start` starts
  it only if idle, otherwise "thread already has an active or pending turn"
  (`app-server/src/request_processors/thread_queue_processor.rs:188-230`;
  `ext/queue/src/service.rs:399-438`). At idle the server dispatches the head
  item itself (`service.rs:440-505,588-603`), but **not after an interrupt**
  (`:590-592`). `thread/queue/delete` withdraws an item. All are
  `#[experimental]` (`app-server-protocol/src/protocol/common.rs:666-700`).
  `codex queue --thread --message` is the official CLI built on this
  (`cli/src/main.rs:213-214`; `tui/src/session_queue_commands.rs:33-140`).

## 6. Process model and transport

- Codex is a Rust workspace. Plugins carry only skills, MCP servers, apps and
  hooks (`plugin/src/manifest.rs:8-24`). The one script runtime is an internal
  V8 helper with a "Narrow experimental ABI" that has no host APIs
  (`plugin-host/src/protocol.rs:1-35`; `code-mode-runtime/src/ui/engine.rs:1`).
  So connector code always runs in its own process, like the Claude helper.
- The helper is a normal user process. It can open the daemon socket (same uid)
  and BuildFrame's runtime socket. Hooks and `!` children start from the
  daemon's environment snapshot (`hooks/src/engine/command_runner.rs:476-496`),
  so `CODEX_HOME` and `XDG_RUNTIME_DIR` are the daemon's. Verify against
  `initialize.codexHome` (`app-server-protocol/src/protocol/v1.rs:78-88`).
- Handshake: `initialize` once per connection, before any other request (docs).
  `capabilities.experimentalApi` is needed for the queue;
  `optOutNotificationMethods` can cut noise (`v1.rs:46-74`).
- Liveness: once the last subscriber leaves, the thread unloads after 60 s idle
  (docs, `thread/unsubscribe`). The helper's own subscription keeps it loaded.
  `thread/loaded/list` and `thread/read` (status `notLoaded | idle | active`,
  `v2/thread.rs:1749-1758`) let the helper refuse threads the daemon has not
  loaded.

## 7. Install and versioning

- The `!` route needs only BuildFrame's CLI on `PATH`. The hook route installs a
  plugin: `codex plugin marketplace add <path | owner/repo[@ref] | git URL>` and
  `codex plugin install PLUGIN@MARKETPLACE` (`cli/src/marketplace_cmd.rs:45-74`;
  `cli/src/plugin_cmd.rs:64-79`). Marketplace entries may also point at an npm
  package and version (`core-plugins/src/npm_source.rs:15-20,85-87`). Plugins are
  stable and on by default (`features/src/lib.rs:1886-1889`).
- Host version: `initialize.userAgent` is
  `"{originator}/{CARGO_PKG_VERSION} (os; arch) …"`
  (`login/src/auth/default_client.rs:152-166`). `codex app-server daemon version`
  prints JSON with the running server's version (`app-server-daemon/README.md:44-46`).
- Stability: "Some app-server methods and fields are intentionally gated behind
  `experimentalApi`", and generated bindings are "specific to the Codex version
  you ran" (docs, app-server). The control-socket WebSocket transport is
  documented. The TCP WebSocket listener is "experimental and unsupported".

## 8. Permissions

- `turn/start` overrides for approval policy, sandbox, permissions and model
  apply "for this turn and subsequent turns" (`v2/turn.rs:247-265`). Omitting
  them uses the thread's current settings, which the TUI last set
  (`tui/src/app_server_session.rs:1873-1890` sends them on every turn). A
  settings change made in the TUI between turns may not be applied until the
  TUI's next turn: experiment 1.
- The only one-turn change, `turn/settings/update`, is experimental and limited
  to the approvals reviewer and environments (`v2/turn.rs:42-60`). There is no
  per-turn read-only mode like Pi's `prepare`.
- Approval requests go to every subscribed connection, filtered to
  human-capable clients when required (`app-server/src/outgoing_message.rs:183-193,386-500`).
  The TUI shows them. The helper must not reply.
