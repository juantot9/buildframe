---
id: WF-130
title: "Explain empty Projection actions"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-129]
created: 2026-08-27
---

## Question

Do the two deliberately empty Projection action collections state the accepted direct-retained Reviewing rule that makes their emptiness intentional rather than unfinished wiring?

## Acceptance evidence

- `reviewActions` records that direct-retained Reviews have no Finish ceremony and therefore project no Review action.
- `questionActions` records that Questions continue without disposition and therefore project no Question action.
- The rationale sits immediately at each stub, so a future producer or cleanup encounters the semantic decision before changing `return []`.
- Comment-stripped `projection.ts` is byte-identical before and after. No parameter, return value, projection shape, command, test, package Interface, or configuration changes.
- Focused Workspace Projection scenarios pass. Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Recorded P16C comment obligation and accepted direct-retained rationale: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)
- Direct retained Reviewing implementation: [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)

## Seam decision

Record the semantic reason at each private Projection helper. Do not replace an intentionally empty collection with a new action, remove an Interface field, or extract a shared comment/helper. The two comments differ because Review ceremony and Question disposition are distinct rejected semantics.

## Constraints

- Change only comments beside `reviewActions` and `questionActions` plus issue records.
- Do not add a producer, action kind, command, blocker, or test-only seam.
- Preserve every projection byte and package Interface.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Each private stub now states its distinct accepted semantic reason. `reviewActions` records that direct-retained Reviews have no Finish ceremony; `questionActions` records that Questions continue without disposition. Both therefore deliberately project no action until a real command producer and governing semantic decision exist.

The rationale sits immediately above each `return []` helper. No parameter, call, collection, blocker, projection shape, or command changed. Comment-stripped TypeScript transpilation retains exact SHA-256 `161e2ee45c8463c61fb7bc39a55fc59355115cec2f01f9bd153618fb622dd2ea` before and after.

The focused Workspace Projection scenarios pass 1 file / 7 tests with package typecheck. On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes all 25 files / 145 tests, dependency checks, the strengthened unused-declaration gate, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. The unrelated root `package.json` bump remains excluded.
