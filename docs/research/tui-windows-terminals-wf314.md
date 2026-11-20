# WF-314: does the TUI hold up in Windows terminals?

## Status — 2026-11-20

**Verdict: Reviewing holds up in conhost, WezTerm and herdr, with one Windows
gap left: pasting in conhost (WF-320).** From PowerShell in all three, every
key in the `?` list acts, mouse clicks, hover and selection work, `y` copies
to the system clipboard, exit restores the terminal exactly (cursor, mouse,
focus, paste and kitty modes match a fresh shell), wide text stays aligned,
`--no-color` and `--ascii` are clean, and start-up is well inside the WF-015
budget (first frame about 0.25 s in conhost, a reopened Review in under 2 s).
Windows Terminal and the VS Code terminal are not installed on the reference
machine and were not checked; Git Bash is out of scope.

- **Fixed here (Windows):** every Git run of the runtime flashed a console
  window that took the keyboard and mouse; Git now starts hidden.
- **Windows, filed:** Ctrl+V and right-click do not paste in conhost
  (WF-320); the input cursor `▏` is a box in conhost's default font (WF-319).
- **Shared code, filed (not Windows-specific):** a wrapped Diff line loses its
  last word below 30 columns (WF-316); chrome is cut mid-word at about 30
  columns (WF-317); the wheel over a Files list that fits on screen jumps to
  its ends (WF-318).
- **Key collisions:** without the kitty keyboard protocol (conhost, WezTerm
  by default) Ctrl+I, Ctrl+M, Ctrl+H and Ctrl+[ act as Tab, Enter,
  Backspace and Esc. No listed key needs them apart; only the unlisted
  Ctrl+H/Ctrl+L resize aliases are lost there. herdr speaks the kitty
  protocol, so there they are separate keys.
### How the WezTerm runs were made

WezTerm's own command line (`wezterm cli send-text --no-paste`, `get-text`)
drove BuildFrame in a real WezTerm window. Keys went in as the bytes a
terminal sends without the kitty keyboard protocol (`ESC [ Z` for
Shift+Tab, `ESC [ 1;2C` for Shift+→, `ESC O R` for F3), so these runs check
how BuildFrame reads those bytes and what WezTerm draws, not which bytes a
physical key produces: the key-collision table and the mouse, clipboard,
focus and theme checks still need a person at the keyboard. Terminal state
after exit was read back from WezTerm (DECRQM for cursor, mouse, focus and
paste modes; the kitty keyboard flags) and compared with a fresh shell.

### herdr

herdr (the desktop app) runs each terminal through `herdr-core`, which
emulates a terminal with Ghostty's engine (it reports `TERM_PROGRAM=ghostty`)
over ConPTY, and it supports the kitty keyboard protocol, so BuildFrame turns
that on here. The app does not set `HERDR_ENV` or the pane variables the
standalone `herdr` CLI needs; its own CLI, `hc`, drove a terminal of its own
(`hc run`, `hc keys`, `hc send`, `hc read`) at 200×120. `hc keys` sends
named keys through herdr's encoding, but it lower-cases letters (`shift+j`
for `J`) and has no names for `?`, `!`, `<` or `>`, so those keys, the mouse,
looks, resizing and closing are checked by hand.

## Setup

### Terminals

