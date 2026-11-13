# OpenTUI 0.5.1 bounded syntax highlighting for Reviewing

Date: 2026-08-05
Status: primary-source investigation and throwaway prototype complete; production integration deferred

## Question

Can the pinned OpenTUI `0.5.1` syntax facilities highlight Reviewing code without weakening bounded projection reads, exact Diff-row/Anchor identities, or inline Question-card insertion?

## Primary sources

The exact first-party release [`v0.5.1`](https://github.com/anomalyco/opentui/releases/tag/v0.5.1), commit [`ad9a818`](https://github.com/anomalyco/opentui/tree/ad9a818d7a9d73f3386e92a445d0feb4b395c69e), identifies `packages/core` as `@opentui/core` `0.5.1`. The reviewed implementation sources are:

- `packages/core/src/renderables/Code.ts`;
- `packages/core/src/renderables/Diff.ts`;
- `packages/core/src/syntax-style.ts`;
- `packages/core/src/lib/tree-sitter-styled-text.ts`, `client.ts`, and `default-parsers.ts`;
- the official `packages/web/src/content/docs/components/code.mdx`, `diff.mdx`, and `reference/tree-sitter.mdx` skill documentation.

The throwaway executable evidence is captured on branch `prototype/opentui-bounded-syntax-highlight` at commit `1f71734d3029a29da9bd0983487fb34ab1750d4d`. It pins both production importers and all native optional packages to `0.5.1` and reproduced the earlier result unchanged.

## Findings

### `CodeRenderable` is asynchronous and preserves plain-text fallback

`CodeRenderable` sends its complete `content` plus one `filetype` to `TreeSitterClient.highlightOnce`. It initially draws unstyled text when configured to do so, rejects stale asynchronous results with a snapshot counter, converts highlight ranges to `StyledText`, requests a replacement render, and falls back to plain text if highlighting fails. Its public `highlightingDone` promise permits deterministic settlement.

This is useful behavior, but a renderable owns one complete text buffer. Supplying one renderable per projected Diff row would parse incomplete language fragments and create unnecessary parser work.

### `DiffRenderable` cannot directly replace Neoflow's Diff pane

`DiffRenderable` parses a unified patch, flattens each hunk into internal code buffers, and combines syntax foregrounds with addition/removal/context backgrounds and gutters. Split mode also aligns wrapped visual rows. Its stable navigation interface is `getHunkRowOffsets()`; it does not expose Neoflow's per-row identities or an insertion seam for arbitrary children between exact rows.

Replacing the current pane would therefore make the renderer, rather than the Reviewing model, own row structure. Recovering exact Anchor identities and inserting Question cards would require a parallel mapping coupled to OpenTUI internals. That is a shallow, fragile seam and is rejected.

### A row-preserving path is technically viable

`treeSitterToStyledText` highlights a supplied string once and returns public `StyledText.chunks`. Highlight ranges and chunks preserve source text and newline offsets when concealment is disabled. The prototype joined four bounded TypeScript rows, highlighted that one window, split styled chunks back at newlines, and proved:

- exact text equality after splitting;
- the same four-row count;
- the selected Neoflow row identity remained unchanged;
- an inline Question card can still be inserted between existing row VDOM children.

The same prototype confirmed that `DiffRenderable` renders the bounded patch but exposes only one hunk offset and no exact row identity.

### Built-in language coverage is intentionally narrow

OpenTUI `0.5.1` bundles default tree-sitter assets for JavaScript/JSX, TypeScript/TSX, Markdown/Markdown-inline, and Zig. Highlighting other file types requires additional reviewed WASM grammars and query assets. Unsupported or failed languages must remain plain code; production must not download parser assets at runtime.

## Production shape, if scheduled

Keep the existing Reviewing View and its exact row children. Add one private, asynchronous highlighter inside the Reviewing Application Module that:

1. maps a reviewed path extension to a bundled OpenTUI filetype;
2. joins only the current bounded Diff window;
3. highlights once with concealment disabled;
4. rejects stale results by Review/file/window/theme identity;
5. splits chunks back into the exact projected rows;
6. caches the result by content identities, filetype, and semantic theme;
7. leaves gutters, selected/addition/deletion backgrounds, Anchor identities, and Question-card insertion under the current View;
8. bypasses highlighting in no-color mode and falls back to the current code color on every unsupported/error path.

This would require an internal asynchronous result seam and focused lifecycle/performance tests. It is not a safe visual-only patch.

## Verdict

**Do not use `DiffRenderable` as a production replacement.** OpenTUI can supply tree-sitter styling through a row-preserving bounded-window adapter, but that adapter needs a separately accepted implementation slice. Syntax highlighting remains non-gating for the current Gate A correction candidate.
