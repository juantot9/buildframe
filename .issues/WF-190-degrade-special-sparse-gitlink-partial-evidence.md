---
id: WF-190
title: "Degrade special, sparse, Gitlink, and partial evidence per side"
status: closed
labels:
  - wayfinder:task
parent: WF-187
assignee: juanan
blocked_by: [WF-189]
created: 2026-09-05
---

## Outcome

Every endpoint side degrades per path when content or structure is unavailable, exactly as WF-187 settles: non-UTF-8 and case-distinct path bytes stay lossless, symlinks are never dereferenced, special working entries degrade without content, sparse/skip-worktree absence is never deletion, Gitlinks are captured without recursion, partial repositories enumerate what is locally provable, and large-file pointers are recognized without filter execution. One unavailable side or object never erases otherwise exact files or bytes.

## Interface

Extend the captured per-file evidence vocabulary with closed degradation facts, all optional in format-1 payloads: exact raw path bytes with non-UTF-8 and case-distinct preservation; symlink evidence carrying raw target bytes with side identity distinct from any target content; special-entry availability for fifos, sockets, and devices with no content claim; sparse-index/skip-worktree absence recorded as intentional absence rather than deletion; Gitlink evidence carrying before/after Gitlink object identities plus, only when locally inspectable, the checked-out commit and dirty/untracked indicators of the nested checkout; partial-availability evidence distinguishing missing enumeration structure from a complete manifest whose content object is unavailable; and large-file pointer evidence keeping pointer bytes, declared payload identity/size, local payload availability, and captured payload bytes distinct.

Unrenderable and binary bytes are captured as binary evidence without decoding or transformation. Explicit generated classification remains derived, disclosed evidence and never identity. Arbitrary repository-defined or checkout-selected content filters remain unsupported: files that would require them have dependent working evidence unverified, and the existing `unsupported-checkout-config` rejection path stays in force. No new Workspace method or caller-visible Git primitive is added; all degradation is expressed through the existing capture, preview, and verification routes.

## Module seam

`WorkspaceEvidence` owns pointer recognition, Gitlink inspection, sparse/skip-worktree interpretation, partial-object handling, and per-side degradation behind the bounded inspection context. Recognition and degradation machinery may split into internal files but stays one implementation with one external seam; callers only see closed per-file facts. The owner-local comparison verifier extends currentness interpretation to the new degradation facts so Reviewing, Projection, and Harness Interaction keep delegating: unavailable-side files reverify as current when their absence facts are unchanged, and become unverified when local inspectability changes.

## Acceptance

- [x] Non-UTF-8 and case-distinct paths preserve exact raw bytes through manifest, window, and verification on every side; no path is normalized, folded, or re-encoded.
- [x] Symlink sides carry raw target bytes and are never dereferenced or followed; a symlink-to-directory never becomes directory membership, and target mutation stales or changes only the evidence the side actually promises.
- [x] Special working entries (fifo, socket, device) yield availability and kind evidence with no content claim; they neither block the manifest nor invent bytes.
- [x] Sparse-index and skip-worktree absence is recorded as intentional absence on every affected side and is never reported as deletion or staged removal; collapsing sparsity on the checkout is the only thing that can change the fact.
- [x] Gitlinks are captured without recursion: before/after Gitlink identities always, checked-out commit plus dirty/untracked indicators only when locally inspectable. Missing nested checkout facts affect only working endpoints that depend on them; no operation initializes, fetches, updates, or opens a nested repository as parent content.
- [x] Partial repositories enumerate complete membership when structure is locally provable; missing enumeration structure fails closed, while a complete manifest with an unavailable content object degrades that file per side without erasing other files or bytes. `GIT_NO_LAZY_FETCH=1` and checkout-controlled configuration rejection remain in force.
- [x] Recognized large-file pointers keep pointer bytes, declared payload identity/size, local payload availability, and captured payload bytes distinct; nothing fetches or hydrates. Arbitrary content filters stay unsupported with dependent working evidence unverified.
- [x] Binary/unrenderable bytes, explicit generated classification, and per-side availability flow through format-1-compatible optional fields; old records keep parsing. A focused mutation that dereferences a symlink, treats skip-worktree as deletion, or lets one unavailable object erase sibling files makes the relevant focused scenarios fail.
- [x] Comparison currentness stays owned once; a focused mutation that re-inlines degradation interpretation in Reviewing, Projection, or Harness Interaction makes the relevant focused scenarios fail. Canonical verification, Local Runtime contracts, all four compiled risk probes, dependency/package seams, and `git diff --check` pass on Node 26.5.1 / pnpm 11.20.0 with the package-manager bump unstaged.

## Constraints

