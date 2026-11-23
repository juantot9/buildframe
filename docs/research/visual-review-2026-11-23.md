# BuildFrame visual review

Date: 2026-11-23. Build: `a8c7b13` (0.1.0 candidate).
Method: Impeccable critique, Operate mode, design review only. The detector reads web markup, so it doesn't apply to a terminal UI. One reviewer, no second isolated pass.

The UI was captured, not guessed. A temporary vitest scenario (`createTestRenderer` + `createReviewingApplicationForTest`) drove the real app through Home, a live Review (6 files: modified, added, deleted, nested), a 222-line Diff with long lines, side-by-side, the composer, a sent and answered Message, `?`, `/`, `e`/`m`, `z`, `c` and the commit picker. It ran at 80x24, 120x34 and 180x45, in default and `--ascii --no-color`, plus Quiet Paper, Warm Carbon and Indigo Night at 120x34. Colour came from `captureSpans()`, rendered to PNG for viewing.

## Verdict

It doesn't look wrong, and the language holds: one accent, glyph + word + tone everywhere, the Diff keeps the room. What holds it back is mostly finish work:

1. Dialogs float over half-visible panes, so cut-off text shows around every overlay.
2. Pane titles have no hierarchy. The whole row is bold, and in accent when focused.
3. Some layouts break the system's own rules: the answer printed twice, side-by-side at 25 cells, the code jumping sideways.

Most fixes are small and match rules already written in DESIGN.md.

Scores (Nielsen, 0–4): status 3, match 3, control 3, consistency 2, error prevention 3, recognition 3, efficiency 3, minimalism 2, recovery 3, help 2. Total **27/40**.

What already works:
- File status colours (letter only: A green, D red, M brass) match the 2026-11-21 research, and the screen reads calmly.
- History rail (`◆ ━━━━ ○ ━━━━ #1 ━━━━ now`) is distinctive and compact.
- Footer discipline: two fixed rows, the anchor on the right, mode-specific keys.

---

## Ranked proposals

Each entry: what you see now, the change, a mockup, why it helps, and effort with location. Line numbers are at `a8c7b13`.

### 1. Give every centred dialog a quiet backdrop, and move focus into it (larger)

**Screens:** `/` search, `?` keys, `c` Configuration, `e`/`m` jump lists. All widths.

Now (120x34, `/`): the panes show through at the edges, cut mid-word. The Files pane keeps its accent border and `FOCUSED`, so two accent frames compete.

```
│▌ Files FOCUSED  Changed│ │  Diff  since last commit · app/server.ts · 11-20/229 …
│    M  guide.md╭──────────── Search this Review ────────────╮6  ✓ answered  │
│  ▾ src/       │ File paths and added or removed text in the …│ connect wait  │
│    ▾ app/     │ / retry▏                                     │he first       │
```

At 80x24, `?` leaves one-cell slivers on each side (`│▌│`, `│6│`, `│›│`), which read like rendering errors.

Change:
- Behind every centred dialog, paint the body in Ground with the pane text in Pewter, or blank it. The send confirmation already does this (`reviewing-message-commit-gate-backdrop`).
- While a dialog is open, no pane shows the accent border or `FOCUSED`. The dialog frame is the only accent on screen.

```
│   Files  Changed       │ │  Diff  since last commit · …   (all pane text dimmed to Pewter)
│    M  guide.md╭──────────── Search this Review ────────────╮               │
│  ▾ src/       │ / retry▏                                    │               │
```

Why: one place to look. Cut-off words around a box are the main reason the app can look "unfinished" while doing everything right.

Effort: medium. `reviewingView.ts:4104` (the existing backdrop pattern), the overlays in `reviewingView.ts:3923` (jump list), `reviewingSearchDialog.ts:29`, `shellChrome.ts:219` (keys), the Configuration overlay, and `shownFocus` in `paneTitle` (`reviewingView.ts:458`).

### 2. Split pane titles into name and meta (quick)

**Screens:** every Review pane, all widths and themes.

Now: the whole title is one bold label, in accent when focused (`fg: focused ? accent : text, bold: true`):

```
│▌ Diff FOCUSED  since last commit · server.ts · 11-20/229   │     ← all bold accent
│  History  1 Message         │                                  ← all bold Frost
```

DESIGN.md's type scale says counts and positions are *Meta (regular, Pewter)*. The code doesn't follow it, so the title row is as loud as the selected line.

Change: the name (and `FOCUSED`) stays bold, in accent when focused. Everything after the two spaces is regular Pewter.

```
│▌ Diff FOCUSED  since last commit · server.ts · 11-20/229   │
   ^ bold accent   ^ from here: Pewter regular
```

Why: the eye finds the pane name first, then the detail. It also halves the amount of accent on screen.

