---
id: WF-198
title: "Make Scroll position truth visible in the Reviewing panes"
status: closed
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: [WF-195]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **Placement.** Each pane title gains a compact six-cell horizontal position strip at its trailing edge. This deliberately avoids stealing a code column or content row: row widths, wrap budgets, gutters, card identities, and pointer targets stay unchanged. The strip reads left-to-right from start to end even for vertically navigated content. The horizontal Questions arrangement uses the same title strip. Empty, unavailable, and wholly fitting content has no strip; a pending replacement Diff has no stale strip while its rows are hidden.
- **Projection truth.** Files and Questions use the absolute first displayed item and displayed item count against their settled projection totals, not the admitted window length. Diff uses the first-to-last projected row span represented by the displayed rows, against `window.totalRows`. Wrapped physical lines and embedded composer/discussion rows consume the existing viewport budget but do not become invented projected rows. Side-by-side pairing can represent disjoint source runs; its strip is explicitly a **row span**, not a claim that every intervening row is displayed or a guessed total of visual pairs. No renderer scroll state, off-window content measurement, or extra reads are used.
- **OpenTUI and fallback.** A small application-private `ScrollBarRenderable` specialization owns the standard `scrollSize`, `viewportSize`, and `scrollPosition` values. Its built-in interactive slider/arrows are hidden, and its display-only track draws whole-cell `─` / `━` glyphs (track/thumb), or `-` / `#` in ASCII. OpenTUI 0.5.10's Slider has no configurable thumb glyph and otherwise emits Unicode half-blocks, so the specialization is necessary for the settled ASCII contract. Thumb length is the visible span/total fraction rounded to the nearest cell (minimum one), and its travel is position/(total-span), also rounded. No-color uses terminal-default foreground/background rather than RGB theme colors.
- **Interaction and proof.** The strip is nonfocusable, nonselectable, and does not handle navigation or mutate the model. Pointer events retain the containing pane's existing meaning. Tests inspect the actual ScrollBar values and captured glyph cells at top/middle/bottom across bounded windows in rich and fallback presentations, plus existing reflow, selection, pending, and exact-copy scenarios. This remains application-only; no Workspace Interface or durable facts change.

## Implementation and verification (2026-09-07)

Implemented as `apps/neoflow/src/reviewingScroll.ts` (the private display-only `ReviewingScrollRenderable` specialization) plus `paneTitle` strips and viewport-height plumbing through `filesPane`/`questionsPane`/`diffPane`/`reviewBody`, including the historical dialog's inner viewport. The scenario drives Diff and Files edge/page navigation in the live panes and the Questions phase through the settled immutable-snapshot dialog (`historical-` prefixed ids), asserting `scrollSize`/`scrollPosition`/`viewportSize` truth, glyph cells, default-color spans in the ASCII lane, nonfocusability, hidden slider/arrows, click inertness (no reads, no movement), 100×28 and 80×24 reflow, and full-frame ASCII safety.

Two findings recorded per the seam rule:

- **Exposed defect fixed in the Reviewing model (application-owned).** `moveToEdge` fed `±MAX_SAFE_INTEGER` into `cycledTarget`, which wraps overshoot to the opposite extreme, so `g`/Home jumped to the LAST row and `G`/End to the FIRST on Diff, Files, and Questions. Single steps and pages keep their deliberate cycling; edge jumps now clamp (`bounded` flag on the three region moves). No prior scenario asserted diff edge navigation, which is why it survived. Re-proved by the new scenario's top/bottom assertions.
- **Settled interaction confirmed, not changed.** Any Question navigation (Tab focus, card click, `j`) presents the live Review through the historical dialog's snapshot panes; pane-region clicks on empty pane space focus the live Questions pane without a dialog. The scenario exercises both facts without altering them.

One verification incident: an untracked `repo-health-report.html` tool artifact (created earlier in the session, not by lint) tripped `oxfmt --check`; it was deleted and did not regenerate, so no ignore-pattern change was made. Canonical `v1:verify` passed (34 files / 287 tests), all four compiled risk probes passed, and `git diff --check` is clean with the unrelated root `packageManager` bump unstaged.

## Outcome

The Reviewing TUI's scrollable panes — the Change Set manifest, the selected diff, and the Questions pane — gain visible Scroll position indicators built on OpenTUI's `ScrollBarRenderable`, so it is always truthful which portion of the underlying content is on screen. Indicators are presentation-only: thumb position and size derive from the settled projection totals (projected row counts and window bounds) and the pane's viewport, never from renderer-internal state guessed after the fact, and they never alter row identities, selection, pointer targets, focus, or content bytes. Panes whose content fits the viewport show no indicator or a full-height thumb, per what the resolution settles. The exact per-pane placement, glyphs, and no-color/ASCII behavior are recorded in this issue's resolution before implementation.

## Interface

No Workspace Interface, State format, record format, limit, deadline, or budget changes. Indicators derive at render time from already-projected totals and viewport geometry; no projection fact, content envelope, or durable record changes.

## Module seam

Presentation lives in the Reviewing Application (`apps/neoflow`) through the pinned `@opentui/core`; Workspace Evidence, Projection, Reviewing, and Harness Interaction keep their settled seams and are changed only if a defect is exposed, in which case the fix is folded into the owning owner and re-proved.

## Acceptance

- [x] Per-pane indicator placement, glyphs, and no-color/ASCII behavior are recorded in this issue's resolution before implementation lands.
- [x] Thumb position and size are truthful against projection totals at the top, middle, and bottom of each pane's scroll range, proven by scripted scenarios in both the rich and fallback presentations.
- [x] Indicators never disturb row identities, selection, pointer targets, focus, or byte-exact content, and the scripted reflow (Wide/Balanced/80×24), focus, and pending-behavior assertions stay green.
- [x] The no-color/ASCII fallback lane asserts indicator structure with ASCII glyphs, and `presentation.noColor` suppresses color exactly as elsewhere.
- [x] Canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass, with the unrelated root `packageManager` bump still unstaged.

## Constraints

- Keep Node 26.5.1 / pnpm 11.20.0, State format 2, Interface version 1, the three-method Workspace Interface, and all limits/deadlines/budgets unchanged.
- Indicators derive only from already-projected totals and viewport geometry; no Git, filesystem, or network access and no new dependency class beyond the pinned `@opentui/core`.
- Presentation-only: no User Configuration surface and no change to the settled Reviewing interaction model.
- Never inspect real user repositories or `.neoflow` state; all scenarios use disposable generated fixtures and the established scripted Terminal harness.
- Keep the unrelated root package-manager bump unstaged through every commit.

## Authority

- [Adopt OpenTUI rich content for Reviewing presentation](./WF-195-adopt-opentui-rich-content-reviewing-presentation.md)
- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md)
- [Choose the visual language](./WF-013-choose-visual-language.md)
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)
