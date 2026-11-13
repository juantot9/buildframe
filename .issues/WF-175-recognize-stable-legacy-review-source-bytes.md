---
id: WF-175
title: "Recognize stable legacy Review source bytes"
status: closed
labels:
  - wayfinder:task
parent: WF-174
assignee: juanan
blocked_by: []
created: 2026-09-02
---

## Question

Can the Workspace-owned importer safely capture and recognize every accepted legacy Review source shape behind one bounded read-only internal Interface, without importing legacy code or exposing filesystem mechanics?

## Acceptance evidence

- Add one package-private legacy Review source Module under `packages/workspace`. Given an explicit queue or receipt locator under a trusted disposable root, it returns one frozen result containing exact stable bytes, SHA-256, byte length, observed regular-file metadata, source kind, recognized format, and either validated legacy values or a closed diagnostic.
- Accept the exact structural behavior of all four settled formats: raw version-1 annotation arrays, version-1 queue objects, version-2 queue objects with explicit anchors, and version-1 receipt objects. Preserve legacy identifiers, text, optional paths/excerpts, anchors, timestamps, Harness labels, outcomes, queue dispositions, and embedded workspace paths without converting them to v1 domain records.
- Bound one source at 16 MiB, one parsed source at 4,096 aggregate annotations and receipt batches, and stabilization at three attempts. Missing, malformed JSON/UTF-8, duplicate identities, unsupported-newer versions, invalid fields/state relationships, non-regular files, final-component or owned-directory symlinks, growth past the byte bound, and identity/metadata change during capture return closed diagnostics rather than partial values.
- Read with a no-follow file handle, compare path and handle identity/metadata before and after the bounded read, and never write the source. A failed attempt releases its handle; a failed overall capture retains no bytes as authoritative evidence.
- Add immutable sanitized golden files for each accepted form plus focused malformed, duplicate, unknown-newer, over-bound, symlink, replacement, and mutation controls. Tests prove exact bytes/digests and unchanged source bytes, mode, timestamps, and directory entries. At least one race regression must fail if only a pre-read `lstat` is retained.
- Active source and declarations contain no import from a legacy package and expose no new package subpath or public filesystem Interface. This child writes no Authoritative State and adds no Workspace command/view yet.
- Focused Workspace tests, canonical verification, all four compiled probes, source-island/dependency checks, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Implement the explicit legacy Review importer](./WF-174-implement-explicit-legacy-review-importer.md)
- [Define legacy deletion, cutover, and data migration](./WF-049-define-legacy-cutover-migration.md)
- LG-01 and retained parser facts in [Review the legacy packages for blockers](./WF-135-review-legacy-packages-for-blockers.md)
- Legacy source definitions retained for evidence only: `apps/tui/src/review/persistence.ts`, `apps/tui/src/review/receipts.ts`, and `apps/tui/src/review/types.ts`

## Seam decision

The source recognizer is a real internal Module: it hides unsafe local-file stabilization, exact-byte hashing, versioned parsing, structural limits, and legacy validation behind one read-only operation and one closed result vocabulary. Tests may cross this package-private Interface with real disposable files and a deterministic race hook, but neither the hook nor the Module is exported from the package. Do not introduce a filesystem port: production and tests both use the supported local filesystem, with tests varying only disposable paths and timing.

## Constraints

- Copy behavior, not imports. Do not modify or broaden the retained legacy parser while using it as evidence.
- Preserve source bytes exactly; parsed values are derived and cannot substitute for the byte capture.
- Do not infer current Workspace association, intent, v1 identity, Anchor, history completeness, Harness truth, or candidate status in this child.
- Do not store evidence, add a migration index, expose a Local Runtime frame, or render UI yet.
- Use sanitized fixtures only. Do not inspect `.neoflow/review.json`, a real receipt path, or any other user data.
- Preserve the unrelated root `package.json` bump.

## Resolution comment

Yes. `packages/workspace/src/legacyReviewSource.ts` is one package-private,
read-only Interface over the local source seam. One request names a source kind,
a trusted configured root, and bounded relative components; the implementation
resolves only that intentional root alias, requires every owned descendant to be
a real directory and the final entry a regular file, opens with `O_NOFOLLOW`,
reads in bounded linear chunks, and compares directory, path, handle, identity,
size, mode, mtime, and ctime evidence around the read. It retries exactly three
times, closes every handle, and publishes only a stable capture. One source is
bounded at 16 MiB and one parsed source at 4,096 aggregate entries.

The same Module owns strict UTF-8/JSON recognition and the settled legacy
version semantics for raw v1 arrays, v1/v2 queues, and v1 receipts. Its frozen
result preserves exact bytes, SHA-256, metadata, source kind/format, normalized
legacy-only values, or one closed diagnostic. It neither associates a Workspace
nor creates migration/v1 State. No active source imports a legacy package, the
file has no package export, and no filesystem Interface was introduced.

Four sanitized immutable goldens total 3,075 bytes with pinned digests
`b44c0bc5…`, `bb53d76d…`, `a1392d00…`, and `42df009c…`. Eleven focused
contracts cover all formats and anchor migrations, receipt state relationships,
malformed UTF-8/JSON, duplicate identities, older/newer rejection, aggregate and
byte limits, configured-root aliases, owned-directory/final symlinks,
non-regular and missing paths, replacement, repeated mutation, and post-open
growth. Golden captures leave bytes, mode, inode, mtime/ctime, and directory
entries unchanged. A mutation removing the post-read identity/metadata barrier
fails the successor-byte regression by publishing the retired inode's bytes.

On Node 26.5.1 with pnpm 11.20.0, all 14 Workspace test files / 110 tests pass.
Canonical `v1:verify` passes 28 files / 171 tests, dependency firewall,
typecheck, builds, and smoke; all four compiled State, Local Runtime, reviewed
Pi 0.80.6, and dogfood probes pass, and `git diff --check` is clean. No real
legacy/user source was read or changed, no State/Workspace/wire Interface moved,
and the unrelated `package.json` bump remains untouched.
