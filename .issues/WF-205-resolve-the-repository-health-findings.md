---
id: WF-205
title: "Resolve the repository health findings"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: null
blocked_by: []
created: 2026-09-07
---

## Destination

Every finding in the 2026-09-07 repository health survey is dispositioned:
each is either implemented and re-proved through its owning module's existing
Interface — with the canonical `v1:verify` chain passing and no speculative
abstraction or shallow Interface introduced — or explicitly ruled out of scope
with its reason recorded. The findings and their dispositions are captured in
[`docs/audit/repo-health-findings-2026-09-07.md`](../docs/audit/repo-health-findings-2026-09-07.md),
and the survey's HTML artifact is not tracked.

## Notes

- **Authority.** Findings F1–F8 and the baseline survey:
  [`docs/audit/repo-health-findings-2026-09-07.md`](../docs/audit/repo-health-findings-2026-09-07.md).
  Standard for fixes: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
  — through existing Interfaces, no new abstractions justified by the cleanup.
- **House convention.** Task tickets carry execution: each records its
  pre-implementation resolution in the ticket before code, then implementation
  and verification (see [Make Scroll position truth visible in the Reviewing panes](./WF-198-make-scroll-position-truth-visible.md)).
- **Settled at charting.** All eight findings entered adoption review; the
  per-finding decisions below were made in the charting session and are baked
  into the tickets: precise blocking against
  [Implement context source discovery and exact capture](./WF-199-implement-context-source-discovery-and-exact-capture.md)
  only where files collide; root relocation ruled out of scope (F5 residue is a
  README signpost); CI on GitHub Actions; the engines pin decided inside the CI
  ticket; module splits as same-package subdirectory modules along existing
  seams, with exceptions argued per ticket; barrel curation through the
  existing subpath exports, sequenced after the splits; test restructuring
  bundled with the source split it belongs to.
- **Skills.** Module-split tickets consult the codebase-design vocabulary;
  interaction decisions use the grilling and domain-modeling skills.
- **Parallelism.** The frontier is open, unassigned children whose blockers
  are closed; sessions may work unblocked tickets concurrently.

## Decisions so far

- [Rule the repository-root relocation out of scope](#out-of-scope) — the `.issues/` and root-docs workflow is the dogfooding method itself; the residue is a README signpost, ticketed as such.
- [Signpost the repository root](./WF-208-signpost-the-repository-root.md) — the README's `Repository layout` section separates source, the tracked working method, and ignored operator-owned directories, and its stale pnpm requirement now matches the declared `11.10.0`; implemented in `5e5bc47` and verified by the full chain.
- [Centralize the v1 version marker](./WF-207-centralize-the-v1-version-marker.md) — the effort label is gone from every live name (root scripts, `tsconfig.json`/`tsconfig.tests.json`, `vitest.config.ts`, probe and smoke scripts, and the `neoflow-dogfood` bin), while State/protocol/capability/checksum identities keep theirs; no marker constant is introduced.
- [Keep verification captures retained across projection reads](./WF-247-keep-verification-captures-retained-across-projection-reads.md) — the projection adopts a fresh re-capture for the same live-changes identity instead of serving a stale evicted entry, and the shared capture FIFO holds four with a separate two-entry context bound; the two-message scenarios pass repeatedly on Linux and the full suite passes on macOS.

## Not yet specified

- **The `reviewing*` naming duplication across layers (F7).** Whether the app's `reviewingView`/`reviewingModel`/… family and the Workspace's `reviewing.ts` get a `ui/` vs `domain/` prefix (or directory) convention can't be phrased sharply until the Reviewing view and Workspace Reviewing splits land and show where the seam actually runs.
- **`reviewingModel.ts` mass (2,973 lines).** Not ticketed as its own split: its shape depends on how the Reviewing view split and the naming decision resolve; revisit when both close.
- **Other giant scenario tests in the Workspace package.** Splitting them travels with each module split ticket; whether any remain unreasonably large after those land is re-checked at the quality gate.

## Out of scope

- **Relocating the workflow artifacts out of the repository root** (finding F5's relocation option) — the `.issues/` tracker, `CONTEXT.md`, and root handoff documents are the dogfooding method itself and are load-bearing for daily work; relocation buys an aesthetic gain at the cost of daily friction. Ruled out at charting; the residue (a README signpost) stays in scope as a ticket.
