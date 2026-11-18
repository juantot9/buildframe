---
id: WF-300
title: "Build Planning's first slice"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-296, WF-297, WF-299]
created: 2026-11-18
---

## Question

Build the Planning slice resolved in
[WF-298](./WF-298-re-scope-plannings-first-slice.md): start from a goal and
`file:line` pointers, review a BuildFrame-owned plan file through line
comments and versions, approve a frozen version, and Implement.

## Before code

- A short UX brief with the measured current Home and Review screens, for
  owner approval (the owner's rule for interface changes).
- A design of the Planning Workspace owner's commands, records and views
  through WF-296's owner declarations, and of the Planning screen through
  WF-297's screen interface.
- The plan-file contract: location under the OS temporary folder, naming,
  how a version is snapshotted at turn end, how an unattributed change and
  an owner's edit are recorded, and recreation after the OS clears the file.
- Connector changes: Pi's tool gate allowing only the plan file during a
  Planning turn; the Claude plugin hook doing the same only during a
  BuildFrame turn; the one-time Claude setting shown by `/buildframe` and
  `buildframe doctor`.

## Out of scope

Manual Handoff, native plan-mode capture, comparing code against the plan,
downloadable modules.
