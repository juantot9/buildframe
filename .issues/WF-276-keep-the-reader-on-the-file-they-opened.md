---
id: WF-276
title: "Keep the reader on the file they opened"
status: closed
labels:
  - wayfinder:task
assignee: juanan
created: 2026-11-06
---

## Outcome

Opening a file stays put: nothing that lands later moves the selection back to the first file, and a Message being written always names the same file in the Diff title and on its card.

## Finding

The 2026-11-06 critique re-run (P1). Moving down past the last file in Files wrapped to the top by reloading the whole Review, even when every file was already loaded. That reload landed a few seconds later, after the reader had moved on and opened another file, and put the selection back on the first file. A Message started in between showed "New Message · src/reviewQueue.ts:17" on its card while the Diff body and title showed `review.txt`.

## Interface

- **Files wrap:** when the whole Files list is loaded, `j` past the end, `k` past the top and the edge jumps select locally. Only a list with more files than are loaded still pages through a Review load.
- **Composer title:** the Diff title while composing, checking, saving or saved names the composer's own file (`editor.fileLabel`), never whichever file is selected.

## Verification

- `keeps the opened file selected after j wraps around the Files list` fails on the old code (the Diff reads `review.txt` within 200 ms) and passes now.
