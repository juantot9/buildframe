# WF-322: a public integration contract — standard protocol or our own?

## Summary — 2026-11-26

| Question | Verdict |
| --- | --- |
| 1. Can ACP, MCP or A2A deliver a prompt into a session the person already has open? | **No, not as specified.** ACP's client launches the agent; MCP servers cannot start turns (Claude Code's *channels* extension is the exception, and it is Claude-only); A2A is a remote HTTPS agent service. |
| 2. Do they carry exact text, correlated start/end, answer, interrupt, idle/busy? | **Partly.** ACP comes closest (prompt, answer chunks, `stopReason`, `session/cancel`) but has no turn ID, no "taken" acknowledgement apart from the turn, and no busy/idle. MCP and A2A carry less. |
| 3. How do Codex, Claude Code and OpenCode expose "send a prompt to a running agent"? | Each has its **own** API: Codex app-server JSON-RPC over a Unix socket, Claude Code Mods (`$.prompt.submit`, `turn.*`), and OpenCode's HTTP + SSE API. None of them uses ACP for the live session. |
| 4. Can today's JSONL seam be published as v1? | **Yes, if it is cut down.** The framing is sound. The bootstrap, manifest, IDs and disclosure shapes are internal and must be hidden behind a smaller public vocabulary. |
| 5. Recommendation | **Our own methods over a JSON-RPC 2.0 envelope**, LF-delimited on the existing socket (the same framing as ACP and MCP stdio). Borrow ACP's vocabulary where it fits. Keep an ACP bridge as a later option. |

## Versions examined

