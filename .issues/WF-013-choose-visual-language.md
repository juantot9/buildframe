---
id: WF-013
title: "Choose Neoflow’s visual language"
status: closed
labels:
  - wayfinder:prototype
parent: WF-001
assignee: juanan
blocked_by: [WF-012]
created: 2026-07-14
assets:
  - "git branch prototype/visual-language at 57ed47f"
  - "apps/tui/prototypes/visual-language/ on that branch"
---

## Question

Which terminal visual direction, hierarchy, density, color discipline, feedback motion, and artifact presentation gives Neoflow a distinctive but restrained identity while maximizing legibility and comfort?

## Blocked by

- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md)

## Resolution comment

Neoflow’s visual language is calm, exact, quietly crafted, and Artifact-first. It combines the prototype’s Editorial Ledger and Flowline directions rather than adopting one variant unchanged: Editorial Ledger governs sustained Plan and long-form Artifact reading through controlled measure, breathable vertical rhythm, sparse rules, warm-neutral restraint, and margin-like anchored comments; Flowline supplies the ownable identity through a restrained connected spine, focus rails, and anchor nodes that clarify hierarchy without carrying workflow authority. Calibrated Console contributes compact geometry and scan lines selectively to files, diffs, findings, metadata, and technical detail rather than setting the density of prose or commitment surfaces.

Density follows content role. Workflow, file, finding, and history lists stay compact; controls and metadata remain moderate; Plans, diffs, comments, and commitment summaries receive more reading space. Ordinary structure uses alignment, gutters, whitespace, and sparse separators instead of nested cards. Fully bounded surfaces are reserved for composers, consequential commitments, blockers, recovery, and focused decisions. Artifacts always outrank surrounding workflow chrome.

Focus uses a consistent visible grammar: a leading rail and stronger region heading, a textual marker plus restrained tint for the selected item, and explicit bounded treatment for editing or commitment. The default canvas is a coherent deep neutral rather than pure black. Sentence-case headings, restrained uppercase micro-labels, sparse bold, and readable Artifact measure establish hierarchy independently of terminal font choice.

Color is a redundant helper, not authority. One bright identity accent traces focus; small stable tints help distinguish Planning and Reviewing; amber draws attention to consequential decisions; green and red communicate outcomes; additions and deletions retain conventional diff treatment. Every use keeps an equivalent word, marker, rail, or selection shape. No-color and ASCII presentations remain first-class. Motion is limited to brief one-shot acknowledgement and restrained indication while activity is observably active; reduced-motion presentation removes both without hiding state.

The persistent layout-preset strip created avoidable visual competition with Artifacts. Its placement is clarified in [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md); the visual system keeps immediate task-local controls beside the work they affect. UI/UX fundamentals—clear hierarchy, visible state, recognition over recall, consistency, progressive disclosure, error prevention and recovery, readable contrast and measure, and keyboard/pointer parity—take precedence over branding whenever they conflict.

Validated interactive prototype: `apps/tui/prototypes/visual-language/` on branch `prototype/visual-language`, commit `57ed47f`. Its three source directions, realistic Planning and Reviewing scenarios, and wide, medium, narrow, linear, no-color, ASCII, and reduced-motion presentations are primary evidence. The prototype is not production code; implementation should rewrite and refine the synthesis in the real terminal renderer.
