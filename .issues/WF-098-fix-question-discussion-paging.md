---
id: WF-098
title: "Fix Question discussion paging"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-14
---

## Question

Can the Reviewing Application make Ctrl+J/K page an expanded Question and Pi Response reliably in real terminals, derive each page from the card's actual width and height at every supported viewport and arrangement, and keep its visible position truthful without widening the Workspace Interface?

## Acceptance evidence

- A regression sends the legacy LF byte emitted by Ctrl+J and fails against the current implementation, then proves it advances an expanded discussion without changing Question selection or workflow meaning.
- Page movement is derived from the rendered discussion card's current visible-detail capacity rather than the fixed eight-row guess, and works at linear, balanced, and wide widths plus short and tall terminal heights.
- Resizing or changing effective pane geometry clamps the same Application-owned visual position; the card and pane title never disagree and repeated paging at either edge has no dead presses.
- Pointer paging and PageUp/PageDown retain equivalent bounded behavior. Composer input remains owned by OpenTUI's Textarea and is not regressed.
- Focused Application tests, canonical `pnpm v1:verify`, all four risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- A-01 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)

## Constraints

- Keep this inside the Reviewing Application Module. Do not expose card geometry through the Workspace Interface.
- Derive one paging calculation for rendering, keyboard, pointer, resize, and truthful labels; do not copy view wrapping arithmetic into the renderer-neutral model.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The human dogfood failure had two coupled causes. Terminal.app reports
Ctrl+J as the legacy LF/`linefeed` key even when Kitty keyboard support is active,
while the Application recognized only a modified `j`. The renderer-neutral model
also advanced a fixed eight rows although the expanded discussion's real page size
is derived from terminal width, terminal height, arrangement, pane widths, wrapped
Question/Response text, fixed thread rows, and the final-page bound.

The Application View now recognizes both Ctrl+J encodings and owns one exact
`DiscussionPage` derived while constructing the card. Ctrl+J/K, PageDown/PageUp,
and pointer controls consume that same current page size and maximum offset. The
View synchronizes its clamped visual offset back into the Application model on
every render, so terminal resize or pane reflow cannot leave dead presses or a
pane title that disagrees with the displayed card. This changes only ephemeral
Application position; Question selection, durable workflow meaning, the
Workspace Interface, and the Textarea-owned composer remain unchanged.

The existing real-Workspace Ask/Response scenario now sends the literal LF byte
and verifies complete-page movement at 80x24, both sides of the 90- and 120-column
layout breakpoints, 132x34, and the human session's 213x64 Terminal.app viewport.
It observes differing page sizes, final-page clamping, repeated edge input,
Ctrl+K return, PageUp/PageDown and pointer parity, and narrow-end to wide resize
clamping with truthful card and pane labels. The complete 16-test Application
scenario file passes.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 19 files / 124 tests, typecheck, builds, and smoke. All four compiled
risk probes pass, and `git diff --check` is clean. The prepared dogfood State,
workspace, and Pi session were preserved; only Neoflow and its runtime owner were
restarted from the corrected build, and its Terminal.app viewport was restored
to 213x64. The owner then confirmed Ctrl+J paging works in that human session.
The unrelated root `package.json` bump remains excluded.
