---
id: WF-121
title: "Strip controls at the Question composer seam"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-120]
created: 2026-08-26
---

## Question

Can the Reviewing Application retain the printable content of a bracketed paste while removing every C0, DEL, and C1 control before it becomes a model-owned Question Draft, without moving paste decoding into the Application or widening its package Interface?

## Acceptance evidence

- The existing real-OpenTUI composition scenario pastes printable text interleaved with ANSI styling, `NUL`, representative C0 whitespace/control characters, `DEL`, and a C1 control. The focused Textarea converges on the exact printable remainder with its cursor at the corresponding position.
- Selecting and copying the normalized composer text returns that exact remainder, and submitting it produces one direct Review directive whose Question body is byte-for-byte the same. This proves the model-owned Draft and OpenTUI widget do not diverge.
- The old implementation fails observably: `NUL` rolls the whole Textarea back to the prior Draft, while other surviving controls can enter the Draft. The repair strips controls rather than rejecting the paste, so printable text around them is retained.
- The Application owns one exact accepted-text rule: remove `U+0000`–`U+001F` and `U+007F`–`U+009F`. OpenTUI continues to own bracketed-paste byte decoding and ANSI-sequence removal; ordinary Unicode and spaces remain unchanged.
- OpenTUI applies its native insertion and cursor semantics to the already filtered text, so removing controls neither resets its edit history nor requires the Application to reinterpret a renderable cursor as a string offset. The existing 64 KiB limit continues to apply to the normalized UTF-8 Draft and retains its current notice and rollback behavior.
- Normalization is silent, like OpenTUI's existing ANSI removal. Because the printable remainder is retained rather than discarded, this child does not add a new UX notice that could overwrite workflow status.
- `reviewingInputFromPasteEvent` remains unchanged because the focused composer bypasses it. S-07 title filtering, A-05 dead-code deletion, and last-ranked A-02 no-color streaming remain separate children.
- No sanitizer or OpenTUI test seam is exported. The Application root, launcher, executable behavior, and Workspace command/durable shapes remain unchanged.
- Focused Application scenarios, Application typecheck/build, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package order: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled finding: [`S-05`](../docs/audit/pre-p17-codebase-findings.md#s-05--pasted-text-is-filtered-by-a-weaker-rule-than-typed-text)
- Corrected route and repair: [Disposition the Application text-filtering findings](./WF-075-disposition-application-filtering-findings.md)

## Seam decision

The existing focused Textarea is the private seam where OpenTUI-owned input becomes a model-owned local Draft. A package-private `QuestionTextareaRenderable` specializes only `insertText`: OpenTUI still decodes paste bytes and removes ANSI first, then the specialization removes controls before native insertion and the existing content callback synchronizes the accepted body. This keeps one invariant behind the Reviewing Application Interface and covers ordinary input plus bracketed paste without modifying the bypassed `reviewingInputFromPasteEvent` route.

The initial plan put normalization inside `synchronizeQuestionEditor` and reconciled the widget afterwards. The focused regression exposed why that is the wrong side of the seam: OpenTUI's cursor is a renderable coordinate, not a JavaScript string offset when controls and Unicode are present, and replacing text after insertion clears native edit history. Filtering immediately before `super.insertText` lets OpenTUI preserve both facts itself and removes the model's special `NUL` refusal.

The regression crosses the same Interface as production: bracketed input enters the real OpenTUI adapter, the visible composer and clipboard expose the accepted text, and the committed Harness directive exposes the resulting Question body. A separately exported sanitizer would be a shallow Interface used only by tests.

## Constraints

- Strip controls; do not reject the whole paste or replace controls with visible glyphs.
- Preserve printable text order, exact Unicode bytes, and the logical cursor position after removals.
- Preserve the 64 KiB Question Draft limit, atomic Ask flow, clipboard behavior, and OpenTUI's ANSI handling.
- Do not consolidate this rule with `safeText`: labels deliberately preserve tab, LF, and CR while the single-line-by-input composer does not.
- Do not add a cross-package text utility or widen any package export.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Yes. The focused composer now uses one private `QuestionTextareaRenderable` whose
only specialization is `insertText`. OpenTUI still decodes bracketed-paste bytes
and strips ANSI sequences; its inherited paste path then dispatches the resulting
text through the specialization, which removes every C0, DEL, and C1 code point
before native insertion. Ordinary Textarea input uses the same door. The existing
content callback therefore hands only accepted text to the model, and the obsolete
model-side `NUL` refusal is gone. The 64 KiB Draft check, notice, and rollback are
otherwise unchanged.

The implementation deliberately moved one step earlier than the initial seam
plan. A first working version normalized inside `synchronizeQuestionEditor` and
then rewrote the Textarea. The focused control/Unicode case showed that OpenTUI's
cursor is a native renderable coordinate rather than a JavaScript string offset
when controls are present; translating it after insertion required temporary
buffer rewrites that also cleared edit history. Specializing `insertText` lets
OpenTUI insert only normalized text and preserve cursor, selection, Unicode, and
undo behavior itself, while keeping decoding and ANSI handling in the external
adapter.

The real OpenTUI scenario now starts with `Pasted Question`, moves into its middle,
and bracket-pastes ANSI-styled text interleaved with `NUL`, C0 whitespace/control
edges, `DEL`, lower/mid/upper C1 values, and a multibyte compass. The visible
Textarea becomes exactly `Pasted exact 🧭 Question`; its logical cursor remains
after `Pasted exact 🧭 `; OSC 52 copies the same 26 UTF-8 bytes; and the one
committed direct Review directive carries the byte-identical Question body. No
filter notice replaces workflow status.

Restoring the old base Textarea plus its `NUL` rejection makes that regression fail
1/1 by timing out before any accepted composer text appears. Independently omitting
the C1 range also fails 1/1, so the test excludes both whole-paste rollback and a
partial C0-only repair. `reviewingInputFromPasteEvent`, `safeText`, title filtering,
no-color streaming, Workspace commands, and durable shapes are unchanged.

All four Application test files pass 22/22, and Application typecheck/build pass.
The compiled Application root still exposes only `createReviewingApplication`;
the launcher still exposes only `openDeveloperReviewing` and
`openDeveloperWorkspaceRuntime`. On Node 26.5.1 with pnpm 11.20.0, canonical
`pnpm v1:verify` passes the dependency firewall, all 24 files / 141 tests,
typecheck, builds, and smoke. All four compiled risk probes pass and
`git diff --check` is clean. The unrelated root `package.json` bump remains
excluded. S-05 is closed at the owner-local OpenTUI seam without adding a package
Interface.
