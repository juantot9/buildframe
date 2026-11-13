---
id: WF-084
title: "Compare Diff line bytes directly"
status: closed
labels:
  - wayfinder:task
parent: WF-079
assignee: juanan
blocked_by: [WF-083]
created: 2026-08-09
---

## Question

Can W-10 replace `sameDiffLine`'s two Buffer constructions with a direct `Uint8Array` byte comparison and length precheck before Live Changes multiplies Diff recomputation?

## Blocked by

- [Bound the Snapshot evidence identity cache](./WF-083-bound-snapshot-evidence-cache.md)

## Acceptance evidence

- `sameDiffLine` performs no Buffer construction and returns early on unequal byte lengths.
- Regression coverage includes equal bytes, unequal bytes, and equal-prefix/different-tail bytes through the Reviewing Interface or its unusually lossless Diff mechanic.
- The affected test lane and typecheck pass; no digest shortcut or Buffer-view substitute is used.

## Resolution comment

Closed W-10 by replacing both `Buffer.from` constructions in `sameDiffLine` with a byte-length precheck and direct indexed `Uint8Array` comparison. No digest shortcut or Buffer view remains.

The unusually lossless Diff-mechanic regression spies on `Buffer.from` and makes any construction throw, then proves equal bytes, unequal lengths, and equal-prefix/different-tail bytes. It fails the old implementation. The focused eight-scenario Reviewing suite, `pnpm v1:typecheck`, and `git diff --check` pass under Node 26.5.1.

## Authority

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)
- W-10 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
