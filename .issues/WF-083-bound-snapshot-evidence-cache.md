---
id: WF-083
title: "Bound the Snapshot evidence identity cache"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-082]
created: 2026-08-09
---

## Question

Can W-01 give Workspace Projection's `#snapshotEvidenceIdentities` an explicit bound and deterministic eviction rule before Live Changes raises its insertion rate from roughly one per Review to one per edit?

## Blocked by

- [Add compiler-checked Workspace durable codecs](./WF-082-add-workspace-durable-codecs.md)

## Acceptance evidence

- The cache has a named bound and deterministic eviction behavior local to Workspace Projection.
- Interface-level regression drives more distinct Snapshots than the bound and proves an evicted hint safely falls back to authoritative capture without changing correctness.
- The old unbounded implementation fails the bound assertion.

## Resolution comment

Closed W-01 with a named four-entry FIFO bound in Workspace Projection. Snapshot evidence hints now pass through one local retention method; inserting a fifth evicts the oldest, and an evicted hint retains the existing authoritative-capture fallback.

The Projection Interface regression creates six exact same-content Snapshots, forces each original Evidence identity out of Workspace Evidence retention, observes cache sizes `1,2,3,4,4,4`, then re-reads the evicted oldest Snapshot and proves it remains `current` through fallback while the cache stays at four. The focused five-scenario Projection suite, `pnpm v1:typecheck`, and `git diff --check` pass under Node 26.5.1. The observation hook is private to runtime assembly and does not widen the Workspace Interface.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- W-01 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
