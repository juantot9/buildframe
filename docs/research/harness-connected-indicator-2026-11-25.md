# Showing "connected to an external tool" inside Pi, Claude Code and OpenCode

## Summary — 2026-11-25

All three harnesses let an extension pin a persistent, push-updated indicator,
but in different places and with different freedom:

| | Persistent, keyed, shared row | Richer persistent surface | Transient |
| --- | --- | --- | --- |
| **Pi 1.6.0** | `ctx.ui.setStatus(key, text)`: one footer line, all extensions' texts joined by a space, sorted by key | `setWidget` (≤10 lines above/below the editor), `setFooter`/`setHeader` (replace the built-in) | `notify()` writes a line **into the chat**, not a toast |
| **Claude Code 2.1.332 (Mod API)** | `$.ui.status(text)`: one line per plugin under the prompt | `ui.render` hooks on `BesidePrompt` (a cell right of the prompt), `AbovePrompt` (a band row), `StatusLine` (rewrite the status-line row); `$.ui.open` panes | `$.ui.toast(text)` (4 s), `$.ui.notify` (OS notification) |
| **OpenCode 2.3.2 (TUI plugin)** | none keyed; slots instead: `prompt.footer.status`, `home.footer.status`, `sidebar.content`, `sidebar.footer`, `session.composer.top` | `replace` any slot; `session.panel` | `ui.toast.show(...)` (5 s, one at a time) |

Every harness shows its **own** MCP state as a coloured dot/glyph plus a short
word (Connected / Connecting / failed / needs sign-in) in a list view, and only
raises a footer/toast-level notice when something is wrong. None shows a
permanent "MCP connected" badge on the main input line except OpenCode's home
screen (`⊙ N MCP`).

## Versions examined

