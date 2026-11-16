---
name: BuildFrame
description: A terminal Reviewing companion; calm, dense, text-first panes where color reports state.
colors:
  graphite-ground: "#0d1014"
  graphite-pane: "#12171d"
  graphite-raised: "#192029"
  slate-rule: "#303a46"
  frost-text: "#d8dee9"
  pewter-muted: "#7d8998"
  harbor-cyan: "#70b7d4"
  harbor-cyan-wash: "#17313c"
  sage-success: "#8ebd8b"
  sage-wash: "#162a20"
  rose-danger: "#d8898b"
  rose-wash: "#301a20"
  brass-warning: "#d5b875"
  code-text: "#c8d0dc"
typography:
  title:
    fontFamily: "the terminal's monospace font"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "the terminal's monospace font"
    fontWeight: 400
    lineHeight: 1
  label:
    fontFamily: "the terminal's monospace font"
    fontWeight: 700
    lineHeight: 1
spacing:
  cell: "1ch"
  gutter: "2ch"
  files-pane-min: "16ch"
  files-pane-default: "34ch"
  questions-pane-min: "20ch"
  questions-pane-default: "40ch"
components:
  pane:
    backgroundColor: "{colors.graphite-pane}"
    textColor: "{colors.frost-text}"
    padding: "0 1ch"
  pane-focused:
    backgroundColor: "{colors.graphite-pane}"
    textColor: "{colors.harbor-cyan}"
  row-selected:
    backgroundColor: "{colors.harbor-cyan-wash}"
    textColor: "{colors.frost-text}"
  diff-row-added:
    backgroundColor: "{colors.sage-wash}"
    textColor: "{colors.code-text}"
  diff-row-removed:
    backgroundColor: "{colors.rose-wash}"
    textColor: "{colors.code-text}"
  card-raised:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.frost-text}"
  header:
    backgroundColor: "{colors.graphite-pane}"
    textColor: "{colors.frost-text}"
    height: "1 row"
---

# Design System: BuildFrame

## Overview

**Creative North Star: "The Quiet Ledger"**

BuildFrame is a ledger you read in a terminal: rows of code, Messages and Responses, each set down plainly and kept. The screen is mostly text on a low, slightly tinted ground, dark or light to match the terminal. Panes are outlined with thin rounded rules and filled with a surface one step off the ground. Nothing glows, slides in or decorates. When the eye catches on something, it is because that thing is focused, selected or changed state.

Density is deliberate. A developer runs BuildFrame in a split pane beside a harness and an editor, so every row earns its place and secondary facts step back by dimming, not by shrinking or hiding. Hierarchy comes from weight (bold titles), position (the focused pane's `▌` marker) and a small set of tinted washes behind selected and changed rows.

Every visual signal has a plain-text equivalent. A state is always a glyph and a word, and color adds a third channel on top. That is why `--no-color` and `--ascii` work as full modes rather than degraded fallbacks.

**Key Characteristics:**
- Tinted ground with a one-step-offset pane surface; light and dark presets share one role set, and the default follows the terminal.
- Thin rounded pane borders (`╭╮╰╯`) that switch to `+ - |` under `--ascii`.
- One accent per theme. It marks focus and selection, nothing else.
- Every state is a glyph, a word and a color tone. Color is never the only channel.
- Bold titles, muted metadata, no size hierarchy (the terminal has one size).
- Motion only where it carries meaning: a braille spinner for work in progress and optional eased scrolling.

## Colors

The palette is cool and low-chroma, with roles ahead of hues. Quiet Graphite's values are the tokens above. The default preset, **Match terminal**, shows Quiet Graphite on dark terminals and **Quiet Paper**, its light counterpart, on light ones, following the terminal's own report of its background and switching live if it changes. Warm Carbon and Indigo Night are dark-only presets that fill the same roles with different values. User themes can inherit any preset and override single roles.

### Primary
- **Harbor Cyan** (`harbor-cyan`): focus and selection only. It colors the focused pane's border and title, `›` selection cursors in the focused pane, the composer and dialog frames, and the `now` chip. Work in progress, a past step and anything in a pane without focus never take it. Quiet Paper's accent is a deep harbor blue, Warm Carbon's a dry amber and Indigo Night's a soft violet.
- **Harbor Cyan Wash** (`harbor-cyan-wash`): the background fill behind the selected row or the expanded item, in the focused pane. It is the only full-row fill that means "your cursor is here". History's `▶ now ◀ here` row says what the Diff shows, not where the cursor is, so it is bold Frost Text (Brass on a past step) with no wash. A selection in a pane without focus keeps its `›` or `▌` on Graphite Raised, so only the focused pane wears the accent.

### Secondary
- **Sage** (`sage-success`) with **Sage Wash** (`sage-wash`): answered and saved states, added diff lines (the wash fills the row and the glyph carries the color), and the agent's connection. A green `●` means only that the agent is connected; which Review is open (Current or Previous) is said in words, in Frost Text.
- **Rose** (`rose-danger`) with **Rose Wash** (`rose-wash`): failed, not sent, and removed diff lines. It also marks blocking conditions inside dialogs.

### Tertiary
- **Brass** (`brass-warning`): caution and uncertain outcomes (stopping, interrupted, unknown, confirm), files that changed during a Message, `✎ Code changed while answering`, and the Diff pane border while it shows a past step, so history can't pass for current code. Your own edits between answers (`○ edits before #1`, `○ edits outside answers`) are routine, so they stay Pewter.

### Neutral
- **Graphite Ground** (`graphite-ground`): the app background behind everything.
- **Graphite Pane** (`graphite-pane`): pane, header and list surfaces.
- **Graphite Raised** (`graphite-raised`): floating cards, dialogs and the Question composer, one step above panes.
- **Slate Rule** (`slate-rule`): resting pane borders.
- **Frost Text** (`frost-text`): primary text.
- **Pewter** (`pewter-muted`): secondary text, line numbers, waiting and no-answer states, and comments in code.
- **Code Text** (`code-text`): unhighlighted source in the Diff.

Syntax highlighting has its own small token palette per theme (keyword, string, number, comment, function, type, constant, property, tag, markup). No token takes the theme's accent or its caution colour, so code never reads as focus or as a warning: function names and tags get their own hue (Quiet Graphite's is a soft periwinkle, `#9fb2e8`), and so do numbers and constants (a soft peach, `#e8a07a`).

