# Key-hint footer patterns in keyboard-first terminal apps

Research date: 2026-11-17
Pinned sources: Charm bubbles [`v2.2.1`](https://github.com/charmbracelet/bubbles/tree/v2.2.1), Bubble Tea [`v2.1.1`](https://github.com/charmbracelet/bubbletea/tree/v2.1.1), lazygit [`v0.66.3`](https://github.com/jesseduffield/lazygit/tree/v0.66.3), gitui [`v0.28.1`](https://github.com/gitui-org/gitui/tree/v0.28.1), Zellij [`v0.46.0`](https://github.com/zellij-org/zellij/tree/v0.46.0), htop [`3.5.3`](https://github.com/htop-dev/htop/tree/3.5.3), GNU nano [`v9.3`](https://git.savannah.gnu.org/cgit/nano.git/tag/?h=v9.3) (read from the official [`nano-9.3.tar.xz`](https://www.nano-editor.org/dist/v9/nano-9.3.tar.xz)), Midnight Commander [`4.8.33`](https://github.com/MidnightCommander/mc/tree/4.8.33), k9s [`v0.51.0`](https://github.com/derailed/k9s/tree/v0.51.0), Helix [`25.07.1`](https://github.com/helix-editor/helix/tree/25.07.1), Codex CLI [`rust-v0.169.0`](https://github.com/openai/codex/tree/rust-v0.169.0), OpenCode [`v1.19.6`](https://github.com/anomalyco/opencode/tree/v1.19.6), Hunk [`v0.25.0` = `03f7ea4`](https://github.com/modem-dev/hunk/tree/03f7ea41946da29e6e814165af70247fdca03912). Claude Code docs are unversioned web pages, read on the research date.

See also: [terminal-command-discovery-patterns-2026-08-30.md](terminal-command-discovery-patterns-2026-08-30.md) covers how users *discover* commands. This note covers how the hint row stays calm and stable.

## Question

How do keyboard-first terminal apps show key hints at the bottom of the screen (a footer, help bar or status bar) without overwhelming the user or making the bar jump around as context changes? What makes a key-hint bar feel calm and stable versus noisy?

## Comparison

| Tool | Keys shown | Fixed or contextual | How many at once | When narrow | Full help | State or mode in the bar | Shifts when context changes |
|---|---|---|---|---|---|---|---|
| bubbles `help` | Whatever the app returns from `ShortHelp()` | Contextual. Disabled bindings are skipped | As many as fit on one line | Drops from the tail, then adds ` …` | `ShowAll` swaps in `FullHelp()` columns. The `?` toggle is app-defined | No | Yes. A disabled binding is removed, so the later ones slide left |
| lazygit | Bindings flagged `DisplayOnScreen`, then global Cancel and `?` | Per focused panel, plus mode items added at the front | 2–9 per panel, plus up to 2 global | Drops from the tail with ` \| …`. Global keys (including `?`) come last, so they are cut first | `?` opens a filterable menu: Local / Global / Navigation | Mode items in colour (rebase, cherry-pick, bisect, patch). App status sits to the left | Yes. Disabled items are hidden; mode items push everything right; app status shrinks the bar |
| gitui | Every `available` command, as `Name [key]` | Per component, sorted by a fixed `order` number | One line. `more [.]` expands it to all lines | Wraps into extra lines; collapsed it shows line 1 | `h` help popup, grouped | No | Less. Unusable commands stay in place but dimmed (`enabled: false`) |
| Zellij (default one-line bar) | 8 mode tiles. In a mode, that mode's keys | Tiles are fixed; the keys follow the mode | 8 tiles + up to ~13 mode keys (Pane mode) | Whole row: full labels → key only. Mode keys: long → short → best effort + ` ... ` | No single help screen. The hints *are* the help. Optional compact-bar tooltip | Selected tile is highlighted. Lock mode disables, not hides, the other tiles. `-- INTERFACE LOCKED --`, `FULLSCREEN` | Tiles never move. The right part changes with the mode |
| htop | F1–F10 with 6-cell labels | Fixed. The bar is replaced during search/filter | 10 | No fitting logic; the row is drawn left to right (clipping not verified) | F1 / `h` / `?` | Labels change in place: `Tree`/`List`, `Filter`/`FILTER`. `PAUSED` is appended | No. Read-only mode blanks slots instead of removing them |
| GNU nano | The current menu's functions, in definition order | Fixed per menu (main, search, write-out…) | Up to `((COLS+40)/20)*2`, so 12 at 80 cols, in 2 rows | Fewer columns; labels clipped inside equal-width cells | `^G` / F1 | `Exit` becomes `Close` in the same slot when several buffers are open | Only on a menu change, when the whole grid is swapped |
| Midnight Commander | F1–F10 | Slots fixed; labels set per screen (panels, viewer, editor) | 10 | Each slot is at least 7 cells; below 70 cols the right-hand slots get no width | F1 | Labels name the toggle: `Wrap`/`UnWrap`, `Hex`/`Ascii` | No. Empty labels keep their slot |
| k9s | The current view's own actions, in a grid in the header | Per view. App-wide ("shared") actions are left out | Up to 6 rows × N columns | Not verified | `?` | No | Yes. Sorted alphabetically by description, so adding one moves others |
| Helix | No footer hints. An infobox appears after a prefix key | Per prefix (`Space`, `g`, `z`, `m`, `Ctrl-w`) | That prefix's whole table | Not verified | `auto-info` popup; `:help`-style docs | Status line shows the mode (`NOR`/`INS`/`SEL`) | Not applicable |
| Codex CLI | `? for shortcuts`, one action (`tab to queue message`), mode label | Contextual by composer state | Usually 1–3 | Labels have short forms, applied in a fixed collapse order, then dropped by priority; survivors keep reading order | `?` swaps the footer for a grouped overlay | `Plan mode (shift+tab to cycle)`, "press again to quit" | Some. Hints appear and disappear, but the order is fixed |
| Claude Code | `? for shortcuts` (docs) | Contextual | One hint, plus a mode indicator | Notifications can truncate the status line (docs) | `?` on empty input toggles a shortcut panel | Mode indicator cycled with `Shift+Tab` | Not verified |
| OpenCode | `<palette> commands`, `<cycle> agents`, `esc interrupt` | Contextual (idle / busy / shell mode) | 2–3 | Not verified | Command palette. The help dialog just points to it | Busy spinner; `esc again to interrupt` | Some. Left side changes when busy |
| Hunk | No key hints in the status row | n/a | 0 | Status items drop whole by priority; the mode badge is never dropped | `?` dialog; F10 menus | Keyboard-mode badge | The row is removed when empty, so the body grows by one line |

## Findings

### bubbles: two tiers, with order and visibility owned by the app

`help.KeyMap` has two methods. `ShortHelp() []key.Binding` returns the one-line bar and `FullHelp() [][]key.Binding` returns columns. Both render "in the order in which the help items are returned". `Model.ShowAll` picks which one `View` draws. Defaults: separator ` • ` for short help, four spaces between full-help columns, and ellipsis `…`.

Sources:

- [`help/help.go` L12-L28, KeyMap](https://github.com/charmbracelet/bubbles/blob/v2.2.1/help/help.go#L12-L28)
- [`help/help.go` L76-L113, Model, defaults, View](https://github.com/charmbracelet/bubbles/blob/v2.2.1/help/help.go#L76-L113)

Disabled bindings vanish rather than dim. `ShortHelpView` and `FullHelpView` both `continue` past `!kb.Enabled()`, and a full-help column with no enabled bindings is dropped. `Enabled()` is false after `SetEnabled(false)` or `Unbind()`. The package comment says the help "should self-manage". The effect is that everything after a disabled binding slides left.

Sources:

- [`help/help.go` L137-L140, L187-L188, L246-L253](https://github.com/charmbracelet/bubbles/blob/v2.2.1/help/help.go#L137-L140)
- [`key/key.go` L103-L121](https://github.com/charmbracelet/bubbles/blob/v2.2.1/key/key.go#L103-L121)

Width handling is tail truncation. Once the next item would pass `width`, the bar ends with ` …` if that fits. As written, if even the ellipsis does not fit, `shouldAddItem` returns `ok` and the item is appended anyway. There is no priority: whatever comes last in `ShortHelp()` is cut first.

Source: [`help/help.go` L125-L167, L234-L244](https://github.com/charmbracelet/bubbles/blob/v2.2.1/help/help.go#L125-L167)

`?` is not built into `help`. The Bubble Tea example binds `?` itself and flips `ShowAll`. Its short help is just `? toggle help • q quit`, and every other key lives only in the full view.

Source: [`examples/help/main.go` L25-L38, L104-L105](https://github.com/charmbracelet/bubbletea/blob/v2.1.1/examples/help/main.go#L25-L38)

The `list` bubble shows the expected use:

- It recomputes enabled bindings from state in `updateKeybindings`. While filtering, it disables movement, quit and help and enables only `esc cancel` and `enter apply filter`.
- `?` exists twice with two labels: `? more` and `? close help`.
- Toggling `ShowAll` reflows the list, because the help area changes height.

Sources:

- [`list/list.go` L729-L773](https://github.com/charmbracelet/bubbles/blob/v2.2.1/list/list.go#L729-L773)
- [`list/keys.go` L81-L88](https://github.com/charmbracelet/bubbles/blob/v2.2.1/list/keys.go#L81-L88)
- [`list/list.go` L896-L900](https://github.com/charmbracelet/bubbles/blob/v2.2.1/list/list.go#L896-L900)

### lazygit: per-panel bar, explicitly hides what is disabled

The bar takes the focused context's bindings and then adds global bindings whose key the context does not already use. It keeps only those with `DisplayOnScreen`, not disabled, and with a non-empty short description. Panels flag 2–9 bindings; for example, files flags 7 and merge conflicts 9. The global ones are Cancel (Esc, hidden when there is nothing to cancel) and `Keybindings: ?`.

Sources:

- [`pkg/gui/options_map.go` L37-L71](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/options_map.go#L37-L71)
- [`global_controller.go` L86-L103, L309-L317](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/global_controller.go#L86-L103)

The decision to hide is documented on the field: "the keybinding will not be displayed if it is currently disabled. We could instead display it with a strikethrough, but there's limited realestate … so we're hiding it instead". The bar also uses a separate `ShortDescription`, so one key can carry two labels: one in the bar and another in the `?` menu.

Source: [`pkg/gui/types/keybindings.go` L15-L35](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/types/keybindings.go#L15-L35)

Mode items are put at the *front* in fixed colours:

- paste commits (cyan) during cherry-pick;
- bisect (green);
- rebase/merge state and patch options (yellow).

The style-guide comment reserves colour for "a specific mode where the user is likely to want to press that key". Each prepend pushes the rest of the bar right.

Source: [`options_map.go` L32-L36, L73-L107](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/options_map.go#L73-L107)

Items are written as `Description: key`, joined by ` | `. When the next one does not fit, the bar ends with ` | …`. Because globals are added after context bindings, `Keybindings: ?` is the first thing lost on a narrow terminal.

Source: [`options_map.go` L112-L141](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/options_map.go#L112-L141)

The bottom line is one row with three parts:

- the app status (a spinner and text, sized to its content) on the left;
- the options bar, which takes the flexible remainder;
- an information section on the right.

When a status appears, the options bar starts later and is shorter. `gui.showBottomLine: false` hides the row "except to display a loader".

Sources:

- [`window_arrangement_helper.go` L144-L151, L325-L345](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/helpers/window_arrangement_helper.go#L325-L345)
- [`docs/Config.md` L288-L291](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L288-L291)

`?` (`keybinding.universal.optionMenu`) opens a menu titled "Keybindings" with three sections: Local (the current panel), Global and Navigation. It is filter-as-you-type. Disabled items are *shown* there, with their disabled reason, unlike the bar.

Sources:

- [`options_menu_action.go` L17-L92](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/options_menu_action.go#L17-L92)
- [`docs/Config.md` L730](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L730)
- [`pkg/i18n/english.go` L1604-L1607](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/i18n/english.go#L1604-L1607)

### gitui: dim, don't hide; fixed order numbers; a "more" toggle

`CommandInfo` separates three flags:

- `available` ("available in current app state"): whether it is listed at all.
- `enabled` ("available but not active in the context"): drawn in `disabled_fg` instead of `command_fg`.
- `quick_bar`: `hidden()` keeps a command out of the bar but in help.

`order` sorts the bar: `PRIORITY` 1, `AVERAGE` 10, `NAV` 20, `RARE_ACTION` 30; Help is 99 and Quit 100. Help and Quit therefore always sit at the end, in a predictable place.

Sources:

- [`src/components/command.rs` L39-L87](https://github.com/gitui-org/gitui/blob/v0.28.1/src/components/command.rs#L39-L87)
- [`src/strings.rs` L9-L14](https://github.com/gitui-org/gitui/blob/v0.28.1/src/strings.rs#L9-L14)
- [`src/ui/style.rs` L213-L220](https://github.com/gitui-org/gitui/blob/v0.28.1/src/ui/style.rs#L213-L220)
- [`src/app.rs` L1106-L1160](https://github.com/gitui-org/gitui/blob/v0.28.1/src/app.rs#L1106-L1160)
- [`src/popups/help.rs` L97-L130](https://github.com/gitui-org/gitui/blob/v0.28.1/src/popups/help.rs#L97-L130)

The command bar wraps commands into as many lines as needed, separated by single spaces. Labels carry their own key, as in `Help [h]`. When there is more than one line, 9 columns on the right hold `more [.]` / `less [.]`. Collapsed, the bar is one row high; `.` (`cmd_bar_toggle`) expands it to all rows, and the main area shrinks to fit.

Sources:

- [`src/cmdbar.rs` L37-L137, L179-L197](https://github.com/gitui-org/gitui/blob/v0.28.1/src/cmdbar.rs#L63-L137)
- [`src/app.rs` L258-L275, L348-L356](https://github.com/gitui-org/gitui/blob/v0.28.1/src/app.rs#L258-L275)
- [`src/keys/key_list.rs` L151, L182](https://github.com/gitui-org/gitui/blob/v0.28.1/src/keys/key_list.rs#L182)

The `h` popup gets *all* commands (`force_all`), drops `hide_help` ones, de-duplicates them and groups them under reversed group headings. The selected row expands to show its long description.

Sources:

- [`src/app.rs` L661-L666](https://github.com/gitui-org/gitui/blob/v0.28.1/src/app.rs#L661-L666)
- [`src/popups/help.rs` L187-L245](https://github.com/gitui-org/gitui/blob/v0.28.1/src/popups/help.rs#L187-L245)

### Zellij: a fixed row of mode tiles that shortens as a whole

The default layout gives `status-bar` one row, which renders `one_line_ui`. `classic.kdl` gives it two rows (`classic true`). `compact.kdl` replaces it with `compact-bar`.

Sources:

- [`layouts/default.kdl`](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-utils/assets/layouts/default.kdl)
- [`layouts/classic.kdl`](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-utils/assets/layouts/classic.kdl)
- [`layouts/compact.kdl`](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-utils/assets/layouts/compact.kdl)
- [`status_bar/mod.rs` L678-L787](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/mod.rs#L678-L787)

The left part is always the same 8 tiles in the same order: LOCK, PANE, TAB, RESIZE, MOVE, SEARCH, SESSION, QUIT.

- The current mode's tile is marked `Selected`, and its key becomes the "back to Normal" key.
- In Locked mode the other tiles are set `Disabled`, not removed.
- Width degrades the *whole* row at once. The one-line bar goes from full labels with inline keys to keys only. When the modes share no common modifier, it uses 2-letter labels (`Pa`, `Ta`) instead. The classic first line goes from full labels, to shortened modifiers (`^C`), to keys only, and then to nothing.

No tile moves when the mode changes.

Sources:

- [`status_bar/first_line.rs` L47-L120 (labels), L266-L309 (three-step fitting), L546-L660 (fixed tile list, Selected/Disabled)](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/first_line.rs#L546-L660)
- [`status_bar/one_line_ui.rs` L520-L600](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/one_line_ui.rs#L520-L600)

What sits right of the tiles depends on the mode:

- **Normal and Locked:** a session hint, or right-aligned secondary keys (new pane, focus, resize). Focus and resize appear only when there is more than one selectable pane.
- **Any other mode:** that mode's own keys, each with a long and a short label (Pane mode has 13, such as "Toggle Fullscreen"/"Fullscreen"). Fitting goes full list → short labels → as many as fit plus ` ... `.

Sources:

- [`one_line_ui.rs` L24-L72](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/one_line_ui.rs#L24-L72)
- [`one_line_ui.rs` L798-L860, L1098-L1108, L1742-L1757](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/one_line_ui.rs#L1098-L1108)
- [`status_bar/second_line.rs` L118-L135, L297-L349](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/second_line.rs#L297-L349)

State messages *replace* the hint area instead of being mixed into it:

- In classic Normal mode the second line shows a rotating tip, not keys.
- Locked shows ` -- INTERFACE LOCKED -- `.
- Fullscreen, floating panes, "copied" and clipboard errors each get their own line.

Sources:

- [`second_line.rs` L48-L58, L271-L295](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/second_line.rs#L271-L295)
- [`status_bar/mod.rs` L789-L829](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/mod.rs#L789-L829)

The compact bar shows only tabs and a mode word. If a `tooltip` key is configured, entering any non-base mode opens a floating key tooltip, which closes on return to the base mode. Pressing the key keeps it open ("persisted").

Source: [`compact_bar/mod.rs` L33-L37, L520-L558](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/compact_bar/mod.rs#L520-L558)

### htop: ten fixed slots, labels swapped in place

The main bar is `F1`–`F10` followed by fixed 6-cell labels (`"Help  "`, `"Tree  "`). The read-only variant replaces Nice−/Nice+/Kill with six spaces, so the slots stay where they are.

State is shown by rewriting a label in its slot:

- F5 reads `List` or `Tree`, whichever the key will do next.
- F4 becomes `FILTER` in capitals while a filter is active.
- `PAUSED` or a read failure is appended after the keys.

Sources:

- [`MainPanel.c` L29-L36, L206-L219, L237-L262](https://github.com/htop-dev/htop/blob/3.5.3/MainPanel.c#L29-L36)
- [`FunctionBar.c` L83-L92, L98-L149](https://github.com/htop-dev/htop/blob/3.5.3/FunctionBar.c#L98-L149)

`FunctionBar_drawExtra` draws left to right with no width fitting. That curses clips text past the right edge is an inference, not verified.

Search and filter replace the whole bar with an input bar (`F3 Next  S-F3 Prev  Esc Cancel  Search:`, `Enter Done  Esc Clear  Filter:`).

Source: [`IncSet.c` L39-L56](https://github.com/htop-dev/htop/blob/3.5.3/IncSet.c#L39-L56)

Help is `F1`, `h` or `?`. The bar can be hidden with `--no-function-bar` or the setting "Hide main function bar (0 - off, 1 - on ESC until next input, 2 - permanently)". An active search or filter bar is never hidden.

Sources:

- [`htop.1.in` L56-L57, L186-L187](https://github.com/htop-dev/htop/blob/3.5.3/htop.1.in#L186-L187)
- [`DisplayOptionsPanel.c` L317](https://github.com/htop-dev/htop/blob/3.5.3/DisplayOptionsPanel.c#L317)

### GNU nano: a fixed grid per menu, sized by width

`bottombars(menu)` shows the first `shown_entries_for(menu)` functions of the menu, in definition order. The count is capped at `((COLS + 40) / 20) * 2`, which is 12 at 80 columns. They fill two rows column by column (`index % 2` is the row), and every cell is `COLS / columns` wide. A label too long for its cell is clipped, and the description is skipped if fewer than 2 cells remain. Source comments ask translators to keep the labels "at most 10 characters".

Sources:

- [`src/winio.c` L2419-L2491](https://git.savannah.gnu.org/cgit/nano.git/tree/src/winio.c?h=v9.3#n2419)
- [`src/global.c` L484-L501, L776-L779](https://git.savannah.gnu.org/cgit/nano.git/tree/src/global.c?h=v9.3#n484)

Within a menu the grid never changes. A different menu, such as the search prompt or Write Out, swaps in a whole new grid. The one in-place change is `Exit` becoming `Close` in the same cell when more than one buffer is open.

Source: [`src/files.c` L59-L60, L627-L628](https://git.savannah.gnu.org/cgit/nano.git/tree/src/files.c?h=v9.3#n59)

Ways to hide the bar:

- `-x`/`--nohelp` and `set nohelp` hide the two lines.
- `M-X` toggles them in every menu except the help viewer and the linter.
- `set zero` hides all chrome.
- `set minibar` puts buffer state in the status-bar row.

Full help is `^G`/F1.

Sources:

- [`doc/nanorc.5` L219-L230, L258-L259, L451-L455, L1010-L1013](https://git.savannah.gnu.org/cgit/nano.git/tree/doc/nanorc.5?h=v9.3#n258)
- [`doc/nano.1` L380-L381](https://git.savannah.gnu.org/cgit/nano.git/tree/doc/nano.1?h=v9.3#n380)
- [`src/global.c` L1278, L1487, L1596](https://git.savannah.gnu.org/cgit/nano.git/tree/src/global.c?h=v9.3#n1487)

### Midnight Commander: ten slots aligned to the panels

The button bar always has 10 slots, numbered `1`–`10`. Each is at least 7 cells.

- **Below 70 columns,** slots that no longer fit get zero width, and drawing stops at the first one, so the right-hand keys drop.
- **Wider,** extra width is shared out so that the F5/F6 boundary lines up with the divider between the two panels.

Each label is fitted to its slot with `str_fit_to_term`. An empty label keeps its slot.

Source: [`lib/widget/buttonbar.c` L63-L108, L178-L201, L263-L282](https://github.com/MidnightCommander/mc/blob/4.8.33/lib/widget/buttonbar.c#L63-L108)

Each screen sets its own labels in the same slots: panels show Help, Menu, View, Edit, Copy, RenMov, Mkdir, Delete, PullDn, Quit. The viewer names the action a toggle will take: `Wrap`/`UnWrap`, `Hex`/`Ascii`, `Raw`/`Parse`, `Format`/`Unform`. It blanks slots that do not apply in hex mode.

Sources:

- [`src/filemanager/filemanager.c` L1639-L1648](https://github.com/MidnightCommander/mc/blob/4.8.33/src/filemanager/filemanager.c#L1639-L1648)
- [`src/viewer/display.c` L82-L126](https://github.com/MidnightCommander/mc/blob/4.8.33/src/viewer/display.c#L82-L126)

The man page describes "Keybar visible" ("10 labels associated with F1-F10 keys"); it is on by default.

Source: [`doc/man/mc.1.in` L1916-L1918](https://github.com/MidnightCommander/mc/blob/4.8.33/doc/man/mc.1.in#L1916-L1918)

### k9s: a header grid of view-local keys, sorted by wording

When a view is pushed, popped or comes to the top, the header menu rebuilds from that view's `Hints()`.

- It leaves out `Shared` actions (app-wide keys) and invisible ones.
- Numeric mnemonics (namespace shortcuts) go in their own first columns.
- The rest flow into a grid at most 6 rows high, keys padded to the column's widest key.
- Sort order is numbers first, then **alphabetical by description**. Adding or renaming one action moves its neighbours.

Sources:

- [`internal/ui/menu.go` L20-L23, L60-L103, L117-L149, L208-L216](https://github.com/derailed/k9s/blob/v0.51.0/internal/ui/menu.go#L79-L149)
- [`internal/model/menu_hint.go` L40-L54](https://github.com/derailed/k9s/blob/v0.51.0/internal/model/menu_hint.go#L40-L54)
- [`internal/ui/action.go` L50-L62, L192-L217](https://github.com/derailed/k9s/blob/v0.51.0/internal/ui/action.go#L192-L217)

`?` shows "active keyboard mnemonics and help". `ctrl-e` toggles the header, and `ui.headless: true` hides it at start. Behaviour when the terminal is too narrow for the grid was not verified.

Sources:

- [`README.md` L363, L394, L485-L486](https://github.com/derailed/k9s/blob/v0.51.0/README.md#L363)
- [`internal/view/app.go` L256, L305-L324](https://github.com/derailed/k9s/blob/v0.51.0/internal/view/app.go#L305-L324)

### Helix: no footer hints; a prefix table appears on demand

Helix has no key-hint bar. Its status line shows the mode as `NOR`/`INS`/`SEL`, and those strings can be configured. Prefix keys enter "minor modes": `g`, `m`, `z`/`Z`, `Ctrl-w`, `Space`.

Sources:

- [`book/src/editor.md` L119-L129](https://github.com/helix-editor/helix/blob/25.07.1/book/src/editor.md#L119-L129)
- [`book/src/keymap.md` L166-L180](https://github.com/helix-editor/helix/blob/25.07.1/book/src/keymap.md#L166-L180)

On a pending prefix, `autoinfo` is set straight away from the node's `infobox()`. Sticky nodes such as `Z` keep it open. The code read has no delay or timeout.

- Rows follow keymap definition order.
- Keys with the same description share one row (`k, up`).
- `no_op` keys are skipped.
- The box is drawn bordered at the bottom right, above the status line.
- `editor.auto-info` (default `true`) turns it off.

Sources:

- [`helix-term/src/keymap.rs` L75-L110](https://github.com/helix-editor/helix/blob/25.07.1/helix-term/src/keymap.rs#L75-L110)
- [`helix-term/src/ui/editor.rs` L841, L872, L1522-L1527](https://github.com/helix-editor/helix/blob/25.07.1/helix-term/src/ui/editor.rs#L1522-L1527)
- [`helix-term/src/ui/info.rs` L8-L40](https://github.com/helix-editor/helix/blob/25.07.1/helix-term/src/ui/info.rs#L8-L40)
- [`book/src/editor.md` L46](https://github.com/helix-editor/helix/blob/25.07.1/book/src/editor.md#L46)

### Codex CLI: one seed hint, label forms, priority drop, fixed reading order

The footer module separates two kinds of row:

- an **instructional** footer ("what to do next", such as a quit confirmation or a queue hint);
- a **contextual** footer (status line, agent label).

Instructional states win. `FooterMode` has six states:

- `ComposerEmpty`
- `ComposerHasDraft`, where "the shortcuts hint is suppressed"
- `ShortcutOverlay`
- `EscHint`
- `QuitShortcutReminder`
- `HistorySearch`

Idle with an empty composer, the hint is `? for shortcuts`, or `… for agents · ? for shortcuts`. With a draft while a task runs, it is `tab to queue message`. Transient lines are `<key> again to quit` and `esc again to edit previous message`.

Source: [`bottom_pane/footer.rs` L1-L24, L163-L200, L300-L345, L745-L800, L912-L930](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/tui/src/bottom_pane/footer.rs#L163-L200)

The passive-hint fitter states its rules up front: "Shorten or drop labels in collapse order. If a row still overflows, refill it in interaction priority order, then paint the surviving labels in reading order." Reading order is the declaration order of `Kind`, and the side (left or right) is fixed per kind.

- **Collapse order:** drop `Shortcuts`, then shorten the Plan, Warning, Ide and Action labels, then drop `Agents`.
- **Priority, when a row is refilled:** `Action` first and `Shortcuts` last.

The footer asks for a second row only when an input mode and a current action fit apart but not together.

Source: [`chat_composer/passive_hints.rs` L1-L30, L102-L195](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/tui/src/bottom_pane/chat_composer/passive_hints.rs#L140-L195)

`?` toggles `ShortcutOverlay`, which replaces the footer with a grouped reference ("Compose", …). It flows into 3, 2 or 1 columns. Its keys come from the live bindings, so remapped and disabled keys show correctly.

Source: [`bottom_pane/shortcut_overlay.rs` L1-L5](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/tui/src/bottom_pane/shortcut_overlay.rs#L1-L5)

### Claude Code (docs only)

From the [interactive mode](https://code.claude.com/docs/en/interactive-mode) page:

- `?` on empty input means "Toggle the shortcut help panel". Typed when the input already has text, it inserts the character.
- `Shift+Tab` cycles permission modes shown in a "mode indicator" (`default` is labelled "Manual").
- The docs warn: "Keyboard shortcuts may vary by platform and terminal."

From the [status line](https://code.claude.com/docs/en/statusline) page:

- A custom status line "renders in its own row above the built-in footer badges".
- "With a custom status line configured, Claude Code stops showing some footer hints, such as `? for shortcuts`".
- It "temporarily hides during … the help menu and permission prompts".
- Updates are event-driven and "debounce[d] at 300ms".
- Notifications share the row and "may truncate your status line output" on narrow terminals.

Rendering code was not checked.

### OpenCode: two hints and a two-press interrupt

The row under the prompt has two sides:

- **Right:** `<palette key> commands`, plus either usage (context · cost) or `<agent key> agents`. In shell mode it is `esc exit shell mode` instead.
- **Left, while busy:** a spinner and `esc interrupt`. After the first press, the label reads `esc again to interrupt` in the primary colour.

The session footer below it is status only: directory, permission count, LSP and MCP counts, `/status`. It has no keys. The help dialog says only "Press `<key>` to see all available actions and commands in any context", meaning the command palette.

Sources:

- [`packages/tui/src/component/prompt/index.tsx` L1513-L1595, L1655-L1690](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/tui/src/component/prompt/index.tsx#L1655-L1690)
- [`packages/tui/src/routes/session/footer.tsx` L52-L90](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/tui/src/routes/session/footer.tsx#L52-L90)
- [`packages/tui/src/ui/dialog-help.tsx` L18-L38](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/tui/src/ui/dialog-help.tsx#L18-L38)

### Hunk: no key row; deterministic status fitting; row removed when empty

[hunk-diff-and-pane-patterns.md](hunk-diff-and-pane-patterns.md) does not cover the footer. At `v0.25.0`, Hunk has no persistent key hints.

The bottom row holds status items, an inline prompt and a keyboard-mode badge. Fitting is "deterministic":

- The badge "is never dropped".
- On overflow "the lowest-priority item is dropped whole (newest first among equals)".
- Only the last survivor is truncated with `…`.
- Next to an open prompt, right-hand items appear only whole, because "a clipped status fragment … reads as noise".

Source: [`packages/hunk/src/ui/statusLine/layout.ts` L1-L22, L111-L146, L193-L203](https://github.com/modem-dev/hunk/blob/03f7ea41946da29e6e814165af70247fdca03912/packages/hunk/src/ui/statusLine/layout.ts#L1-L22)

When there is nothing to show, the row is removed and the body gains its height (`statusBarVisible`). Each time a status appears or clears, the content moves by one line.

Sources:

- [`statusLine/StatusLine.tsx` L17-L24](https://github.com/modem-dev/hunk/blob/03f7ea41946da29e6e814165af70247fdca03912/packages/hunk/src/ui/statusLine/StatusLine.tsx#L17-L24)
- [`ui/App.tsx` L588-L592](https://github.com/modem-dev/hunk/blob/03f7ea41946da29e6e814165af70247fdca03912/packages/hunk/src/ui/App.tsx#L588-L592)

The `?` dialog is hand-written in its rows and wording, but its key column comes from live bindings. A disabled or unbound command shows no key, and a row left with no keys is dropped. F10 opens the top menus, which show keys the same way.

Sources:

- [`ui/lib/helpContent.ts` L1-L15, L142-L177](https://github.com/modem-dev/hunk/blob/03f7ea41946da29e6e814165af70247fdca03912/packages/hunk/src/ui/lib/helpContent.ts#L142-L177)
- [`docs/keybindings.md` L117, L187-L189](https://github.com/modem-dev/hunk/blob/03f7ea41946da29e6e814165af70247fdca03912/docs/keybindings.md#L187-L189)

### Cross-cutting: what reads as calm versus noisy

- **Calm: fixed slots.** htop, Midnight Commander, nano (within a menu) and the Zellij tiles never move a key. They change a label *in place* (`Tree`/`List`, `FILTER`, `Exit`/`Close`, `Wrap`/`UnWrap`) or blank the slot.
- **Noisy: hiding disabled keys in a flowing row.** bubbles and lazygit do this, and each hide slides the rest. gitui and Zellij Locked mode instead *dim* keys that cannot be used now.
- **Calm: shortening the whole row.** Zellij uses long → short → key-only, and Codex uses label forms with a fixed collapse order. Both keep the same keys in the same order. Tail truncation (bubbles, lazygit) loses whatever was declared last, which in lazygit is `?`.
- **Calm: few hints.** The AI CLIs show 1–3 hints plus a `?` seed and hide even that when it is not useful (Codex with a draft, Claude Code with a custom status line).
- **Noisy: mixing state into the key row.** lazygit's mode items push the bar, and its app status shrinks it. Calmer tools give state its own place: Zellij replaces the hint line with a state line, Codex separates instructional and contextual rows, htop appends after a fixed bar.
- **Noisy: content-driven order.** k9s sorts by description. Calmer tools use an explicit order number (gitui), the declared order (Codex reading order, Helix, nano) or fixed positions.
- **Noisy: changing row height.** Hunk removes the row when it is empty, bubbles' full help grows the bar, and gitui's `more` and Codex's second row add lines. Overlays (lazygit menu, Codex `?` overlay, Helix infobox, Zellij tooltip) leave the layout alone.

## Implications for BuildFrame

These are options, not decisions.

- **Give each key a fixed slot (htop / mc / Zellij tiles).** Every key BuildFrame can show gets a permanent position. A key that does not apply right now is dimmed or blanked, not removed, and labels may change only in place. This removes the jumping most directly. The cost is width spent on keys that cannot be used, and a dimmed key that means nothing under `--no-color`. That needs a non-colour form, such as leaving the slot blank or putting the label in parentheses.
- **Split a fixed anchor group from a contextual group.** `[?] keys  [q] quit` (and perhaps `[Esc] Home`) sit in one place that never changes, right-aligned like gitui's Help/Quit at order 99/100. Only the left group follows focus and mode. It is cheaper than full fixed slots and keeps the escape hatches still. The contextual half still moves, so it suits a short contextual set.
- **Cut the row to a seed plus 2–3 hints (Codex, Claude Code, OpenCode, Bubble Tea example).** Show `[?] keys` and only the actions most likely next, and move movement keys (`j/k`, `Tab`) and view toggles (`v`, `z`, `t`, `[`/`]`) to the `?` list. This answers "too much information" head-on. The trade-off is discoverability for first-time users, which an onboarding-only longer row or the existing grouped `?` list could cover.
- **Degrade by shortening before dropping (Zellij, Codex).** On a narrow row, go from `[v] side-by-side` to `[v]` key-only for every hint at once, then drop by rank while keeping the original reading order. Never drop `?` (unlike lazygit). Key-only is the one short form that respects "one label per key". Alternate short *words* (Zellij `Fullscreen` vs `Toggle Fullscreen`, lazygit `ShortDescription`) would break that rule.
- **Move state-driven actions out of the key row.** `[r] send again` and `[x] interrupt` appear and disappear with state, which is the jitter the owner sees. One option is to pair them with the row-1 status sentence that explains them, as OpenCode's busy row pairs a spinner with `esc interrupt` ("Send failed. [r] send again"). Another is to give them one reserved slot that is blank when unused. The first keeps the keys row purely structural. The second keeps every key in one row.
- **Swap the whole row on mode changes; avoid piecemeal edits (nano menus, htop search bar).** For composer and dialog modes, replace the keys row with that mode's own fixed set. A whole-row swap reads as "you are in a different mode"; per-key edits read as noise. Mark the mode in words (htop `FILTER`, Zellij `-- INTERFACE LOCKED --`) so it works under `--ascii` and `--no-color`.
- **Use a prefix popup for rarely used groups (Helix infobox, Zellij tooltip).** View toggles could live behind one prefix whose table appears at once, without animation, in a corner overlay. The row loses several hints at the cost of an extra keystroke and a new pattern to learn. It only pays off if those keys are rare in practice.
- **Keep the footer height constant.** Show full help as an overlay or dialog (lazygit menu, Codex overlay), as `?` already does. Do not grow the footer (bubbles `ShowAll`, gitui `more`) or remove an empty status row (Hunk), because either moves the panes above. A blank status row costs one line but keeps the Diff from shifting.
