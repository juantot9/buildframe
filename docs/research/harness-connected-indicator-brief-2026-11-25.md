# Brief: show in each harness that BuildFrame is connected (WF-321)

Sources: [research note](harness-connected-indicator-2026-11-25.md) (what each
harness lets an extension show, from primary sources),
[captured frames](harness-connected-indicator-frames-2026-11-25.md) (what the
installed builds show today), and for Codex
[codex-connector-wf302](codex-connector-wf302.md) plus the Codex source at
`rust-v0.170.0`. Nothing is built until the questions are answered.

## The question the indicator answers

From inside a harness, the person isn't asking "is BuildFrame connected" in
general. They're asking **"will a Message from BuildFrame land in this
session?"** A repository has one connection, and each `/buildframe` takes it
from the session before. So the state that matters most is the one where
another session took it, and it should be the loud one. Connected is the
normal case and should be quiet.

Today it is the other way round in Claude Code: connected shows as an amber
`⚠` warning.

## What each harness shows today

| Harness | Connected | Problem |
| --- | --- | --- |
| Pi 1.6.0 | footer status row `BuildFrame Review attached` | plain text, no glyph or colour; the idle hint `BuildFrame: /buildframe to attach this session` shows in every repo |
| Claude Code 2.1.332 | `⚠ buildframe: BuildFrame: BuildFrame Review attached`, amber | reads as a warning; Claude draws `$.ui.status` as a notice with the Mod id in front, so the name appears three times |
| OpenCode 2.3.2 | 5 s toast `BuildFrame connected to this session.` | nothing stays after the toast |
| Codex 0.170.0 | the one-line reply of `!buildframe`, in the conversation | nothing persistent; a takeover is never shown |

Also: three words for one state ("attached", "connected", a bare `●`); the
access level shows only once, in Pi's transcript; no harness changes when the
BuildFrame window closes.

## Principles

1. **Quiet when right, loud when wrong.** Connected is a small light.
   Reconnecting, refused and taken over say what happened and end with what
   to do, as DESIGN.md asks of warnings.
2. **Follow the host inside the host.** The indicator lives in another tool's
   interface, so it uses that tool's success, warning and muted colours, not
   BuildFrame's Sage hex. The glyph is the same everywhere because the hosts
   already agree: Pi's examples use `●`, OpenCode's MCP rows use a coloured
   `•`, and Claude Code's `BesidePrompt` cell is meant "for a status glyph".
3. **Glyph, word and colour.** The word carries the state when colour is off
   (DESIGN.md: never colour alone): `●` connected, `○` not.
4. **Never claim more than the evidence.** Reconnecting is never green.
5. **Two surfaces where the host offers them:** a quiet light that may hide,
   and a persistent line for problems that must not hide.

## States

All four connectors already share `ConnectorStatus`
(`packages/local-runtime/src/connector/contracts.ts`): `connected`,
`retrying`, `refused`, `replaced`, `cancelled`. One pure mapping from it to
glyph, word and tone, beside that type, gives every harness the same states;
each adapter only places the result.

| State | Light | Problem line |
| --- | --- | --- |
| `connected` | `● BuildFrame` (success) | none |
| `connected`, read-only | `● BuildFrame read-only` (success) | none |
| `retrying` | `○ BuildFrame reconnecting…` (warning) | `reconnecting…` and the cause, e.g. `BuildFrame isn’t running` |
| `refused` | `○ BuildFrame` (error) | the reason, e.g. `workspace unavailable` |
| `replaced` | `○ BuildFrame` (warning) | `moved to another session · /buildframe to take it back` |
| `cancelled` (disconnected here) | nothing | nothing |
| never connected | see Q2 | nothing |

## Where it goes

| Harness | Light | Problem line | Transient |
| --- | --- | --- | --- |
| Pi | `ctx.ui.setStatus('buildframe', …)` with `theme.fg` colour: the shared footer row it uses now. Keys sort, so `buildframe` comes early and survives truncation | the same row (Pi has one row per key), plus the existing one-time `notify` warning on `replaced` | `notify` for command answers |
| Claude Code | `ui.render` on `BesidePrompt`: a coloured `● BuildFrame` cell right of the prompt. Hides while Claude asks a question or a picker is open | `$.ui.status(text)`, persistent and drawn amber with `⚠ buildframe:` in front by Claude, which fits a problem; our text drops its own `BuildFrame:` | `$.ui.toast` for command answers |
| OpenCode | `ui.slot({ append: 'prompt.footer.status', render })`, reactive. Not `home.footer.status` (home screen only) or `sidebar.content` (wide terminals only) | the same slot, with the problem text | toast for command answers, as now |
| Codex | **none possible** (below) | none | `!buildframe` and `!buildframe status` replies |

## Codex

Codex 0.170.0 gives an outside process no place to put a light:

- No extension UI and no custom `/` commands. BuildFrame connects through the
  app-server control socket, triggered by `!buildframe`
  ([wf302](codex-connector-wf302.md)).
