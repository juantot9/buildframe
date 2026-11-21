# File status colours in file lists and trees

Research date: 2026-11-21
Pinned sources: lazygit `v0.66.3`, gitui `v0.28.1`, tig `tig-2.6.1`, VS Code `1.147.0`, Primer React `@primer/react@38.46.0`, Primer Primitives `@primer/primitives@11.10.0`, GitLab `v19.6.1-ee`, diffview.nvim `4516612`, neo-tree.nvim `3.42.0`, Zed `v1.29.3`. JetBrains and GitHub Docs pages are unversioned and were read on the research date. github.com's own PR page is closed source, so Primer's `FilesChanged` TreeView story stands in for it.

## Summary

- Everyone uses the same three hues: green for added, red for deleted, yellow/amber for modified. Renamed varies the most: yellow, magenta, green, teal, blue, or no colour.
- Terminal tools (lazygit commit files, diffview, tig, Zed's optional indicator) colour the **status letter** and leave the name plain. Editors (VS Code, JetBrains, Zed, neo-tree) colour the **name**. gitui colours the whole row.
- Selected rows: most tools keep the status colour and mark selection with a background. gitui, tig and VS Code's *focused* list replace it with the selection foreground.
- Parent folders: editors colour them from their children (VS Code, Zed, neo-tree, JetBrains as an option). Review UIs (GitHub/Primer, GitLab, gitui) leave folders plain.
- Most tools pair colour with a letter, icon or label. JetBrains, and Zed by default, show colour alone. Of the tools surveyed, only GitHub ships colour-blind themes, which turn green into blue and red into orange.

## Comparison

| Tool | What is coloured | Added | Modified | Deleted | Renamed | Selected row | Folders | No colour / a11y |
|---|---|---|---|---|---|---|---|---|
| lazygit (commit files) | Letter only; name plain | green | yellow | red | yellow (C cyan, T magenta) | Keeps colours, adds bold + blue bg | Working-tree panel: name green/yellow from children's staging state | Letter always shown |
| gitui | Whole row (glyph + name) | light green `+` | yellow `M` | light red `-` | light magenta `R` | fg replaced by white on blue | Plain | Glyph always shown |
| tig (status view) | Letter, one colour for all | magenta | magenta | magenta | magenta | Whole row white on green | n/a (flat list) | Labels can be long words (`modified`) |
| VS Code | Name + badge letter | `#81b88b` | `#E2C08D` | `#c74e39` + strikethrough | `#73C991` | Focused list: selection fg wins; unfocused keeps | Colour + faded dot, except for deletions | Colours or badges can each be turned off |
| GitHub (Primer story) | Trailing icon only | green (success) | amber (attention) | red (danger) | uncoloured | Bg + accent bar; icon keeps colour | Plain | Icon has text label; colour-blind themes |
| GitLab MR tree | Trailing icon only; `+N −M` coloured | green icon | no icon | red icon | blue (info) icon | Row bg (`is-active`) | Plain | Icons have aria labels |
| JetBrains | File name | green | blue | grey | teal | Not documented | Optional | Colour only; colours editable |
| diffview.nvim | Letter only | `diffAdded` | `diffChanged` | `diffRemoved` | `diffChanged` | CursorLine bg; letter keeps colour | Letter + colour when folded | Letter always shown |
| neo-tree.nvim | Name + symbol | `#5faf5f` | `#d7af5f` | `#ff5900` | links to modified | CursorLine bg + bold | Inherit highest-priority child | Symbols can be blanked |
| Zed project panel | Name (letter optional, off) | `#a1c181` | `#dec184` | `#d07277` | not used in panel | Keeps colour | Colour from child summary | Indicator letter off by default |

Hex values are each tool's default dark theme.

## Per-tool notes

### lazygit

- In the commit-files panel (a commit's diff, the closest match to BuildFrame), only the letter is coloured: A green, M and R yellow, D `unstagedChangesColor` (red by default), C cyan, T magenta. The name stays the default colour. ([files.go L284-L309](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/presentation/files.go#L284-L309), [L313-L328](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/presentation/files.go#L313-L328))
- In the working-tree panel, the two-character `XY` code is coloured by column (index green, worktree red). The name is coloured by staging state, not change type: green when fully staged, yellow when partly staged. ([L137-L143](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/presentation/files.go#L137-L143), [L212-L229](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/presentation/files.go#L212-L229))
- Folders take that colour from their children ([file_node.go L32-L47](https://github.com/jesseduffield/lazygit/blob/v0.66.3/pkg/gui/filetree/file_node.go#L32-L47)).
- Selected line: bold is added and the text colours stay, unless the theme sets a colour. The background is blue. ([Config.md L196-L207](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L196-L207), [L229-L231](https://github.com/jesseduffield/lazygit/blob/v0.66.3/docs/Config.md#L229-L231))

### gitui

- One span covers the glyph and the name. Glyphs are `+ M - R !`; type changes get a blank glyph and no colour. ([status_tree.rs L141-L196](https://github.com/gitui-org/gitui/blob/v0.28.1/src/components/status_tree.rs#L141-L196))
- Colours: New LightGreen, Modified Yellow, Deleted LightRed, Renamed LightMagenta, Conflicted Yellow bold ([style.rs L111-L132](https://github.com/gitui-org/gitui/blob/v0.28.1/src/ui/style.rs#L111-L132), [L340-L345](https://github.com/gitui-org/gitui/blob/v0.28.1/src/ui/style.rs#L340-L345)).
- Selected row: `use_selection_fg` is true by default, so the status colour becomes white on blue ([L148-L161](https://github.com/gitui-org/gitui/blob/v0.28.1/src/ui/style.rs#L148-L161), [L335-L337](https://github.com/gitui-org/gitui/blob/v0.28.1/src/ui/style.rs#L335-L337)). Folders use plain text style ([status_tree.rs L198-L216](https://github.com/gitui-org/gitui/blob/v0.28.1/src/components/status_tree.rs#L198-L216)).

### tig

- The status letter is coloured by *section* (staged, unstaged, untracked), and all three default to magenta. The file name is `default`. ([tigrc L433-L434, L453-L456](https://github.com/jonas/tig/blob/tig-2.6.1/tigrc#L453-L456), [draw.c L405-L412](https://github.com/jonas/tig/blob/tig-2.6.1/src/draw.c#L405-L412))
- On the cursor line, per-field colours are skipped and the whole row is `cursor`, white on green bold ([draw.c L43-L53](https://github.com/jonas/tig/blob/tig-2.6.1/src/draw.c#L43-L53), [tigrc L423-L424](https://github.com/jonas/tig/blob/tig-2.6.1/tigrc#L423-L424)).
- `status:long` shows words (`added`, `modified`…) instead of letters ([util.c L416-L441](https://github.com/jonas/tig/blob/tig-2.6.1/src/util.c#L416-L441)).

### VS Code

- The git extension gives each resource a letter (`M A D R C T U I !`) and a theme colour ([repository.ts L62-L95](https://github.com/microsoft/vscode/blob/1.147.0/extensions/git/src/repository.ts#L62-L95), [L122-L160](https://github.com/microsoft/vscode/blob/1.147.0/extensions/git/src/repository.ts#L122-L160)). Renamed and copied share `renamedResourceForeground`, the same green as untracked. Type-changed uses the modified colour. Deletions are also struck through ([L252-L263](https://github.com/microsoft/vscode/blob/1.147.0/extensions/git/src/repository.ts#L252-L263)).
- Defaults (dark / light): added `#81b88b`/`#587c0c`, modified `#E2C08D`/`#895503`, deleted `#c74e39`/`#ad0707`, renamed and untracked `#73C991`/`#007100`, conflict `#e4676b`/`#ad0707` ([package.json L4160-L4260](https://github.com/microsoft/vscode/blob/1.147.0/extensions/git/package.json#L4160-L4260)). Dark Modern and Light Modern don't override them ([dark_modern.json](https://github.com/microsoft/vscode/blob/1.147.0/extensions/theme-defaults/themes/dark_modern.json)).
- The Explorer colours the name and draws the letter as a badge. `explorer.decorations.colors` and `explorer.decorations.badges` (both on by default) turn each off separately ([files.contribution.ts L579-L588](https://github.com/microsoft/vscode/blob/1.147.0/src/vs/workbench/contrib/files/browser/files.contribution.ts#L579-L588)).
- Folders: `propagate` is true for everything except deletions ([repository.ts L312-L316](https://github.com/microsoft/vscode/blob/1.147.0/extensions/git/src/repository.ts#L312-L316)). A folder gets the child's colour and a dot badge at 0.4 opacity, with the tooltip "Contains emphasized items" ([decorationsService.ts L114-L120, L197-L202](https://github.com/microsoft/vscode/blob/1.147.0/src/vs/workbench/services/decorations/browser/decorationsService.ts#L114-L120)).
- Selection: "make sure selection color wins". In a focused list the selected row's name and badge inherit the selection foreground ([iconlabel.css L129-L134](https://github.com/microsoft/vscode/blob/1.147.0/src/vs/base/browser/ui/iconLabel/iconlabel.css#L129-L134)).

### GitHub (Primer)

- In the `FilesChanged` TreeView story, the name and file icon are plain. A trailing octicon shows status, and each one has a text label: added `DiffAddedIcon` in success, modified `DiffModifiedIcon` in attention, renamed `DiffRenamedIcon` with no colour, removed `DiffRemovedIcon` in danger. Folders have no status. ([TreeView.features.stories.tsx L109-L195](https://github.com/primer/react/blob/%40primer/react%4038.46.0/packages/react/src/TreeView/TreeView.features.stories.tsx#L109-L195), [module.css L20-L30](https://github.com/primer/react/blob/%40primer/react%4038.46.0/packages/react/src/TreeView/TreeView.features.stories.module.css#L20-L30))
- The current item gets a background and an accent bar. The icon colours are untouched. ([TreeView.module.css L101-L123](https://github.com/primer/react/blob/%40primer/react%4038.46.0/packages/react/src/TreeView/TreeView.module.css#L101-L123))
- In the protanopia/deuteranopia and tritanopia themes, `fgColor.success` becomes blue and `fgColor.danger` becomes orange ([fgColor.json5 L252-L264, L376-L384](https://github.com/primer/primitives/blob/%40primer/primitives%4011.10.0/src/tokens/functional/color/fgColor.json5#L252-L264)). Users choose these in [theme settings](https://docs.github.com/en/get-started/accessibility/managing-your-theme-settings).

### GitLab merge request tree

- The name is plain, and bold until the file is viewed. A trailing icon appears only for added (`file-addition`, success), deleted (`file-deletion`, danger) and renamed (`file-renamed`, info/blue), each with an aria label. **Modified files get no icon**, just `+N −M` in success/danger. ([tree_list.vue L255-L261, L300-L304](https://gitlab.com/gitlab-org/gitlab/-/blob/v19.6.1-ee/app/assets/javascripts/diffs/components/tree_list.vue#L255-L304), [file_row_stats.vue](https://gitlab.com/gitlab-org/gitlab/-/blob/v19.6.1-ee/app/assets/javascripts/diffs/components/file_row_stats.vue))
- Folders have no status icon (`changeIcon` returns null for non-blobs). The active file is marked by row class only.

### JetBrains IDEs

- The status is shown by colouring the file name everywhere it appears. Light / Darcula: Added `#0A7700`/`#629755`, Modified `#0032A0`/`#6897BB`, Deleted `#616161`/`#6C6C6C`, Renamed `#007C7C`/`#3A8484`, Unversioned `#993300`/`#D1675A`. Folders are coloured only with "Highlight directories that contain modified files". Colours are set under Version Control › File Status Colors. ([File status highlights](https://www.jetbrains.com/help/idea/file-status-highlights.html))
- The red-green vision option only neutralises editor errors and strings. File status colours are not mentioned. ([Accessibility](https://www.jetbrains.com/help/idea/accessibility.html))

### diffview.nvim

- The letter takes the status highlight and the name is `Normal`. The active file's name uses `Type`. ([render.lua L14-L22](https://github.com/sindrets/diffview.nvim/blob/4516612fe98ff56ae0415a259ff6361a89419b0a/lua/diffview/scene/views/diff/render.lua#L14-L22))
- Default links: Added and Untracked → `diffAdded`; Modified, Renamed, Copied, TypeChange and Unmerged → `diffChanged`; Deleted, Unknown and Broken → `diffRemoved`; Ignored → `Comment` ([hl.lua L388-L399, L454-L464](https://github.com/sindrets/diffview.nvim/blob/4516612fe98ff56ae0415a259ff6361a89419b0a/lua/diffview/hl.lua#L454-L464)).
- A folder's status is its children's status if they all match, otherwise `M` ([file_tree.lua L68-L92](https://github.com/sindrets/diffview.nvim/blob/4516612fe98ff56ae0415a259ff6361a89419b0a/lua/diffview/ui/models/file_tree/file_tree.lua#L68-L92)). By default it is shown only while the folder is collapsed (`folder_statuses = "only_folded"`, [render.lua L59-L67](https://github.com/sindrets/diffview.nvim/blob/4516612fe98ff56ae0415a259ff6361a89419b0a/lua/diffview/scene/views/diff/render.lua#L59-L67)).

### neo-tree.nvim

- `use_git_status_colors = true` colours the name, folders included, and a separate symbol column shows the status ([components.lua L520-L546](https://github.com/nvim-neo-tree/neo-tree.nvim/blob/3.42.0/lua/neo-tree/sources/common/components.lua#L520-L546), [defaults.lua L254-L269](https://github.com/nvim-neo-tree/neo-tree.nvim/blob/3.42.0/lua/neo-tree/defaults.lua#L254-L269)).
- Groups link to GitSigns/GitGutter first, then fall back to Added `#5faf5f`, Modified `#d7af5f`, Deleted `#ff5900`. Renamed links to Modified; untracked and conflict are orange `#ff8700` ([highlights.lua L289-L313](https://github.com/nvim-neo-tree/neo-tree.nvim/blob/3.42.0/lua/neo-tree/ui/highlights.lua#L289-L313)).
- Parents take the highest-priority child status, in the order `U?MADTRC` ([parser.lua L41-L84](https://github.com/nvim-neo-tree/neo-tree.nvim/blob/3.42.0/lua/neo-tree/git/parser.lua#L41-L84)). The cursor line is `CursorLine` + bold, so the fg colour stays.

### Zed

- The label colour follows a priority order: conflict, then deleted, then modified, then created/untracked, then ignored. A clean entry is muted, or default when selected. ([items.rs L2241-L2284](https://github.com/zed-industries/zed/blob/v1.29.3/crates/editor/src/items.rs#L2241-L2284)) The `renamed` theme key exists but the panel doesn't use it.
- One Dark: created `#a1c181`, modified `#dec184`, deleted `#d07277`, renamed `#74ade8` ([one.json L107-L137](https://github.com/zed-industries/zed/blob/v1.29.3/assets/themes/one/one.json#L107-L137)).
- A letter indicator (`! U D M A`) exists but `git_status_indicator` is off by default ([project_panel.rs L8404-L8427](https://github.com/zed-industries/zed/blob/v1.29.3/crates/project_panel/src/project_panel.rs#L8404-L8427), [default.json L993-L994](https://github.com/zed-industries/zed/blob/v1.29.3/assets/settings/default.json#L993-L994)).
- A directory's summary adds up its descendants, so folders are coloured ([git_traversal.rs L96-L101](https://github.com/zed-industries/zed/blob/v1.29.3/crates/project/src/git_store/git_traversal.rs#L96-L101)).

## Implications for BuildFrame

### What the code says today

- A Files row is a single `label` with one fg: muted when unchanged, `selectionColors().fg` when selected (`reviewingView.ts` ~L611-L638). Colouring part of the row means splitting it into spans; Questions rows already do this with `tail`.
- Selection is `accent` on `accentSoft` when the pane has focus. With the terminal's own background, `accentSoft` becomes transparent (`shellLook.ts` `theme()`), so selection is then shown only by `›`, bold and the accent colour. `accent` is reserved for focus (`shellLook.ts` L401).
- `warning` already means "changed since" (change marks and changed steps in `reviewingView.ts`).
- In Nerd Font mode the letter is replaced by an icon (plus, minus, pencil, shuffle, copy; T and S fall back to the pencil), so the shape still carries most of the status (`reviewingFileGlyphs.ts` L38-L46).

### Two checks on the four themes

- **Contrast**: success, danger and warning are at least 4.8:1 on `accentSoft` in all four themes (Quiet Paper is lowest at 4.8). Keeping the letter's colour on the selected row stays readable.
- **Deuteranopia** (Machado 2009 simulation): success and danger come out almost the same khaki in every theme. In Graphite, `#8ebd8b` becomes `#b8af8e` and `#d8898b` becomes `#aba48a`. In Quiet Paper, warning joins them too. So the colour can only reinforce the letter, never replace it. BuildFrame already always shows the letter.

### Options

**A. Colour the letter only (diffview / lazygit commit files).**
A → `success`, D → `danger`, M/R/C/T/S → `warning`, `·` stays muted. The name keeps today's colour. The letter keeps its colour on the selected row, while `›`, the name and bold carry the selection. Folders stay plain.
Pros: quiet; selection still works with a transparent background; one rule ("new / gone / changed") reuses the meaning `warning` already has; nothing to do for no-colour or ASCII mode. Cons: a mostly-modified change makes a column of yellow letters; renames aren't set apart.

**B. Colour the letter and the name (VS Code / Zed / neo-tree).**
Same mapping on the name too; the selected row overrides both with the selection fg (as VS Code does).
Pros: status visible from a distance, editor-familiar. Cons: loud; a red name reads like an error; when the background is transparent, a selected row's accent name is the only cue and loses against coloured neighbours; two colour systems (status vs focus) compete in one pane.

**C. Colour only A and D letters; M/R/C/T/S in normal text (GitLab-like).**
Pros: calmest; colour marks only files that appear or disappear. Cons: less familiar; a rename or type change looks like an ordinary edit until you read the letter.

### Recommendation

**A.** It matches the terminal tools closest to BuildFrame, keeps `accent` meaning focus, and reuses tokens the diff already uses. Don't use `accent` for modified or renamed: it means focus, and in Warm Carbon accent (`#e0ad62`) and warning (`#e6d36a`) are near-identical. Keep folders uncoloured for now. If collapsed folders hiding changes becomes a problem, diffview's approach (a letter on collapsed folders only) is the small next step. Fall back to C if the yellow column feels noisy on real reviews.