### Named Rules
**The One Accent Rule.** Each theme has a single accent, and it means focus or selection. It never decorates, never marks success and never marks a warning. A state badge keeps its own tone on a selected row or card title; bold, the cursor glyph and the border carry the selection. Wordmarks and group labels are bold Frost Text. On the history row, only the `now` chip is filled with the accent; a shown past step's chip is Brass, like its Diff border. Paging hints, loading screens, mode toggles and dialog body text are Frost Text or Pewter, never the accent.

**The Washes Are Rows Rule.** Tinted washes (`*-wash`) fill whole rows behind content. They never sit behind isolated words or labels.

**The Contrast Floor Rule.** Text clears 4.5:1 on every fill in its theme, washes included, and a new theme or role is checked against that matrix before it ships. Quiet Paper meets it fully. The dark presets' Pewter and comment text fall to 3.8–4.4:1 on row washes, which is a known gap to close, not a precedent.

**The Transparent Terminal Rule.** With `background: terminal`, the surfaces (ground, pane, raised, and the selection's Harbor Cyan Wash) become transparent, so the terminal's own background shows through. The state washes stay: Sage Wash and Rose Wash still fill added and removed rows, because they say which lines changed and a lone `+`/`-` glyph is too faint to scan by. Under `--no-color`, every role collapses to plain white on transparent.

## Typography

**Font:** the user's terminal monospace font, at the terminal's own size. BuildFrame never sets a family or size.

**Character:** a single size on a fixed cell grid, so hierarchy comes from weight, case, dimming and position.

### Hierarchy
- **Title** (bold): pane titles, the Message card heading and the header route (`BuildFrame / …`).
- **Body** (regular): code, Message text, list rows.
- **Label** (bold, sometimes uppercase): the source word in the header (`LIVE CHANGES`, `SNAPSHOT`, `PAST STEP`), `FOCUSED` after a pane title, and state words in badges.
- **Meta** (regular, Pewter): counts, positions (`· 12-40/310`), timestamps, hints.

### Named Rules
**The Weight-Not-Size Rule.** Promote with bold and demote with Pewter. Uppercase is reserved for short mode or state labels, never for sentences.

## Layout

The layout is a horizontal row of bordered panes (Files, Diff, Questions) under a header, with a one-row status line at the bottom. Pane widths are measured in terminal cells.

- **Width modes:** `wide` at 120 columns and up, `balanced` from 90 to 119, and `linear` below 90 (one pane at a time, `Tab` cycles).
- **Pane widths:** Files prefers 34 cells (minimum 16) and Messages 40 (minimum 20); users can resize both and hide Files. The Diff always keeps at least half the terminal (never under 32 cells). When the side panes want more than that leaves, they give way in proportion to their preferred widths.
- **Arrangements:** `workspace` (default), `code-spotlight` and `review-notebook` rearrange the same panes.
- **Header:** one row at every size, or none when the user hides it in Configuration. Below 100 columns the source word shortens (`LIVE CHANGES` to `LIVE`).
- **Pane title row:** `▌ Title FOCUSED  detail · start-end/total`. The visible window is given as ordinals rather than drawn as a scrollbar.
- **Padding:** one cell inside panes and two cells in the header. There is no other spacing scale.
- **Long lines:** the Diff supports `wrap` and `clip`. Wrapped code breaks after a space or delimiter, so identifiers and strings stay whole, and only cuts mid-token when a token is longer than half a row. A clipped line ends with `›`.
- **Text that doesn't fit:** never cut from the middle. Sentences wrap or keep their start and end in `…`. Pane titles keep the file name: the path shortens first, then basis words drop, and `PAST` always stays. A state word is never cut: in a stack of Messages the preview gives way, counted in terminal cells. A preview that gives way ends on a whole word before its `…`. A location keeps `file:line`, drops its folders first, and when the name still doesn't fit says `line N` (the Diff title already names the file); a name is never cut. A count such as "5 files" is dropped whole rather than cut.

### Named Rules
**The Code Keeps the Room Rule.** When space runs out, chrome gives way first (header words shorten, keys drop by rank, then one pane at a time). The Diff never shrinks to make room for chrome.

## Elevation & Depth

There are no shadows. Depth is three tonal steps: Ground, then Pane, then Raised. Panes sit on the ground and are outlined by a rule. Cards, dialogs and the composer sit one step higher on Raised, and an accent border marks them as active.

### Named Rules
**The Three Steps Rule.** Only Ground, Pane and Raised exist. A fourth surface level means the design needs restructuring, not another tint.

## Shapes

The terminal's box-drawing set is the whole shape language. Pane borders are rounded (`╭ ╮ ╰ ╯ │ ─`), and `--ascii` swaps them for `+ - |`. Inside panes, structure comes from leading glyphs, not boxes:

- `▌` the focused pane or selected diff row (`|` or `>` in ASCII)
- `›` the selected list row (`>`)
- `▸ ▾` collapsed and expanded tree nodes (`> v`)
- `● ○ ◆ ▶ │ ┃` history rail nodes and lines (current, other, start, now)

Under `--ascii`, every interface character has a stand-in (`·`→`-`, `…`→`...`, `↳`→`->`, `✎`→`*`, `◀`→`<`, and so on). `?` is reserved for the unknown state and for characters in source code that have no ASCII form; source code never gets stand-ins, because they could pass for real syntax.

## Components

### Pane
- **Character:** an outlined, quiet container. The title row says what it is and which slice is on screen.
- **Resting:** Graphite Pane fill, Slate Rule border.
- **Focused:** Harbor Cyan border, title in accent with the `▌` marker and the word `FOCUSED`.
- **Diff showing a past step:** Brass border, which overrides focus. The past must never look like current code.

### List rows (Files, Messages, history, Home)
- **Character:** dense, single-line and cursor-led.
- **Selected:** a `›` prefix plus a Harbor Cyan Wash fill across the whole row in the focused pane; Graphite Raised in a pane without focus. Home's rows are bold Frost Text on the wash.
- **Meta:** counts such as `●3` (Messages on a file) and change marks trail the name in Pewter or Brass.

### Diff rows
- **Gutter:** `▌` when selected, then old and new line numbers right-aligned to 4 cells, then the `+`/`-` marker.
- **Added and removed:** Sage Wash and Rose Wash fill the row, on the theme background and the terminal's alike. Syntax colors stay intact on top.
- **Selected:** Harbor Cyan Wash, which takes precedence over add and remove washes.

### State badge
- **Character:** one vocabulary everywhere (the list, the Message card and the status line). It lives in `reviewingStatus.ts`.
- **Form:** a glyph, a word and a tone. For example `✓ answered` (Sage), `✗ failed` (Rose), `? unknown` (Brass), `○ waiting` (Pewter), `■ interrupted` (Brass), and a spinning `⠋` for checking, saving or working (Frost Text: the spinner's motion says it is working, so it never takes the accent).
- **Saved is not sent:** the composer card alone names the phase. Its title reads `Checking`, then `Saving`, then `Saved`, and its hint says only what that phase means ("Nothing is saved yet.", "Saving it locally first.", "This closes by itself."). The Diff title keeps describing the Diff, History's local row shows only its badge while the card is open, and the footer gives the keys ("[Ctrl+C] quit", "Keys you press now wait until it’s saved."). Once saved, the local card shows `○ saved` (Pewter) and the status line says "Saved. Waiting for <agent> to start.", the same sentence it keeps after the Message reaches History. Only an answer earns the green `✓`. When a Message reaches its outcome, the status line is replaced with it (for example `✗ #2 failed: Pi reported an error.`).
- **Keys live in the footer:** a dialog doesn't repeat its keys inside the box (Preview, Configuration). An empty draft closes on one Esc, so its footer says `[Esc] close`. `[F3] preview` appears only while an agent is connected, because the preview checks against it; pressed earlier, F3 says no agent has connected instead of opening a preview that closes at once.
- **ASCII:** `+ x ? o #` with a `. : ' :` spinner, which never reuses the `| -` of ASCII borders and separators.

### Cards and dialogs
- **Background:** Graphite Raised, with a Harbor Cyan border. The send confirmation uses a Brass border, because it is a caution.
- **Placement:** the Question composer and a saved Message's card both open directly beneath their anchored line, never above it. Dialogs are centred in the body and are as tall as their content; their hints sit inside the box, never in a border.
- **Steady size:** a dialog whose text changes as you move through it keeps the height of its longest text. Configuration reserves the rows of the longest description any setting or value can show, so moving between settings or changing one never makes the box grow, shrink or move.
- **Focus while writing:** the composer lives in the Diff, so the Diff shows `FOCUSED` while a Message is being written, wherever it was started from.
- **Send confirmation:** only when an earlier Message never reported back, so sending may repeat work. Plain words ("An earlier Message here never reported back."), never internal names. A Message's content never triggers it: BuildFrame does not scan for secrets. A plain backdrop hides the panes behind it, so nothing competes with the question.
- **Use:** the expanded Question or Message card, the Question composer, the action lookup, Configuration, and confirmation and preflight dialogs.

### Status line
- **Form:** a single row with a tone glyph (`✓` success, `!` warning, `✗` error, none for info) and a sentence. A warning or error that doesn't fit takes a second row rather than losing its end, because its end usually says what to do.
- **Lifetime:** 5 s for info and success, 10 s for warnings, 20 s for errors.
- **Never trails the card:** "Saved. Waiting for <agent> to start." is replaced by "<agent> started #1." when the turn starts, then by the outcome.

### Keys row
- **Form:** `[key] action` hints separated by two spaces, following the focused pane (Files, Diff, History) and the mode (past step, composer, dialog). The bracket keys read `[ and ]` everywhere, so they never pass for `/` (search). Each key has one label wherever it shows (`[t] review points`).
- **Ranked:** when the row is too narrow, hints drop whole, highest rank first. Each key keeps one rank in every pane, so the same width drops the same keys wherever focus is. `[?] keys` and `[Tab] pane` stay longest; `[t] review points` goes first, and `[q] quit` and `[Esc] Home` share a rank so they drop together.
- **Only what applies:** `[x] interrupt` appears only while the selected Message is running, and `[r] send again` only after it failed, stopped, was lost, or ended without an answer. Both act on the selected Message from any pane and rank just after `[Tab] pane`, because the Message card names them wherever it shows. `[ and ] history` shows in every pane once there is history. An empty Review lists only `[f] all files` as its way on, without the keys that need a file or a line.
- **Balanced arrangement:** Files and History share the side pane, so its title names the other one (`Files  Changed  · History 2`, `History  2 Messages  · Files`). `Tab` reaches it.

### Home
- **Form:** the Review's frame. Under the header, a context row on Graphite Raised (where a Review's history row sits) says what is open: "No Review open" in Pewter, or "Current Review · 1 file · 0 Messages". Below it, one bordered pane titled `▌ Home FOCUSED  2 choices`. There is no wordmark, because the header already says BuildFrame.
- **Placement:** the pane is a card, centred in the body like a dialog and as tall as its rows. It is 76 cells wide, a reading column, or the whole width on a narrower terminal. The launcher keeps the height of its longest description, so moving between choices never makes it jump. A list (commits, Previous Reviews) grows to the room it has. The card is centred as if the footer had its ordinary two rows, so a typed input's taller footer takes its row from below and the card never moves while you search.
- **Choices:** one row each, an icon then the label. The selected choice's description sits under the list, wrapped on whole words with its indent kept. A choice that can't be used yet says why in words ("Previous Reviews (none yet)") and in Pewter.
- **One card for every Home view:** the commit picker (`▌ Commits FOCUSED`) and Previous Reviews (`▌ Previous Reviews FOCUSED  2 · newest first · read only`) replace the card's contents, at the same width and left edge, so the column never moves when you go between them. The header names the view in the choice's own words ("Review a commit or range").
- **Commit picker:** single-spaced rows. The mode is a setting, shown as a radio pair (`● One commit   ○ Range up to HEAD`, `(*)`/`( )` in ASCII), never the `›` of a cursor. The preview below the list is Frost Text and Pewter: an empty comparison reads "No changed files · [Tab] compares a range instead" there, once, never in green and never repeated in the status line. Search and the mode toggle are footer keys (`[/] search`, `[Tab] commit / range`), with the mode toggle kept longer, since it is the picker's main switch.
- **Says it in the card:** what the picker shows, and why it can't, is said in the preview where the eye already is; the status line stays quiet, and so does loading. A merge at HEAD reads "A merge has two parents. [h/l] picks which one to compare against." and the keys row offers `[h/l] parent`; a name that isn't here reads "No commit, branch or tag by that name here."; too far back reads "This repository doesn't have that many commits before HEAD." The preview names the endpoints on their own lines, Parent and Commit in commit mode or Start and Head in range mode, by hash and subject with the labels aligned. While a hash or HEAD~N is being typed it says what Enter will compare instead, so an older answer never reads as the new one. `HEAD~N` follows first parents, as git does.
- **Typed inputs:** `n` asks for "Commits back from HEAD (HEAD~N)" with 2 suggested, and the first digit replaces it; `r` asks for a "Commit hash, branch or tag". Each footer says what Enter will compare.
- **Previous Reviews:** one row per Review: when, then its counts, then any historical outcome.
- **Pointer:** a click selects a choice or a Review; a click on the one already selected opens it, as Enter does.
- **ASCII icons:** `+` new, `@` continue, `=` commit or range, `%` Previous Reviews. None of them reuses the `>` cursor or the `-` separator.

### Header
- **Form:** one row on Graphite Pane: `BuildFrame / <route>` on the left; the source word (Pewter) and the agent's connection (`● Pi`) on the right. On a Review the row below already names it (`Current Review · ◆ ━━━━ … now`), so the header reads just `BuildFrame`, and that row adds nothing after `now`; the Diff title says what it covers.
- **Say it once:** a name or a whole answer appears in one place on screen. When the Diff card beside History holds the selected Message without paging, History shows its short preview. Home with a Review open says "Welcome back" and names the Current Review only in its first choice.
- **Past step:** the source word becomes `PAST STEP` in Brass, so the header never says live while the Diff shows the past.
- **Hidden:** the agent's connection moves to the end of the history row, so it is never lost.

## Do's and Don'ts

### Do:
- **Do** express every state as glyph, word and tone through `reviewingStatus.ts`, so it reads the same in all three places it appears.
- **Do** keep the reader's place: a refresh, an answer landing or a list toggle keeps the selected file and Diff line (matched by path and line).
- **Do** ask for a second Esc before throwing away typed text; an empty draft closes on one.
- **Do** give every Unicode glyph an ASCII twin and every color a meaning that survives `--no-color`.
- **Do** add new colors as roles in `SemanticTheme` with values in all three themes, never as one-off hex literals in views.
- **Do** collapse chrome before code at narrow widths (shorter header words, ranked keys, then single pane below 90 columns).
- **Do** show the visible window as ordinals (`· 12-40/310`) rather than drawing scrollbars.
- **Do** let a key that acts on the Review (write, copy, switch, send, interrupt, quit) wait while it loads: say "Still loading (…); press a again in a moment." rather than act on the wrong thing or do nothing. Movement keeps working, and `q` quits only when nothing is loading or saving.
- **Do** fit text to the width it actually has. Wrap instructions and recovery sentences; never let OpenTUI's middle truncation cut them.
- **Do** state an empty result plainly in Pewter with the way on ("No changes since your last commit. [f] shows all files."). Nothing changed is a fact, not a caution.

### Don't:
- **Don't** use the accent for anything except focus and selection.
- **Don't** put a wash behind a single word, or add a fourth surface tint.
- **Don't** animate anything except the work-in-progress spinner and opt-in eased scrolling (`motion: off` disables the latter).
- **Don't** rely on color alone to separate states. If two states differ only by color, give them different glyphs.
- **Don't** pair a dark-only preset (Warm Carbon, Indigo Night) with a light terminal and expect legibility. Only Match terminal and Quiet Paper are built for light backgrounds.
- **Don't** let a theme's warning share its accent's hue. Caution and focus must stay distinguishable.
