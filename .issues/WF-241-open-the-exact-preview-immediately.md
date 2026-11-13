---
id: WF-241
title: "Open the exact preview immediately"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

Pressing `F3` shows the preview overlay on the same key press. The overlay names the target and the typed Message while the Workspace composes, then fills in the exact bytes, destination, SHA-256, limitations, and assessment. Cancelling a pending preview never reopens the dialog when the answer arrives.

## Finding

A measured inspection on the small fixture cost about 1.2s: one full `workspace.current-changes.capture` (~400ms), the file-scoped `workspace.context.capture` (~200ms), `workspace.context.verify` (~200ms), and a second full capture (~400ms) proving the repository had not moved during the inspection. The dialog could not open until all of it finished, so `F3` looked unresponsive.

## Interface

The inspection request gains `purpose?: 'preview' | 'submit'` (absent means the full path). A preview skips only the commitment-time stability proof — the retained-capture verification and the second repository capture — because the commit revalidates the retained capture and re-captures the repository state before storing anything. Everything that determines the exact material and its assessment stays: the index read, the capability and attachment, the basis, the file-scoped capture with its digest and provenance, the line checks, the template rendering, and the sensitivity assessment.

The Reviewing model shows the pending overlay from the in-flight `preview` inspection request, freezes the composer for it, and drops the answer if the operator cancels with `Esc` or `F3`.

## Acceptance

- [x] `F3` renders the preparing overlay before the workspace answers.
- [x] The exact facts replace the preparing overlay when the inspection returns.
- [x] `Esc`/`F3` cancels a pending preview and a late answer never reopens it.
- [x] The composer stays frozen for the pending preview exactly as for the resolved one.
- [x] A preview-purpose inspection still commits through the full commit revalidation.
- [x] Focused scenarios, full verification, and `git diff --check` pass with unrelated work untouched.

## Resolution

The wait existed twice: the dialog did not open until the inspection finished, and the inspection did work only the commit needs. Opening the overlay on the key press removes the perceived latency, and the preview-purpose path removes most of the real one while keeping the commit's fail-closed verification intact. The stability proof cannot move to the preview because a preview is not a commitment.

## Completion evidence (2026-09-16)

- `InspectDefaultReviewMessageViewRequest.purpose` is validated and threaded to the preparation; for `preview` the context verification and the settling repository capture are skipped for live targets, and the commit path still performs them.
- Measured on the fixture under load after the change: preview ~310ms versus ~690ms for the full submission path, with the earlier cold measurement at ~1.2s.
- New tests: the application opens the preparing overlay on `F3`, cancels a pending inspection, and sends the exact bytes afterwards; the Workspace commits a preview-purpose inspection through the full revalidation.
- Verification on Node 26.5.1: the full 41-file/369-test suite, lint, format, dependency firewall, typechecks, clean builds, build smoke, the compiled dogfood fault probe, and `git diff --check` pass with unrelated repository-health work unstaged.
