---
id: WF-100
title: "Pin durable manifest digest order"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: []
created: 2026-08-13
---

## Question

Can the Workspace make X-01's existing JSON key-order durability contract explicit and regression-protected without rewriting any stored digest or inventing a canonical serializer?

## Acceptance evidence

- One Workspace Interface scenario pins the exact SHA-256 values for a deterministic one-file Review manifest and the existing reviewed Harness Capability Manifest.
- The scenario crosses `Workspace.execute`/`Workspace.read` and the existing `ReviewedHarnessAdapter` seam, restarts the Workspace owner before dispatch, and therefore exercises the persisted Capability Manifest verifier and the complete Review Manifest verifier as well as both producers.
- Source comments at the Capability Manifest and Review Manifest producer/verifier sites name historical JSON key order as a durable format contract and direct future reorderings through migration rather than cosmetic cleanup.
- A focused mutation that reorders either normalized Capability Manifest keys or public Review Manifest file keys fails the golden scenario.
- No canonical serializer, digest rewrite, durable migration, public Interface widening, or unrelated normalization change is introduced.
- Focused Workspace tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent route and package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled finding and withdrawn canonical-serializer alternative: [`X-01`](../docs/audit/pre-p17-codebase-findings.md#x-01--durable-digests-depend-on-implicit-source-key-order)
- State/projection disposition: [Disposition the Workspace state and projection findings](./WF-072-disposition-workspace-state-and-projection-findings.md)

## Constraints

- Preserve every digest already stored by the immutable-Current and Live Changes implementations.
- Pin the present plain `JSON.stringify` order; do not sort keys or claim a new canonical representation.
- Keep digest mechanics private to their owning Workspace Modules and test only through existing Interfaces.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. One Direct Harness Interaction scenario now pins both historical plain-JSON
representations through existing Interfaces. A deterministic untracked
`golden.txt` Review Manifest is fixed at
`4d973d8e968903f1e54c3d6778187714e1c53305be32500b0a90b90db930daa3`, and the
reviewed scripted Capability Manifest is fixed at
`942db29fa80bc8730b83003a86b4e8008893258275c8ec42bdd18dd2281b4c02`.

The scenario establishes the reviewed Adapter, creates the Review, then reopens
the Workspace before re-establishing and asking from the exact whole-file
Anchor. Re-establishment must parse and verify the persisted Capability Manifest;
the Ask must load, normalize, and verify the complete persisted Review Manifest
before the Adapter can observe a direct-dispatch directive. The directive exposes
both pinned digests through the reviewed Adapter seam, and the Review digest also
matches the value returned by `Workspace.execute`.

Comments now name the historical key order as a durable format contract at the
Capability Manifest normalizer, producer, and verifier; at the Workspace Evidence
Review Manifest producer; at Reviewing's persisted-file normalizer; and at the
Harness complete-manifest verifier. No serializer, sorting, digest rewrite,
migration, or Interface was added. Focused mutations independently swapping the
Capability Manifest's first two keys and the Review file's first two keys both
failed the golden scenario.

On Node 26.5.1 with pnpm 11.20.0, the complete Harness Interaction file passes
11/11. `pnpm v1:verify` passes the dependency firewall, all 19 files / 127 tests,
typecheck, builds, and smoke. All four compiled risk probes pass, and
`git diff --check` is clean. The unrelated root `package.json` bump remains
excluded.
