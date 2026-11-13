# Hunk diff and pane interaction patterns

Research date: 2026-07-31
Pinned source: [`modem-dev/hunk@840a504684882c8237fa76004bcf1ddd41fe74d3`](https://github.com/modem-dev/hunk/tree/840a504684882c8237fa76004bcf1ddd41fe74d3)

## Question

How does Hunk avoid silently losing code beyond a Diff pane's width, and which pane sizing and visibility behaviors are useful for Neoflow's Reviewing TUI?

## Findings

### Long Diff lines are a view choice, not silent overflow

Hunk keeps line wrapping as explicit view state. `w` toggles wrapping; when wrapping is disabled, Left/Right scroll code horizontally and Shift accelerates that movement. The horizontal offset applies to code while gutters remain fixed.

Sources:

- [`src/ui/lib/appCommands.ts`, Diff scrolling and line-wrap commands](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/lib/appCommands.ts#L203-L299)
- [`src/ui/App.tsx`, horizontal extent/offset and wrap toggle](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L1038-L1092)

Wrapped rows are terminal-cell-aware rather than JavaScript-string-width-aware. Hunk sanitizes terminal text, preserves grapheme clusters across syntax spans, wraps content into visual lines, and leaves continuation gutters blank. It separately measures wrapped row geometry so scrolling/windowing still operates on what is actually painted.

Sources:

- [`src/ui/diff/renderRows.tsx`, span slicing and wrapping](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/diff/renderRows.tsx#L80-L700)
- [`src/ui/diff/codeColumns.ts`, fixed gutters and code viewport geometry](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/diff/codeColumns.ts#L1-L150)

### Inline review notes live at their exact code anchor

Hunk does not expand one selected note inside a detached sidebar. It builds one explicit presentation plan that inserts framed `inline-note` rows immediately before the exact old/new Diff row they annotate. The card title carries source, position among notes sharing an Anchor, and a GitHub-style file/line label; the complete summary and optional rationale wrap inside the code viewport. Multiple notes on one Anchor remain distinct `i/n` cards, and range annotations add a side-specific guide through the covered code rows. Notes participate in measured/windowed Diff geometry rather than floating outside scrolling and navigation.

Sources:

- [`src/ui/diff/reviewRenderPlan.ts`, exact Anchor matching, grouped placement, and inline row insertion](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/diff/reviewRenderPlan.ts#L130-L330)
- [`src/ui/components/panes/AgentInlineNote.tsx`, framed title/body and complete wrapped note rendering](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/components/panes/AgentInlineNote.tsx#L1-L430)
- [`src/ui/lib/agentAnnotations.ts`, exact old/new Anchor and location labels](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/lib/agentAnnotations.ts#L45-L145)
- [`src/ui/diff/PierreDiffView.tsx`, mounting inline cards in the windowed Diff stream](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/diff/PierreDiffView.tsx#L330-L390)

### Side panes give their width to the center Diff

Hunk models side-pane widths explicitly, preserves a minimum width for both sidebar and Diff, and lets the Diff consume the remainder. A left pane's divider uses the direct drag delta; a right pane's left-edge divider mirrors that delta. This is the same physical-border model requested for Neoflow.

Sources:

- [`src/ui/App.tsx`, pane minima and width state](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L188-L245)
- [`src/ui/App.tsx`, responsive pane planning and center width](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L850-L910)
- [`src/ui/App.tsx`, mirrored left/right divider resizing](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L1820-L1870)
- [`src/ui/lib/sidebar.ts`, clamped resize calculation](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/lib/sidebar.ts)

The visible divider is one cell, while Hunk gives mouse interaction a wider invisible hit target. Neoflow's current renderer remains keyboard-first, but the distinction is useful if mouse resizing is added later.

Source: [`src/ui/components/panes/PaneDivider.tsx`](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/components/panes/PaneDivider.tsx)

### The file pane is optional and responsive

Hunk binds `s` to sidebar visibility. Hiding it returns its width to the Diff. On narrower layouts, showing it is allowed only when sidebar, divider, and minimum Diff widths all fit; tests cover hide/show and pager behavior.

Sources:

- [`src/ui/lib/appCommands.ts`, sidebar command](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/lib/appCommands.ts#L250-L266)
- [`src/ui/App.tsx`, responsive sidebar toggle](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/App.tsx#L1200-L1232)
- [`src/ui/AppHost.interactions.test.tsx`, sidebar visibility scenarios](https://github.com/modem-dev/hunk/blob/840a504684882c8237fa76004bcf1ddd41fe74d3/src/ui/AppHost.interactions.test.tsx#L2890-L2980)

## Neoflow adaptation

- Wrap Diff code by default so ordinary overflow is visible immediately.
- Keep `w` as an explicit wrap/no-wrap toggle. In no-wrap mode, Shift+Left/Right moves code while gutters stay fixed; plain `h/l` remains the old/new Anchor-side control.
- Keep inline and side-by-side as one local `v` presentation choice; both use the same wrapping and horizontal-code viewport behavior.
- Keep side widths ephemeral. The Files pane owns its right border; Questions owns its left border; the center Diff receives the remaining width. Clamp all changes so the center remains usable.
- Keep every Question visible as a compact, navigable card in the Questions pane. Selecting a card moves the Diff to its exact immutable Anchor and inserts one Hunk-style framed discussion card immediately before that code row. The inline card carries the complete Question and captured Pi Response; the sidebar card remains a concise index with ordinal, status, preview, location, and Response size rather than becoming a second transcript.
- Use the conventional `Ctrl+h` / `Ctrl+l` pair for physical left/right border movement. Mirroring the effect for the right pane makes the control operate on borders rather than abstract “grow/shrink” semantics.
- Use `s` to hide/show Files. Hidden Files is presentation-only: selection and Review meaning remain unchanged, and focus cycles only through visible panes.
- Preserve 80×24 linear behavior: width controls do nothing there except explain that a visible side-pane border must be focused.
