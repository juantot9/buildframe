# Compact terminal command discovery patterns

**Date:** 2026-08-30

**Question:** Which built-in discovery patterns from established keyboard-driven terminal applications could replace Neoflow's persistent command rows while keeping current actions contextual and exact?

## Answer in brief

There is no single terminal convention called “leader-key discovery.” The reviewed applications use five distinct built-in patterns:

1. a hidden prefix followed by a separate key list (tmux);
2. a prefix whose pending key table appears immediately (Helix and Yazi);
3. a small contextual footer plus a complete contextual action menu (Lazygit);
4. a read-only, context-fed help view beside direct commands (K9s); and
5. persistent mode-specific hints that progressively shorten as width disappears (Zellij).

The strongest shared lesson for Neoflow is **two-stage discovery**: retain one compact, always-findable seed such as `Space actions`, then disclose only the actions valid in the current Application state. A hidden prefix alone does not bootstrap itself. A permanent multi-line legend spends space after the user has learned it. A searchable command palette is more machinery than the current bounded command set warrants.

The evidence supports a throwaway human comparison, not a production choice. The smallest comparison should test (A) a Helix/Yazi-style read-through action window, (B) a Lazygit-style focus-first action chooser, and (C) a one-row adaptive strip plus read-only lookup. All three should keep current direct keys and accepted Enter/Esc semantics unchanged.

## Method and limits

Only first-party manuals and versioned source were used. The inspected stable releases and underlying commits were:

| Product | Release | Commit |
| --- | --- | --- |
| tmux | [`3.7c`](https://github.com/tmux/tmux/releases/tag/3.7c) | [`e476c1230b958df0cb12977517d24b3dc931375b`](https://github.com/tmux/tmux/tree/e476c1230b958df0cb12977517d24b3dc931375b) |
| Helix | [`25.07.1`](https://github.com/helix-editor/helix/releases/tag/25.07.1) | [`a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b`](https://github.com/helix-editor/helix/tree/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b) |
| Zellij | [`0.45.1`](https://github.com/zellij-org/zellij/releases/tag/v0.45.1) | [`efd8fd5a89a20c07a111d248ad7fce53848d2c18`](https://github.com/zellij-org/zellij/tree/efd8fd5a89a20c07a111d248ad7fce53848d2c18) |
| Lazygit | [`0.64.1`](https://github.com/jesseduffield/lazygit/releases/tag/v0.64.1) | [`fbe2379fa5831b1ce1a8a836a604652ffc14844f`](https://github.com/jesseduffield/lazygit/tree/fbe2379fa5831b1ce1a8a836a604652ffc14844f) |
| K9s | [`0.51.0`](https://github.com/derailed/k9s/releases/tag/v0.51.0) | [`558caafe7ba067467de46b320cc22ef11fef9c34`](https://github.com/derailed/k9s/tree/558caafe7ba067467de46b320cc22ef11fef9c34) |
| Yazi | [`26.8.15`](https://github.com/sxyazi/yazi/releases/tag/v26.8.15) | [`1f3588d6f4ef80122089db70e670a0eb757f20fe`](https://github.com/sxyazi/yazi/tree/1f3588d6f4ef80122089db70e670a0eb757f20fe) |
| OpenTUI | [`0.5.9`](https://github.com/anomalyco/opentui/releases/tag/v0.5.9) | [`df2fc1594bb7a1274fc490155305e3d9f61f1b01`](https://github.com/anomalyco/opentui/tree/df2fc1594bb7a1274fc490155305e3d9f61f1b01) |

These sources establish mechanics, not comparative usability, popularity, or fitness for Neoflow. No optional “which-key” plugin is treated as product authority. Where a source does not define narrow-terminal behavior, the comparison says so rather than inferring it from screenshots.

## Pattern comparison

| Product | Built-in pattern and bootstrap | Context and activation | Dismissal | Width behavior evidenced by source |
| --- | --- | --- | --- | --- |
| tmux | `C-b` enters a prefix key table; `C-b ?` lists annotated bindings. No automatic pending-key popup is present in the cited default path. | The second key invokes its bound command. Root-table bindings remain directly invocable without the prefix. The list can be scoped to a key table, but the default notes view covers root and prefix tables rather than the focused pane's currently possible product actions. | Prefix handling returns after the bound command; the cited list path does not define a compact popup dismissal contract. | No adaptive compact presentation is established by the cited key-list sources. |
| Helix | `Space` enters Space mode. A pending key-trie node immediately becomes a bottom-right information box listing keys and descriptions. | The next matching key executes directly. The information is scoped to the current pending key node, not a global command dump. `Space ?` separately opens a command palette. | Esc cancels pending keystrokes. | The info box intersects itself with the terminal viewport; source shows clipping, not reflow or paging. |
| Lazygit | A one-line contextual strip is visible at the bottom; `?` opens the complete keybindings menu. | The strip includes enabled, explicitly displayable bindings from the current context plus non-conflicting globals. The menu groups Local, Global, and Navigation actions, carries disabled reasons, supports filtering, and can execute the selected binding with Enter. Direct bindings still work without opening it. | Esc closes the menu; Enter executes; double-click also executes. | The strip stops before overflow and appends an ellipsis. The cited menu source does not promise a specific small-terminal reflow. |
| K9s | `?` opens active keyboard mnemonics/help; `:` opens command mode and `/` opens filtering. | Help receives resource-specific hints from the current top view and adds General, Navigation, and configured Hotkeys sections. It is non-selectable: discovery is separated from command execution. Direct resource and action keys remain active outside help. | Esc, `q`, `?`, or Enter all return from help; Esc also exits command/filter modes. | The cited help source computes column widths but does not establish a narrow fallback. |
| Zellij | Persistent status-bar hints expose mode-switch keys. Prefix-like keys such as `Ctrl-p` enter a mode whose current actions replace the ordinary hints. | Actions are drawn from the current input mode. Some action keys return to Normal immediately; Enter/Esc leave non-normal modes. Direct global bindings coexist. | Enter/Esc return to Normal for non-normal, non-locked modes. | Explicitly adaptive: full labels → shortened modifiers → keys only → nothing; action hints use full → medium → best-effort with `...`. The plugin can render one or two rows. |
| Yazi | Any first key shared by multi-stroke bindings automatically opens a `which` window; `~` or F1 opens full help. | The pending window contains only chords that share the entered prefix. Each next key filters candidates and executes when one remains or a complete chord matches. Full help is layer-specific, filterable by key/description, selectable with `j/k`, and can execute the selected action with Enter. | An unmatched next key dismisses without a command. Full help uses Esc/Ctrl-C to close and Enter to submit. | The pending window clamps to terminal width/height, lays out one to three columns, and declines to draw when too little height exists. Help windows their binding rows to available height. |

## Primary-source observations

### tmux: prefix plus explicit list, not automatic discovery

The default `prefix` option is `Ctrl-b` ([`options-table.c` lines 776–787](https://github.com/tmux/tmux/blob/e476c1230b958df0cb12977517d24b3dc931375b/options-table.c#L776-L787)). tmux documents that ordinary prefix-table bindings execute after that prefix while root-table bindings execute directly, and that custom key tables are possible ([`tmux.1` lines 3905–3938](https://github.com/tmux/tmux/blob/e476c1230b958df0cb12977517d24b3dc931375b/tmux.1#L3905-L3938)); a temporary table consumes the next key and then returns to the default table ([`tmux.1` lines 1739–1754](https://github.com/tmux/tmux/blob/e476c1230b958df0cb12977517d24b3dc931375b/tmux.1#L1739-L1754)).

The built-in bindings attach human notes, map `?` to `list-keys -N`, and map `/` to describing one binding ([`key-bindings.c` lines 350–385](https://github.com/tmux/tmux/blob/e476c1230b958df0cb12977517d24b3dc931375b/key-bindings.c#L350-L385)). `list-keys -N` emits key plus note and defaults to root/prefix tables ([`tmux.1` lines 3946–4017](https://github.com/tmux/tmux/blob/e476c1230b958df0cb12977517d24b3dc931375b/tmux.1#L3946-L4017)).

**Implication:** a prefix is a namespace, not inherently a discovery UI. Copying only `Space` plus a hidden second-key vocabulary would repeat tmux's bootstrap gap.

### Helix: pending key branch becomes an immediate action window

Helix identifies Space mode as a normal-mode minor mode that usually returns after one command ([`keymap.md` lines 166–182](https://github.com/helix-editor/helix/blob/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b/book/src/keymap.md#L166-L182)). Its Space table contains key/description/command entries and a separate `Space ?` command palette ([`keymap.md` lines 279–314](https://github.com/helix-editor/helix/blob/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b/book/src/keymap.md#L279-L314)).

The keymap records a pending trie node; Esc drains pending keys, a matching leaf executes, and an intermediate node remains pending ([`keymap.rs` lines 329–373](https://github.com/helix-editor/helix/blob/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b/helix-term/src/keymap.rs#L329-L373)). The editor turns that pending node into `autoinfo` immediately ([`ui/editor.rs` lines 838–875](https://github.com/helix-editor/helix/blob/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b/helix-term/src/ui/editor.rs#L838-L875)). The information box is bottom-right and intersected with the viewport ([`ui/info.rs` lines 8–37](https://github.com/helix-editor/helix/blob/a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b/helix-term/src/ui/info.rs#L8-L37)).

**Implication:** this is the clearest first-party precedent for the acceptor's “leader plus available actions” idea. Its direct second-key execution must not be copied where Neoflow has already accepted Enter-only activation.

### Lazygit: compact seed and complete contextual menu

Lazygit's bottom line takes bindings from the current context plus non-conflicting global bindings, then includes only enabled bindings explicitly marked for on-screen display ([`options_map.go` lines 32–67](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/gui/options_map.go#L32-L67)). When the next item exceeds width, it writes an ellipsis and stops ([`options_map.go` lines 108–136](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/gui/options_map.go#L108-L136)).

`?` is the default option-menu key and Enter is the default menu confirmation ([`user_config.go` lines 1033–1037](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/config/user_config.go#L1033-L1037)); the configured return key defaults to Esc ([`user_config.go` lines 995–1003](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/config/user_config.go#L995-L1003)). The menu derives Local, Global, and Navigation groups from the current view, retains disabled reasons, and allows keybinding filtering ([`options_menu_action.go` lines 17–90](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/gui/controllers/options_menu_action.go#L17-L90)). Its standard menu controller executes with the configured confirmation, closes with return, and supports double-click execution ([`menu_controller.go` lines 31–81](https://github.com/jesseduffield/lazygit/blob/fbe2379fa5831b1ce1a8a836a604652ffc14844f/pkg/gui/controllers/menu_controller.go#L31-L81)).

**Implication:** the reusable product idea is not Lazygit's exact keys; it is one narrow seed backed by a context-derived complete view. This most directly addresses Neoflow's excess persistent prose.

### K9s: contextual help is lookup, not an alternate command path

K9s documents `?` as “active keyboard mnemonics and help,” `:` as resource command mode, `/` as filtering, and Esc as mode/view cancellation ([`README.md` lines 357–381](https://github.com/derailed/k9s/blob/558caafe7ba067467de46b320cc22ef11fef9c34/README.md#L357-L381)).

Its help view combines hints from the current top view with General and Navigation sections and optional configured hotkeys ([`help.go` lines 115–145](https://github.com/derailed/k9s/blob/558caafe7ba067467de46b320cc22ef11fef9c34/internal/view/help.go#L115-L145), [`help.go` lines 210–267](https://github.com/derailed/k9s/blob/558caafe7ba067467de46b320cc22ef11fef9c34/internal/view/help.go#L210-L267)). Initialization makes Help non-selectable ([`help.go` lines 53–68](https://github.com/derailed/k9s/blob/558caafe7ba067467de46b320cc22ef11fef9c34/internal/view/help.go#L53-L68)), and Esc, `q`, `?`, or Enter all navigate back ([`help.go` lines 81–88](https://github.com/derailed/k9s/blob/558caafe7ba067467de46b320cc22ef11fef9c34/internal/view/help.go#L81-L88)).

**Implication:** read-only action lookup is a legitimate alternative to a command palette. It has a lower accidental-activation risk but adds a separate step after discovery.

### Zellij: persistent hints are justified by global input modes

Zellij's default keys enter Pane, Resize, Scroll, Session, Tab, Move, and tmux-like modes, while Enter/Esc return from non-normal modes ([`default.kdl` lines 194–237](https://github.com/zellij-org/zellij/blob/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-utils/assets/config/default.kdl#L194-L237)). The status plugin renders a one-line UI when allocated one row and otherwise emits first and second lines ([`status-bar/main.rs` lines 334–409](https://github.com/zellij-org/zellij/blob/efd8fd5a89a20c07a111d248ad7fce53848d2c18/default-plugins/status-bar/src/main.rs#L334-L409)).

Mode-switch labels progressively degrade from full labels, to shortened modifiers, to keys alone, to nothing ([`first_line.rs` lines 298–345](https://github.com/zellij-org/zellij/blob/efd8fd5a89a20c07a111d248ad7fce53848d2c18/default-plugins/status-bar/src/first_line.rs#L298-L345)). Current-mode action hints similarly try full, medium, then best-effort text with `...` ([`second_line.rs` lines 316–368](https://github.com/zellij-org/zellij/blob/efd8fd5a89a20c07a111d248ad7fce53848d2c18/default-plugins/status-bar/src/second_line.rs#L316-L368)).

**Implication:** adaptive degradation is worth borrowing. Persistent multi-row mode chrome is not: Neoflow's ordinary Reviewing keys do not redefine every keystroke through a global mode, and the human already rejected its persistent rows.

### Yazi: automatic which-key plus searchable layer help

Yazi's built-in map uses described multi-stroke chords and exposes layer help with `~` and F1 ([`keymap-default.toml` lines 90–164](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-config/preset/keymap-default.toml#L90-L164)). Its router opens `which` whenever a matched first key has more strokes; single-key chords execute directly ([`router.rs` lines 37–61](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-fm/src/router.rs#L37-L61)).

The window is terminal-clamped, bottom-positioned, one-to-three columns, and omitted when there is insufficient height ([`which/which.rs` lines 20–68](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-fm/src/which/which.rs#L20-L68)). Each subsequent key filters candidates; a unique or complete match executes, while no match dismisses without execution ([`core/which.rs` lines 19–52](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-core/src/which/which.rs#L19-L52)).

Full help filters the current layer's chords by key or description ([`help/help.rs` lines 27–72](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-core/src/help/help.rs#L27-L72)). Its help keys use `j/k`, Esc, and Enter; Enter closes and runs the selected binding ([`keymap-default.toml` lines 372–388](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-config/preset/keymap-default.toml#L372-L388), [`help/close.rs` lines 13–23](https://github.com/sxyazi/yazi/blob/1f3588d6f4ef80122089db70e670a0eb757f20fe/yazi-actor/src/help/close.rs#L13-L23)).

**Implication:** pending-key help and complete help can coexist. Neoflow has too few ordinary commands to justify Yazi's searchable second system now, but its context and terminal-bounding behavior are directly relevant.

## OpenTUI 0.5.9 feasibility

No renderer or package Interface change is required to prototype any of the bounded directions:

- Core `renderer.keyInput` emits canonical key events, including `space`, `return`, and `escape`; direct listeners run before focused renderables and expose propagation control ([keyboard docs lines 15–74](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/keyboard.mdx#L15-L74)). Neoflow already translates this stream through its private Reviewing input seam.
- Core supports relative/absolute positioning, fixed and bounded dimensions, wrapping, gaps, and clipping; its own guidance names absolute positioning for overlays and fixed geometry ([layout docs lines 62–89](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/layout.mdx#L62-L89), [lines 139–158](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/layout.mdx#L139-L158)). Resize reruns layout and reports new integer geometry ([layout docs lines 223–249](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/layout.mdx#L223-L249)).
- Higher-`zIndex` siblings own overlapping hit cells and mouse events bubble, so an opaque action window can block the underlying review without another renderer abstraction ([interaction docs lines 64–92](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/interaction.mdx#L64-L92)).
- OpenTUI emits down/up rather than a synthetic click, and focus/Tab order remains application-owned ([interaction docs lines 12–45](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/interaction.mdx#L12-L45), [lines 104–132](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/interaction.mdx#L104-L132)). This matches Neoflow's existing pointer and model-owned focus policy.

The 0.5.9 docs also describe a separate `@opentui/keymap` package for layers, sequences, and discovery ([keyboard docs lines 105–111](https://github.com/anomalyco/opentui/blob/df2fc1594bb7a1274fc490155305e3d9f61f1b01/packages/web/src/content/docs/core-concepts/keyboard.mdx#L105-L111)). That is capability evidence, not a dependency recommendation. Neoflow's small existing command set and private model/input seam can answer the prototype question with exact `@opentui/core@0.5.9`; adding another dependency before the interaction is accepted would be speculative.

## Fit against Neoflow's accepted behavior

### Facts the prototype must respect

- `?` already toggles model-owned action checks/details. It is not a free help key.
- Space is available only in ordinary browsing. In Question and comparison text input it is user text and must never be intercepted.
- Home clicks select only, and Enter is the sole activation action. Commit and history click/Enter behavior must remain unchanged.
- The moved-HEAD choice already owns its focus, geometry-matched movement, Enter, and Esc. Search, configuration, historical detail, comparison input, changed-target composer, and other contextual overlays keep their own instructions; a global action window must not open over them.
- Esc has route-, editor-, and changed-target-specific meaning. When an action window is present, its first Esc may close only that ephemeral window; after closure, ordinary Esc behavior resumes.
- Ordinary Reviewing commands remain stable across Files, Diff, and Questions. Discovery may describe those commands differently by availability, but it must not rename their keys or produce a Workspace command by itself.
- The action list can be derived from current private Application state. It needs no Workspace read, durable fact, command registry export, package Interface, or generic dialog framework.
- At 80x24, no discovery treatment may displace the fixed comparison preview/controls or contextual safety text. ASCII/no-color modes need textual focus and availability, not color-only distinctions.

### What transfers cleanly

1. **One visible bootstrap token.** Lazygit's compact footer solves the bootstrap problem that tmux and Helix leave to learned vocabulary. Neoflow can reserve one short token rather than two persistent command sentences.
2. **Current-context actions only.** Lazygit reads the current context; K9s asks the top view for hints; Helix/Yazi show only the pending branch. Neoflow should similarly project only actions currently meaningful in the model.
3. **Progressive disclosure.** A short seed can open descriptions; direct keys still serve experienced use. This lowers persistent visual weight without making commands inaccessible.
4. **Width degradation, not wrapping everything.** Zellij and Lazygit shorten or elide low-priority hints. A one-row seed must stay one row; the opened window can switch columns or stack at 80 columns.
5. **Application-owned cancellation and focus.** Every reviewed design has explicit dismissal. OpenTUI has no automatic Tab order, which reinforces keeping selection and cancellation in the existing model.

### What does not transfer directly

- Helix/Yazi second-key execution cannot activate a Home choice with a new non-Enter key.
- K9s's full-screen help is too interruptive for a small ordinary Reviewing vocabulary.
- Zellij's persistent two-row mode bar recreates the human-rejected treatment and solves a stronger global-mode problem than Neoflow has.
- tmux's prefix without an immediate list is insufficiently discoverable.
- Lazygit's `?` key conflicts with Neoflow's existing action-check details.
- A searchable palette, custom bindings, arbitrary command names, and `@opentui/keymap` are unsupported scope until a smaller prototype fails.

## Bounded prototype directions

### A. Read-through action window

- Ordinary browse shows one stable seed: `[Space] actions`.
- Space opens a compact bottom-anchored list grouped by Navigate, Inspect, and View/Configure.
- Pressing an already-valid direct key closes the window and follows the exact existing input path. Thus `j/k` still select, `q` still opens the composer, `c` still configures, and only Enter can activate a Home choice.
- Esc closes without replay. Pointer rows may select/highlight for reading but must not execute.

This most closely combines Helix/Yazi pending disclosure with Neoflow's existing direct commands and has the smallest new state model.

### B. Focus-first action chooser

- The same `[Space] actions` seed opens a compact list with visible focus.
- Tab plus geometry-matched movement changes focus; Enter dispatches the selected **existing** action; Esc cancels.
- Direct command keys continue to work without opening the chooser. Home activation remains Enter-only, including from the chooser.
- Pointer clicks select a row only; Enter activates, matching accepted Home semantics.

This borrows Lazygit's menu model and the accepted moved-HEAD focus treatment. It is more explicit for a novice but creates a second navigation layer and therefore requires human comparison.

### C. Adaptive strip plus read-only lookup

- One ordinary row shows `[Space] actions` and at most one or two highest-value contextual hints, ending in `...` when needed.
- Space opens a read-only K9s-style action reference. It cannot execute anything; Esc, Space, or Enter closes it.
- Existing direct keys remain the only command path.

This has the lowest accidental-activation risk but may leave a novice doing an extra lookup-and-recall step.

## Recommendation and next child

Create one throwaway prototype child, **“Prototype compact contextual action discovery,”** comparing A, B, and C against the same real Application state shapes at 132x50 and 80x24. The actual acceptor should choose or reject them while exercising Home, comparison, ordinary Review, and composer/contextual-overlay exclusions. No production command row should change until that verdict exists.
