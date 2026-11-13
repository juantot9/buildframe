---
id: WF-263
title: "Fix the second Reviewing critique's P1s: keep your place, say saved not sent, guard Esc"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-05
---

## Outcome

These are the three P1s from the second 2026-11-05 Reviewing critique (`.impeccable/critique/2026-11-05T14-45-06Z__apps-neoflow-src-reviewingview-ts.md`).
- The Diff keeps your file and line when an answer lands or the files refresh.
- A new Review opens on the first file the Files pane lists.
- A Message is shown as saved, not sent, until there is evidence. The status line is replaced by each Message's outcome.
- Typed drafts need a second Esc to discard.

## Finding

- **Line resets.** A refresh brings a new Snapshot whose files and rows have new identities, so the identity lookup failed and the selection fell back to the first row. `f` (Changed/All) always reset to the first file.
- **Deleted file opens first.** The bundle read matched files with `file.newSide?.pathBytesBase64 === requested.filePathBytesBase64`. With no path requested, a deleted file (no new side) compares `undefined === undefined` and always matched. That is why Reviews opened on a deleted file, and a lookup by identity could also be beaten by a deleted file earlier in the manifest.
- **Overclaiming "sent".** A Message saved locally showed `✓ sent`, the same glyph and tone as `✓ answered`, while it was still saving. The status line kept "✓ Sent to …" after a failure or unknown outcome. CONTEXT.md lists "Sent as a universal state" as a term to avoid.
- **One-key discard.** One Esc discarded a draft with text, and drafts are never persisted.

## Interface

- `applyReviewNow` remembers the selected file's path and line (new side, else old). If the identity lookup fails, it re-finds them by path and line in the refreshed Diff, as long as that Diff shows the selected file.
- `f` keeps the same file by path; otherwise it uses `firstListedFile`, the first file in the Files pane's tree order.
- `#readReviewBundle` matches files only by what was requested. With nothing requested, it opens `firstListedFile(manifestFileItems(…))`.
- Outgoing badges: committing is now `saving`, and saved locally is now `○ saved` (Pewter). After the save, the status line reads "Saved. Waiting for <agent> to start." `messageState` moved into the model, and `settledOutcome` replaces the status line when a Message is answered, fails, is refused, interrupted, ends without an answer, or is lost.
- Esc on a draft with text arms the discard ("Press Esc again to discard this draft. Nothing has been sent."). The second Esc discards. Typing disarms it. An empty draft still closes on one Esc.
- Polish: the compact header, the history rail's "everything since last commit", and the footer lines are fitted with `…`. The loading sentence wraps.

## Acceptance

- [x] After an answer lands while the file changes, the cursor stays on its line, and `a` opens there.
- [x] A Review with a deleted file opens on the first listed file.
- [x] "Saved. Waiting for … to start." follows a send, and a failure replaces it with "#1 failed: … reported an error."
- [x] Saved never shares answered's glyph or tone.
- [x] A typed draft survives one Esc and is discarded on the second.

## Completion evidence (2026-11-05)

- The app suite passes 87/87. Typecheck, oxlint and oxfmt are clean for `apps/neoflow`.
- New tests:
  - `keeps the selected Diff line when an answer lands and the file changes`
  - `opens a Review on the first listed file, not on a deleted one`
  - `says a Message is saved, not sent, and replaces that with its outcome`
  - `asks for a second Esc before discarding a draft with text`
  - the status unit test.
- The keep-place test and the first-file test both fail without their fixes.
- Re-rendered critique frames:
  - Frame 10 keeps the cursor on line 10 after the answer.
  - Frames 11 and 12 show `✗ #2 failed: Pi fixture reported an error.` and `! #3: Neoflow lost track of this turn.`
  - At 60×20 the header and rail end in `…`.
