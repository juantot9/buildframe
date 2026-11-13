---
id: WF-164
title: "Configure the Reviewing header"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-163]
created: 2026-08-31
---

## Question

How should portable presentation preferences expose all three human-reviewed top-header structures plus independent visibility, with Source-first masthead shown by default, without turning header choice into workflow State or a package Interface?

## Acceptance evidence

- Rewrite the three prototype directions inside the private production View; copy no prototype subtree or switcher. Add one closed header-style preference with `breadcrumb-rail`, `source-masthead`, and `minimal-marker`, plus an independent boolean visibility preference. Existing and new configurations default to visible `source-masthead`, the acceptor's preferred option.
- Keep these facts inside the existing portable `UserConfiguration` presentation seam. Parse optional additive `reviewing.header.style` and `reviewing.header.visible` fields under configuration version 1, diagnose invalid known values while defaulting only those fields, preserve unfamiliar sibling/header fields on save, validate writes, and retain atomic mode-0600 replacement/fail-closed unsupported-file behavior.
- Extend the existing Configuration overlay with separate Header style and Header visibility rows. Up/Down selection, Left/Right cycling, immediate preview, immediate save, Enter/Esc close, no Space leakage, no workflow State, and no generic settings registry remain exact. Header style cycles in A/B/C order; visibility toggles Shown/Hidden without losing the selected style.
- Render one stable private `reviewing-header` owner with style-specific IDs. Breadcrumb rail uses two rows, Source-first masthead uses three, Minimal marker uses one, and Hidden uses zero. Recompute content geometry from the chosen height so Home, comparison, Live, Previous, historical overlay, fixed preview, and action strip remain inside 224x68, 132x50, and 80x24 without wrapping or stale cells.
- Preserve route/source truth and avoid color-only meaning in every style. The Source-first masthead leads with Workspace Home, Local Comparison, Live Changes, or Saved Snapshot as appropriate; route and State remain subordinate. Hidden mode adds no replacement chrome and leaves accepted retention/history/context bands untouched.
- Prove defaulting, valid/invalid parsing, unfamiliar-field preservation, save/reload, and malformed/newer-file refusal in owner-local User Configuration tests. Prove production input cycling, hide/show, restart restoration, style-specific geometry/IDs, no-color/ASCII safety, zero Workspace read/command/State movement, and unchanged historical-dialog geometry in real Application scenarios.
- Verify Application tests/typecheck, canonical `pnpm v1:verify`, all four compiled State/Runtime/Pi/dogfood probes, and `git diff --check` on Node 26.5.1 with pnpm 11.20.0. Then rebuild fresh Scenario A and obtain genuine judgment on the configured default/header visibility, repaired historical distinction, and perceived loading before closing WF-147.

## Authority

- Human-selected configurable direction: [Prototype a quieter Reviewing header](./WF-163-prototype-quieter-reviewing-header.md)
- Portable presentation owner: existing private `UserConfiguration` Module in `apps/neoflow`
- Historical context presentation: [Distinguish historical detail from Live Reviewing](./WF-162-distinguish-historical-detail-from-live-reviewing.md)
- Genuine gate: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)

## Seam decision

Header choice is a portable display preference like theme, background, and arrangement, not a Workspace fact. Deepen the existing User Configuration and private Application/View seam: one small closed preference controls three View implementations and zero-height hiding; the existing save effect remains the only persistence route. Do not export a header Module, generic settings registry, or renderer Interface.

## Constraints

- Do not change Workspace reads, commands, durable workflow State, State version, Review routes, selection, retention/history bands, action discovery, input ownership, diagnostics, package exports, or dependencies.
- Do not preserve the rejected old header as a fourth style, add per-route header preferences, auto-hide, animation, logos, arbitrary templates, custom text, keybindings, or terminal-width persistence.
- Do not copy prototype source, retain a prototype switcher on `main`, or infer final Scenario A acceptance from tests/PTYs.
- Do not touch P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Progress (2026-09-01)

Production commit `416a576a6bf68cb9c4b39f8d03b5cc1c935bfdbc` keeps the preference inside the private version-1 User Configuration/Application/View seam. Missing configuration defaults to visible Source-first masthead; Breadcrumb rail, Source-first masthead, Minimal marker, and independent visibility preview and save through the existing Configuration effect. The three structures own two, three, and one rows respectively, hidden owns zero, and route/source facts remain shared privately without a package Interface or Workspace fact. The no-color Configuration control also exposed and repaired its existing transparent-cell backing so immediate style changes leave clean raw frames.

Owner-local evidence covers valid and invalid fields, unfamiliar-header preservation, failed writes, all style IDs/heights, exact content-row movement, hide/show, restart restoration, no Workspace read/command/State movement, 224x68/132x50/80x24 rendering, no-color/ASCII raw cells, and historical geometry. All 28 Application tests pass. Canonical verification passes 26 files / 149 tests, typecheck, clean build, and smoke; all four compiled State/Runtime/Pi/dogfood probes and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

The fresh human rerun did not complete this child’s acceptance: checking saved Snapshots still felt too slow. The fixture persisted visible `source-masthead`, but no header verdict is inferred. [Make saved Version navigation feel immediate](./WF-165-make-saved-version-navigation-feel-immediate.md) measured the production Local Runtime route and found 0.64–1.38-second p95 settlement versus a near-300 ms direct-Workspace control. [Run Local Runtime read cohorts behind operation barriers](./WF-166-run-local-runtime-read-cohorts-behind-operation-barriers.md) corrected that measured transport at exact commit `79cc4ec`; rapid production p95 settlement is now 313.411–353.580 ms with direct-owner parity.

The final real-executable Scenario A rerun used no configuration file, so it exercised the visible Source-first masthead default exactly. The acceptor explicitly accepted the production header and saved/read-only historical presentation. They accepted current loading with future improvement after reporting that it felt better but not perfect. Fixture State, immutable Versions, complete Responses, Git, and working bytes remained exact. This closes the configurable-header child without claiming that future performance work is unnecessary.
