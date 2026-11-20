---
id: WF-320
title: "Ctrl+V and right-click do not paste in conhost"
status: closed
labels:
  - wayfinder:task
assignee: null
blocked_by: []
created: 2026-11-20
---

## Finding

Found by hand in conhost on Windows 11 while checking the TUI
([WF-314](./WF-314-check-the-tui-in-windows-terminals.md)). Text cannot be
pasted into the composer or any other BuildFrame input in conhost. A key
logger that turns on what BuildFrame turns on (SGR mouse reporting with
movement, bracketed paste) shows why:

- **Ctrl+V** reaches the program as the key `0x16`; conhost leaves pasting to
  it, and BuildFrame does nothing with Ctrl+V.
- **Right-click** reaches the program as a mouse click
  (`ESC [ < 2 ; x ; y M` / `m`), because BuildFrame owns the mouse.
- **Alt+Space** does not open the window menu (Edit → Paste); it too reaches
  the program, as `ESC` and a space.

Both are how people paste in a Windows console, so a Windows user cannot
paste a Message at all. In WezTerm, pasting works: the terminal sends a
bracketed paste.

Blocks [WF-315](./WF-315-lift-the-native-windows-refusal-and-prove-windows-end-to-end.md)
(owner decision, 2026-11-20): Windows support does not ship until a Windows
user can paste.

## Direction

In a text input (composer, searches, filters, the comparison picker's
input), treat Ctrl+V as paste: read the system clipboard and insert it
exactly as a bracketed paste would, line breaks kept and nothing sent. The
host clipboard BuildFrame already uses for `y` (`shellClipboard.ts`) is the
place to read from. Decide whether a right-click in an input pastes too, as
the console's own right-click does.

Ctrl+V means nothing to BuildFrame today, so taking it for paste changes no
binding. Check that terminals which do send a bracketed paste on Ctrl+V do
not paste twice.

## Verification

- In conhost, Ctrl+V in the composer inserts the clipboard text with its line
  breaks, and nothing is sent.
- In WezTerm, a paste still arrives once.

## Done (2026-11-21)

On Windows, Ctrl+V reads the system clipboard and hands the text to OpenTUI
as a bracketed paste (`apps/buildframe/src/clipboardPaste.ts`, started by
`ShellClipboard`, which both apps create before any screen listens for
keys). Every input takes it exactly as a terminal paste, and no screen sees
the key. macOS and Linux are untouched: Ctrl+V is not paste there.
Terminals that paste on Ctrl+V themselves never send the key, so nothing
pastes twice. `test/fast/clipboardPaste.test.ts` covers the paste, an
empty or non-text clipboard, two quick presses, stopping, and a terminal's
own bracketed paste.

Checked by hand in conhost and WezTerm (both send Ctrl+V as `0x16`): Ctrl+V
pastes into the composer and into `/`, and nothing is sent.

- Line breaks: the composer drops control characters from every paste, line
  breaks included, so two pasted lines join into one. That is what a
  bracketed paste already does; Ctrl+V does the same, as Direction asks.
- Right-click still belongs to BuildFrame's mouse handling and does not
  paste. Making it paste inside an input would change the Reviewing view,
  which is over the file size budget; not done.
