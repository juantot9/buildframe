---
id: WF-122
title: "Filter bordered box titles at one seam"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-121]
created: 2026-08-26
---

## Question

Can every title-bearing bordered box apply the Application's existing rendered-text policy once, including both top and bottom titles, while preserving the complementary Workspace path escaping that still protects CR and LF?

## Acceptance evidence

- Re-enumeration records the current class before implementation. `reviewingView.ts` now has six `borderedBox` callers; five `title` props and one `bottomTitle` prop sit under that door. The settled finding's four-title count predates the HEAD-moved continuation overlay. No direct `Box` call outside `borderedBox` carries either prop.
- One real Workspace/Application/OpenTUI scenario creates a Git path containing both CR and a C1 control. Workspace `evidencePath` keeps CR represented as visible `\\r` but deliberately passes C1; the rendered Question composer and expanded Question-card titles retain the visible path while replacing the raw C1 with `�`.
- The scenario inspects the real `BoxRenderable` title Interface, not a new exported filter seam. A long Question also makes the existing `bottomTitle` observable and proves it remains a valid filtered title after the centralized change.
- The old implementation fails because repository-derived C1 reaches both dynamic titles unchanged. A control that places sanitization before the caller options spread also fails, proving callers cannot overwrite the accepted title.
- `borderedBox` applies `safeText` after spreading caller options, independently to `title` and `bottomTitle` when present. All current literal titles remain byte-for-byte unchanged in normal presentation.
- Workspace `evidencePath` remains untouched and load-bearing: `safeText` intentionally preserves CR and LF, whereas the Workspace path representation neutralizes them. This child does not claim either filter subsumes the other.
- The focused-composer control rule from WF-121 remains separate because it removes tab, LF, and CR rather than rendering them. A-05 dead-code deletion and last-ranked A-02 no-color streaming remain separate children.
- No title helper, `borderedBox`, or test seam is exported. Application root/launcher values, OpenTUI layout and color options, Workspace facts, command shapes, and durable bytes remain unchanged.
- Focused Application scenarios, Application typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled finding and cross-package obligation: [`S-07`](../docs/audit/pre-p17-codebase-findings.md#s-07--box-titles-reach-the-renderer-unfiltered)
- Corrected render-path enumeration: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)

## Seam decision

`borderedBox` is already the one private door used by every title-bearing `Box`. Let it preserve all ordinary caller options, then override only present `title` and `bottomTitle` values with `safeText(value, state.presentation.ascii)`. This closes the class without adding per-call-site policy or widening the Reviewing Application Interface.

The regression crosses the production Interface from a real checkout path through Workspace projection into the real OpenTUI render tree. Directly exporting `safeText` or `borderedBox` for a unit test would create a shallow Interface and would miss the complementary Workspace transformation the finding says must remain load-bearing.

## Constraints

- Filter both top and bottom title props after the caller options spread.
- Preserve `titleColor`, alignments, borders, layout, literals, and ASCII/no-color behavior.
- Do not remove or weaken `evidencePath`; it remains the only CR/LF protection for these repository paths.
- Do not reuse WF-121's composer-input control policy for rendered labels.
- Do not add a generic text utility or widen any package export.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `borderedBox` now snapshots the optional top and bottom titles, spreads every
caller option as before, and then overrides only the present title values with
`safeText(value, state.presentation.ascii)`. The post-spread placement is
load-bearing: title color/alignment and every other Box option remain caller-owned,
while an unfiltered caller value can no longer overwrite the accepted rendering.
No helper or View implementation detail was exported.

The current AST census corrects the settled finding's historical count. There are
six `borderedBox` calls; five top titles and one conditional bottom title sit under
that one door. The fifth top title is the HEAD-moved continuation overlay added
after the four-title audit count. No direct `Box` call outside `borderedBox`
carries either title prop. The repair therefore closes the current class rather
than only the two dynamic sites.

The regression uses an actual Git filename containing CR followed by C1 OSC.
Workspace projection turns CR into the visible two-character `\\r` representation
and intentionally leaves C1 intact. Through the real Application and OpenTUI tree,
both the Question composer and expanded Question card now contain
`review\\r�title.txt`, with neither raw CR nor C1. A long Question makes the
existing `Detail rows N-M/total` bottom title observable at the same Interface.
This proves the Application adds C1 coverage without pretending to replace the
Workspace's still-load-bearing CR/LF escape.

The old implementation fails the selected regression 1/1 at the composer title.
Moving the sanitized overrides before `...options` independently fails 1/1 with
the same raw C1 title, proving the ordering guard. All existing literal titles,
bottom-title text, colors, alignment, and layout remain unchanged in normal
presentation. WF-121's composer-input rule and `evidencePath` are byte-for-byte
untouched.

All four Application test files pass 23/23, and Application typecheck/build pass.
The compiled Application root still exposes only `createReviewingApplication`;
the launcher still exposes only `openDeveloperReviewing` and
`openDeveloperWorkspaceRuntime`. On Node 26.5.1 with pnpm 11.20.0, canonical
`pnpm v1:verify` passes the dependency firewall, all 24 files / 142 tests,
typecheck, builds, and smoke. All four compiled risk probes pass and
`git diff --check` is clean. The unrelated root `package.json` bump remains
excluded. S-07 is closed at the existing private rendered-Box seam.
