---
id: WF-124
title: "Carry fragmented SGR styles across no-color writes"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-123]
created: 2026-08-26
---

## Question

Can the no-color output stream remove a complete non-reset SGR sequence even when OpenTUI splits it across writes, while preserving resets, non-style terminal controls, incomplete final bytes, backpressure, and a bounded retained prefix?

## Acceptance evidence

- A focused stream regression writes one style across multiple chunk boundaries, including boundaries after bare `ESC`, `ESC[`, and parameter bytes. The captured stdout contains the surrounding UTF-8 text but no style bytes.
- The same stream preserves a reset split across writes and a non-SGR lifecycle sequence split after `ESC[`. Ending or destroying with an incomplete candidate flushes those bytes unchanged rather than silently dropping them.
- The old implementation fails observably because each fragment is filtered independently and the reconstructed style reaches stdout unchanged.
- Keep `removeAnsiStyles` byte-for-byte unchanged; its complete-buffer contract is already sound. `createNoColorOutput` alone owns one trailing candidate and combines it with the next write before invoking that function.
- Retain only a syntactically possible SGR prefix: `ESC`, `ESC[`, or `ESC[` followed solely by digits/semicolons. Retained bytes are copied out of the source chunk so a short suffix cannot pin a 64 KiB native span.
- Bound retained candidate bytes at exactly 64 KiB, matching the measured OpenTUI `NativeSpanFeed` span. Exact-limit remains pending; limit-plus-one is classified as non-style and flushed unchanged. Edge coverage proves both outcomes.
- Every write/final/destroy callback settles once. Existing stdout backpressure waits for the same `drain`; TTY dimensions, fd forwarding, renderer wiring, and shutdown order remain unchanged.
- No streaming parser, constant, sink parameter, or test seam is exported. Tests isolate the existing source-private output factory by temporarily capturing process stdout and always restoring it.
- A-02 is the last-ranked Application finding; do not combine it with the subsequent Application package checkpoint.
- Focused no-color and Application scenarios, Application typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled finding: [`A-02`](../docs/audit/pre-p17-codebase-findings.md#a-02--no-color-filtering-is-stateless-but-applied-per-stream-chunk)
- Measured 64 KiB OpenTUI split and last rank: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)

## Seam decision

`createNoColorOutput` is already the stream Interface that owns chunk boundaries, stdout backpressure, and OpenTUI's WriteStream shape. Keep its small amount of carry state inside the factory. The pure `removeAnsiStyles` function continues to know only complete buffers; callers and tests do not learn a parser protocol.

A separately exported streaming filter would be a shallow Interface for one production caller. The focused tests cross the existing Writable Interface and assert emitted bytes, which is the same observable result OpenTUI and the terminal use.

## Constraints

- Remove only complete non-reset SGR styles; preserve empty/`0` resets and every non-SGR sequence byte-for-byte.
- Preserve byte order and UTF-8 bytes outside removed styles.
- Bound retained candidate bytes at 64 KiB and cover exact-limit plus limit-plus-one.
- Flush pending incomplete bytes on ordinary finalization and explicit destruction.
- Preserve stdout backpressure and exactly-once stream callbacks.
- Do not change renderer cadence, terminal lifecycle controls, `removeAnsiStyles`, or package exports.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `createNoColorOutput` now owns one private trailing SGR candidate. It examines
only the final `ESC`: a bare `ESC`, `ESC[`, or an `ESC[` suffix containing only
digits and semicolons is copied into the carry; everything before it is passed to
the unchanged complete-buffer filter. The next write combines with that short
copy exactly once. Ordinary writes with no carry avoid concatenation, and a suffix
copy cannot retain OpenTUI's whole native span.

The candidate is explicitly bounded at 64 KiB. A syntactically incomplete
candidate of exactly 65,536 bytes remains pending; the next valid parameter byte
makes it exceed the bound and flush unchanged. A final `m` can still complete and
remove an exact-limit candidate because completed syntax is classified before the
pending bound. Finalization and normal destruction both flush an incomplete suffix
unchanged, matching the prior stream's preservation rather than dropping bytes.

Three focused Writable-Interface tests capture the real factory's process stdout.
A style split after bare `ESC`, parameter bytes, and `ESC[` disappears while a
split reset, alternate-screen control, UTF-8 text, and incomplete final prefix
remain byte-for-byte. A forced false stdout write settles its callback once only
after one `drain`. The bound test observes zero emitted bytes at exactly 64 KiB,
then exact unchanged overflow and destroy suffix bytes. The process stdout method
is restored in every path; no sink parameter or test factory was added.

The old implementation fails 2/3 focused tests: the reconstructed RGB style reaches
stdout and the exact-limit candidate emits immediately. Changing the bound from
`<=` to `<` independently fails the exact-limit regression. The complete-buffer
`removeAnsiStyles` source block is byte-identical to the parent commit, and reset,
non-SGR, TTY getter, fd, renderer, and shutdown Interfaces are unchanged.

All five Application test files pass 26/26, and Application typecheck/build pass.
The compiled Application root still exposes only `createReviewingApplication`;
the launcher still exposes only `openDeveloperReviewing` and
`openDeveloperWorkspaceRuntime`. On Node 26.5.1 with pnpm 11.20.0, canonical
`pnpm v1:verify` passes the dependency firewall, all 25 files / 145 tests,
typecheck, builds, and smoke. All four compiled risk probes pass and
`git diff --check` is clean. The unrelated root `package.json` bump remains
excluded. Last-ranked A-02 and every fixed Application finding are closed; the
Application package checkpoint is next.
