# Harness "connected" indicator: captured frames, 2026-11-25

What each harness shows today about its BuildFrame connection. Captured with
`rex capture` (text and HTML for colours) from the installed builds on the
owner's machine: BuildFrame `9404b1d`, Pi 1.6.0, Claude Code 2.1.332,
OpenCode 2.3.2 (plugin loaded from `~/buildframe-dev-9404b1d/opencode` via a
project-local `opencode.json` / `tui.json`, since it isn't installed
globally). Scratch repo with one changed file; isolated `XDG_STATE_HOME`.

Sequence: open BuildFrame's Review, then `/buildframe` in Pi, then Claude
Code, then OpenCode, then quit BuildFrame. Only the rows that carry
BuildFrame state are shown; Pi's and Claude Code's other footer rows are
trimmed.

## 1. Before attaching

BuildFrame header:

```
  Current Review · ◆ ━━━━ ○ ━━━━  now                               ○ No agent
```

Pi, footer (status row, always present once the extension loads):

```
$0.000 (sub) 0.0%/500k (auto)                   (openai-codex) gpt-6.2-sol • max
BuildFrame: /buildframe to attach this session
```

Claude Code: nothing about BuildFrame until `/buildframe` runs. The command
menu lists it as "Attach this Claude session to the BuildFrame Reviewing
application".

OpenCode: nothing. The command menu lists `/buildframe` as "Connect this
session to BuildFrame".

## 2. Pi attached

Pi transcript line, then the status row:

```
 BuildFrame Review attached (workspace write).
...
BuildFrame Review attached
```

BuildFrame header: `● Pi` (green).

## 3. Claude Code attached

Status row under the prompt, in the warning colour (`rgb(255,193,7)`) with a
warning glyph:

```
  ⚠ buildframe: BuildFrame: BuildFrame Review attached
  ⏵⏵ auto mode on (shift+tab to cycle)
```

BuildFrame header: `● Claude Code`. Pi was displaced (see 5).

## 4. OpenCode attached

A toast at the top right, gone after a few seconds:

```
┃  BuildFrame                          x  ┃
┃                                         ┃
┃  BuildFrame connected to this session.  ┃
```

After it fades, OpenCode shows nothing about BuildFrame. Its footer row is
`<path>:main  shift+tab agents  ctrl+p commands`.

BuildFrame header: `● OpenCode`.

## 5. Displaced sessions (one connection per repository)

Each new `/buildframe` takes the repository's connection; the older sessions
say so:

```
Pi:           BuildFrame: disconnected (another session connected)
Claude Code:  ⚠ buildframe: BuildFrame: another session connected to this repository
```

The BuildFrame header shows only the current harness, never `+N`, because only
one is connected at a time.

## 6. BuildFrame closed

Quitting the BuildFrame window changes nothing in any harness after 8 s: Pi
and Claude Code keep their last status (here the displaced text), and
OpenCode shows nothing. The background process outlives the window, so the
OpenCode session is presumably still connected; no harness shows whether a
BuildFrame window is open.

## Observations

- **Three different words for one state:** "attached" (Pi, Claude Code),
  "connected" (OpenCode, displaced text), and in BuildFrame only the
  harness name with `●`.
- **Claude Code reads as a problem:** the attached state shows `⚠` in amber,
  and the name appears three times ("buildframe: BuildFrame: BuildFrame
  Review attached"): the Mod's id, the status prefix, and the text.
- **OpenCode has no persistent indicator:** the only signal is a toast.
- **Pi is persistent but plain:** text only, no glyph or colour; the idle
  row ("/buildframe to attach this session") is always on, also in repos
  where BuildFrame is never used.
- **Access level** (workspace write vs read-only) appears only in Pi's
  transcript line, not in any persistent row.
- **Nothing reflects BuildFrame's window** being open or closed, or the
  Review in progress (e.g. a Message waiting).

Raw captures (text and HTML) were kept in the session scratchpad
(`frames/*-{0-before,1-attached,1-toast,2-after-opencode,3-bframe-closed}`),
not in the repo.
