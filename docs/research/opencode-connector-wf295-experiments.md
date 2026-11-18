# WF-295: OpenCode connector experiments

Live runs of the experiments listed in
[the WF-294 note](./opencode-connector-wf294.md#open-questions-and-experiments),
on 2026-11-18.

## Setup

- OpenCode **2.3.2** (`opencode --version`), Bun **1.4.4** inside the server
  (`globalThis.Bun.version` read by the plugin), macOS, uid 502.
- A private `opencode serve` on a loopback port, with every XDG directory in a
  scratch folder: no real config, credentials, sessions or background service
  were touched.
- A fake OpenAI-compatible model (`@opencode/ai/providers/openai-compatible`
  pointed at a local Node server). It records each request body. Text with
  `SLOW` streams for about 3 s, `FAIL` returns HTTP 500, and `TOOL` asks for one
  `glob` call before answering.
- A probe plugin in the throwaway repository's `.opencode/plugins/`. It logs
  every `session.*` event with its durable `seq`, runs a `prompt` hook, and
  registers `/probe` (send with a chosen ID, interrupt, switch hook policy,
  socket test, module import).
- Experiments 5 (foreign-input policy) and 7 (OpenCode 1) were already decided
  by the owner: hold typed prompts with `queue`; OpenCode 2 only.

## Results

| # | Experiment | Result |
| --- | --- | --- |
| 1 | Byte fixture | **Exact.** Leading spaces, CRLF, combining accents, emoji and a tab were identical in the hook, the admission, `inbox.enqueued`, and the request the model received. |
| 1b | Retry by ID | Same ID and text: original admission, no hook rerun, no model call. **Same ID, different text after delivery: also the original admission, no conflict.** Each retry emits an empty `execution.started`/`succeeded` pair. |
| 2 | Event order | Matches WF-294, plus one refinement (below). Steer, queue, API interrupt, plugin interrupt, provider failure, a synthetic `steer` report, and a tool call with queued or steered input in its middle were each recorded. |
| 3 | Socket under Bun | **Works.** `lstat(..., { bigint: true })`, `process.getuid()` and a Unix-socket round trip all succeed in the plugin. BuildFrame's `local-runtime/src/harnessAdapter.ts` imports with its whole graph (no `effect` conflict). `XDG_RUNTIME_DIR` is unset in the server on macOS, so BuildFrame falls back to `/tmp/buildframe-<uid>` on both sides. |
| 4 | Command UX | Commands run **while the session is busy** (an interrupt and a policy change both ran mid-turn). A thrown error reaches API clients as `CommandExecutionError` with the message, and the TUI shows a toast: "Failed to run command" and the message (on a brand-new session the title reads "Failed to set up session"), keeping the typed command. A successful command shows **nothing**. |
| 6a | Plugin reload mid-turn | The turn continues. Cleanup runs and a fresh instance starts about 1 ms later and sees the remaining events, but has no memory of the turn: report **unknown**. |
| 6b | Server stop mid-turn | Cleanup runs before any terminal event reaches the plugin. The assistant message is stored with `finish: "error"`, `error.type: "aborted"`. After restart nothing resumes: empty inbox, no active session. Report **unknown**. |

### Event order (experiment 2)

Every case starts with `inbox.enqueued(own)`, `execution.started`,
`inbox.delivered(own)`. Then:

| Case | What follows |
| --- | --- |
| Idle prompt | `step.started` … `step.ended{stop}`, `execution.succeeded` |
| User steer mid-turn | `inbox.enqueued(foreign, steer)`, `step.ended{stop}`, **`inbox.delivered(foreign)`**, another step, `execution.succeeded` |
| User queue mid-turn | `inbox.enqueued(foreign, queue)`, `step.ended{stop}`, **`inbox.delivered(foreign)`**, another step, `execution.succeeded` |
| Steer during a tool call | the tool step ends `{tool-calls}`, then **`inbox.delivered(foreign)`** before BuildFrame's final step |
| Queue during a tool call | the tool step, BuildFrame's final step `{stop}`, then **`inbox.delivered(foreign)`** |
| API or plugin interrupt | `step.failed{aborted}`, `execution.interrupted{reason:"user"}` |
| Provider HTTP 500 | `retry.scheduled` about 8 times over about 70 s, then `step.failed`, `execution.failed{error}` |
| Synthetic `steer` report | admitted as `type: "synthetic", delivery: "steer"`; delivered at the next step boundary like a user steer |

A prompt hook that sets `event.delivery = "queue"` turns a `steer` prompt into
`inbox.enqueued{delivery:"queue"}`, and that prompt then waits until BuildFrame's
final step has ended.

## What changes for the connector

1. **A held prompt ends BuildFrame's turn instead of spoiling it.** Queued
   input is drained only at the idle boundary, after the model's last step ends
   with `stop`, never between tool calls. So when a foreign item whose
   `inbox.enqueued` said `delivery: "queue"` is delivered after BuildFrame's
   `step.ended{stop}`, BuildFrame's turn has finished: report it **succeeded**,
   with the text of the steps since `inbox.delivered(own)`. This needs no kit
   change: the glue emits `turn-ended` (own, succeeded) then `turn-started`
   (foreign). Steered input and synthetic `steer` reports stay a lost turn
   (`input` that joins `this-turn`).
2. **Check the admitted text on every submit.** A reused ID returns the
   original admission even when the text differs, so the glue compares
   `admitted.payload.text` with the exact bytes it sent and reports a mismatch
   as not delivered exactly.
3. **Retries are not a second delivery.** A retried submit produces an empty
   execution with no `inbox.delivered`, which the "own delivered" anchor
   already ignores.
4. **Provider failures are slow to end.** Retries can keep BuildFrame's turn
   running for over a minute before `execution.failed`. Nothing needs changing,
   but the Message stays in flight for that long.
5. **`/buildframe` feedback.** Throwing gives a clear failure toast. Confirming
   success (for example "Connected to BuildFrame") needs a TUI part, because the
   server part shows nothing on success.
6. **Reload and restart both report unknown.** Plugin cleanup closes the
   connector session, which the kit already reports as lost.

## Not covered

- A real background subagent report (a synthetic `steer` input stood in for it,
  which is how WF-294 found subagents report).
- Context-overflow compaction.
- The shared background service (`opencode service`): the runs used a private
  `serve`, so the inherited-environment question is answered for macOS defaults
  only.
