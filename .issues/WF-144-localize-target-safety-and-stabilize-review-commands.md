---
id: WF-144
title: "Localize target safety and stabilize Review commands"
status: closed
labels:
  - wayfinder:enhancement
parent: WF-140
assignee: juanan
blocked_by: [WF-143]
created: 2026-08-27
---

## Problem

The exact changed-target safety already holds, but the Application repeats it in a two-row global danger condition even though the composer owns a precise `TARGET CHANGED` title and blocked-action footer. Separately, the two Reviewing command rows change wholesale with Files/Diff/Questions focus, so useful global commands disappear while only pane emphasis changed. Both are private command/disclosure chrome at the same View seam.

## Acceptance evidence

- A changed Question composer shows `TARGET CHANGED` exactly once, in its bounded composer title, and retains the local `[Enter] blocked · [Esc] reselect target in Live Changes` instruction. The global `TARGET CHANGED - your Question text is preserved` and `Return to Live Changes...` rows are absent, returning those two rows to code/discussion without lowering the block.
- Preserve the exact Draft, original Live Changes identity, generation-first target check, ordinary Enter refusal, Esc reselection, later Attachment/action inspection, one atomic Ask after valid reselection, and no-effect/no-State-transition cases with and without Pi.
- Outside focused overlays/editors, one two-line Reviewing command set remains byte-for-byte stable as focus moves among Files, Diff, and Questions and across Wide/Balanced/Linear layouts. It identifies Diff-owned Ask/view commands without hiding global search, Versions, Live return, region movement, file visibility, configuration, or Home controls.
- Configuration, search, continuation, historical-dialog, comparison, Home, composer, and pending-local instructions retain their owning contextual chrome; this child does not invent a universal command bar or change key semantics.
- Keep the production Workspace Interface, commands, projections, durable bytes, OpenTUI adapter, package exports, and preferences unchanged. Add no renderer abstraction, persistent setting, generic notification, or cross-package helper.
- Real Workspace/OpenTUI regressions prove one local target-change disclosure, exact blocked/reselected behavior, stable command rows through all three pane focuses and resize, and unchanged no-attachment safety. The old source fails the focused controls, and a clean build proves the same compiled path with disposable controls removed.
- Focused Application tests, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. Legacy/user data and the unrelated root `package.json` bump remain untouched.

## Authority

- Owning map: [Pass the codebase deepening quality gate](./WF-140-pass-codebase-deepening-quality-gate.md)
- Reconciled gaps: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)
- Deferred directive: [Prove Live Changes integration and human acceptance](./WF-092-prove-live-changes-integration-and-acceptance.md)
- Accepted changed-target semantics: [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)

## Seam decision

Keep the model and composer contract unchanged. The composer is already the deepest owner of target-change meaning: its title names the exact target and its footer names the blocked action and explicit recovery. Remove only the redundant global View condition. Replace the three focus-dependent ordinary Reviewing footer branches with one compact two-line command vocabulary; semantic overlays continue to override it at their existing branches. This deepens one private View seam rather than adding a command-bar Module.

## Constraints

- Reduce visual weight, never the generation/identity check or blocked-action semantics.
- Keep `q`, `v`, and `w` Diff-owned; label that ownership rather than making those keys active in another pane.
- Preserve modal/editor-specific instructions and all current key bindings.
- Do not fold comparison click targets, packed/PTY evidence, or human acceptance into this child.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Changed-target safety now has one visual owner. The global two-row danger
condition is gone; the bounded composer still names its exact file/side/line and
adds `TARGET CHANGED` once in its title, while its local footer continues to say
`[Enter] blocked · [Esc] reselect target in Live Changes`. Removing the duplicate
returns two rows to the Diff/discussion without changing any model branch,
identity comparison, Draft byte, command, or recovery instruction.

Ordinary Reviewing now publishes one two-line command vocabulary regardless of
Files, Diff, or Questions focus: Diff-owned Ask/view commands are labeled as
such, while search, Versions, Live return, region movement, file visibility,
configuration, border sizing, and Home remain present. Continuation adds only
its semantic `C` affordance. Home, comparison, search, configuration,
continuation, and historical control surfaces still replace the footer through
their pre-existing contextual branches; no universal command bar or key
behavior was introduced.

The real changed-composer scenario proves exactly one `TARGET CHANGED`, the local
blocked/reselect footer, absence of both former global sentences, unchanged
ordinary Enter refusal, zero Pi directives before reselection, and one atomic
Ask after Esc reselects the current target. The no-Attachment path proves the
same local disclosure and unchanged no-State-transition refusal. The geometry
scenario captures the two command rows byte-for-byte at Wide Diff focus, Wide
Questions focus, Balanced Files focus, and 80x24 Linear layout while pane widths
and mouse behavior remain stable.

Against the old source, the changed-target control fails with two occurrences
instead of one, and the command control fails with no stable rows instead of the
expected pair. After a clean Application build, a disposable test copy importing
`apps/neoflow/dist` passes all three target/chrome scenarios 3/3; it was removed.
The production change is a net deletion inside the private View and adds no
Interface or state.

All five Application test files pass 26/26. Canonical `pnpm v1:verify` passes 26
files / 147 tests, typecheck, clean builds, and smoke on Node 26.5.1 with pnpm
11.20.0. All four compiled risk probes and `git diff --check` pass. Workspace
semantics, durable bytes, package exports, legacy/user data, and the unrelated
root `package.json` bump remain unchanged.
