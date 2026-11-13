---
id: WF-105
title: "Unify Workspace Evidence capture retention"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can Workspace Evidence make its two capture producers share one private FIFO retention rule so their common two-capture bound cannot drift silently?

## Acceptance evidence

- The retained-capture maximum is one named module constant with value 2, not an exported or configurable Workspace Evidence limit.
- One private helper owns insertion and FIFO eviction for `#captures`; both current-change capture and historical-comparison capture call it, leaving no duplicated retention loop or second bound literal.
- A Workspace Interface scenario interleaves current-change A, historical comparison B, changed current-change C, and historical comparison D. After C it observes only B/C retained; after D it observes only C/D retained, so both producers cross and enforce the same bound through bounded manifest reads.
- Focused mutations changing the named maximum or bypassing the helper from either producer make the interleaved Interface scenario fail.
- Capture identities, public views, retry behavior, verification, content, and the existing two-entry FIFO outcome remain unchanged.
- The complete Workspace Evidence scenarios, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled scope and non-configurability decision: [`W-02`](../docs/audit/pre-p17-codebase-findings.md#w-02--capture-eviction-loop-duplicated-verbatim)
- Workspace evidence/Git disposition: [Disposition the Workspace evidence and Git findings](./WF-071-disposition-workspace-evidence-and-git-findings.md)

## Constraints

- Keep the retention helper and constant private to `workspaceEvidence.ts`; do not widen `WorkspaceEvidenceLimits` or the package Interface.
- Tests and callers cross `Workspace.read`; do not expose the Map, helper, or limit for inspection.
- Preserve insertion-order FIFO semantics exactly, including behavior when a capture identity is already present.
- Do not broaden this duplication repair into a generic cache, configurable policy, or unrelated Workspace Evidence cleanup.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. Workspace Evidence now names its private policy once as
`MAX_RETAINED_CAPTURES = 2`. One `#retainCapture` helper owns the Map insertion
and insertion-order eviction loop, and both successful current-change and
historical-comparison producers call it. A focused source census finds one bound,
one `#captures.set`, one size check, and the two producer calls. The exported
`WorkspaceEvidenceLimits` remains unchanged.

The new Workspace Interface scenario creates current-change A, comparison B,
changed current-change C, and comparison D. After C, A reads as unverified with
`evidence-not-retained` while B/C manifests remain available. After D, B has the
same unavailable result while C/D remain available. All four identities are
distinct, so each producer is observed crossing the shared two-entry FIFO rather
than repeatedly addressing one Map entry.

Three focused mutations each fail the scenario 1/1: raising the named maximum to
3 leaves A available, bypassing the helper from current-change capture leaves A
available after C, and bypassing it from comparison capture leaves B available
after D. Restoring the implementation leaves the complete Workspace Evidence
file passing 12/12.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passes the dependency
firewall, all 19 files / 131 tests, typecheck, builds, and smoke. All four
compiled risk probes pass, and `git diff --check` is clean. Capture bytes,
identities, retry and verification behavior, public Interfaces, and FIFO
semantics are otherwise unchanged. The unrelated root `package.json` bump
remains excluded.
