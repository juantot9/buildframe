# WF-303: Codex connector experiments

Live runs of the experiments listed in
[the WF-302 note](./codex-connector-wf302.md#open-questions-and-experiments),
on 2026-11-19 and 2026-11-20.

## Setup

- Codex CLI **0.170.0** (Homebrew cask). Codex's shared background server
  (the daemon) **updated itself to 0.171.0 overnight**, so the later runs are
  on 0.171.0 (`codex app-server daemon version` reported
  `cliVersion 0.170.0, appServerVersion 0.171.0`).
- An isolated `CODEX_HOME` at `/tmp/cxh` (short, because the daemon's socket
  path must fit macOS's 104-byte limit), a throwaway repository, and a fake
  Responses-API model on a loopback port (Codex 0.170 speaks only the Responses
  API to custom providers). `approval_policy = "never"` and no request retries.
  No account was used; the real `~/.codex` was not touched.
- The Codex TUI ran in a Rex tab. A probe process connected to the daemon's
  Unix socket with a hand-written WebSocket client (Node 26, no dependency),
  called `initialize` with `experimentalApi: true`, and logged every message.

## Results

| # | Experiment | Result |
| --- | --- | --- |
| 1 | Shared-thread attach | **Works.** `thread/loaded/list` shows the TUI's thread; `thread/resume` subscribes the probe. The TUI renders BuildFrame's prompt and answer, and tracks the busy state of turns it did not start (Enter steers into them, Tab waits for them). |
| 2 | Byte fixture | **Exact.** Leading spaces, CRLF, combining accents, emoji, a tab and a `$skill` word were identical in the `userMessage` item and in the model's input. `clientId` comes back as sent. |
| 3 | Event order | Every event names the turn. See below. |
| 4 | `!` trigger | `!cmd` runs in the TUI's session with `CODEX_THREAD_ID` = the exact thread and `CODEX_HOME` set, as **its own turn** (`commandExecution`) with no model call. **Its command line and output enter the model's context** on the next turn as a `<user_shell_command>` message. |
| 5 | Embedded fallback | A `codex --no-daemon` session's thread is **not** in the daemon's `thread/loaded/list`, and `thread/read` reports it `notLoaded`: the connector can detect it and refuse. |
| 6 | Queue | `thread/queue/add` on an **idle** thread starts the turn at once (a following `thread/queue/start` answers "queue is empty"). Added while the user's turn runs, it waits and then runs as **its own** turn. **After an interrupt the queue stops dispatching**: an item added then waits until something else runs, so the connector must call `thread/queue/start`. `thread/queue/delete` withdraws an item (`deleted: true`, then `false`). |
| 7 | Lifetime | The daemon **auto-updated and restarted** (0.170.0 → 0.171.0 at 02:02, with update checks off in config): the probe's socket closed with no message, the TUI reattached on its own, and the thread was loaded again. Quitting the TUI (`/quit`) prints "Disconnected from this task. Any running work continues" and sends **no** event to other clients; the thread stays loaded while the probe is subscribed. |
| 8 | Node client | A hand-written RFC 6455 client over `net.createConnection(socketPath)` works: `101 Switching Protocols`, JSON-RPC in text frames, `x-codex-websocket-max-unfragmented-message-bytes: 16777216`. `initialize.userAgent` is `codex-tui/<server version> …` and `codexHome` is the real path. No dependency needed. |

### Event order (experiment 3)

Every BuildFrame case starts with `turn/started {turn.id}`, then
`item/started`/`item/completed` for a `userMessage` with `clientId` = ours and
that `turnId`. Then:

| Case | What follows |
| --- | --- |
| Idle send | `agentMessage` items, `turn/completed {status: completed}` |
| User presses Enter mid-turn | a second `userMessage` **on our turn ID** with the TUI's own `clientId`; the answer covers the user's text; `completed` |
| User presses Enter during our tool call | the same: their `userMessage` joins our turn after the tool step |
| User presses Tab mid-turn | our turn completes on its own; the user's text then starts a **new** turn |
| TUI Esc | `turn/completed {status: interrupted}` |
| `turn/interrupt {threadId, turnId}` from the probe | the reply, then `turn/completed {status: interrupted}`; on a turn that is not active: error "no active turn to interrupt" |
| Model HTTP 500 (no retries configured) | an `error` notification, then `turn/completed {status: failed, error: {message, codexErrorInfo}}` |

## What changes for the connector

1. **Attribution is exact.** A `userMessage` on our turn ID with another
   `clientId` is input that joins this turn (unknown). Tab-queued input never
   touches our turn. No exclusive-window rule is needed.
2. **Send = `queue/add` then `queue/start`.** Add starts at once when idle;
   start is needed after an interrupt, and "queue is empty" from it is not an
   error. `taken` is our `userMessage` appearing; `withdraw` is `queue/delete`
   returning `deleted: true` (proven never taken).
3. **Version admission from the server, on every connect.** The daemon updates
   itself independently of the installed CLI and of `check_for_update_on_startup`,
   so the version can move ahead of the verified list overnight. A turn in flight
   during a restart is lost (unknown).
4. **Refuse threads the daemon has not loaded** (`notLoaded`): they belong to an
   embedded TUI.
5. **No "TUI left" signal.** Codex treats a session as a task that outlives its
   TUI (`codex resume <thread>` reattaches). The connection can follow the thread.
6. **`!buildframe` is visible to the model.** Keep its output to one line.

## Not covered

Compaction, a real subagent, a hook that blocks BuildFrame's prompt, a Stop
hook that extends the turn, and approval prompts during BuildFrame's turn (runs
used `approval_policy = "never"`).
