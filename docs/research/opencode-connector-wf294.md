# WF-294: can an OpenCode plugin carry the connector contract?

## Verdict — 2026-11-17

**Yes for OpenCode 2 (2.3.0); point 2 (exact delivery) and point 3 (turn
lifecycle) are not a no.** A server plugin in OpenCode 2 can register
`/buildframe` as a real command that receives the session ID. It can submit a
user prompt with **an ID that BuildFrame chooses**, where retrying the same ID
gives back the original admission. It can watch durable, per-session ordered
events that name that ID when it is enqueued, delivered, or cancelled, and it
can interrupt the session. The plugin runs inside the OpenCode server, under
Bun, and can open the local Unix socket itself. Unlike Claude, it needs no
helper.

The gap is in point 3, and it matters: **OpenCode's terminal events are per
execution (busy period), not per prompt.** `session.execution.succeeded|failed|interrupted`
carry only `sessionID`. A turn can be attributed to BuildFrame's prompt only
while no other input is delivered between BuildFrame's prompt and that terminal
event. OpenCode delivers other input into a running execution by default: the
TUI's prompts default to `steer`, and background subagent reports arrive as
`steer` input. When that happens the outcome must be **unknown**. This is the
same exclusive-window condition the Pi and Claude connectors already rely on,
but OpenCode hits it more often.

