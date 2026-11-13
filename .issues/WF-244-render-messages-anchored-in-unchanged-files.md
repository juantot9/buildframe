---
id: WF-244
title: "Render Messages anchored in unchanged files in the content pane"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

Selecting a Message anchored in an unchanged file lands the unchanged-content pane on the exact anchored line and renders the complete Message and its Response inline there, mirroring the Diff card from WF-242. The deliberate WF-242 limit — file selection plus a notice, no anchored line, no card — is closed.

## Finding

WF-242 routes `navigateToMessage` into the Diff only when the anchored file has a `diffFileIdentity`. An unchanged file has none, so navigation sets `The Message is at <path>:<line>; open that file to read it in context.` and stops. `selectedMessageThread` likewise requires an available Diff whose file matches, so the unchanged-content pane never resolves the selected thread; its renderer inserts only the legacy Question composer at the selected line, never the Message card, and `previewUnchangedFile` ignores any anchor line and resets the content cursor to line 1.

## Interface

`preview-file-content` carries an optional `anchorLine`; `applyUnchangedFileContent` lands `unchangedContentLine` on it, and `previewSelectedFile`/`navigateToMessage` route a live unchanged anchor through the content view instead of a notice. The view resolves the selected thread against the loaded content view, and `messageThreadCard` takes the anchored code line (decoded by its caller) instead of a Diff row, so the same card renders at the content line. A snapshot review has no live content to read; its unchanged anchor keeps the existing notice. No durable record, projection, or protocol change.

## Module seam

The Application model keeps selection state and the content-load effect; the card's interface narrows from a Diff row to the exact anchored code line, removing its dependency on the Diff projection.

## Acceptance

- [x] Moving the Messages-pane selection to an unchanged-file Message selects its content line and scrolls the pane to it.
- [x] The selected Message renders inline in the unchanged-content pane with its complete body and Response and the shared card paging.
- [x] A Messages-pane move between two unchanged-file Messages follows each anchor and each card.
- [x] A snapshot unchanged anchor still fails with a notice instead of fabricating content.
- [x] Focused scenarios, full verification, the compiled dogfood probe, and `git diff --check` pass with unrelated work untouched.

## Resolution

`preview-file-content` carries an optional `anchorLine`, and `applyUnchangedFileContent` lands the content cursor on it through the existing `unchangedContentLineTo` clamp and scroll. `previewSelectedFile` and `navigateToMessage` route a live unchanged anchor through that path; a snapshot origin keeps the WF-242 notice because there is no live content to read, and the live-only guard is explicit. The view resolves the selected thread against the loaded content view — `reviewLiveContentLines` is the single line decoder for both the pane and the thread — and `messageThreadCard` now takes the exact anchored code line instead of a Diff row, so the same card renders at a Diff row or a content line. The card is inserted at the anchored line with the same selection-span and paging treatment as the legacy composer, and the Diff branch keeps row placement through the optional `row`.

## Completion evidence (2026-09-16)

- A new application scenario composes one Message at `stable.txt:2` and another at `stable.txt:3` in All scope, settles each Invocation, and proves the post-commit selection lands each card at its content line (`▌` marker), that `k`/`j` in the Messages pane follow both anchors and both cards, and that the card carries `Code stable.txt:2`.
- All 25 application scenarios pass, as do the 24 Harness Interaction scenarios; lint, format, dependency firewall, package and test typechecks, clean builds, build smoke, and all four compiled risk probes (State, Local Runtime, Pi, dogfood) pass on Node 26.5.1.
- The full suite passes 380/380 in 44 files; under load average ~8 with the default 20-second per-test bound two different untouched load-sensitive scenarios (Authoritative State quarantine, workspace Reviewing fork) timed out and each passed in isolation (164ms and 1.7s), and the same suite passed 380/380 with a 60-second bound.
- `git diff --check` is clean and the unrelated repository-health backlog remains untracked and untouched.