| Source | Version | Where read |
| --- | --- | --- |
| ACP | schema release `schema-v1.35.0` (2026-11-23, commit `11347504`) | [agentclientprotocol/agent-client-protocol@schema-v1.35.0](https://github.com/agentclientprotocol/agent-client-protocol/tree/schema-v1.35.0), `docs/` via `gh api`; [agentclientprotocol.com](https://agentclientprotocol.com) (fetched 2026-11-26) |
| MCP | revision `2026-07-28` (what `/specification/latest` serves) | [modelcontextprotocol/modelcontextprotocol@2bbace5](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/2bbace557bbf2cb5d03d6f9b48905415cd7607b0), `docs/specification/2026-07-28/` |
| A2A | `v1.0.1` (2026-05-28, commit `33035925`) | [a2aproject/A2A@v1.0.1](https://github.com/a2aproject/A2A/tree/v1.0.1) `docs/specification.md` |
| Codex CLI | `codex-cli 0.170.0` (`/opt/homebrew/bin/codex`) | `codex app-server generate-json-schema` output; earlier source reading in [codex-connector-wf302.md](./codex-connector-wf302.md) |
| Claude Code | `2.1.332` (`~/.local/bin/claude`) | Mod API types `plugin-authoring/types/claude-code.d.ts` (bundled 2.1.332); [channels reference](https://code.claude.com/docs/en/channels-reference) and [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions) (fetched 2026-11-26) |
| OpenCode | `v2.3.2` (`~/.opencode/bin/opencode`) | [anomalyco/opencode@v2.3.2](https://github.com/anomalyco/opencode/tree/v2.3.2): `packages/protocol/openapi.json`, `packages/cli/src/commands/handlers/acp.ts` |
| Pi | `1.6.0` | `@earendil-works/pi-coding-agent/docs/rpc.md`, `rpc-commands.md` (installed package) |
| BuildFrame seam | `main` at `9c02f14` | `packages/local-runtime/src/{protocol,framing,contracts,runtimeLocation}.ts`, `packages/workspace/src/harness-interaction/contracts.ts` |

Nothing was run except `--help`, `--version` and Codex's schema generator.

## 1. Attaching to a session that is already open

### ACP: the client owns the agent process

- The only transport ACP defines is stdio. "The client launches the agent as a subprocess", messages are LF-delimited JSON-RPC, and agents and clients "MAY implement additional custom transport mechanisms" (`docs/protocol/v1/transports.mdx`). A Streamable HTTP/WebSocket transport is only an RFD, listed under **Draft** in `docs/docs.json` (`rfds/streamable-http-websocket-transport.mdx`).
- `session/load` (capability `loadSession`) "MUST replay the entire conversation". `session/resume` (`sessionCapabilities.resume`, stabilized) reconnects without replay (`docs/protocol/v1/session-setup.mdx`). Both make the agent process that the client spawned pick up a **stored** session. The spec mentions "sharing sessions between different Client instances", but it sets no rules for two clients on one live session. The draft `session/status` RFD admits that `session/load` and `session/resume` "make the Agent start handling a session for the connection that sent them" (`rfds/session-status.mdx`).
- Who implements ACP (`docs/get-started/agents.mdx`): **Claude** via Zed's `claude-agent-acp` adapter, **Codex CLI** via `codex-acp`, **OpenCode** natively, and **Pi** via a third-party `pi-acp`. In every case the harness is an ACP *agent* that an editor starts. Example: `opencode acp` calls `Standalone.start()`, its own standalone server, and speaks ACP over its stdin/stdout (`packages/cli/src/commands/handlers/acp.ts` at v2.3.2). It does not join the server the user's TUI uses.

**Verdict:** ACP is for "an editor runs an agent". BuildFrame would have to be the ACP client and launch a second agent process. That is the managed-session model WF-258 already rejected for ordinary review, not a way to reach the person's open TUI.

### MCP: the harness is the client, so BuildFrame could only be a server

- MCP has hosts, clients and servers. Servers offer resources, prompts and tools (`/specification/latest`). The 2026-07-28 revision removes server-initiated requests (sampling and elicitation move to the MRTR pattern) and protocol-level sessions (`changelog.mdx` §1, §7). Nothing in the core lets a server start a model turn. A tool runs only when the model calls it.
- **Claude Code channels** are the exception, as a Claude-specific extension. An MCP server that declares `experimental['claude/channel']` emits `notifications/claude/channel {content, meta}`. The text reaches the model wrapped in `<channel source=… …>` tags. "Claude Code doesn't acknowledge notifications"; events that arrive while Claude is busy "are delivered together on the next turn". Channels are a research preview behind an allowlist or `--dangerously-load-development-channels`, and Claude Code spawns the server over stdio ([channels reference](https://code.claude.com/docs/en/channels-reference)).

**Verdict:** core MCP cannot do it. Channels can push into a live Claude session, but the text is wrapped, nothing is acknowledged, and messages are batched. That fails "exact text" and "correlated turn".

### A2A: a remote agent service

- A2A is for "independent, potentially opaque AI agent systems". Agents publish an Agent Card at `/.well-known/agent-card.json` and offer JSON-RPC 2.0 over HTTP(S), gRPC or REST. "Production deployments MUST use encrypted communication" (`docs/specification.md` §1, §5.3, §8, §9).
- `contextId` groups tasks, and `taskId` is **server-generated**: "Client-provided `taskId` values for creating new tasks is NOT supported" (§3.4.1–3.4.2).
- No A2A surface turned up in Codex 0.170.0's app-server schema, in OpenCode v2.3.2's source tree or OpenAPI document, in `codex --help` or `claude --help` for 2.1.332, or in Pi 1.6.0's docs.

**Verdict:** A2A does not fit. It assumes a network service with auth and TLS, and none of the four harnesses speaks it.

## 2. What each protocol carries

| Need | ACP v1 | MCP 2026-07-28 (+ Claude channels) | A2A 1.0.1 |
| --- | --- | --- | --- |
| Deliver into the open session | No (the client spawns the agent) | Channels only (Claude, preview) | No |
| Exact text as written | Yes: `session/prompt` with a `text` content block | No: wrapped in a `<channel>` tag | Yes: a `Message` text `Part` |
| "Received" ack apart from the turn | No. `messageId` is agent-generated and optional (`rfds/message-id.mdx`, stabilized); a prompt-response ack is only in the v2 preview | No ("doesn't acknowledge") | `SendMessage` returns a `Task` |
| Turn start tied to the Message | Implicit: the open `session/prompt` request. There is no turn ID | No | `TASK_STATE_SUBMITTED`/`WORKING` on our `taskId` |
| Turn end and outcome | Yes: the `session/prompt` response `stopReason` (`end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`) | No | Yes: `COMPLETED`/`FAILED`/`CANCELED`/`REJECTED` |
| Final answer | Yes: `agent_message_chunk` updates, keyed by session only | Only if the model calls a reply tool | Yes: artifacts or messages |
| Interrupt | Yes: `session/cancel` notification, answered with `cancelled` | No | `CancelTask`, "success is not guaranteed" |
| Idle/busy | No. `session/status` is a draft and reports open, saved or unknown, not busy | No | No session-level state |
| Foreign input (the user typing mid-turn) | Not modelled | Batched with other events | Not modelled |

Sources: `docs/protocol/v1/prompt-turn.mdx` and `cancellation.mdx` (ACP), the channels reference (MCP), `docs/specification.md` §3.1.5 and §4.1.3 (A2A).

## 3. How the harnesses expose "send a prompt to a running agent"

| Harness | Surface | Send | Start / end / answer | Interrupt | Idle/busy |
| --- | --- | --- | --- | --- | --- |
| **Codex 0.170.0** | App-server over the daemon's Unix socket `$CODEX_HOME/app-server-control/app-server-control.sock`, which the TUI uses by default. WebSocket frames, one JSON-RPC message per frame ([wf302](./codex-connector-wf302.md), [evidence](./codex-connector-wf302-evidence.md)) | `turn/start`, `turn/steer`, `thread/queue/*`, with `clientUserMessageId` echoed back | `turn/started`, `turn/completed` with `TurnStatus` `completed\|interrupted\|failed\|inProgress` and the final `agentMessage` | `turn/interrupt {threadId, turnId}` | `ThreadStatus` `notLoaded\|idle\|systemError\|active{activeFlags}` plus `thread/status/changed` |
| **Claude Code 2.1.332** | A Mod running inside the session (`claude-code.d.ts`); channels (above). The Agent SDK's `resume` starts a new process from the stored transcript (`~/.claude/projects/…jsonl`); it does not attach to a live TUI ([sessions](https://code.claude.com/docs/en/agent-sdk/sessions)) | `$.prompt.submit({text})`: "a turn of its own, once the session is idle" | `turn.start` (turn ID), `turn.complete` (`answer`) | `$.turn.abort({turnId})` | Inferred from `turn.start`/`turn.complete` |
| **OpenCode 2.3.2** | HTTP API, the same server the TUI uses (`openapi.json`, "Experimental HttpApi surface") | `POST /api/session/{id}/prompt {id?, text, delivery: steer\|queue}`; the `msg_` ID is caller-chosen and idempotent ([wf294 evidence](./opencode-connector-wf294-evidence.md)) | SSE `GET /api/event`: `session.execution.started\|succeeded\|failed\|interrupted`, keyed per session, not per prompt | `POST /api/session/{id}/interrupt` | `session.status`, `GET /api/session/active` |
| **Pi 1.6.0** | `pi --mode rpc` is a child process with "strict JSONL framing" (LF), not JSON-RPC (`docs/rpc.md`); the live TUI is reached through an extension | `{"type":"prompt","message":…, "streamingBehavior":"steer"\|"followUp"}` | Event stream | `abort` | Inferred |

Codex's wire messages follow JSON-RPC but **omit the `"jsonrpc"` member**: the generated `JSONRPCRequest` schema has `id`, `method`, `params` and `trace`, and requires only `id` and `method`.

The pattern: each vendor built a private, JSON-RPC-like or JSON-lines API for its own session. Nobody uses a shared standard to drive a live session. Our Adapters translate these APIs, and that translation is what a public integration has to implement.

## 4. Publishing today's seam as v1

What exists (`packages/local-runtime/src`):

- **Framing:** UTF-8 JSON, one object per LF, decoded with a fatal decoder. Frames are capped at 1 MiB (`MAX_FRAME_BYTES`). The connection is closed on malformed or oversized frames and on more than 2 MiB of pending output (`framing.ts`, `protocol.ts:25-29`). This is already the ACP and MCP stdio framing.
- **Handshake:** `bootstrap {protocolVersion, workspaceInterfaceVersion, workspaceIdentity, role}` with a 5 s timeout. Then `harness.adapter.establish {adapterProtocolVersion: 1, requestId, manifest, attachment}`.
- **Strictness:** keys are checked with `hasOnlyKeys`. Request IDs must match `^(?:hae|had|has)_[a-z0-9]{1,48}$`.
- **Manifest:** `neoflow.harness-capabilities/1` carries `adapterImplementationIdentity`, `reviewedHostVersions` and full capability contracts: authority, `effectConstraint`, `evidenceProfile`, `artifactResultContract.maximumBytes`, `noStartTimeoutMs` and `knownLimitations` (`workspace/src/harness-interaction/contracts.ts:100-166`).
- **Message disclosure:** `bytesBase64`, `byteLength`, `characterLength`, `sha256`, plus a frozen capability snapshot.
- **Errors:** `protocol.error` has 5 codes and no message. Bootstrap rejection has 6 codes and attachment refusal has 10 or more.

**Viable**, because the framing, the same-user socket (0700 directory, 0600 socket, `runtimeLocation.ts`) and the ack-then-evidence model already match the two levels. Publishing it as is would be a mistake, though. To publish it, v1 needs:

1. **One public version number** negotiated once. It replaces `protocolVersion` + `workspaceInterfaceVersion` + `adapterProtocolVersion` + the manifest schema, and maps to them internally.
2. **Discovery in place of bootstrap identity.** `bframe endpoint --json` returns `{socket, workspace, protocolVersions}`. The integration echoes `workspace` in the first request. `runtimeCodeIdentity` and the `role` list stay private.
3. **The public manifest** `{name, version, level: "basic"|"full", canInterrupt}`. BuildFrame expands it into an internal `DirectReviewCapabilityContract` marked unverified, with its own defaults for `noStartTimeoutMs`, `maximumBytes` and the evidence profile (`basic` ⇒ start and end unavailable). Integrations never see capability snapshots, compatibility identities, `stateVersion`, effect constraints or authority.
4. **A small message vocabulary.**
   - *deliver*: BuildFrame → integration, carrying `messageId`, `text` and `sha256`. JSON strings carry UTF-8 exactly, so base64 is optional.
   - *deliver result*: `accepted` (≈ `accepted-for-observation`) or `notDelivered {reason}` (≈ `proven-not-dispatched`).
   - *full level only*: `turnStarted`, `turnEnded {outcome, answer}`, `correlationLost`, `status {idle|busy|unknown}`, and *interrupt*.
   Integration-chosen event IDs keep the idempotence that `evidenceIdentity` gives today.
5. **Looser IDs.** Accept any string up to N bytes, or BuildFrame-minted IDs only for Messages. Outside authors should not have to learn `hae_`/`had_`/`has_` prefixes.
6. **A documented error table** with stable codes and a human `message`. Each code says whether the connection survives. Unknown fields: be strict on BuildFrame's side for v1, but say so. Forward compatibility wants "ignore unknown", so this is an open question.
7. **A framing spec**: LF, UTF-8, no embedded newline, 1 MiB cap, no `stderr` meaning, connection-close semantics, and what "replaced" (`harness.adapter.released`) means.
8. **Hidden entirely:** `workspace.*` frames, other client roles, runtime replacement, the Review-batch dispatch (`harness.direct-review.dispatch`, which is not a Message), and the artifact and plan contracts.

### Would a JSON-RPC 2.0 envelope help outside authors?

Yes, for little cost:

- **Correlation and errors for free.** JSON-RPC 2.0 defines `id`-correlated request/response, notifications, and an error object `{code, message, data}`. Codes −32768 to −32000 are reserved (−32700 parse error, −32600 invalid request, −32601 method not found, −32602 invalid params), and anything else is the application's ([jsonrpc.org/specification](https://www.jsonrpc.org/specification) §5.1). Today `requestId` + `type` + a private code list do the same job by hand.
- **Libraries exist in every language**, and authors of ACP or MCP agents already speak it with the same LF framing (ACP `transports.mdx`; MCP `basic/index.mdx` and `transports/stdio.mdx`). LSP uses the same envelope with `Content-Length` headers instead ([LSP 3.17 base protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol)). LF is the simpler choice here, because the socket is ours.
- **Both directions already fit.** JSON-RPC peers can both send requests. ACP has the agent request things from the client. So BuildFrame → integration `deliver`/`interrupt` requests, with the result as the ack, and integration → BuildFrame `turnStarted`/`turnEnded` requests sit naturally in the envelope. These events are requests rather than notifications because today's evidence is acknowledged (`applied`/`refused`).
- **Costs:** a mandatory `"jsonrpc":"2.0"` member (Codex shows vendors drop it), and an internal translation layer, which the public manifest needs anyway.

A literal ACP subset was considered. The integration would act as an ACP agent on our socket, with `initialize`, `session/prompt`, `session/update` and `session/cancel`. It is not recommended for v1. ACP agents expect the client to own the session (`session/new` gets `cwd` and MCP servers, and agents send fs and permission requests to the client). It lacks the `accepted` ack, idle/busy, foreign-input and correlation-lost signals that the full level needs. And no ACP client could use it anyway, because the transport would be custom.

## 5. Recommendation

**Own methods over a JSON-RPC 2.0 envelope**, LF-delimited, on the existing same-user socket. The method names would be something like `buildframe/initialize`, `message/deliver`, `turn/started`, `turn/ended`, `turn/interrupt` and `session/status`. Reuse ACP's words where the meaning matches: a text content block, and `stopReason`-style outcomes. The contract stays ours, which keeps the Truth-Critical Distinction and the unknown outcomes we need. Authors get a familiar envelope and off-the-shelf libraries. A standard protocol can be added later as a **bridge**, for example an ACP-agent shim for harnesses that only speak ACP, once a real need appears. Neither ACP, MCP nor A2A can reach the open session today, so none of them can be the contract.

### Open questions for the owner's brief

1. Use JSON-RPC 2.0 strictly (require `"jsonrpc":"2.0"`), or accept Codex-style messages without it?
2. Who mints the Message ID: BuildFrame only, or may the integration return its own native ID (as Codex's `clientId` and OpenCode's `msg_` do)?
3. Are the full level's turn events requests (acknowledged, as today) or fire-and-forget notifications?
4. Must `basic` report anything after `accepted`, for example an optional `delivered`? Or is the outcome strictly unknown?
5. How should an integration report foreign input (the user typing mid-turn) so that BuildFrame marks the outcome unknown? Is that required at the full level?
6. Unknown fields and methods: reject (as today's `hasOnlyKeys` does) or ignore? What is the versioning rule for additive changes?
7. Does the 1 MiB frame cap also cap the answer, or is the answer truncated with a flag (today `maximumBytes` is per contract)?
8. Does `bframe endpoint --json` print the workspace identity, and is that a secret? With no token, any same-user process that runs it can attach.
9. When a second integration connects to the same checkout, is the first one released (as with `harness.adapter.released` today) or refused?
10. Should the SDK, the conformance runner (`bframe integration check`) and the skill target the JSON-RPC envelope from day one, with our Codex Adapter as the first client to prove it?