**OpenCode 1 (1.19.6) is a weaker, retiring target.** Its own release notes
offer the upgrade to OpenCode 2 and say v1 plugins need updating. V1 plugins
cannot register a code-running slash command on the server, and its terminal
signal (`session.idle`) has no ID either. Recommendation: target OpenCode 2
only; see [OpenCode 1](./opencode-connector-wf294-evidence.md#opencode-1-1196-in-brief).

## Versions examined

| Line | Version | Commit | Date | Where |
| --- | --- | --- | --- | --- |
| OpenCode 2 (primary) | `@opencode/cli` / `@opencode/plugin` **2.3.0** (npm `latest`) | `a6b15d33daf6ab7d35569f6d711fdb630b9f04e7` (tag `v2.3.0`) | 2026-11-13 | [anomalyco/opencode@v2.3.0](https://github.com/anomalyco/opencode/tree/a6b15d33daf6ab7d35569f6d711fdb630b9f04e7) |
| OpenCode 1 (legacy) | `opencode-ai` / `@opencode-ai/plugin` **1.19.6** (npm `latest`) | `f4e363c8295fa90a03dddc451882fffe8fbce357` (tag `v1.19.6`) | 2026-11-17 | [anomalyco/opencode@v1.19.6](https://github.com/anomalyco/opencode/tree/f4e363c8295fa90a03dddc451882fffe8fbce357) |

The canonical repository is `anomalyco/opencode`; `sst/opencode` redirects
there (GitHub API, 2026-11-17). Unless noted, the paths below are relative to
`packages/` at the v2.3.0 commit. Docs are cited from the same commit's
`services/site/src/docs/content/` and match the live
[opencode.ai/docs/build/plugins/server](https://opencode.ai/docs/build/plugins/server)
page (fetched 2026-11-17). Nothing was run: every claim comes from reading
source and docs. Points that need a live run are listed under
[experiments](#open-questions-and-experiments).

## Summary

| # | Point | OpenCode 2.3.0 | Reason |
| --- | --- | --- | --- |
| 1 | Connect | **Yes** | A server plugin adds a command with `ctx.command.transform`; its executor receives `sessionID`, and the TUI routes `/buildframe args` to it. |
| 2 | Exact delivery | **Yes** | `ctx.session.prompt({ sessionID, id, text })`: the text is stored and sent to the model verbatim, under a caller-chosen, idempotent message ID. |
| 3 | Turn lifecycle | **Yes, conditional** | Enqueued, delivered and cancelled events carry the ID. Terminal events are per execution (session-scoped), so they can be attributed only when no other input is delivered in between. Otherwise the outcome is unknown. |
| 4 | Interrupt | **Yes** | `ctx.session.interrupt({ sessionID })` is session-scoped (the same grain as Pi's `ctx.abort()`) and is reported as `execution.interrupted{reason:"user"}`. |
| 5 | Concurrency | **Partial** | Each input has its own ID, but the TUI defaults to `steer`, which merges the user's prompt into BuildFrame's running execution, so that turn becomes unknown. A prompt hook can change foreign prompts to `queue` or reject them. |
| 6 | Process and transport | **Yes** | In-process JS/TS in the shared OpenCode server (a Bun binary). Bun's `node:net` supports Unix sockets, so no helper is needed. The server can be remote, and then the socket is unreachable. |
| 7 | Install and versioning | **Yes** | `opencode plugin add pkg@x.y.z` and exact versions stay pinned. The host version comes from `ctx.app.version`. There is no `engines` gate, so the plugin must check the version itself. |
| 8 | Permissions | **Yes** | The prompt runs under the session's selected agent and rules, and `ask` prompts reach the user. Read-only mode is possible through the `permission` `evaluate` hook or the `session` `context` hook. |

## Evidence per point

The cited evidence for points 1–8 and the OpenCode 1 summary is in
[opencode-connector-wf294-evidence.md](./opencode-connector-wf294-evidence.md).

## What the connector kit (WF-293) must add

1. **Turn identity minted before submission.** The kit's host port should let a
   connector mint the native turn/message ID before submitting, and treat a
   retried submit with the same ID as the same delivery. OpenCode provides this
   natively; Pi and Claude can supply `undefined`.
2. **Session-scoped terminals plus an exclusive window.** Generalize what Pi
   (`onInput`/marker) and Claude (`foreign-prompt` fact) each hand-roll into one
   kit rule: `ownDelivered(id)`, `foreignInputDelivered()` and
   `sessionTerminal(outcome)`. Correlation is lost, and the outcome unknown, as
   soon as foreign input lands inside BuildFrame's window. Shutdown-interrupted
   and stream-error cases must also map to unknown.
3. **Status reporting that can be absent or deferred.** A server-part connector
   has no direct UI, so `/buildframe` feedback may go through a separate TUI part
   or command errors.
4. **No process-global state.** Several connector sessions (one per repository
   location) can live in one long-lived host process. Their lifetimes follow
   plugin `setup` and cleanup, including hot reload.
5. **A runtime-agnostic kit.** The kit and its imports (`@buildframe/workspace`,
   `local-runtime`) must run under Bun as well as Node, and must not bundle
   `effect`. The plugin must use the host's copy. If BuildFrame's own `effect`
   usage conflicts with that, it needs a bundling decision.
6. **Locality checks.** Refuse when the host server is remote, and surface a
   clear diagnostic when the socket location differs because of the inherited
   environment.
7. **Per-host version admission**, using `ctx.app.version` and a verified list,
   in the same shape as `piHostCompatibility.ts`.

## Open questions and experiments

Each experiment is zero-funded: use a local mock provider, use an isolated
`--standalone` server and a throwaway repository, and never touch a real
account.

1. **Byte fixture.** Submit a fixed body with leading spaces, CRLF, combining
   Unicode and emoji through `ctx.session.prompt({id})`. Compare the
   `inbox.enqueued` item, `session.message` and the model-bound request
   (captured with the `session` `http.request` hook or the mock provider) with
   the bytes sent.
2. **Event ordering matrix.** With the plugin's subscription running, record
   `seq` order for: an idle prompt; a user steer mid-turn; a user queue
   mid-turn; a TUI Esc interrupt; `ctx.session.interrupt`; a provider failure;
   overflow compaction; and a background subagent report. Confirm the
   exclusive-window rule in each case.
3. **Socket under the shared service.** Check that `connectHarnessAdapterRuntime`
   (`lstat` with bigint, `getuid`, framing) works in the Bun service. Check
   socket discovery when the service was started from a shell with a different
   `XDG_RUNTIME_DIR`.
4. **Command UX.** Confirm that `/buildframe status` reaches the server command
   while the session is busy, and check how a thrown error is shown. Decide
   whether a TUI part is worth it.
5. **Foreign-input policy.** Compare a `prompt` hook that throws with forcing
   `queue`; this is the owner's call.
6. **Hot reload and restart.** Confirm that the connector reports unknown when
   the plugin is replaced mid-turn and when the service restarts and resumes the
   turn.
7. **Decision for the owner: OpenCode 1 support.** This note recommends
   targeting only OpenCode 2, because 1.19.6 offers the upgrade and v1 plugins
   do not run in v2 (`build/plugins/migrate-v1.mdx:6-12`).
