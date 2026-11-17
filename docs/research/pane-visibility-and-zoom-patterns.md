# Pane visibility and zoom patterns in keyboard-first tools

Research date: 2026-11-17
Pinned sources: tmux [`3.8`](https://github.com/tmux/tmux/tree/3.8), lazygit [`v0.66.3`](https://github.com/jesseduffield/lazygit/tree/v0.66.3), Vim [`v9.2.1355`](https://github.com/vim/vim/tree/v9.2.1355), Neovim [`v0.12.6`](https://github.com/neovim/neovim/tree/v0.12.6), VS Code [`1.146.0`](https://github.com/microsoft/vscode/tree/1.146.0), Zellij [`v0.46.0`](https://github.com/zellij-org/zellij/tree/v0.46.0), tig [`tig-2.6.1`](https://github.com/jonas/tig/tree/tig-2.6.1), gitui [`v0.28.1`](https://github.com/gitui-org/gitui/tree/v0.28.1), diffnav [`v0.13.1`](https://github.com/dlvhdr/diffnav/tree/v0.13.1), Hunk [`840a504`](https://github.com/modem-dev/hunk/tree/840a504684882c8237fa76004bcf1ddd41fe74d3), Helix [`25.07.1`](https://github.com/helix-editor/helix/tree/25.07.1)

## Question

How do keyboard-first terminal and editor tools let a user quickly choose which side panes to see, so the main content (code or diff) gets the width, especially in split screens and narrow terminals?

## Comparison

| Tool | Key | Toggle or cycle | Persists across restarts | Shown on screen | Reaching a hidden pane | Automatic width rules vs. manual choice | Discovery |
|---|---|---|---|---|---|---|---|
| tmux | prefix `z` (`resize-pane -Z`) | Toggle | No; it is a runtime window flag | `Z` in the window flags in the default status line; menu label switches to "Unzoom" | Selecting another pane unzooms, unless `select-pane -Z` is used, which moves the zoom to the new pane | None; zoom ignores terminal size | `prefix ?` (`list-keys -N`), pane menu |
| lazygit | `+` next, `_` previous (normal, half, full) | Cycle in both directions | No. `gui.screenMode` and `--screen-mode` set only the starting mode | The layout itself; no mode text found | Mode follows focus: the focused panel is the one enlarged. Focusing the main view hides every side panel in half and full | `portraitMode: auto` stacks at ≤84 cols × ≥46 rows. In half mode the user's `enlargedSideViewLocation` decides instead | `?` keybindings menu, generated keybinding docs |
| Vim / Neovim | `CTRL-W o` only, `CTRL-W \|` widest, `CTRL-W _` tallest, `CTRL-W =` equalize | `o` is destructive (closes windows). `\|`/`_` and `=` are a manual pair, not a toggle | Only through `:mksession` with `winsize` | Other windows shrink to `'winminwidth'`/`'winminheight'` but stay visible | `'winwidth'` (default 20) grows the window that gets focus | `'equalalways'` re-equalizes after a split or close | `:help`; no on-screen hint |
| VS Code | `Ctrl+B` primary bar, `Ctrl+Alt+B` secondary bar, `Ctrl+K Ctrl+M` maximize group, `Ctrl+K Z` Zen (exit with `Esc Esc`) | Toggles | Bar visibility: yes, per workspace. Zen: yes when `zenMode.restore` is on (default true). Maximized group: not verified | Checked items in menus; an "Unmaximize Group" button in the editor title | Opening a view in a hidden bar reveals the bar. Activating another editor group unmaximizes. Leaving Zen restores the earlier bar visibility | None found in the sources read | Command Palette (`f1: true`), View/Appearance menu, layout-control menu |
| Zellij | `Ctrl p` then `f` (`ToggleFocusFullscreen`); `Shift f` also covers UI bars | Toggle | Not verified | Tab name gets ` (FULLSCREEN)`; status bar shows `(FULLSCREEN): + N hidden panes` | Moving focus keeps fullscreen and shows the next pane fullscreen. Splitting exits fullscreen. Resizing past the maximum enters fullscreen; shrinking exits it | None | Status-bar key hints (long or short labels), right-click menu "Fullscreen" / "Exit fullscreen" |
| tig | `O` maximize; `Enter` re-splits; `q` closes the child | One-way maximize; at most 2 views | Split options only (`vertical-split`, `split-view-width` in tigrc) | One view fills the display | `Tab` reports "Only one view is displayed"; you re-open the split with `Enter` | `vertical-split=auto` goes side-by-side when width > 160, or width > 4 × (height − 1) | `h` help view; unknown keys say "press h for help" |
| gitui | Focus the diff (`→`/`Enter`); `w` switches the workdir/stage list | Focus-driven | No | The diff takes 100% of the width | `←`/`Esc` returns to the list at 50/50 | None (fixed percentages) | Command bar hints ("Diff [→]", "Back [←]"); `.` expands the bar |
| diffnav (delta-based) | `e` toggles the file tree | Toggle | Start state from `ui.showFileTree`; runtime toggle not saved | Tree is gone; the diff takes the full width | Hiding moves focus to the diff. `Tab` does nothing while hidden. `t` file search still works | None; dragging the divider below a threshold hides the tree | README key table, optional footer |
| Hunk | `s` | Toggle with responsive override | No (not verified beyond source read) | Sidebar is gone | n/a (single sidebar) | Sidebar auto-shows only at ≥220 cols. Below that, `s` force-opens it if 22 + 1 + 48 cols fit | Help / footer (see [hunk note](hunk-diff-and-pane-patterns.md)) |

Helix and Kakoune add nothing beyond Vim. Helix's window mode has `o` / `Ctrl-o` "Only keep the current window" ([`book/src/keymap.md` L273](https://github.com/helix-editor/helix/blob/25.07.1/book/src/keymap.md#L273)) and no zoom or restore. Kakoune was not checked further.

## Findings

### tmux: zoom is a reversible overlay with a visible flag

`resize-pane -Z` toggles the active pane "between zoomed (occupying the whole of the window) and unzoomed (its normal position in the layout)". The default binding is prefix `z`, with a help note. The layout under the zoom is kept, so unzooming restores it exactly.

Sources:

- [`tmux.1` L366 (prefix `z`), L3880-L3883 (`resize-pane -Z`)](https://github.com/tmux/tmux/blob/3.8/tmux.1#L3880-L3883)
- [`key-bindings.c` L445, `bind -N 'Zoom the active pane' z`](https://github.com/tmux/tmux/blob/3.8/key-bindings.c#L445)

The zoomed state is shown by a `Z` window flag ("The window's active pane is zoomed"). The default `window-status-format` includes `#{window_flags}`, and `window_zoomed_flag` is available for custom status lines. The pane menu label switches between "Zoom" and "Unzoom".

Sources:

- [`tmux.1` L7573 `window_zoomed_flag`, L7983 `Z` flag](https://github.com/tmux/tmux/blob/3.8/tmux.1#L7983)
- [`window.c` L1382-L1383, flag printing](https://github.com/tmux/tmux/blob/3.8/window.c#L1382-L1383)
- [`options-table.c` L1860-L1879, default window-status formats](https://github.com/tmux/tmux/blob/3.8/options-table.c#L1860-L1879)
- [`key-bindings.c` L82, pane menu Zoom/Unzoom](https://github.com/tmux/tmux/blob/3.8/key-bindings.c#L82)

Moving focus to a pane hidden by the zoom unzooms the window (`window_set_active_pane`). Directional `select-pane -L/-R/-U/-D` finds the neighbour as if unzoomed. With `-Z` ("keeps the window zoomed if it was zoomed"), the zoom moves to the newly active pane. Zoom is stored as a runtime window flag (`WINDOW_ZOOMED`). No option persists it.

Sources:

- [`window.c` L755-L770, unzoom on activating a hidden pane](https://github.com/tmux/tmux/blob/3.8/window.c#L755-L770)
- [`window.c` L1107-L1143, push/pop zoom re-zooms the active pane](https://github.com/tmux/tmux/blob/3.8/window.c#L1107-L1143)
- [`cmd-select-pane.c` L223-L240 and L276-L289](https://github.com/tmux/tmux/blob/3.8/cmd-select-pane.c#L223-L289)
- [`tmux.1` L4019-L4037, `select-pane -Z`](https://github.com/tmux/tmux/blob/3.8/tmux.1#L4019-L4037)

Discovery: prefix `?` runs `list-keys -N`, which lists the noted bindings ([`key-bindings.c` L419](https://github.com/tmux/tmux/blob/3.8/key-bindings.c#L419)).

### lazygit: a focus-relative three-step cycle

`+` / `_` cycle normal → half → full and back ([keybindings doc L23-L24](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/keybindings/Keybindings_en.md#L23-L29); [`screen_mode_actions.go` L12-L34](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/screen_mode_actions.go#L12-L34)). The mode is relative to focus, not to a fixed pane:

- When the main (diff) view is focused, half and full both set the side section's weight to 0, so the diff gets the full width.
- When a side panel is focused, half gives side and main equal weight and full gives the main section 0.
- In both half and full, only the focused side panel is drawn; the others get size 0.

Sources:

- [`window_arrangement_helper.go` L241-L269, mid-section weights](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/helpers/window_arrangement_helper.go#L241-L269)
- [`window_arrangement_helper.go` L447-L461, only the focused side window is drawn](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/helpers/window_arrangement_helper.go#L447-L461)

Persistence: the docs say `screenMode` is the "Default size for focused window. Can be changed from within Lazygit with '+' and '_' (but this won't change the default)." The mode is held in in-memory per-repo state. The start mode comes from `--screen-mode`, then `half` when started with a filter path or git arg, then `gui.screenMode`.

Sources:

- [`docs/Config.md` L343-L346](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L343-L346)
- [`pkg/gui/gui.go` L634-L658, L736-L744](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/gui.go#L736-L744)
- [`pkg/app/entry_point.go` L223-L224](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/app/entry_point.go#L223-L224)

Automatic rules and the manual choice:

- `portraitMode: auto` stacks the panels when width ≤ `portraitModeAutoMaxWidth` (84) and height ≥ 46.
- In half mode, the user's `enlargedSideViewLocation` overrides that automatic choice.
- `sidePanelWidth` (default 0.3333) is the static knob; the docs suggest a small value "if you're using a narrow screen, so that you can see more of the main section".

Sources:

- [`window_arrangement_helper.go` L120-L134](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/controllers/helpers/window_arrangement_helper.go#L120-L134)
- [`docs/Config.md` L92-L96, L137-L143, L356-L368](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L92-L96)

### Vim / Neovim: maximize plus equalize, and grow-on-focus

- `CTRL-W o` / `:only` makes the current window the only one by closing the others. This is not reversible.
- `CTRL-W |` sets width "to N (default: widest possible)".
- `CTRL-W _` does the same for height.
- `CTRL-W =` makes all windows "(almost) equally high and wide".

Other windows never go below `'winminwidth'` / `'winminheight'`, so they stay visible as slivers. The text is identical in Neovim.

Sources:

- [Vim `runtime/doc/windows.txt` L403-L418, L562-L597, L634-L636](https://github.com/vim/vim/blob/v9.2.1355/runtime/doc/windows.txt#L562-L597)
- [Neovim `runtime/doc/windows.txt` L396, L559, L578, L593](https://github.com/neovim/neovim/blob/v0.12.6/runtime/doc/windows.txt#L559-L593)

`'winwidth'` (default 20) is the relevant automatic rule: "If the current window is smaller, its size is increased, at the cost of the width of other windows. Set it to 999 to make the current window always fill the screen." Focus therefore reveals a squeezed window. `'equalalways'` re-equalizes after a split or close, and `'eadirection'` / `'winfixwidth'` protect manual widths.

Sources:

- [`options.txt` L10758-L10768 `'winwidth'`](https://github.com/vim/vim/blob/v9.2.1355/runtime/doc/options.txt#L10758-L10768)
- [`options.txt` L3513-L3525 `'equalalways'`](https://github.com/vim/vim/blob/v9.2.1355/runtime/doc/options.txt#L3513-L3525)
- [`windows.txt` L605-L624](https://github.com/vim/vim/blob/v9.2.1355/runtime/doc/windows.txt#L605-L624)

Sizes persist only through sessions (`'sessionoptions'` item `winsize`) ([`options.txt` L7806](https://github.com/vim/vim/blob/v9.2.1355/runtime/doc/options.txt#L7806)).

### VS Code: independent per-part toggles, persisted per workspace, auto-revealed by intent

The default bindings are:

- `Ctrl/Cmd+B` toggles the Primary Side Bar.
- `Ctrl/Cmd+Alt+B` toggles the Secondary Side Bar.
- `Ctrl/Cmd+K Ctrl/Cmd+M` toggles Maximize Editor Group. It needs at least two groups and shows an "Unmaximize Group" title button while active.
- `Ctrl/Cmd+K Z` toggles Zen Mode; `Esc Esc` exits it.

All are Command Palette entries (`f1: true`) with checked ("toggled") menu items.

Sources:

- [`layoutActions.ts` L288-L310](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/actions/layoutActions.ts#L288-L310)
- [`auxiliaryBarActions.ts` L28-L52](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions.ts#L28-L52)
- [`editorActions.ts` L1198-L1228](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/parts/editor/editorActions.ts#L1198-L1228)
- [`workbench.zenMode.contribution.ts` L99-L143](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/workbench.zenMode.contribution.ts#L99-L143)

Persistence:

- `sideBar.hidden` and `auxiliaryBar.hidden` are runtime layout keys stored at workspace scope.
- `zenMode.active` is also stored at workspace scope. It is restored when `zenMode.restore` is true (the default).
- Whether a maximized group survives a restart was not verified.

Sources:

- [`layout.ts` L2905-L2908](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/layout.ts#L2905-L2908)
- [`layout.ts` L1197-L1204](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/layout.ts#L1197-L1204)
- [`workbench.zenMode.contribution.ts` L66-L70](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/workbench.zenMode.contribution.ts#L66-L70)

Reaching hidden content:

- Opening a view container in a hidden bar first un-hides that part.
- Activating a different editor group unmaximizes, and expands the group if it was minimized.
- Leaving Zen restores whichever bars were visible before.

Sources:

- [`paneCompositePart.ts` L517-L532](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/parts/paneCompositePart.ts#L517-L532)
- [`editorPart.ts` L812-L835](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/parts/editor/editorPart.ts#L812-L835)
- [`layout.ts` L1570-L1585](https://github.com/microsoft/vscode/blob/1.146.0/src/vs/workbench/browser/layout.ts#L1570-L1585)

### Zellij: fullscreen that stays on while you move focus

In Pane mode (`Ctrl p`), `f` runs `ToggleFocusFullscreen` and `Shift f` runs a variant that also covers the UI bars. The right-click pane menu has "Fullscreen" / "Exit fullscreen".

Sources:

- [`zellij-utils/assets/keybinds/default.kdl` L32, L47-L49](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-utils/assets/keybinds/default.kdl#L47-L49)
- [`zellij-utils/assets/config/default.kdl` L77](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-utils/assets/config/default.kdl#L77)

State is shown twice:

- The tab name gets ` (FULLSCREEN)`.
- The status bar shows `(FULLSCREEN): + N hidden panes`, which counts what is hidden.
- The pane-mode hint uses a long label ("Toggle Fullscreen") or a short one ("Fullscreen") depending on the space available.

Sources:

- [`default-plugins/bars/src/tab_bar/tab.rs` L141-L142](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/tab_bar/tab.rs#L141-L142)
- [`status_bar/second_line.rs` L127, L433-L458](https://github.com/zellij-org/zellij/blob/v0.46.0/default-plugins/bars/src/status_bar/second_line.rs#L433-L458)

Behaviour while fullscreen:

- Moving focus (next, previous, or directional) keeps fullscreen and swaps which pane fills the screen (`switch_next_pane_fullscreen`, `focus_pane_left_fullscreen`).
- Focusing a hidden pane by id unsets fullscreen.
- An increase-resize that cannot grow further enters fullscreen, and a decrease exits it. Fullscreen sits at the end of the resize scale.

Sources:

- [`zellij-server/src/tab/mod.rs` L6516-L6524, L6574-L6591](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-server/src/tab/mod.rs#L6516-L6591)
- [`tiled_panes/mod.rs` L3059-L3077](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-server/src/panes/tiled_panes/mod.rs#L3059-L3077)
- [`tiled_panes/mod.rs` L1100-L1123](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-server/src/panes/tiled_panes/mod.rs#L1100-L1123)
- [`tiled_panes/mod.rs` L1990-L2020](https://github.com/zellij-org/zellij/blob/v0.46.0/zellij-server/src/panes/tiled_panes/mod.rs#L1990-L2020)

Whether session resurrection restores fullscreen was not verified.

### tig: a width-driven split orientation and a one-way maximize

tig shows at most two views:

- `Enter` on a commit splits the display to show the diff.
- `O` runs `maximize`: "Maximize the current view to fill the whole display". It only acts when two views are displayed, and it does so by dropping the other view from the display.
- `q` closes a child view and maximizes its parent.
- After a maximize, `Tab` reports "Only one view is displayed".

Sources:

- [`doc/manual.adoc` L76-L80, L359-L370](https://github.com/jonas/tig/blob/tig-2.6.1/doc/manual.adoc#L359-L370)
- [`src/tig.c` L246-L256, L280-L283, L333-L340](https://github.com/jonas/tig/blob/tig-2.6.1/src/tig.c#L280-L283)
- [`src/view.c` L778-L795](https://github.com/jonas/tig/blob/tig-2.6.1/src/view.c#L778-L795)

The automatic rule chooses orientation rather than visibility. `vertical-split` defaults to `auto`, which splits side-by-side when `width > 160 || width * 0.5 > (height - 1) * 2`. `split-view-width` (default 50%) and `split-view-height` (67%) keep the smaller view at least 4 columns or rows. These settings live in tigrc; the docs show `:toggle` bindings for runtime changes.

Sources:

- [`doc/tigrc.5.adoc` L244-L265](https://github.com/jonas/tig/blob/tig-2.6.1/doc/tigrc.5.adoc#L244-L265)
- [`src/display.c` L188-L215](https://github.com/jonas/tig/blob/tig-2.6.1/src/display.c#L188-L215)
- [`include/tig/tig.h` L166-L167](https://github.com/jonas/tig/blob/tig-2.6.1/include/tig/tig.h#L166-L167)
- [`tigrc` L143-L146, L240, L331](https://github.com/jonas/tig/blob/tig-2.6.1/tigrc#L143-L146)

### gitui: focusing the diff is the zoom

In the Status tab, the file lists and the diff split 50/50. When focus is on the diff, the constraints become 0/100, so the diff gets the whole width. `→` focuses the diff and `Esc` returns to the list. `w` (`toggle_workarea`) switches between the unstaged and staged lists rather than hiding anything. The command bar advertises "Diff [→]" / "Back [←]", and `.` expands it.

Sources:

- [`src/tabs/status.rs` L105-L121, L835-L858](https://github.com/gitui-org/gitui/blob/v0.28.1/src/tabs/status.rs#L105-L121)
- [`src/keys/key_list.rs` L145, L182](https://github.com/gitui-org/gitui/blob/v0.28.1/src/keys/key_list.rs#L145)
- [`src/strings.rs` L1293-L1316](https://github.com/gitui-org/gitui/blob/v0.28.1/src/strings.rs#L1293-L1316)

### diffnav (delta-based): a plain tree toggle with a config start state

`e` toggles the file tree. Hiding it moves focus to the diff and gives the diff the full width. `Tab` only switches panes while the tree is visible. The start state comes from `ui.showFileTree`, and the README also offers `hideHeader` / `hideFooter` "to get more screen space for diffs". Dragging the divider below a threshold hides the tree, and dragging is clamped to at most half the width.

Sources:

- [`README.md` L150-L235](https://github.com/dlvhdr/diffnav/blob/v0.13.1/README.md#L150-L235)
- [`pkg/ui/tui.go` L123-L133, L342-L372, L1389-L1402](https://github.com/dlvhdr/diffnav/blob/v0.13.1/pkg/ui/tui.go#L342-L372)

### Hunk: responsive default, manual override

Sidebar sizing and the `s` toggle are covered in [hunk-diff-and-pane-patterns.md](hunk-diff-and-pane-patterns.md). That note does not record the breakpoints:

- The sidebar is shown automatically only in the `full` viewport (≥220 columns).
- `medium` (160–219) and `tight` (<160) hide it by default.
- In those widths, `s` force-opens it only if sidebar minimum (22), divider (1) and Diff minimum (48) fit.
- A second `s` hides it again.

So in a 120–160 column split, Hunk starts with the Diff alone.

Sources:

- [`src/ui/lib/responsive.ts` L5-L62](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/lib/responsive.ts#L5-L62)
- [`src/ui/App.tsx` L190-L192, L860-L866, L1213-L1229](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L1213-L1229)

## Implications for BuildFrame

These are options, not decisions.

- **Diff zoom as a single toggle (tmux `z` / Zellij `f`).** One key gives the Diff the full width and the same key restores the arrangement exactly. It is cheap to learn and composes with any width mode. A footer flag (a `Z`/"zoom" word, ASCII-safe) covers `--no-color`. The trade-off is that it hides both side panes at once, so it does not answer "Files but not History".
- **A lazygit-style cycle on one key (normal → Diff-wide → Diff-only).** It fits the one-label-per-key rule and gives graduated control. But cycles are harder to predict than toggles, and lazygit's version depends on focus. BuildFrame would need to decide whether the mode follows focus (lazygit, gitui) or always favours the Diff.
- **Independent per-pane toggles (VS Code `Ctrl+B` / `Ctrl+Alt+B`).** Extending `s` with a sibling for History gives precise control of what is visible. It costs a footer slot, and the per-pane state must be reconciled with the balanced mode, where Files and History share one slot.
- **Raise the automatic three-pane threshold (Hunk shows its sidebar only at ≥220 cols).** This addresses the 120–160 split-screen pain with no new key. The cost is that users on 120–160 columns who like three panes must opt in, and the threshold change itself must be discoverable.
- **Decide what focus does to a hidden pane.** The options are auto-reveal (tmux unzoom, VS Code reveal, Vim `'winwidth'` grow) or swapping the zoom target (Zellij, `tmux select-pane -Z`, lazygit). Auto-reveal keeps Tab and `Ctrl+h/l` working without a mode. Swapping preserves the full-width Diff while the user peeks at Files or History.
- **Persistence: session-only (tmux, lazygit, Zellij) or remembered (VS Code per workspace).** Session-only is simpler and avoids surprises when terminal width differs next launch. Remembering suits users who always work in split screens. A config default plus a runtime override, like lazygit `screenMode`, sits in between.
- **Showing hidden state.** Zellij's `FULLSCREEN: + N hidden panes` tells users both that something is hidden and how much. A footer word or count works under `--ascii` / `--no-color` without relying on colour or borders.
- **Manual choice vs. width modes.** Hunk lets `s` override the responsive default only when minimum widths fit. lazygit lets half-mode placement override portrait auto-detection. Either keeps the Diff's minimum width as the hard rule and treats the user's choice as a preference that is applied when it fits.