| Harness | Version | Where read |
| --- | --- | --- |
| Pi | `pi --version` → 1.6.0, `@earendil-works/pi-coding-agent` 1.6.0 | `~/Library/pnpm/global/v11/6abe-…/node_modules/@earendil-works/pi-coding-agent/` (below: `PI/`) |
| Claude Code | `~/.local/bin/claude --version` → 2.1.332, the build on `PATH` (an older 2.1.323 npm copy sits under nvm). The bundled `plugin-authoring` skill matches it | Mod API types: `/private/tmp/claude-502/bundled-skills/2.1.332/…/plugin-authoring/types/claude-code.d.ts` (below: `CC.d.ts`) and `reference.md`; docs at code.claude.com (fetched 2026-11-25) |
| OpenCode | `opencode --version` → 2.3.2 (Bun binary `~/.opencode/bin/opencode`) | Source at tag `v2.3.2` (`c0ad18b4`) of [anomalyco/opencode](https://github.com/anomalyco/opencode/tree/v2.3.2) via `gh api`. `~/.opencode/node_modules/@opencode-ai/plugin` is a stale **1.17.14** (v1) and was not used |

Nothing was run interactively; every claim is from source/docs. "Inferred" marks
anything not stated there. The Claude Mod API facts are from 2.1.332, the installed
build.

## Pi 1.6.0

**API** (`PI/dist/core/extensions/types.d.ts`, `ExtensionUIContext`):

- `setStatus(key: string, text: string | undefined): void` — "Set status text in the footer/status bar. Pass undefined to clear." Docs: "Status in footer (persistent until cleared)" (`PI/docs/extensions.md` §Widgets, Status, and Footer).
- `setWidget(key, content: string[] | ((tui, theme) => Component) | undefined, { placement?: "aboveEditor" | "belowEditor" })`, default above.
- `setFooter(factory | undefined)` — replaces the built-in footer entirely; the factory gets `footerData.getExtensionStatuses()` so a custom footer can still show other extensions' statuses (`PI/dist/core/footer-data-provider.d.ts`).
- `setHeader(factory | undefined)` (startup header above chat), `setTitle(title)` (terminal title), `setWorkingMessage`/`setWorkingIndicator` (only while streaming), `custom(...)` (focused component/overlay).
- `notify(message, type?: "info" | "warning" | "error")`.

**Rendering and limits** (`PI/dist/modes/interactive/components/footer.js` 10–16, 253–260):

- All statuses share **one footer line**: entries sorted by **key** (`a.localeCompare(b)`), newlines/tabs collapsed to spaces, joined with `" "`, then `truncateToWidth(line, width, dim "...")`. No per-key width cap; a long neighbour can push yours off the end.
- Colour: the text is drawn as given, so ANSI from `ctx.ui.theme.fg("success", "✓")` etc. renders; the official example `PI/examples/extensions/status-line.ts` uses `theme.fg("accent","●")`, `theme.fg("success","✓")`, `theme.fg("dim", …)`.
- Widgets: string arrays are cut at `MAX_WIDGET_LINES = 10` with "... (widget truncated)"; widgets render in Map insertion order (first `setWidget` of a key first) (`interactive-mode.js` 2013–2047, 2091, 2095–2116).

**`notify` is not a toast** (`interactive-mode.js` 2447–2456, 3267–3285, 3964–3973): `error` and `warning` append `Error: …`/`Warning: …` lines to the chat container; `info` appends a dim line, and consecutive info lines replace the previous one in place. They stay in scrollback.

**Updates and teardown**: push only (call `setStatus` whenever state changes; no polling by Pi). On reload, session switch or replacement, `resetExtensionUI()` clears every extension's widgets, footer/header overrides and all statuses (`interactive-mode.js` 2059–2089). An extension that loses its own external connection must clear or reword its status itself; Pi does not know.

**RPC/print modes**: `setStatus`, `setWidget`, `notify` become fire-and-forget `extension_ui_request` events that the client may ignore (`PI/docs/rpc-extension-ui.md` l.8); `ctx.hasUI` is false in print/JSON mode (`extensions.md` l.1177).

**Pi's own MCP precedent** (built-in extension `PI/dist/extensions/mcp/index.js`): no footer status. `describeState()` (l.141–162) words: `starting`, `connecting…`, `connected · N tools[ · resources]`, `needs sign-in`, `failed: <first line>`, `disabled`. After startup it calls `notify("MCP servers need attention:\n … Run /mcp to fix.", "warning")` once (l.538; docs `PI/docs/mcp.md` l.98: "reports … once after startup"). Status lives in `/mcp`. Selected items use `✓`.

## Claude Code (Mod API 2.1.332, settings, hooks)

**Mod surfaces** (`CC.d.ts`):

- `$.ui.status(text: string | undefined): void` (l.3190–3201): "Pins `text` as this plugin's status line under the prompt, beside the engine's own pinned notices, until the next call replaces it. One per plugin; `undefined` removes it." First 2,000 characters drawn (10,000 remotely). Raised as a `ui.status` event (`{ text }`, l.9317), so another plugin's hook can see it (that it can rewrite or drop it is inferred from the general hook chain). Order between plugins' status lines: **not documented**. Colour: plain text; the doc says only the `StatusLine` command output "alone may hold escape sequences" (l.14120–14126), so ANSI in `$.ui.status` is inferred not to render.
- `$.ui.toast(text, { timeoutMs? })` (l.3138–3154): a box under the plugin's name on a stack at the transcript's top right, default 4,000 ms; click dismisses, hover holds. In scrollback mode it is one line on the notification bar. "A toast takes the place of its plugin's own toast only, never another plugin's"; at most 50 waiting (`reference.md`).
- `$.ui.notify(text, { title? })` → OS notification via the user's `preferredNotifChannel` (l.3155–3176).
- `ui.render` on `{ component: 'BesidePrompt' }` (l.14286–14350): "The room to the right of the prompt, for a small thing: a meter, a status glyph". One cell per plugin; `maxColumns` for all cells together with one blank between; cells that do not fit are dropped **from the last**; order via `BesidePromptList` (`plugins` in chain order; hooks may hide/reorder; "an organization's mod wins by the chain's order"). Elements: `Box`, `Text`, `Client`. Hidden while anything asks the person something, while a picker/help is open, the band collapsed, or a screen reader on. Terminal and desktop only.
- `ui.render` on `{ component: 'AbovePrompt' }` (l.14150–14235): one row per plugin in the band above the prompt; `AbovePromptList` stacks/reorders; yields to surveys (`hasSurvey`); the person can collapse it (ctrl+x ctrl+a). `bodyColumns` = width less 5. All surfaces.
- `ui.render` on `{ component: 'StatusLine' }` (l.14100–14148): rewrites the status-line row whether or not a `statusLine` command is set; `maxRows` ≤ 5; terminal only. One instance, so mods sharing it compose by chaining `next(e)`.
- Panes: `$.ui.open({ id, title, focus? })`; unasked panes seat only from 144 columns (110 once asked) (l.3215–3230).
- Push model: any hook may call `$.ui.status`/`toast`; `$.clock.every`/`after` and atoms (`update($, atom, fn)` redraws readers) drive redraws (skill table; `reference.md`).
- Unload: panes are closed with `kind: 'unload'` (l.9794–9811); at a hot reload `$.clock.every` stops. What happens to a plugin's `$.ui.status` line when the plugin unloads is **not documented** (inferred: removed with the plugin; unverified).

**`statusLine` setting** ([code.claude.com/docs/en/statusline](https://code.claude.com/docs/en/statusline)): `{ "statusLine": { "type": "command", "command": "...", "padding": 0, "refreshInterval": N≥1 } }`. One command per settings file, owned by the user, not an extension. Runs at session start, then on new assistant message, `/compact`, permission-mode or vim-mode change, command change, and optional `refreshInterval`; debounced 300 ms; an in-flight run is cancelled by a new trigger. Output: each line a row, ANSI colours and OSC 8 links; keep lines ≤ `COLUMNS − 4` or they are cut with `…`; emoji count 2 columns. Non-zero exit or no output blanks it. Can go stale while the session is idle unless `refreshInterval` is set. "System notifications like MCP server errors … display on the right side of the row"; if they do not fit they move to a row below.

**Hooks** ([code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)): `systemMessage` = "Warning message shown to the user" (per event, can be discarded or routed elsewhere); `statusMessage` = spinner text only while the hook runs; `terminalSequence` can set the window title (OSC 0/1/2) in interactive sessions. No hook output gives a persistent in-UI indicator.

**Claude Code's own MCP precedent** ([code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)): `claude mcp list` uses `✔ Connected`, `! Needs authentication`, `✘ Failed to connect`, `⏸ Pending approval`, `⊘ Disabled for this project`. Drops produce the notice `MCP server "<name>" disconnected · still retrying · open /mcp to reconnect now`. Persistent state lives in `/mcp`; the footer only shows errors (right of the status-line row, per the statusline doc).

## OpenCode 2.3.2 (TUI plugin)

**API** (`packages/plugin/src/tui/context.ts` @v2.3.2; docs `services/site/src/docs/content/build/plugins/cli.mdx`):

- A TUI part is `{ id, setup(context) → cleanup? }` (`packages/plugin/src/tui/plugin.ts`). The server part has no UI; it must reach the TUI part (BuildFrame uses an RPC event).
- `context.ui.toast.show({ title?, message, variant?: "info"|"success"|"warning"|"error", duration?, sessionID? })`.
- `context.ui.slot(claim) → () => void` with exactly one of `prepend | append | before | after | replace` and a reactive `render(input) → JSX`. Slot paths (`SlotMap`, l.191–202): `app`, `home.footer`, `home.footer.status`, `prompt.footer`, `prompt.footer.status`, `prompt.footer.file`, `session.composer.top`, `session.panel`, `sidebar.content`, `sidebar.footer`.
- Sharing (context.ts l.206–222): "Several claims at one anchor coexist in plugin enable order"; for `replace`, "the last-enabled claim wins; an ancestor replacement beats a descendant one"; suppressed claims are recorded, not dropped. A claim on a path the host stops publishing degrades to the nearest ancestor (additive) or is suppressed (replace).
- `home.footer.status`: "Status contributions appear after OpenCode's health indicators and before the version" (cli.mdx §Slots). It is home-screen only.
- `prompt.footer.status` wraps the session prompt's left footer content (`packages/tui/src/component/prompt/index.tsx` l.1909–1976); `prompt.footer.file` sits beside it. Width is whatever flexbox leaves; the host's own footer content uses `wrapMode="none"`/`truncate` and drops items below set widths (`feature-plugins/prompt/footer.tsx` `promptFooterLayout`). No documented per-plugin width budget.
- Colours: full theme tokens (`context.theme.text.feedback.success.base` etc.) and any OpenTUI JSX.
- Updates: push/reactive. Renders are Solid computations; a plugin updates a signal and the slot redraws. Data APIs (`context.data…`) are reactive too.
- Teardown: claims and keymap layers are removed when "the plugin is disabled, reloaded, or fails setup" or its owning component is disposed (cli.mdx l.306–309, l.590). An external-tool disconnect is the plugin's job to render.

**Toast behaviour** (`packages/tui/src/ui/toast.tsx` l.51, 130–175): default duration 5,000 ms; max width `min(60, terminal − 6)`; **one toast at a time**. A new toast replaces the visible one unless the toast is paused (hover) or a queue exists, in which case it is queued.

**OpenCode's own MCP precedent** (both are built-in *plugins* using the same slot API):

- `feature-plugins/sidebar/mcp.tsx`: appends to `sidebar.content`; per server a `•` coloured success/error/warning/muted, bold name, then `Connected` / `Connecting` / `Error` / `Disabled` / `Sign in`; collapsed header `MCP (N active, M errors)`.
- `feature-plugins/home/footer.tsx`: home footer shows `⊙ N MCP` (green if any connected, muted otherwise) or red `⊙ N MCP failed`, plus `/mcps` hint at width ≥ 64; `⊙ N plugins failed` likewise.

## What BuildFrame uses today

- **Pi** (`packages/pi-adapter/src/extension.ts`): `ctx.ui.setStatus('buildframe', …)` for every connector state (connected, retrying, refused, replaced), `'BuildFrame: /buildframe to attach this session'` at `session_start`, `undefined` at `session_shutdown`; `ctx.ui.notify` for command answers and the "another session connected" warning. Plain text, no theme colours or glyph; key `buildframe` sorts among other keys alphabetically.
- **Claude Code** (`packages/claude-adapter/plugin/hooks/register.js`, protocol in `src/direct/modProtocol.ts`): the helper sends `{ type: 'status', label }` / `{ type: 'detach', label }`; the Mod calls `$.ui.status('BuildFrame: ' + label)`, clears with `$.ui.status(undefined)` on detach/session end, sets `'BuildFrame: helper stopped; /buildframe to attach again'` when polling fails, and uses `$.ui.toast` for command answers. No band, beside-prompt cell or status-line hook.
- **OpenCode** (`packages/opencode-adapter/src/tui.ts`): TUI part listens for the server part's `status` RPC event and calls `context.ui.toast.show({ title: 'BuildFrame', message, variant })`. **No persistent indicator**; once the 5 s toast goes, nothing shows the connection.

## Options per harness (facts and trade-offs)

**Pi**
- `setStatus` (current): persistent, shared one-line footer; sorted by key; cut at terminal width; ANSI via `ctx.ui.theme.fg` allowed. Cheapest; may be truncated by neighbours.
- `setWidget(key, lines, { placement })`: own rows above/below the editor (≤10 lines); costs vertical space.
- `setFooter`: full control, but replaces the built-in footer for everyone (must re-render other statuses from `footerData`); only one extension can own it at a time (last call wins, inferred from the single `customFooter` field).

**Claude Code**
- `$.ui.status` (current): one line per plugin, plain text, survives until replaced; inter-plugin order undocumented.
- `BesidePrompt` cell: purpose-built "status glyph" spot, colourable `Text`; disappears during questions/pickers and narrow layouts (dropped from the last), terminal and desktop only.
- `AbovePrompt` row: more room, every surface; yields to surveys and can be collapsed by the person.
- `StatusLine` render hook: shares the one status-line row with the user's own command; terminal only. The `statusLine` *setting* belongs to the user and is not an extension surface.
- `$.ui.toast`/`notify` and hook `systemMessage`: transient only.

**OpenCode**
- Toast (current): transient, single-slot, can be replaced by any other toast.
- `prompt.footer.status` (`append`): persistent, beside the prompt in each session; coexists with other plugins in enable order; width not guaranteed; a sibling plugin's `replace` would hide it (recorded as suppressed).
- `sidebar.content` / `sidebar.footer`: matches OpenCode's own MCP list style (`•` + word); only visible when the sidebar is shown.
- `home.footer.status`: designed for status, after OpenCode's health indicators, but home screen only.
- `session.composer.top`: a row above the composer; more prominent, takes vertical space.

## Conventions seen (precedent for glyph, colour, wording)

- Glyphs: `●`/`✓` (Pi example), `✔ ! ✘ ⏸ ⊘` (Claude `mcp list`), `•`/`⊙` (OpenCode). Colours map to success/warning/error/muted theme tokens in Pi and OpenCode.
- Wording: short state words (`connected`, `connecting…`, `needs sign-in`, `failed`), often with a pointer to the fix command (`/mcp`, `/mcps`, `Run /mcp to fix`).
- Pattern: steady state is quiet or in a list view; problems are what reach the footer/toast. OpenCode's home footer is the one place a "connected count" is always shown.
