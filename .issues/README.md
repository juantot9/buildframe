# Local Markdown issue tracker

This repository has no remote issue tracker, so wayfinding uses these Markdown issues.

## Issue metadata

- `id` is the stable machine identity.
- `title` is the human identity; human-readable references must link the title rather than display a bare id.
- `status` is `open` or `closed`.
- `labels` contains the issue labels.
- `parent` identifies child issues.
- `assignee: null` means unclaimed. Claim an issue before work by setting the developer name.
- `blocked_by` contains dependency ids. The body repeats dependency relationships as linked titles because this tracker has no graphical dependency UI.
- `assets` points to prototype or research branches/files when applicable.

## Wayfinding operations

- **Load a map:** open the issue labelled `wayfinder:map`.
- **Find children:** select issues whose `parent` is the map id.
- **Find the frontier:** in filename order, select open, unassigned children for which every `blocked_by` issue is closed.
- **Claim:** set `assignee` before reading beyond the question or doing work.
- **Resolve:** append an `## Resolution comment` containing the answer and asset links, set `status: closed`, and append a linked one-line gist to the map’s **Decisions so far**.
- **Rule out of scope:** close the issue with a scope explanation, then link that explanation under the map’s **Out of scope** rather than **Decisions so far**.
- **Create dependencies:** create all issue files first, then add `blocked_by` metadata and linked **Blocked by** sections in a second pass.
