# Files pane: folders that load when opened

Date: 2026-11-24. Status: brief, waiting for the owner's approval. Ticket: WF-321 (follows A5, `4d0db13`).

## Why

A5 made the Files pane load the whole file list at once, so it scrolls as one list. It sends that list in **one message** of up to 10,000 files. Messages between BuildFrame's background process and the screen are capped at 1 MiB (`MAX_FRAME_BYTES`, `packages/local-runtime/src/protocol.ts`), so on a large repo the connection drops.

Measured at `1349443` with the perf probe (`scripts/perf-probe/ui.mjs`, 160x48):

| What | Result |
| --- | --- |
| Size of one entry in the list | changed file ~430 bytes; unchanged ~150–300 (grows with the path) |
| Where it breaks | somewhere between ~3,000 and ~5,000 files, by path length |
| 5,000-file repo (5,025 files, 300 changed) through the background process | the Review never opens: at +1.8 s, "Couldn't open the Review. Lost contact with BuildFrame's background process." |
| Same repo in one process (no cap) | opens in 1.4 s; `f` (all files) 32 ms |
| Wheel from top to bottom of all files | 1,698 notches, 875 frames in 14.6 s, longest gap 24 ms, none over 33 ms, draw median 5.5 ms |
| Rows the All view draws | ~5,300: every file plus every folder, all expanded |
| `neoflow` itself | 762 files, 33 top-level entries, 61 folders, largest folder `.issues` (305 files): unaffected |

Scrolling is smooth once the list arrives; what fails is getting it there. The tests missed it because they open the Review in the same process, where there is no message cap.

## Proposal

Nobody scrolls 5,000 files. Show the tree with folders closed, and load a folder's contents when you open it.

1. **All files (`f`) opens with folders closed**, except the folders on the way to a changed file, so you see the changes and their neighbours straight away. Every other folder is one row: `▸ docs/`.
2. **Opening a folder loads it.** `l`, Enter or a click opens it; `h` closes it. The app reads just that folder from the Workspace (one small read) and shows its subfolders and files. A folder you have opened stays loaded; after an edit, only the open folders are read again.
3. **Closed folders say where the changes are.** A folder row that holds changed files shows the count in Pewter: `▸ src/  3 changed`.
4. **Changed files (the default view) stays as it is today:** fully open, the list you review. It still comes as one list on screen, but the Workspace sends it in pieces that fit the cap, and the app joins them. That only matters for a change that touches thousands of files.
5. **Finding any file still works anywhere.** `/` already searches every path in the Workspace. `J`/`K` move between changed files. `e` lists the changed files, and typing in it searches every path. Jumping to a file opens the folders on its way, loading each.
6. **`H` / `L`:** `H` closes every folder. `L` opens every folder that is already loaded; it never loads the whole repository.
7. **A folder with thousands of files** (generated code, fixtures) loads in pieces like the Changed list, so no folder size can break the connection.

Nothing else on screen changes: the same `▸ ▾` glyphs, status letters and colours, selection and title. Fixed Reviews (a commit or a range) list only their changed files, so they work as today.

## Workspace change (needs approval)

A new read, `review.live-folder`. It takes the Review, its live changes, a folder path (empty for the top) and a window. It returns that folder's subfolders, each with its file and changed-file counts, and its files, each with its status. Each read is bounded to at most 1,000 entries and 512 KiB. It is built from the file list the Workspace already keeps, so it adds no Git work.

Every file-list read (`review.manifest`, `review.live-files`, the new one) also gets a byte bound under the message cap, in addition to its file count, so no read can exceed the cap whatever the path lengths.

## Tests that would have caught it

- A scenario that opens a Review **through the background process** on a generated 5,000-file repo and opens all files.
- A Workspace test that encodes every file-list read for 10,000 files with 200-character paths and checks it stays under `MAX_FRAME_BYTES`.

## Targets

- Opening a folder: its contents on screen within one frame (16 ms) on the 5,000-file repo.
- `f`: faster than today's 32 ms, since ~30 rows replace ~5,300.
- Wheel: as smooth as today.

## Order of work

1. Byte bounds on the reads, and the Changed list sent in pieces. This removes the crash on its own, and lands with the background-process test.
2. The `review.live-folder` read, with its Workspace tests.
3. Folders that load when opened in the Files pane, measured and frame-checked before and after.
4. Code search: the `review.code-search` read, then the scopes in `/`.

Each step is verified and committed on `main` on its own, then brought into `planning`.

## Search: changes, files and code

Owner request 2026-11-24: search by changes, by files, and by any code anywhere, like grep.

**Today** `/` ("Search this Review") finds file paths (with `f`, every path) and added or removed text in the Review's Diff. It can't find code that didn't change.

**Proposal:** one `/` dialog with three scopes, switched with Tab and shown as a radio row like the commit picker's (`● Changes  ○ Files  ○ Code`):

- **Changes:** added or removed text in this Review, as today.
- **Files:** every path in the repository, as today with `f`. A result opens the file and the folders on its way.
- **Code:** any text in any file, the way `git grep` finds it: tracked and untracked files, skipping ignored ones and binaries. Each result is `path:line` and the line. Enter opens the file at that line: in the Diff when the file changed, as plain content when it didn't. You can write a Message there as usual.

Details:

- **Where Code searches.** A live Review searches the code as it is now; a fixed Review (a commit or a range) searches that commit's files. The result list says which (`code now`, `code at f32adef`), so a result never passes for the Snapshot when it isn't.
- **Bounded.** At most 200 results per search, sent in pieces under the message cap. When there are more, the list says so (`200 of 4,622, refine the search`) instead of loading them all.
- **Fast enough to type into.** Measured with `git grep -I -F`: ~120 ms warm on the 5,000-file repo (650 ms on the first, cold run) and 124 ms for 4,622 hits across `neoflow`. Typing keeps the current 80 ms pause; an older search is dropped as soon as a newer one starts.
- **Workspace change (needs approval):** a new read, `review.code-search` (query, scope, window). It runs `git grep` through the same controlled Git path as other Workspace reads; the text it returns is bounded per line.

## Questions for the owner

1. Should All files open the folders that hold changes, or start with every folder closed? Recommended: open the ones with changes.
2. Should closed folders show their changed count (`3 changed`)? Recommended: yes.
3. Should search be one `/` with three scopes (Changes, Files, Code), or keep `/` as it is and add Code search on its own key? Recommended: one `/` with scopes.
