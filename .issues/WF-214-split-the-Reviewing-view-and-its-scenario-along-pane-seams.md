---
id: WF-214
title: "Split the Reviewing view and its scenario along pane seams"
status: closed
labels:
  - wayfinder:task
parent: WF-205
assignee: null
blocked_by: []
created: 2026-09-07
---

## Superseded (2026-11-17)

[Split the app into a shell and screens](./WF-297-split-the-app-into-a-shell-and-screens.md)
replaces this ticket. Planning needs a second top-level screen, so the seam
that matters is shell versus screen; the pane split becomes internal to the
Reviewing screen there, and the scenario test splits with it.

## Question

Findings F1, F3, and F4 on the application side: `apps/neoflow/src/reviewingView.ts`
is 3,527 lines reaching ~24 indentation levels with 18 lines over 120
characters, and `apps/neoflow/test/scenarios/reviewingApplication.test.ts` is
4,057 lines. Decide the view's module map along the pane seams (the file
already has per-pane functions), flatten the nesting, and split the scenario
file in the same change so source and proof stay in step — application-private
only, no Workspace Interface changes.