- Read local evidence only through the bounded, provenance-isolated Git inspection context. Never fetch, hydrate, checkout, dereference a filter, initialize or open a nested repository, mutate the index or worktree, or contact a host service.
- Structure required to enumerate complete membership is all-or-nothing; content availability degrades independently per side. Limits never silently omit a file, invent bytes, or turn unavailable into unchanged/deleted.
- Degradation facts are observations, not identity: pointers, Gitlinks, sparsity, and generated classification never merge distinct occurrences or rename evidence. Timestamps and display text establish nothing.
- Keep Interface version 1, State format 2, existing limits, deadlines, budgets, and the FIFO. Add no refresh command, path scope, recursion, cache, watcher, or telemetry.
- Use only disposable real Git repositories, generated special entries, and sanitized partial/LFS fixtures. Never inspect real user repositories or data.

## Authority

- [Complete Change Set and Review Snapshot evidence](./WF-187-complete-change-set-review-snapshot-evidence.md)
- [Capture index and working-state comparisons](./WF-189-capture-index-working-comparisons.md)
- [Resolve exact local revision Change Sets](./WF-188-resolve-exact-local-revision-change-sets.md)
- [Define the workspace and change-set evidence contract](./WF-023-define-workspace-change-set-evidence.md)
- [Shape the Reviewing workflow](./WF-006-shape-reviewing-workflow.md)
- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md)

## Resolution

Closed on 2026-09-05. Version and persistence bounds did not change: Interface version 1 and
State format 2 now admit optional per-side `objectAvailability`, raw
`symlinkTarget`, `specialEntry`, `sparseAbsence`, `gitlink`,
`largeFilePointer`, `generated`, and `workingEvidenceLimitation` facts. Paths
continue to use their original bytes as identity and carry base64 plus display
text only at the public boundary. Reviewing's durable parser validates the new
closed shapes, byte lengths, digests, identities, and kind-specific invariants
while accepting every pre-existing format-1 side and manifest summary.

Workspace Evidence now obtains index flags with `ls-files --stage -v`, folds
only affected skip-worktree paths into current-change identity, and represents
an absent skip-worktree path from its exact index object rather than as a
working deletion. Sparse checkout's narrowly structural `config.worktree`
settings are projected into the inert Git overlay; every other worktree-local
key still rejects through `unsupported-checkout-config`. Raw working reads use
`O_NOFOLLOW`; symlink targets use `readlink` or exact blob bytes, and FIFOs,
Unix sockets, character devices, and block devices expose kind plus
`not-applicable` content only.

Gitlink sides always retain the outer tree/index object identity. Working
endpoints perform one bounded, sanitized nested inspection for the nested
object format, checked-out commit, and dirty/untracked booleans, with no parent
content traversal, recursion, initialization, fetch, update, or checkout.
Absent, non-repository, unborn, and failed nested states remain closed
per-side facts. Historical and index-only endpoints never inspect a nested
checkout.

Revision enumeration now begins with a no-renames structural diff, so locally
missing blobs do not erase manifest membership; similarity is recovered only
when required content is available. Missing blob sides retain mode, path, and
object identity with `missing-object`, while missing commits or trees still
fail closed. Capture and verification re-observe object, nested-checkout, LFS,
filter, sparse, special-kind, and read availability independently, using an
optional manifest inspectability witness only when degradation is present.
Stable unavailable facts can remain current; a change in local inspectability
becomes unverified, while ordinary endpoint movement remains stale.

Git LFS v1 pointers are recognized from inert pointer bytes without invoking
Git LFS or a content filter. Evidence keeps pointer bytes/digest, declared
SHA-256 payload identity and size, local-store availability, endpoint
representation, and separately represented capture within the shared budget.
The existing content window route gained the optional `large-file-payload`
representation. Local
payload paths are confined to canonical non-symlink `.git/lfs/objects`
components and read with no-follow semantics; no missing payload is fetched or
hydrated. Working files selected by arbitrary filters retain raw bytes but mark
canonical dependent evidence unsupported and therefore unverified. Explicit
`linguist-generated`/`generated` attributes remain disclosed classification,
never identity.

Focused disposable-repository scenarios cover non-UTF-8 and case-distinct
names, symlink targets and target-only mutation, FIFO and socket replacement,
binary and invalid UTF-8 bytes, generated attributes, sparse collapse,
Gitlinks with dirty/untracked nested facts, locally missing blobs versus
missing trees, pointer/local-store and materialized LFS payloads, arbitrary
filters, currentness transitions, and durable codec corruption. The complete
32-file / 250-test matrix passed with Vitest's sequential thread pool (used to
avoid the OpenTUI experimental-FFI fork teardown fault); TypeScript checks,
all four compiled risk probes, build smoke, dependency/package seams, and
`git diff --check` passed on Node 26.5.1 / pnpm 11.20.0. The unrelated root
package-manager bump remained unstaged.