Effort: small. `paneTitle`, `reviewingView.ts:447-484`: return two spans instead of one `label`. `shellHome.ts:60` has the same pattern for Home and Commits.

### 3. Don't print the answer twice at 120 columns (quick)

**Screen:** Review after an answer, 120x34. It is correct at 180x45.

Now: the Diff card shows the whole Message and answer, and History beside it shows the whole thing again (17 rows).

```
│╭─ #1 src/app/server.ts:16 · ✓ answered ─────────╮│ │ ● › #1 line 16  ✓ answered  │
││ Why does connect wait before the first attempt? ││ │ │    Why does connect wait  │
││ ↳ It does not wait before the first attempt: …  ││ │ │    ↳ It does not wait     │
││   The 250 ms you saw is `delayMs`, used between ││ │ │      before the first     │
││   No code changes                               ││ │ │      … (11 more rows)     │
```

Cause: `diffShowsSelected` treats the card as "fits" only if it needs ≤10 rows at its smallest height (`reviewingView.ts:957-976`). Here it needed 11, so History expands, even though the card on screen shows everything without paging.

Change: judge the card's actual height, or keep History to the 3-row preview whenever an expanded card for the same Message is visible in the Diff. That is DESIGN.md's "Say it once" rule.

```
│ ● › #1 line 16  ✓ answered  │
│ │    Why does connect wait… │
│ │    ↳ It does not wait…    │
```

Effort: small. `reviewingView.ts:957-976`.

### 4. Side-by-side needs room, or it should say so (larger)

**Screen:** `v` in the Diff, 120x34 (three panes) and 80x24.

Now: each side is about 25 cells, so ordinary lines wrap into three rows. 27 rows show 9 lines. It also opens scrolled into the middle of a wrapped line, and `retry.js` breaks after the dot:

```
│▌ Side-by-side FOCUSED  server.ts · 2-11/229               │
│        from '../lib/retry.           from '../lib/retry.  │
│        js';                          js';                 │
│     4    const value0 =           4    const value0 =     │
│        compute(0, 'step-0');         compute(0, 'step-0');│
```

At 180x45 it is good (each side about 50 cells).

Change, picking one:
- (a) While side-by-side is on and each side would be under about 60 cells, hide Files and History the way `z` does, and restore them on `v`. The title then says `code only` (zoom research: "the user's choice is a preference applied when it fits").
- (b) Refuse below the threshold with one status sentence ("Side-by-side needs a wider Diff; z gives it the whole width.").

(a) feels better.

```
│▌ Diff FOCUSED  side by side · since last commit · server.ts · 1-34/229          │
│     1  import { createServer } from 'node:h…    1  import { createServer } from …│
```

Also keep the title word `Diff` with `side by side` as detail (now it swaps to `Side-by-side` and drops "since last commit"), and start at line 1, not mid-line.

Effort: medium. Title at `reviewingView.ts:2795`. The width policy lives with the layout geometry (`effectivePaneGeometry`).

### 5. Make the loading frame the same shape as the loaded one (larger)

**Screen:** opening a Review, all widths. This is a feel issue.

Now: the first frame and the ready frame differ in five ways. Titles sit in the border, then move inside. Pane widths change (24/64/24 → 24/59/29). The right pane is `Messages`, then `History`. The Diff pane is `Current Review`, then `Diff`. The footer says `[ and ] versions`, then `[ and ] history`.

```
╭─ Files ──────────╮ ╭─ Current Review ───────────╮ ╭─ Messages ──────╮   [ and ] versions
            ↓ a moment later
╭──────────────────╮ ╭──────────────────────────╮ ╭──────────────────────╮
│  Files  Changed  │ │▌ Diff FOCUSED  since …   │ │  History  0 Messages │   [ and ] history
```

DESIGN.md already says "Words never flip while something loads".

Change: render the pending state with the real pane geometry and title rows (`Files`, `Diff`, `History`), put `Loading…`/the spinner where the content goes, and pick `history` vs `versions` from the requested Review kind (live → history) before the read returns.

```
╭──────────────────╮ ╭──────────────────────────────────╮ ╭──────────────────────╮
│  Files           │ │▌ Diff FOCUSED                    │ │  History             │
│  Loading…        │ │  ⠋ Saving a snapshot of the code…│ │  Loading…            │
```

Effort: medium. Pending shell at `reviewingView.ts:3355-3410` (`title: ' Files '`, `' Messages '`), footer word at `reviewingKeys.ts:236`.

### 6. Inset the Message card one cell inside the Diff (larger, cheap to try)

**Screen:** any Message card or the composer, all widths. Worst in ASCII.

Now: the card's border sits flush against the pane border, so every row starts and ends with a double rule. In ASCII it becomes `||`, which is also the focused-title marker:

