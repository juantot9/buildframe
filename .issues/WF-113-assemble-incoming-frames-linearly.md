---
id: WF-113
title: "Assemble incoming frames linearly"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-112]
created: 2026-08-26
---

## Question

Can Local Runtime preserve its bounded JSONL framing Interface while assembling a fragmented incoming frame with one final copy instead of re-copying every accumulated byte on every socket chunk?

## Acceptance evidence

- `FramedSocket` scans each arriving chunk for newline delimiters, retains only unfinished-frame fragments, and concatenates those fragments at most once when their line is complete.
- A running unfinished-frame byte total preserves the exact `MAX_FRAME_BYTES` rule both before a newline and when a completed line reaches the decoder. An exact-limit line succeeds; one byte beyond the limit reports `protocol.error / frame-too-large` and closes with `frame-too-large`.
- Existing behavior remains intact for a line split across chunks, multiple lines coalesced in one chunk, empty lines, malformed JSON or UTF-8, close settlement, and send-side output/backpressure bounds.
- An owner-local bounded-process contract drives four exact-limit JSON frames through the private framing Interface one byte per `data` event and observes all four complete frames. It then drives an over-limit line in fragments and observes the exact protocol error and close code.
- Restoring per-chunk whole-buffer concatenation makes that bounded process exceed its 5-second deadline; the linear implementation completes with the same observable frames and bound failure.
- No public package export, protocol shape, diagnostic, timeout policy, role, or caller changes. The send-side `Buffer.concat` remains outside this finding.
- Focused framing and Local Runtime socket contracts, test typecheck, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled performance repair: [`L-02`](../docs/audit/pre-p17-codebase-findings.md#l-02--frame-reassembly-re-copies-the-whole-buffer-per-chunk)
- Running-total requirement: [Disposition the Local Runtime and Pi Adapter findings](./WF-066-disposition-local-runtime-and-pi-adapter-findings.md)

## Seam decision

`FramedSocket` remains the private framing Module shared by the client, server, and Harness Adapter. Fragment retention and byte accounting stay hidden behind its existing constructor, handlers, and send/error operations. The focused test crosses that private Interface with an in-memory socket Adapter; no accumulator Interface or package export is introduced solely for tests.

## Constraints

- Preserve `MAX_FRAME_BYTES` as a body-byte limit excluding the newline delimiter.
- Reset retained fragments and their byte total together after every completed line.
- Do not retain an already-consumed large chunk solely for a small trailing fragment.
- Do not optimize the unrelated send-side concatenation or the test-only `RawPeer` framing helper.
- Do not combine this child with X-06 wait diagnostics or the Local Runtime package-boundary checkpoint.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. `FramedSocket` now scans each incoming chunk from its current offset instead
of appending it to one ever-recopied buffer. An unfinished line is represented by
private fragment storage plus its exact body-byte total. A line contained in one
chunk is decoded directly; a fragmented line is concatenated once when its newline
arrives. Completed-line state resets before decoding, and a small remainder after
an already-consumed line is copied out rather than retaining that line's larger
backing allocation.

The running total remains the authority for `MAX_FRAME_BYTES`. Both the unfinished
and newline-completed paths reject only when body bytes exceed the 1 MiB limit;
the delimiter is still excluded. The owner-local bounded process observes four
exact-limit frames after 4,194,308 one-byte `data` events, then observes the exact
`protocol.error / frame-too-large` frame, `frame-too-large` close code, and orderly
socket end for a fragmented limit-plus-one line. The focused contract completes in
well under its 5-second process deadline (662 ms in the isolated run here).
Restoring whole-buffer concatenation exceeds that deadline. Replacing the running-
total overflow check with a current-fragment check also fails because no protocol
error is emitted.

All four focused Local Runtime test files pass 12/12. On Node 26.5.1 with pnpm
11.20.0, `pnpm v1:verify` passes the dependency firewall, all 22 files / 137 tests,
typecheck, builds, and smoke. All four compiled risk probes pass, and
`git diff --check` is clean. The send-side concatenation, test-only Raw Peer,
public exports, protocol shapes, diagnostics, runtime deadlines, and callers are
unchanged. The unrelated root `package.json` bump remains excluded.
