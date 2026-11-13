---
id: WF-240
title: "Format outgoing Messages with a user template"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

The owner controls the structure of the Message the Harness receives. `message-template.md` beside the user configuration composes the exact outgoing material for current-code Messages with `{{message}}` and `{{location}}` placeholders; without that file the built-in structure is byte-identical to today. The `F3` preview shows the complete rendered result, and an invalid template refuses to send instead of substituting silently.

## Finding

The outgoing material was fixed in Harness Interaction to `${body}\n\n${path}:${line}`, so the owner could not introduce headings, labels, or a different ordering. The owner asked for a default structure plus a user-editable `.md` format. The preview also rendered only the first material line (a one-row label inside a tall bordered box), so a custom structure would have been invisible.

## Interface

`InspectDefaultReviewMessageViewRequest` gains an optional `outgoingTemplate`. For a live-reference Message, Harness Interaction renders it when the template contains exactly one `{{message}}` and one `{{location}}` (8 KiB bound, unknown placeholders rejected) and otherwise keeps the built-in structure; the rendered bytes are the outgoing material, so the existing digest, disclosure, sensitivity occurrences, and commit revalidation apply unchanged. The prepared inspection carries the exact template so the commit replays it; an invalid template returns `message-template-invalid` and the Reviewing model explains it. Saved-origin Messages keep the fixed quoted-source structure (Option A; a templated historical form is deferred).

## Module seam

The renderer, validation, and occurrence bytes stay in Harness Interaction beside the existing composition; the configuration file read stays in the application's user configuration module and travels with the inspection request. No command shape, projection, or durable record changes, and the commit command is untouched because the prepared inspection retains the template.

## Acceptance

- [ ] Without the file, outgoing bytes are identical to the previous structure.
- [ ] A valid template renders exactly and survives the commit revalidation.
- [ ] Unknown or duplicate placeholders fail closed with a truthful notice.
- [ ] A body containing a literal placeholder is never re-rendered.
- [ ] Saved-origin Messages keep the fixed structure.
- [ ] The `F3` preview shows the complete rendered material.
- [ ] Focused scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

User-level (`$XDG_CONFIG_HOME/neoflow/message-template.md`) was chosen over a repository file so a write-capable Harness cannot rewrite the outgoing format mid-review and so the structure applies everywhere. Placeholders stay minimal and named after the two facts the material actually contains, which keeps the sensitivity occurrences exact and the Interface small. Historical templating waits until the pattern proves itself.

## Completion evidence (2026-09-16)

- `composeReviewMessageMaterial` renders a validated template for live-reference Messages and returns a discriminated composition (`composed`/`template-invalid`/`unrenderable`); the prepared inspection carries the exact template so commit revalidation replays the same bytes.
- `messagePreviewOverlay` now sizes the material box from the wrapped content (bounded to the dialog) instead of one row, so the complete rendered template is visible.
- The composer is frozen while the exact preview or its gate is open: `synchronizeMessageEditor` accepts only the inspected body, so typing and paste can no longer rewrite the draft while its overlay is visible, and the overlay hint says so.
- `UserConfiguration.readMessageTemplate()` reads `message-template.md` beside `config.json`; the application passes it with the inspection, refuses to send when it is unreadable, and the model explains an invalid template.
- New tests cover the rendered material and its commit replay, invalid-template refusal, literal-placeholder preservation, and the application file read through the `F3` preview; a `wrapDisplayCellRows` bound test covers early stopping.
- The manual fixture isolates its configuration and ships a sample template.
- A new application scenario pins the freeze: typing while the preview is open leaves the overlay open and the dispatched material identical to the previewed bytes.
- Verification on Node 26.5.1: the full 41-file/367-test suite passed 366/367 with one load-induced 20-second timeout in an untouched sensitive-gate scenario that passes in isolation in 4.2s; lint, format, dependency firewall, typechecks, clean builds, build smoke, the compiled dogfood fault probe, and `git diff --check` all pass with unrelated repository-health work unstaged.