```
│╭─ #1 src/app/server.ts:16 · ✓ answered ──────────╮│
││ Why does connect wait before the first attempt? ││
|+- #1 src/app/server.ts:15 - + answered ----------+|
|| Why does connect wait before the first attempt? ||
```

Change: one cell of margin on both sides of the card (costs 2 cells of card width).

```
│ ╭─ #1 src/app/server.ts:16 · ✓ answered ───────╮ │
│ │ Why does connect wait before the first        │ │
│ ╰───────────────────────────────────────────────╯ │
```

Why: the card reads as an object in the code, not a second frame, and ASCII loses the `||` ambiguity.

Effort: small–medium. `borderedBox` for `reviewing-expanded-message-card` (`reviewingView.ts:1928`), the question card (`~1563`) and the composer; widths are already computed from `diffWidth - 2`.

### 7. Stop the code jumping right when the first Message lands (quick)

**Screen:** the Diff, the moment `#1` is saved. All widths.

Now: the Message-mark column (3 cells) appears only once the file has a Message, so every code row shifts right:

```
│    15   15     const value11 = compute(11, 'step-11');    │   before
│    15   15        const value11 = compute(11, 'step-11'); │   after
│▌   16   16 ●1     const value12 = compute(12, 'step-12'); │
```

Change: reserve the column whenever the Diff is in a Review that can take Messages (live or fixed), so `●1` drops into space that was already there. Or move the mark into the gutter's spare cell between the line numbers and `+`/`-`.

Why: the code you're reading never moves under you. That counts toward the "feel is a priority" rule.

Effort: small. `LINE_MESSAGES_WIDTH` / `hasLineMessages` (`reviewingView.ts:1753-1757`).

### 8. Composer: start small, grow with the text, say what to type (quick)

**Screen:** `a`, all widths. Worst at 80x24.

Now: the empty composer is 9–12 rows tall (`Math.max(9, …)`). At 80x24 it takes 9 of the Diff's 16 rows: a title, six empty rows with no caret or prompt, then `Up/Down moves by row · paste goes at the cursor`.

Change: open at 3 text rows and grow to the current cap as lines are added (the anchor line is above, so growth only pushes code below). Put a Pewter placeholder in the first row. Drop the hint row; the footer already owns keys.

```
│ ╭─ New Message · src/app/server.ts:16 ────────────────╮ │
│ │ Ask about this line…                                 │ │
│ │                                                      │ │
│ ╰──────────────────────────────────────────────────────╯ │
```

Effort: small–medium. `embeddedHeight`, `reviewingView.ts:2335-2337`. Check the "steady size" rule: it applies to dialogs whose text changes, not to a text field the user is filling.

### 9. Answers: one tone, and the state word carries the colour (quick)

**Screen:** Message card and History, all themes.

Now: the first row of the answer is Sage and the rest is Frost, so the colour breaks mid-sentence. The whole card title (`#1 src/app/server.ts:16 · ✓ answered`) is Sage too, not just the badge:

```
↳ It does not wait before the first attempt: `retry`     ← Sage
  calls `work()` at once and only sleeps after a         ← Frost
```

Change: answer text is Frost throughout, with only `↳` in Sage (or Pewter). In the card title, the location is bold Frost and only `✓ answered` takes Sage. That matches DESIGN.md's "A state badge keeps its own tone".

Effort: small. `reviewingView.ts:1051` and `:1870` (`index === 0 ? colors.success`), title colour at `:1884-1889`.

### 10. Warm Carbon and Indigo Night: keywords wear the accent (quick)

**Screen:** any Diff in those themes.

Now:
- Warm Carbon accent `#e0ad62` vs keyword/markup `#dfad83`: both amber.
- Indigo Night accent `#9b8cda` vs keyword `#b4a1e8`: both violet.

Every `const`/`export` reads as focus colour. DESIGN.md: "No token takes the theme's accent".

Change: move each theme's keyword (and markup) to a hue at least about 40° from the accent. For example, Warm Carbon keyword toward a dusty rose `#d39a9a`, and Indigo Night keyword toward a blue-grey `#a8b6e0`. Re-check 4.5:1 on Pane and the washes.

Effort: small. `shellLook.ts:84,92` and `:111,119`.

### 11. Narrow-width pane strip: no wash behind a word, and a marker that survives ASCII (quick)

**Screen:** 80x24 (linear) and code only.

Now: the current pane in `Files   Diff   History 1  [Tab] switch` is accent on `accentSoft`, a wash behind one word (against "The Washes Are Rows Rule"). Under `--ascii --no-color` nothing marks it:

```
  Files   Diff   History 1  [Tab] switch          ← which one is open?
```

Change: bold accent with a leading `▌`, `>` in ASCII.

