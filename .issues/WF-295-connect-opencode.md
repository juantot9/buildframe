---
id: WF-295
title: "Connect OpenCode"
status: closed
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-292, WF-293, WF-294]
created: 2026-11-17
---

## Question

Add an OpenCode connector as one new package built on the connector kit,
within what WF-294 proves OpenCode supports.

## Direction (settled by WF-294)

WF-294 found OpenCode 2 can carry the contract with honest unknowns
([note](../docs/research/opencode-connector-wf294.md)). Run the note's seven
experiments before code.

Owner decisions (2026-11-18):

- **Prompts typed during BuildFrame's turn are held** (OpenCode `queue`
  delivery forced by a `prompt` hook) until that turn ends, not refused, so
  nothing the user types is lost and BuildFrame's outcome stays attributable.
- **OpenCode 2 only.** OpenCode 1 is not supported; its own release notes offer
  the upgrade and v1 plugins do not run in v2.

- New package `packages/opencode-adapter`, listed in the dependency firewall
  with only `@buildframe/local-runtime/harness-adapter` and the workspace
  harness types.
- It contains only host glue: manifest and verified host versions, the
  `/buildframe` command, turn start/observe/interrupt mapping.
- Release: decide with the owner how it ships (a third published package or
  inside `@buildframe/cli`) and add it to `support/manifest.json` through
  `apps/buildframe/src/supportManifest.ts`.

## Verification

- Contract tests through the kit's in-memory host.
- One live connect-and-send round trip on each verified OpenCode version.
- `pnpm verify` passes; `doctor` reports the connector.

## Experiments (2026-11-18)

Run on OpenCode 2.3.2 with a fake local model and an isolated server
([results](../docs/research/opencode-connector-wf295-experiments.md)). Exact
bytes, the Bun socket path, mid-turn commands, reload and restart all hold.
Two changes to the plan:

- A prompt held with `queue` is delivered only after BuildFrame's final step,
  so it **ends** BuildFrame's turn (reported succeeded) instead of making it
  unknown. Only steered input and background reports make it unknown.
- A reused message ID returns the original admission even with different text:
  the glue checks the admitted text on every submit.

Owner decisions (2026-11-18, after the experiments):

- **Release:** a third published package, `@buildframe/opencode`, installed
  with `opencode plugin add @buildframe/opencode@x.y.z` (as Pi's
  `@buildframe/pi`).
- **Feedback:** include a small TUI part, so a successful `/buildframe` shows a
  toast too, as with Pi and Claude.

## Resolution (2026-11-18)

- `packages/opencode-adapter`: `openCodeAdapter.ts` turns OpenCode's session
  events into connector-kit facts (BuildFrame's prompt carries a `msg_<sha256>`
  dispatch ID; a held prompt delivered after BuildFrame's final `stop` step
  ends its turn; steered input or a background report makes it unknown; the
  admitted text is checked on every submit). `plugin.ts` is the server part
  (`/buildframe`, `status`, `disconnect`, the prompt hook that holds typed
  prompts during BuildFrame's turn), `tui.ts` shows its statuses as toasts
  over the plugin's RPC event. Nothing is imported from OpenCode: both parts
  are plain objects typed by shape (`openCodeHost.ts`). Workspace write only,
  like Claude Code.
- Released as `@buildframe/opencode` (server `.` and `./tui`), bundled and
  checked by `pnpm release:assemble`; `support/manifest.json`, doctor
  (`opencode --version`) and the README list it.
- Verified: 12 contract tests; a live round trip on OpenCode 2.3.2 with the
  assembled package, a real BuildFrame and a fake local model (connect, exact
  delivery, answered), and a second Message during which a typed `steer` prompt
  was held as `queue` and BuildFrame's Message still settled as answered;
  `pnpm verify` passes (602 tests).
- Not done: a read-only mode (Pi only today), and publishing (WF-213's release
  process).