- The status line is a closed list of built-in items (`StatusLineItem` in
  `codex-rs/tui/src/bottom_pane/status_line_setup.rs`); none runs a command or
  shows outside text, so the person can't add BuildFrame to it either.
- The only app-server methods that would put our text in the TUI are
  `thread/name/set` and `thread/goal/set`. Both change the person's
  conversation, and the goal is read by the model. Ruled out.
- Hooks run only on events and need a Codex plugin installed: at best a
  one-off message.

So Codex relies on `!buildframe status` on demand and on BuildFrame's own
header. Its gap is a takeover: a Codex session that loses the repository is
never told, and the header's `● Codex` doesn't say which Codex session holds
it. The `!buildframe status` reply should lead with the state (`connected`,
`another session has it`, `not connected`), then what to do. It stays one
line, because it enters the conversation the model sees.

## BuildFrame's side

The header shows `● <harness>`; with two sessions of one harness in a
repository, it can't say which one holds the connection. When a session
connects, BuildFrame's status line could say so once, naming it:
`Connected to Codex · <thread name or short id>` (Q7). The header itself
stays as it is.

## Wording

"Connected" in all interface text; "Attached Harness" stays the domain term,
in code. The `/buildframe` descriptions change to match OpenCode's
"Connect this session to BuildFrame" (Pi's says "attach", Claude Code's says
"Attach this Claude session to the BuildFrame Reviewing application"). This
is a copy change, so it needs approval (Q1).

## Questions

1. **Word.** "Connected" everywhere, including the `/buildframe` command
   descriptions? *Recommended: yes.*
2. **Pi's idle hint.** Show nothing until `/buildframe`, or show
   `○ BuildFrame · /buildframe to connect` only when BuildFrame is running for
   this repository? The second is the only discovery Pi offers and is
   feasible (`bframe doctor` already tells whether BuildFrame is running), but
   it costs a check at session start and goes stale if BuildFrame opens later
   unless it re-checks. *Recommended: nothing, for now.*
3. **Claude Code light.** Accept `BesidePrompt` hiding during questions and
   being dropped first on narrow terminals, or use an `AbovePrompt` band row
   (always a full row, collapsible)? *Recommended: `BesidePrompt`; problems
   stay visible in the status line.*
4. **Access level.** Show `read-only` only, since workspace write is the
   default and the harness's own permissions still apply? *Recommended: yes.*
5. **Review activity.** Connection only, or also "a Message is running"? The
   harness already shows its turn, and the Message is in its conversation.
   *Recommended: connection only.*
6. **BuildFrame window closed.** The background process stays connected.
   Show anything different? *Recommended: no.*
7. **Name the session on connect.** BuildFrame's status line says once which
   session connected (harness and thread name or short id)? This is the only
   way to tell two sessions of one harness apart, and Codex's only takeover
   signal. *Recommended: yes.*

## Out of scope

The header's layout, the one-connection-per-repository rule, and Codex hooks
or plugins.

## Decisions, 2026-11-25

The owner accepted every recommendation above, then a second round:

- **Pi before `/buildframe`:** nothing; the always-on hint goes.
- **Claude Code:** the light is the `BesidePrompt` cell; problems use the
  status line, empty while connected. A Claude Code without `BesidePrompt`
  keeps the status line for the connected state too.
- **Session names:** the harness's own name, taken once at connect (Pi's
  session name when set, OpenCode's title, Codex's thread name if the field
  exists), else the short id. Claude Code keeps the short id.
- **Wording:**

  | State | Light | Problem text |
  | --- | --- | --- |
  | connected | `● BuildFrame` (success) | none |
  | read-only | `● BuildFrame read-only` | none |
  | waiting for BuildFrame to open | `○ BuildFrame not open yet · connects when it opens` (warning) | same, after the prefix |
  | reconnecting | `○ BuildFrame reconnecting…` (warning) | `reconnecting…` |
  | refused | `○ BuildFrame couldn’t connect: <reason>` (error) | `couldn’t connect: <reason>` |
  | taken over | `○ BuildFrame moved to another session · /buildframe to take it back` (warning) | same |

  `/buildframe` descriptions: `Connect this session to BuildFrame`. Codex
  `!buildframe status`: `BuildFrame: connected`, `BuildFrame: another session
  has it · !buildframe to take it back`, `BuildFrame: not connected ·
  !buildframe to connect`. BuildFrame's status line, once when a different
  session connects: `Connected to <harness> · <name or session id>`.
  "Waiting for BuildFrame to open" was not in the approved table; it is the
  first-attach case of `retrying`, worded like Pi's existing notice so it
  never reads as a reconnect.
- **Delivery:** six commits on `main` under WF-321 (mapping, Pi, Claude Code,
  OpenCode, Codex, session names), each with `pnpm verify` and Rex captures;
  then the last one is installed. The global OpenCode config is left alone.