```
  Files  ▌Diff   History 1  [Tab] switch
  Files  >Diff   History 1  [Tab] switch          (ascii)
```

Effort: small. `reviewingView.ts:3180-3200`.

### 12. ASCII focus marker collides with the border (quick)

**Screen:** any focused pane under `--ascii`.

Now: `▌` becomes `|` right after the `|` border, which reads as a double rule: `|| Diff FOCUSED`, `|| Home FOCUSED`.

Change: in ASCII, use a blank cell (`| Diff FOCUSED`). The word `FOCUSED` already carries it, and the `>` cursor stays unique.

Effort: small. `reviewingView.ts:460`, `shellHome.ts:60`.

---

## Quick polish (wording and alignment)

Each one is a one-liner at the location given.

| # | Where (width) | Now | Change | Location |
|---|---|---|---|---|
| a | Jump list `m` (all) | `Messages · 1 Messages` | `1 Message`: use `plural()` | `reviewingView.ts:3943-3948` |
| b | History title while saving (120) | `History  0 Messages + 1 loc` (cut mid-word) | Drop `+ 1 local` first, or say `0 + 1 saving`; never cut | `reviewingView.ts:1444` |
| c | History local row | `＋ local line 16` (full-width plus, 2 cells) | `+ local line 16`, or `○` like the badge | `reviewingView.ts:1209` |
| d | `?` at 80x24 | `[J/K] Next / previous changed fi…`, `[x] Interrupt the selected Messa…` | Shorter labels that fit two columns at 80: "Next / previous file", "Interrupt Message", "Send Message again", "New Message here" | `reviewingKeys.ts:273,286` and siblings |
| e | `?` dialog (all) | Hint in the bottom border, `KEYS` uppercase in the top border, `[!] Action checks (debug)` listed | Title `Keys` like other dialogs; hint inside the box (or only in the footer, which already says `[?/Esc] close`); hide the debug row outside dogfood | `shellChrome.ts:219-223`, `shellKeys.ts:173` |
| f | `z` at 80x24 | `Code only. e lists files, m lists Messages, J/K move between files; z shows…` (cut; repeats the keys row) | `Code only. z shows every pane.` | `reviewingModel.ts:3523` |
| g | Home (all) | `◆ Start new Review`, `● Continue Current Review` | `◆` means a commit and `●` means connected (DESIGN.md). Use `＋`/`+` for new and `↻`/`@` for continue | `reviewingHomeRows.ts:57,70` |
| h | Commit picker (all) | `e5c1901e2015` (12 chars) in rows and preview | 7 characters, as everywhere else (`(f32adef)`) | `reviewingView.ts:3484,3542,3591` |
| i | Files pane (all) | `Files  Changed` then an unpadded `6 changed files` row | Title `Files  6 changed`; drop the row, or give it the 1-cell pane padding | `reviewingView.ts:636,735` |
| j | History empty (120) | `│No Messages yet. Press a` / `on a line or a file to` (no padding, `a` stranded at line end) | 1-cell padding; `No Messages yet.` then a Pewter line `[a] writes one on a line.` | `reviewingView.ts:877` |
| k | `/` results (all) | `+ src/app/server.ts:10  layMs: number } = {` (snippet starts mid-word); `+`/`-` uncoloured; match not marked | Start the snippet on a word boundary with `…`; colour `+`/`-` Sage/Rose; bold the matched text | `reviewingSearchDialog.ts:18-19` |
| l | `/` preview (all) | Shows lines 1–6 of the file for a match on line 10 | Centre the preview window on the match line, with line numbers | `reviewingSearchDialog.ts:43` |
| m | Wrapped Diff rows (120) | Continuation starts with a space: `                  => open(url), options); }` | Trim one leading space on continuation rows | Diff wrap helper (`displayCells.ts` wrap) |
| n | Diff title (all) | `12-38/229` while the gutter shows lines 11–37 of 222 (ordinals count display rows) | Count source lines, or label it (`rows 12-38/229`) so it doesn't contradict the gutter | `reviewingView.ts:462-466` |

## What I'd do first

Week 1, all small: 2, 3, 7, 9, 10, 11, 12 and quick polish a–j. Together they remove most of the noise without changing layout.

Then 1 (backdrop) and 6 (card inset) as one "overlays and cards" pass. Last, 4 and 5, which touch layout policy.

None of this needs new colours, tokens or dependencies. Every change brings the code back in line with a rule DESIGN.md already states.

## Notes

- Captures and their driver (`zzVisualCapture.test.ts`) stayed in the throwaway review worktree, uncommitted.
- Not covered: Previous Reviews with data, past-step (Brass) views, the send confirmation, F3 preview, a failed or interrupted Message, Nerd Font icons, `background: terminal`.