| Terminal                   | On the reference machine                                 |
| -------------------------- | -------------------------------------------------------- |
| conhost                    | Yes (Windows' default console here)                      |
| Windows Terminal           | Not installed; LTSC does not ship it                     |
| WezTerm                    | Yes (Nightly, `%LOCALAPPDATA%\Programs\WezTermNightly`)  |
| VS Code terminal           | Not installed                                            |
| herdr                      | Yes (the desktop app); not in WF-314's list               |

Every terminal runs BuildFrame from PowerShell. Git Bash is out of scope
(owner decision, 2026-11-20).

### Before the first run

1. **Lift the refusal locally.** Until WF-315, BuildFrame refuses native
   Windows before it opens a repository. In
   `packages/workspace/src/workspaceIdentity.ts`, just before the final
   `return { code: 'unsupported-platform', … }` of the platform check, add
   `if ((process.platform as string) === 'win32') return undefined;` (the
   cast keeps the later Windows check compiling). Never commit it;
   `git checkout -- packages/workspace/src/workspaceIdentity.ts` undoes it.
2. **Build once** from PowerShell: `pnpm build`.
3. **Make the fixture:** `node scripts/tui-check-fixture.mjs` prints the path
   of a new throwaway repository. Use one fixture for every terminal so the
   screens match.

### Launch

Run from the BuildFrame checkout in PowerShell (it re-runs itself with
`--experimental-ffi`):

```text
node apps/buildframe/dist/developerExecutable.js <fixture>
node apps/buildframe/dist/developerExecutable.js --no-color <fixture>
node apps/buildframe/dist/developerExecutable.js --ascii <fixture>
```

BuildFrame reopens the last Review on start; wait until its
Diff is drawn before pressing keys, since `q` and the editing keys only ask to
be pressed again while it loads. Before launching, note `TERM`,
`TERM_PROGRAM`, `COLORTERM` and `WT_SESSION` (`Get-ChildItem env:TERM*, env:COLORTERM, env:WT_SESSION`)
in the environment table.

After closing a run, `node apps/buildframe/dist/developerExecutable.js doctor <fixture>`
should report no runtime left behind before the next terminal.

## Checks

Pass means it works as on macOS: the key acts as the `?` list says, the
screen redraws cleanly, nothing stray is printed. Note anything else, however
small, in the cell.

### S — Start and look

- **S1** Cold start to a usable Home within 2 s (WF-015), Enter to the
  first drawn Home, by stopwatch; note the time.
- **S2** Colours: panes, selection, additions/deletions read clearly.
- **S3** Light/dark: switch the terminal's colour scheme between light and
  dark, relaunch; BuildFrame follows the background.
- **S4** Mislabelling: in PowerShell set `$env:TERM_PROGRAM = 'vscode'` (then
  `'WezTerm'`), launch in conhost, and compare keys, colours and mouse with an
  unset `TERM_PROGRAM`. Any difference is a finding.

### K — Keys

Home (launcher, Previous Reviews, comparison picker):

- **K1** `j`/`k` and ↑/↓ move; `g`/`G`, Home/End go to the ends; PgUp/PgDn
  move one window (the comparison list has 40+ commits).
- **K2** Enter opens; Esc goes back to Home.
- **K3** Comparison: Tab and Shift+Tab switch commit / range; `/` searches
  messages and Ctrl+U clears; `n` asks for HEAD~N; `r` takes `v0.1` or
  `feature`; on "Merge the feature", `h`/`l` choose the parent.

In the Review (current changes):

- **K4** Tab and Shift+Tab cycle the panes.
- **K5** `j`/`k`, `g`/`G`, PgUp/PgDn in each pane; `J`/`K` jump between
  changed files.
- **K6** In Files: `h`/`l` collapse and expand `a/b/c/d`; `H`/`L` all
  folders.
- **K7** In the Diff of `notes/long-line.txt` with wrapping off:
  Shift+← and Shift+→ scroll sideways.
- **K8** `v`/`w` change the Diff mode and wrapping; `z` code only and back;
  `s` hides and shows Files; `<` and `>` resize the pane.
- **K9** `e` and `m` open the lists; typing filters, Enter opens, Esc clears
  then closes.
- **K10** `f` changed / all files; `t` review point; `R` back to Live
  Changes; `/` search, Ctrl+U clears.
- **K11** `?` and Space open the key list; `?`, Space, Enter or Esc close
  it. Every key it lists was tried above.
- **K12** `c` opens Configuration; ←/→ change a value; Enter or Esc close.
- **K13** `!` shows details and hides them again; Esc closes them first.
- **K14** `a` opens the composer: type text with Tab, Backspace, ←/→;
  Esc twice discards. Without an agent, Enter must not send.
- **K15** Upper-case keys (`G J K H L R C`) act, and no lower-case key is
  read as its upper case.

Without the kitty keyboard protocol some keys arrive as the same bytes. Try
each pair and record which one BuildFrame acts on in the collisions table:

- **K16** Esc then `j` quickly: two keys, not Alt+J; a lone Esc acts
  without a noticeable delay.
- **K17** Tab / Ctrl+I, Enter / Ctrl+M, Backspace / Ctrl+H, Esc / Ctrl+[.
- **K18** Shift+Tab, Shift+←/→, PgUp/PgDn, Home/End, F3, F4 each arrive
  as themselves (F3 and F4 in the composer).

With a connected agent (one terminal is enough; agents were checked in
WF-313): Enter sends, F3 previews, F4 retargets, `x` interrupts, `r`
resends, `[` and `]` step through history, and the past-step guard says
"Press Esc to come back to now first."

### M — Mouse

- **M1** Clicking a file opens it; clicking a Diff row selects it; clicking
  a pane focuses it.
- **M2** Hover and movement: whatever expands on hover on macOS expands here.
- **M3** The wheel scrolls the pane under the pointer, in every pane.
- **M4** Native selection: the terminal's own select-and-copy still works
  (Shift+drag in conhost and WezTerm).

### C — Clipboard, paste, focus

- **C1** `y` on a Diff row: paste into Notepad gives the row's text, and
  BuildFrame's notice says it was copied (not "attempted" or
  "unavailable").
- **C2** Bracketed paste: paste three lines into the composer; they arrive
  as one paste with their line breaks, and nothing is sent. Paste into `/`
  search too.
- **C3** Focus: switch to another window and back; no stray `^[[I`/`^[[O`
  or other characters appear, and keys keep working.
- **C4** OSC 52: record whether the terminal supports it (conhost does
  not). Only matters if C1 falls back to the terminal.

### L — Layout and text

- **L1** Resize while running: smaller, larger, maximise, back. The screen
  redraws without leftovers.
- **L2** Narrow: about 60 and 30 columns; the layout reflows and the footer
  shortens its labels before dropping keys.
- **L3** `--no-color`: everything readable, selection and focus still
  visible.
- **L4** `--ascii`: no box-drawing or other non-ASCII chrome; file content
  still shows as it is.
- **L5** `src/lib/wide.txt`: CJK, Hangul, emoji (skin tone, ZWJ, flag),
  combining accents and the tab line stay aligned; the selection highlight
  covers whole characters.
- **L6** `windows.txt` (CRLF, `eol=crlf`) shows one changed line (WF-288);
  no `^M` or stray `\r` on screen.

### X — Exit

After each way out, check the shell prompt: the cursor is visible, typing
echoes normally, moving or clicking the mouse prints nothing, the screen
from before launch is back (no alternate screen left), and colours are
reset.

- **X1** `q` from Home and from a Review.
- **X2** Ctrl+C from the composer (typing) and from a Review.
- **X3** Close the terminal window while BuildFrame runs; in a new window,
  `doctor` shows nothing stuck and the next launch starts normally.

## Results

`✓` passes, `✗` fails (see Findings), `–` not applicable, blank not run
yet. `✓ᵇ` passed with the bytes sent by WezTerm's command line; the same
check with real keys belongs to the hands-on pass. `✓ʰ` passed with keys pressed through herdr's own key encoding (`hc keys`) and the screen read back with `hc read`. Windows Terminal and the
VS Code terminal are not installed on the reference machine, so they have no
columns.

### Environment

| Terminal | TERM           | TERM_PROGRAM | COLORTERM | WT_SESSION | Start-up              |
| -------- | -------------- | ------------ | --------- | ---------- | --------------------- |
| conhost  | unset          | unset        | unset     | unset      | Home in ~0.25 s (by eye) |
| WezTerm  | xterm-256color | WezTerm      | truecolor | unset      | Home in 0.95 s (cold) |
| herdr    | xterm-256color | ghostty      | truecolor | unset      | Review in 1.8 s       |

WezTerm here is Nightly 20261010-083911-e2a98e1b with its default
configuration: it answers no kitty keyboard query, so BuildFrame reads plain
key encodings there, and it draws Nerd Font icons from its own built-in
symbols. conhost draws with one console font and no fallback; with the
default font (Consolas) and no Nerd Font installed, the Nerd Font icon set
shows as boxes, while the default text icons are fine. The PowerShell profile itself turns on focus reporting
(mode 1004) in WezTerm, with or without BuildFrame.

### Checks

| Check   | conhost    | WezTerm                    | herdr    |
| ------- | ---------- | -------------------------- | -------- |
| S1      | ✓ ~0.25 s, content a little later | ✓ 0.95 s                   | ✓ Review in 1.8 s |
| S2      | ✓ text icons; Nerd Font icons show as boxes (font) | ✓                          | ✓ |
| S3      | ✓ | ✓                          | ✓ |
| S4      | ✓ (as `vscode`: same) | ✓ (as `vscode`: identical) | ✓ (identifies as `ghostty`) |
| K1–K3   | ✓ (End: no key on this keyboard) | ✓ᵇ                         | ✓ʰ |
| K4      | ✓ | ✓ᵇ                         | ✓ʰ |
| K5–K6   | ✓ | ✓ᵇ                         | ✓ʰ |
| K7      | ✓ | ✓ᵇ                         | ✓ʰ |
| K8–K10  | ✓ | ✓ᵇ                         | ✓ʰ (`<`/`>` ✓ by hand) |
| K11     | ✓ | ✓ᵇ                         | ✓ʰ Space, `?` by hand |
| K12–K13 | ✓ | ✓ᵇ                         | ✓ʰ, `!` by hand |
| K14     | ✓ | ✓ᵇ                         | ✓ʰ |
| K15     | ✓ (Caps Lock makes `j`/`k` act as `J`/`K`) | ✓ᵇ                         | ✓ʰ |
| K16     | ✓ | ✓ᵇ                         | ✓ʰ |
| K17     | ✓ (see collisions) | ✓ (see collisions)         | ✓ʰ (see collisions) |
| K18     | ✓ | ✓ᵇ                         | ✓ʰ |
| M1      | ✓ | ✓                          | ✓ |
| M2      | ✓ | ✓                          | ✓ |
| M3      | ✗ WF-318 (Files); Diff scrolls | ✗ WF-318                   | ✗ WF-318 (Files); Diff scrolls |
| M4      | ✓ | ✓                          | ✓ |
| C1–C3   | ✗ WF-320 (paste); copy and focus ✓ | ✓ (`y` copied the row under the pointer) | ✓ (C2 also via `hc send`) |
| C4      | – (conhost has no OSC 52; system clipboard used) | – (system clipboard used)  | – |
| L1      | ✓ | ✓                          | ✓ |
| L2      | ✗ WF-316, WF-317 (known) | ✗ WF-316, WF-317           | not checked (same layout code) |
| L3–L4   | ✓ | ✓                          | ✓ |
| L5–L6   | ✓ | ✓                          | ✓ |
| X1      | ✓ | ✓                          | ✓ |
| X2      | ✓ | ✓                          | ✓ |
| X3      | ✓ | ✓                          | ✓ |

### Key collisions

Which key BuildFrame acted on when the pair was pressed (K16–K18), with real
keys. Without the kitty keyboard protocol Ctrl+I, Ctrl+M, Ctrl+H and Ctrl+[
send the same bytes as Tab, Enter, Backspace and Esc; no BuildFrame key needs
them apart, so acting as those keys is a pass. Backspace has no binding
outside typing.

| Pressed                 | conhost | WezTerm | herdr |
| ----------------------- | ------- | ------- | ----- |
| Ctrl+I (vs Tab)         | Tab     | Tab     | nothing |
| Ctrl+M (vs Enter)       | Enter   | Enter   | nothing |
| Ctrl+H (vs Backspace)   | nothing | nothing | resize |
| Ctrl+[ (vs Esc)         | Esc     | Esc     | nothing |
| Esc then `j` (vs Alt+J) | ✓       | ✓ᵇ      | ✓ʰ    |
| Shift+Tab               | ✓       | ✓ᵇ      | ✓ʰ    |
| Shift+←/→               | ✓       | ✓ᵇ      | ✓ʰ    |
| F3 / F4                 | ✓       | ✓ᵇ      | ✓ʰ    |

## Findings

- **C2, conhost:** nothing can be pasted. Ctrl+V reaches BuildFrame as the key
  `0x16` and right-click as a mouse click, and BuildFrame turns neither into a
  paste. Filed as
  [WF-320](../../.issues/WF-320-paste-on-windows-consoles.md).
- **K3, conhost:** the cursor in the picker's `/` search is a box: the default
  console font has no `▏`, and only `--ascii` replaces it. Review search and
  the `e`/`m` filter use the same glyph. Filed as
  [WF-319](../../.issues/WF-319-input-cursor-glyph-missing-in-conhost.md).
- **Every terminal, fixed:** while BuildFrame ran, a console window flashed
  open and shut several times a second and took the keyboard and mouse. The
  runtime has no console (it starts with `windowsHide`), so every `git` it
  started got a new console window: 33 Git runs and 28 console windows in
  7 s of watching. `runGitProcess` now starts Git with `windowsHide: true`;
  the same watch then counted 71 Git runs, 46 console hosts and no visible
  window.
- **M3, WezTerm (shared code, so likely every terminal):** the wheel over a
  Files list that fits on screen selects its first or last file instead of
  doing nothing. Filed as
  [WF-318](../../.issues/WF-318-wheel-in-a-short-files-list-jumps-to-the-ends.md).
- **L2, WezTerm (layout code, so likely every terminal):** below
  30 columns a wrapped Diff line whose last word overflows loses that word
  (`windows line 1` shows `windows line `). Filed as
  [WF-316](../../.issues/WF-316-narrow-diff-clips-instead-of-wrapping.md).
- **L2, WezTerm (same):** at 29 columns the timeline and pane-tab rows are
  cut without a marker, and the footer anchor reads `[q] qui` while `[a]`
  stays. Filed as
  [WF-317](../../.issues/WF-317-narrow-screens-cut-chrome-mid-word.md).

## Notes to compare on macOS

Seen in WezTerm; probably not terminal-specific, but worth one look on macOS
before calling them bugs.

- The first `<` or `>` on Files jumped its width from 26 to 18 columns; each
  later press moves it by one.
- Ctrl+H and Ctrl+L are unlisted aliases of `<` and `>`. They work only with the
  kitty keyboard protocol (herdr): conhost and WezTerm send Ctrl+H as
  Backspace, so there it does nothing, as the code's comment expects.
- Tab in the composer inserts nothing.
- Switching the comparison picker to "Range up to HEAD" moves the selection
  off a merge commit.
- In conhost, Ctrl+U and `h`/`l` seemed to do nothing until the commit's details
  had finished loading; afterwards both worked. Keys pressed while a
  comparison is inspected look ignored rather than answered.
- BuildFrame reopens the last Review on start. A `q` pressed while it is
  still loading only says to press `q` again (by design), so a quick `q`
  right after start seems not to work.

## Measured (WezTerm)

- Opening a Review of 8 changed files: 2.4 s from Enter to the drawn Diff.
- Every exit (`q` from Home and from a Review, Ctrl+C from a Review and
  from the composer, after `--no-color` and `--ascii`) brought the earlier
  screen back within 30 ms; cursor, mouse, focus, paste and kitty modes then
  matched a fresh shell exactly, and typing echoed normally.
- `--no-color` drew no colour or style codes at all; selection and focus
  stay visible through the `›` and `▌` markers. `--ascii` drew no non-ASCII
  character.
- Wide text: every row of `src/lib/wide.txt` measured 120 cells with the
  Diff border in the same cell on every row (CJK, Hangul, emoji with skin
  tone, ZWJ and flag, combining accents, tab).
- `windows.txt` (CRLF) showed one changed line and no `\r` (WF-288).
