# WF-302: can Codex carry the connector contract?

## Verdict — 2026-11-19

**Yes, conditionally, for Codex CLI 0.170.0. Point 2 (exact delivery) and
point 3 (turn lifecycle) are not a no.** The route is not a plugin. Codex is a
Rust binary with no way to load third-party code into the interactive session.
The route is **Codex's own app-server protocol** (JSON-RPC, the API its IDE and
desktop clients use). In 0.170.0 the terminal UI (TUI) is itself an app-server
client: by default it starts and attaches to a shared background app-server
(the "daemon") over a Unix socket in `$CODEX_HOME`. A second local client can
attach to the **same live thread** (Codex's word for a session), and the server
then sends both clients every event for it. A BuildFrame helper process can
therefore:

- submit a user turn with a **caller-chosen client message ID** that comes back
  on the stored user message, with the text passed to the model unchanged;
- observe `turn/started`, the user-message item (carrying our ID and the turn
  ID), and `turn/completed` with status `completed | failed | interrupted`,
  the error, and the final answer text, **all keyed by turn ID**;
- interrupt that exact turn with `turn/interrupt { threadId, turnId }`.

This is stronger than OpenCode on point 3. OpenCode's terminal events are per
session; Codex's are per turn.

The conditions:

1. **The user's TUI must be running on the shared daemon.** That is the default
   (`daemon_auto_start` is stable and on), but any `-c` override, `--profile`,
   `--oss`, `--no-daemon` and a few other cases run an in-process ("embedded")
   server that nothing else can reach. Then the connector must refuse.
2. **No real `/buildframe`.** TUI slash commands are a closed built-in list;
   unknown ones are rejected before they are sent. The best in-session trigger
   is the TUI's `!` shell escape (`!buildframe`), which runs unsandboxed in the
   session's directory with `CODEX_THREAD_ID` set. A plugin-bundled
   `UserPromptSubmit` hook is the alternative.
3. **Concurrency.** A user who presses Enter during BuildFrame's turn *steers*
   their text into it. Codex reports that by ID, but the outcome must be
   **unknown**. In the other direction, BuildFrame's plain `turn/start` on a
   busy thread would steer into the *user's* turn, so BuildFrame must use the
   experimental start-if-idle queue (`thread/queue/*`).
4. **A helper process, as with Claude.** The control socket speaks JSON-RPC
   inside WebSocket frames, so Node needs a WebSocket-over-Unix-socket client.

**Recommended surface:** a BuildFrame helper that is an app-server client of
the shared daemon, connected with `!buildframe` typed in the session.

## Versions examined

| Line | Version | Commit | Date | Where |
| --- | --- | --- | --- | --- |
| Codex CLI (latest stable) | **0.170.0** (tag `rust-v0.170.0`, GitHub "latest" release) | `29eb79e9866b3262a777fdf8195c1b9e63684c91` | committed 2026-11-17, released 2026-11-18 | [openai/codex@rust-v0.170.0](https://github.com/openai/codex/tree/29eb79e9866b3262a777fdf8195c1b9e63684c91) |

Prereleases `0.171.0-alpha.*` and `0.172.0-alpha.1` exist and were not
examined. Codex ships about one stable release a day (0.167.0 to 0.170.0 in 12
days, GitHub releases API, 2026-11-19), so every claim here should be
re-checked against the version that is current when work starts. Unless noted,
paths are relative to `codex-rs/` at the commit above. Docs:
[learn.chatgpt.com/docs/hooks](https://learn.chatgpt.com/docs/hooks) and
[learn.chatgpt.com/docs/app-server](https://learn.chatgpt.com/docs/app-server)
(the `developers.openai.com/codex/*` pages redirect there with 308), fetched
2026-11-19. Nothing was installed or run. Every claim comes from source and
docs; the points that need a live run are listed under
[experiments](#open-questions-and-experiments).

## Extension surfaces in 0.170.0

| Surface | Runs code? | Fit |
| --- | --- | --- |
| App-server JSON-RPC over the daemon's control socket | Yes, in an outside process | **The route.** It shares the live thread with the TUI. |
| `!cmd` shell escape in the TUI | Yes, an unsandboxed child process with `CODEX_THREAD_ID` | **The connect trigger.** |
| Hooks (`hooks.json`, `[hooks]`, plugin-bundled) | Yes, a child process per event | Alternative connect trigger. They see every prompt, can block it and can add context, but cannot submit turns. |
| Plugins (marketplace: skills, MCP servers, apps, hooks) | Only through their hooks and MCP servers | A packaging option for a hook; nothing more. |
| Skills (`$name`) and custom slash commands | No (instructions for the model) | Do not fit. There is no user-defined slash command. |
| MCP servers (Codex as client) | Yes, but only when the model calls a tool | Do not fit. They cannot start a turn. |
| `codex exec`, `codex queue`, `codex app-server proxy` | Separate processes | `codex queue` is the official "send to an existing session" command and proves the queue path. `exec` runs its own thread. |
| `codex mcp-server` | Not present at this tag | — |
| V8 "UI plugin" process (`plugin-host`) | An internal, experimental, narrow ABI | Not a public extension point. |

## Summary

| # | Point | Codex 0.170.0 | Reason |
| --- | --- | --- | --- |
| 1 | Connect | **Partial** | No custom `/commands`. `!buildframe` runs in the session (unsandboxed, session cwd, `CODEX_THREAD_ID` = thread ID). A plugin `UserPromptSubmit` hook can catch a typed trigger, gets `session_id` (= root thread ID) and `cwd`, and can block it. |
| 2 | Exact delivery | **Yes** | `turn/start` / `thread/queue/add` take `input: [{type:"text", text}]`, which reaches the model as `InputText` unchanged. A caller-chosen `clientUserMessageId` comes back as `userMessage.clientId`. It is **not** idempotent. Hooks can block a prompt or add context but cannot rewrite it. |
| 3 | Turn lifecycle | **Yes** | `turn/started {turn.id}`, `item/started {turnId, item: userMessage{clientId}}`, `turn/completed {turn: {id, status, error, items:[last agentMessage]}}`. Every event names the turn. The interruption reason (user, replaced, budget) is not exposed. |
| 4 | Interrupt | **Yes** | `turn/interrupt {threadId, turnId}` fails unless that turn is the active one, and replies once the turn has aborted (`turn/completed {status:"interrupted"}`). |
| 5 | Concurrency | **Partial** | TUI Enter during a running turn → `turn/steer`, which joins BuildFrame's turn, visible as a foreign `clientId` on that turn ID → **unknown**. Tab queues it for the next turn. BuildFrame must not `turn/start` on a busy thread (it would steer into the user's turn): use `thread/queue/start` (start only if idle; experimental). |
| 6 | Process and transport | **Yes, with a helper** | A Rust host that loads no foreign code. The helper is a normal process. It connects to `$CODEX_HOME/app-server-control/app-server-control.sock` (mode 0600, WebSocket frames) and can open BuildFrame's socket. This works only when the TUI uses the daemon. |
| 7 | Install and versioning | **Partial** | Nothing has to be installed into Codex: the trigger needs only `buildframe` on `PATH`. A hook route installs a plugin from a marketplace (pinned by Git ref or npm version). The host version comes from `initialize.userAgent` (`codex_cli_rs/0.170.0 …`). The daemon auto-updates hourly and the protocol has no semver promise. |
| 8 | Permissions | **Yes, with a caveat** | A turn with no overrides runs under the thread's current approval policy and sandbox. Approval requests go to every subscribed client, the TUI included. The per-turn overrides are sticky ("this turn and subsequent turns"), so there is no clean read-only mode for one turn. |

## Evidence per point

The cited evidence for points 1–8 is in
[codex-connector-wf302-evidence.md](./codex-connector-wf302-evidence.md).

## What the connector kit (WF-293) must add

1. **A remote-client host, not an in-process one.** `ConnectorHost` is
   implemented by a helper that speaks JSON-RPC to the daemon. The kit must
   allow a `submit` that answers `pending`. The queue path is: `thread/queue/add`
   → `thread/queue/start`; `taken` once our `userMessage.clientId` appears;
   `withdraw` = `thread/queue/delete`.
2. **Foreign input by ID.** A `userMessage` item on our turn ID with a
   different (or missing) `clientId` is `input` that `joins: 'this-turn'`. A
   `turn/started` for another turn is foreign. Unlike Pi, Claude and OpenCode,
   no exclusive-window guessing is needed.
3. **Submit-once discipline.** `clientUserMessageId` is not deduplicated, so a
   lost response must become `own-input-unknown`, reconciled through
   `thread/read` or the item stream, and never resent.
4. **Locality and liveness checks.** Check `initialize.codexHome`. Before
   `thread/resume`, confirm the thread is already loaded (`thread/loaded/list`),
   so the helper never cold-loads a thread that the user's embedded TUI owns. The
   helper's own subscription keeps the thread loaded after the TUI exits, and
   Codex gives no "the TUI left" signal, so the kit needs an explicit
   session-ending policy.
5. **A WebSocket-over-Unix-socket JSON-RPC client in Node.** This needs a
   decision: add the `ws` dependency or write a minimal client.
6. **Per-host version admission** from `userAgent`, re-checked on every
   reconnect, because the daemon updates and restarts itself. Opting into
   `experimentalApi` (needed for the queue) narrows the admitted versions further.
7. **Never answer server requests.** The helper receives approval prompts for
   the thread. It must leave them to the TUI, and can opt out of noisy
   notifications.

## Open questions and experiments

Run each with an isolated `CODEX_HOME` in a scratch folder, a throwaway
repository, and a local mock model provider (a custom OpenAI-compatible
`model_providers` entry pointing at a local server). Never use a real account.

1. **Shared-thread attach.** With the TUI on the daemon, the helper calls
   `thread/resume` on its thread. Confirm the TUI renders BuildFrame's prompt
   and answer, shows itself busy, and shows approvals raised in BuildFrame's
   turn.
2. **Byte fixture.** Send a fixed body (leading spaces, CRLF, combining
   accents, emoji, tab, a `$word`) through `turn/start` and `thread/queue/add`.
   Compare the `userMessage` item, the stored rollout and the request the mock
   model receives.
3. **Event order matrix.** Record the order for: an idle send; the user's Enter
   (steer) mid-turn; the user's Tab mid-turn; TUI Esc; helper `turn/interrupt`;
   a provider failure; compaction; a subagent; a hook that blocks BuildFrame's
   prompt; and a Stop hook that continues the turn.
4. **Connect trigger.** For `!buildframe`, idle and busy: check
   `CODEX_THREAD_ID` and `CODEX_HOME` in the child, whether the run creates its
   own turn, and how much of its output enters the model's context. Compare with
   a plugin hook that blocks a `$buildframe` prompt, including the hook trust
   review.
5. **Embedded fallback.** Start the TUI with `--no-daemon` and with a `-c`
   override while a daemon runs. The helper must refuse and must not load the
   thread.
6. **Queue semantics.** Check `queue/start` on a busy thread, dispatch at idle,
   no dispatch after an interrupt, how the TUI shows durable queue items, and
   the delete-versus-dispatch race.
7. **Lifetime.** The TUI exits while the helper is subscribed. The daemon
   restarts or updates mid-turn (it has turn recovery). The helper reconnects:
   expect unknown.
8. **Socket client from Node 26.** Check the WebSocket handshake on the Unix
   socket, the advertised maximum frame size, and compression left off.
9. **Decision for the owner.** Which connect trigger (`!` versus a plugin hook),
   and whether depending on the experimental `thread/queue/*` API is acceptable,
   or a race-prone `turn/start` guarded by `thread/status` is preferred.
