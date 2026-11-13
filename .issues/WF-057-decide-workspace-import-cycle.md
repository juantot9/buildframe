---
id: WF-057
title: "Decide whether to break the packages/workspace import cycle"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: [WF-054]
created: 2026-08-05
assets: []
---

## Question

Must the declaration cycle between `authoritativeState.ts` and `workspace.ts` in `packages/workspace/src` be broken, and if so how—does the shared type move to a third module, or does the cycle stay as an accepted fact with its reason recorded?

**Re-scoped on resolution.** The premise above is wrong: there is not one cycle, there are seven, and all seven run through `workspace.ts`. The question actually decided was whether `workspace.ts` should keep owning both the package's shared vocabulary and its composition root. See **Established facts**, which have been corrected.

## Blocked by

- [Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md)

## Established facts

Corrected on resolution. The original facts described a two-node cycle and
asserted the rest of the package was cycle-free; both were wrong. Every edge in
`packages/workspace/src` was mapped directly from the source to produce the table
below. The superseded version survives in git history.

- **There are seven cycles, not one, and every one runs through `workspace.ts`:**

  | Sibling module | `workspace.ts` → sibling | sibling → `workspace.ts` |
  | --- | --- | --- |
  | `authoritativeState.ts` | `import type` | `import type` |
  | `harness-interaction/contracts.ts` | `import type` | `import type` |
  | `harness-interaction/harnessInteraction.ts` | value | `import type` |
  | `projection.ts` | value | `import type` |
  | `reviewing.ts` | value | `import type` |
  | `workspaceIdentity.ts` | value | `import type` |
  | `workspaceEvidence.ts` | value | `import type` |

- **Every back-edge into `workspace.ts` is `import type`, without exception.**
  TypeScript erases all seven, so there is no runtime cycle anywhere in the
  package. Seven out of seven is too consistent to be accidental; it is treated
  here as an existing deliberate rule that had never been written down.
- **The `authoritativeState.ts` edge is the only one type-only in both
  directions**, which is presumably why a tool named it. That makes it the
  *least* coupled of the seven, not the most: the other six carry a real value
  dependency in the `workspace.ts` → sibling direction.
- **`workspace.ts` is two modules in one file.** Lines 34–390 are the shared
  vocabulary — `WorkspaceIdentity` (`:207`), `WORKSPACE_INTERFACE_VERSION`
  (`:211`), `WorkspaceCommand`, the view and view-scope types, the `Workspace`
  Interface (`:277`), and eleven bootstrap diagnostic types — plus four
  re-export blocks. Lines 391–586 are the composition root: `OpenWorkspace`
  (`:393`), `openRuntimeWorkspace` (`:550`), and `bootstrapWorkspace` (`:573`).
  The boundary is contiguous; the declarations sit entirely above the
  implementation.
- `workspace.ts` is 586 lines, `authoritativeState.ts` is 384 lines.
- **`workspaceIdentity.ts`, the module named for the concept, does not own the
  type.** It imports `WorkspaceIdentity` from `workspace.ts`
  (`workspaceIdentity.ts:25`–`:29`) and contributes `resolveWorkspaceIdentity`
  and `WorkspaceIdentityResolution` instead.
- **`authoritativeStateProtocol.ts` is the package's only import-free leaf** and
  never mentions `WorkspaceIdentity`.
- **No consumer imports a deep path.** `local-runtime`, `pi-adapter`, and
  `apps/neoflow` reach the package only through `@neoflow/workspace`,
  `@neoflow/workspace/harness-interaction`, and `@neoflow/workspace/runtime`. A
  split inside `src/` would therefore cause no cross-package churn.
- Each of `AuthoritativeState` and `WorkspaceIdentity` is used in very few places
  across the named cycle: `AuthoritativeState` appears in `workspace.ts` only as a
  parameter type at `:403` and `:553` and none of its methods are called there,
  and `WorkspaceIdentity` appears in `authoritativeState.ts` only at `:67`, one
  field of `OpenAuthoritativeStateRequest`.

## Notes

- Blocked on the audit because the answer depends on what else the audit establishes about coupling between these two owners. A type-only cycle is a clarity question, not a runtime hazard, so it must not be broken merely because a tool can name it.
- The evidence-driven rule applies: if the only support for breaking it is tidiness, the disposition is **accepted** with the reason recorded, not **fixed**.
- Note the direction of the dependency that matters architecturally: `WorkspaceIdentity` is a domain identity that the state store needs, which may mean the identity type belongs somewhere neither of these two modules owns.

## Resolution comment

**Disposition: accepted, for all seven cycles, with the invariant written down.**
No code changes.

### The invariant this ticket makes explicit

> Within `packages/workspace/src`, `workspace.ts` owns the package's shared
> vocabulary and its composition root. Sibling modules may import that
> vocabulary, but **only** with `import type`. A sibling that needs a runtime
> value from `workspace.ts` is a design error and must be resolved by moving the
> value, not by adding the import.

The code already obeys this rule in all seven cycles. The rule was latent and is
now recorded, so a future reader meeting one of these cycles — or a tool naming
one — has the reason to hand instead of rediscovering it.

### Why accepted rather than split

The alternative considered was moving lines 34–390 into a declarations module,
which would break all seven cycles at once and cost only the import lines in
seven files, one new file, and `index.ts` — no cross-package churn, since no
consumer imports a deep path. That is a narrower diff than expected, and it was
weighed on its merits rather than dismissed.

It was still rejected:

- **There is no hazard to fix.** Every back-edge is erased at compile time, so
  nothing cycles at runtime. The support for splitting is legibility alone, and
  this map's standing rule dispositions a finding supported only by tidiness as
  **accepted**, not **fixed**.
- **The diff lands on source that Gate A and Gate B just proved**, and it would
  touch the import surface of seven of the package's twelve modules. Re-proving
  that to buy clarity is a poor trade while `pnpm verify` is the only gate.
- **The pattern is coherent as it stands.** Vocabulary above, implementations
  below, composition root alongside the vocabulary. The only genuine wart is that
  the composition root shares a file with the vocabulary, and that is a
  file-organisation preference, not a coupling defect.

### What was decided against the original framing

The ticket asked about one edge. Deciding one edge in isolation was rejected:
the question "should the shared type move to a third module?" has the same answer
for all seven, so answering it for one either silently decides the other six or
records an inconsistency. The scope was widened before the decision, not after.

The narrow framing also inverted the evidence. The `authoritativeState.ts` edge
looked like the problem because a tool could see it, but it is the *thinnest* of
the seven — two type-only directions, three usage sites in total. The six edges
carrying a real value dependency were invisible to the framing that named it.

### Consequences

- **No follow-up work.** This closes without an execution obligation on
  [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md).
- **The invariant is a review rule, not a gate.** Nothing enforces it
  automatically. Whether a tool should is part of
  [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md);
  this ticket deliberately does not pre-empt that, and an `import type` rule is
  named there as a candidate the linter decision may pick up.
- **`workspaceIdentity.ts` not owning `WorkspaceIdentity` stays as it is.**
  Renaming or moving it would be the same tidiness-only diff, and the vocabulary
  question the map still lists under **Not yet specified** is the right place for
  it if it is ever taken up.
