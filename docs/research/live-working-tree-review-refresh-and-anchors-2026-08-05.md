# Live working-tree review refresh and durable anchors

Date: 2026-08-05
Status: primary-source comparison complete; target design human-accepted, not implemented

## Question

Should Neoflow's default current-changes surface continuously replace its Diff as the working tree changes, while commit/range reviews remain fixed—and what should happen to a Question when its original line changes?

## Sources and versions

This note uses first-party source and documentation at exact revisions:

- Plannotator [`backnotprop/plannotator@3d435184dce1bc7b17f350b5ea410ba042884fb9`](https://github.com/backnotprop/plannotator/tree/3d435184dce1bc7b17f350b5ea410ba042884fb9).
- Hunk [`modem-dev/hunk@c9ac1203f87323bc2225972ee9e1584f88adcaea`](https://github.com/modem-dev/hunk/tree/c9ac1203f87323bc2225972ee9e1584f88adcaea).
- Neoflow's current glossary and Reviewing decisions in [`CONTEXT.md`](../../CONTEXT.md), [`WF-006`](../../.issues/WF-006-shape-reviewing-workflow.md), and [`WF-051`](../../.issues/WF-051-design-solo-developer-execution-plan.md).

## Plannotator: live comparison intent, explicit snapshot refresh

Plannotator's new default local view is intentionally broad and working-tree-aware: its `since-base` comparison is merge-base(base, HEAD) to the working tree plus untracked files. It organizes committed, changed, and untracked files together. See the first-party [`since-base` intent](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/adr/intent-since-base-github-view-20260701-224500.md).

It does **not**, however, replace an open annotated Diff automatically. The review client polls a server-owned VCS fingerprint every five seconds through [`useDiffFreshness`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/review-editor/hooks/useDiffFreshness.ts). When files change, the toolbar shows `Diff out of date · Refresh`. The implementation states its reason directly: the user refreshes when ready, never automatically, because annotations are line-anchored and changing the Diff underneath them is worse than visible staleness. See [`App.tsx`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/review-editor/App.tsx#L2153-L2163) and the stale banner at [`App.tsx#L3183-L3202`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/review-editor/App.tsx#L3183-L3202).

A refresh preserves the active file where possible and replaces the patch and snapshot identity. Its annotations are retained separately and primarily store file, side, and line coordinates; commit and GitButler annotations additionally retain origin identifiers so export can label a mismatch instead of interpreting historical coordinates against the current Diff. See [`CodeAnnotation`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/ui/types.ts#L153-L205), [`fetchDiffSwitch`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/review-editor/App.tsx#L1853-L1977), and [`exportFeedback.ts`](https://github.com/backnotprop/plannotator/blob/3d435184dce1bc7b17f350b5ea410ba042884fb9/packages/review-editor/utils/exportFeedback.ts).

**Takeaway:** Plannotator agrees that the default comparison should include the latest working state, but deliberately separates *detect latest* from *replace the annotated snapshot*.

## Hunk: explicit watch mode and coordinate-preserved notes

Hunk exposes continuous reloading as an explicit `--watch` option:

- `hunk diff` reviews current repository changes, including untracked files;
- `hunk diff --watch` auto-reloads when the working tree changes;
- `show` reviews commits.

See Hunk's [`README`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/README.md#L62-L83). Watch mode is supported by configuration but ships disabled by default; the config tests encode that default in [`src/core/config.test.ts`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/src/core/config.test.ts#L756-L804).

The implementation treats filesystem events as hints, verifies an authoritative input signature, debounces, serializes refresh, and retains periodic fallback checks. See [`useWatchedInput`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/src/ui/hooks/useWatchedInput.ts), [`watchController.ts`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/src/core/watchController.ts), and its measured [`watch benchmark`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/docs/watch-benchmark-final.md).

Hunk can preserve live comments during a reload because they are session-owned annotations keyed by file plus old/new line coordinates. Its integration test adds a comment, changes the file, reloads, and expects both new content and the comment to remain. See [`AppHost.interactions.test.tsx`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/src/ui/AppHost.interactions.test.tsx#L1564-L1646) and [`liveComments.ts`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/src/core/liveComments.ts). Placement is coordinate/hunk based; it does not preserve an immutable historical source Artifact or prove that a changed line has the same meaning. Notes outside the current hunk can cease to render inline. Hunk's extension views explicitly refuse to guess unresolved mappings and fall the entire file back to raw Diff; see [`docs/extensions.md`](https://github.com/modem-dev/hunk/blob/c9ac1203f87323bc2225972ee9e1584f88adcaea/docs/extensions.md#L795-L802).

**Takeaway:** Hunk proves continuous refresh is operationally viable, but it accepts weaker, session-coordinate annotation semantics than Neoflow's immutable Artifact Anchors. It also makes watch mode opt-in rather than the shipped default.

## Comparison

| Product | Default working-state comparison | Open view changes automatically | Comment basis after change |
|---|---|---|---|
| Plannotator | Yes: `since-base` includes working tree and untracked | No; stale banner and explicit Refresh | Line coordinates retained; special historical modes carry origin metadata |
| Hunk | `diff` includes current changes and untracked | Only with explicit `--watch`/configuration | Live session file/side/line coordinates; no immutable historical Artifact claim |
| Neoflow today | HEAD to one effective-working-state capture | No; Workspace marks immutable Snapshot stale | Exact immutable Review Snapshot and row Anchor |

Neither reference product implements the exact combination proposed for Neoflow: **default continuous latest Diff plus durable Questions that remain truthfully attached to historical source without automatic re-anchoring**.

## Why it is viable, but not a renderer-only correction

The live observation part is straightforward and already partly present: Neoflow performs generation-safe Workspace verification. The hard part is preserving truthful durable meaning when the displayed Diff changes.

Doing this by executing `Start new Review` after every edit would be wrong: it would create unsolicited durable effects, churn Current/Previous history, and make ordinary saves look like user decisions. Mutating the existing Snapshot would also be wrong because Questions, Handoffs, receipts, and Responses already identify it.

The coherent production shape is:

1. **Live Changes** is a Workspace-owned projection of the latest HEAD-to-effective-working-state evidence, updated from invalidation hints plus authoritative verification.
2. **Commit/Range Review** remains fixed to its exact selected endpoints.
3. Asking a Question atomically captures or selects the exact immutable Review Snapshot used by that Ask.
4. A later source change updates Live Changes but never moves the old Question. If its anchored source changed or disappeared, the Question remains available as a historical thread labelled with its original Snapshot/code; it is not attached to the replacement line.
5. Exact unchanged reuse may avoid duplicate bytes, but any correspondence to changed source is only a suggestion until the human confirms a Re-anchor Mapping.

That requires successor Review Snapshot support in the Reviewing and Workspace Evidence Modules: durable lineage, latest-vs-historical projection, no-op reuse, race-safe capture, anchor availability, and bounded history. The execution plan currently assigns the underlying endpoint/successor evidence to P19 and re-anchor/re-review behavior to P22. It cannot be truthfully approximated inside the Gate A View without either weakening Neoflow's Anchor promise or implementing those semantic slices early.

## Recommendation

Adopt the user's agreed policy as the target:

- default Live Changes continuously reflects latest working evidence;
- commit/range review is fixed;
- a Question whose source changes remains attached to historical code and is never moved automatically.

Do **not** copy Hunk's coordinate-preservation behavior as if it were an exact re-anchor, and do not auto-create Reviews on file events. Implement this through Workspace-owned live projection plus immutable successor Snapshot lineage when the roadmap is explicitly re-scoped to permit the required semantic work. Until then, keep the current stale blocker rather than displaying fresh code with falsely current Questions.

## Accepted target decisions

The following product decisions were accepted in the C3-4 design conversation on 2026-08-05. They describe the target; the current Gate A implementation still uses one immutable Snapshot and a stale blocker.

### Snapshot lifecycle and navigation

- Starting a Review records its first exact Snapshot.
- File events update Live Changes but create no Artifact by themselves.
- At Ask commitment, Workspace reuses the latest Snapshot when the complete in-scope evidence is exact and unchanged; otherwise the same atomic command creates a successor Snapshot before dispatch.
- Multiple Questions may therefore share one Snapshot. A new Snapshot is not created merely because another Question was asked or Pi produced a Response.
- User-facing `Versions` navigation presents Live Changes plus the Review's immutable Snapshot lineage. Selecting a version shows its complete Files, Diff, Questions, and a clear historical banner; `Return to Live Changes` restores the latest projection.
- Clicking a historical Question opens its complete original Snapshot and exact Anchor. An older Question may project inline into Live Changes only when Workspace proves the original anchored source remains exact; ambiguity stays historical.

### Complete current-change scope

The default current-change Change Set includes staged, unstaged, untracked, added, deleted, renamed, type-changed, empty, binary, and otherwise unrenderable in-scope files. Limitations remain explicit. New textual files support new-side Anchors; deletions support old-side Anchors; empty or unrenderable files require whole-file Anchors rather than invented rows.

The source of a workspace edit does not alter its evidence treatment. User, script, Git, and Harness-adjacent changes all update Live Changes, but temporal overlap with an Invocation never proves Harness attribution. If a committed Question captured a file that later changed or disappeared, its Snapshot retains the historical file.

### Change while composing

A source change never retargets an open Question composer. Neoflow preserves the text, marks the original target changed, and blocks ordinary submission until the user returns to latest source and reselects. Asking about the original version is available only when that exact version is already retained. Ask remains one generation-checked atomic commitment; a race commits no Question or effect and never replays.

### Continuing from a range

A commit/range Review remains permanently fixed. When its terminal endpoint was HEAD, `Continue with Live Changes from HEAD` starts a new Current Review over `HEAD -> effective working state` and retains the frozen range as Previous/supporting context; it never mutates or migrates Questions from the range. A separate explicit intent may start a composite `range basis -> effective working state` Review. If HEAD moved before either action, Neoflow requires an explicit choice between the saved endpoint and current HEAD, without fetching or checking out.
