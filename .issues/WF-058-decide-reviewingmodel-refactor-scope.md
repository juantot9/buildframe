---
id: WF-058
title: "Decide whether the reviewingModel refactor is in scope"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: [WF-054]
created: 2026-08-05
assets: []
---

## Question

Is the `reviewingModel` refactor in scope for the deepening gate at all—separating state-machine ownership from view concerns such as scroll offset, and removing any dead `ReviewingModelEffect` variants—or is it dispositioned as accepted and left alone?

## Blocked by

- [Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md)

## Established facts

- `apps/neoflow/src` is 7,285 lines across five files. `reviewingView.ts` is 2,539 lines and `reviewingModel.ts` is 2,414, so those two files are roughly two thirds of the Application.
- The crashed session was mid-thought on this when it died—its traces read "planning route and model refactoring" and "planning model state ownership"—and it never produced a recommendation. **There is no accepted design to implement, only an intent.**
- Dead `ReviewingModelEffect` variants were suspected but never confirmed; the session was counting effect types against usage at the moment it died.

## Notes

- Blocked on the audit because this is the lead most likely to turn into a speculative abstraction. The evidence-driven rule applies with full force: no speculative abstraction, no new shallow Interfaces, and a finding supported only by taste is dispositioned **accepted**, not **fixed**.
- Two distinct questions hide in here and may deserve different answers: dead effect variants are a factual dead-code question the audit can settle, while state-versus-view ownership is a design change over source that Gate A's human acceptance just validated. Splitting them is a legitimate outcome of this ticket.
- Whatever is decided, the renderer itself is out of scope for this map—OpenTUI `0.5.1` under Node `26.4.0 --experimental-ffi` is settled by Gate A and Gate B.

## Resolution comment

**Disposition: split, which this ticket's own Notes named as a legitimate outcome.
The dead-code half is confirmed and proposed *fixed*; the state-versus-view
ownership half is *accepted*.** No code changes on this map.

### The dead-code half: confirmed, reversing the audit's ruling

[Audit architecture and risk across every package](./WF-054-audit-architecture-risk-every-package.md)
had ruled this out — *"not confirmed; there are none"* — and explicitly narrowed
this ticket to the ownership half on that basis. **That ruling was wrong.** The
method error is worth more than the finding.

It established that all 14 `ReviewingModelEffect` variants have an
`effect.type === '…'` dispatch arm in `#runEffects`, then concluded that no variant
is unreachable. But a dispatch arm is the **consumer** side, and dead means never
**constructed**. A variant with a handler and no producer is exactly the case that
test cannot detect — and it is the case that exists. `load-question-editor` is
declared (`reviewingModel.ts:276`) and handled (`reviewingApplication.ts:307`), and
`git grep` over every tracked file finds no third site: nothing constructs it.

Behind it sits a complete, unreachable feature path — revising an existing Question
Draft. The dispatch arm calls `#loadQuestionEditor`
(`reviewingApplication.ts:1114`–`:1161`), whose success branch is the only caller of
`openReviseEditor` (`reviewingModel.ts:872`–`:904`), the only writer of a
`revise-question` editor (`:154`–`:162`). Its sibling `create-question` is entered
from a keybinding at `:1146`; this one is entered from nowhere.

It is **unfinished, not merely unbound**, which is what settles the disposition.
`submitEditor` returns `[]` for any editor whose kind is not `create-question`
(`:2367`), and `editorCommand` refuses the same (`:2389`). Adding the missing entry
point would open an editor that silently cannot save, so the code is not a head
start on the feature — the save path was never written.

Recorded as **A-05** in `docs/audit/pre-p17-codebase-findings.md`, category
maintainability, severity low, disposition **fixed**: delete the five spans, exactly
**100 lines**. Nothing is orphaned — the `review.question-body` read it uses is also
the question-discussion path's read (`reviewingApplication.ts:1079`).

Two method notes are now in the ledger beside the retracted ruling, because they
generalise past this union:

- Reachability for a discriminated union of commands or effects is counted from
  **producers**, never from handlers.
- The producer sweep must cover **every module that constructs one**, not just the
  module that declares the type. The view constructs `copy-question-selection` and
  `copy-review-selection` and the model never does, so sweeping the model alone
  would have marked those two dead as well — three false positives beside the one
  true one.

The wrong ruling is kept in the ledger's **Ruled out** section, marked as wrong,
rather than deleted. The reasoning is the thing worth keeping.

### The ownership half: accepted, no refactor

- **There is no design to implement.** The crashed session left an intent and no
  recommendation, as this ticket's facts already record. Inventing one here would be
  the speculative abstraction the map forbids.
- **The support is taste.** `reviewingView.ts` at 2,539 lines and
  `reviewingModel.ts` at 2,414 are large, but size is not a defect. No behavioural
  problem was found that ownership separation would fix; **A-01**, the one
  model/view split that *does* cause a real defect, is already recorded and already
  proposed fixed on its own.
- **The diff would land on source Gate A and Gate B just proved**, and `pnpm verify`
  is the only gate that would re-prove it. Same trade that was refused in
  [Decide whether to break the packages/workspace import cycle](./WF-057-decide-workspace-import-cycle.md).

### The one real structural fact, and why it is still accepted

The view **originates** effects rather than only receiving them: `copy-review-selection`
at `reviewingView.ts:2279` and `:2324`, `copy-question-selection` at `:2297`, all
pushed straight through `#onEffects` without passing through the model.

That is the ownership smudge this ticket suspected, and it is nonetheless correct as
built. The state these effects carry lives in the OpenTUI widget and the renderer's
selection gesture, not in the model — `textarea.getSelectedText()`,
`renderer.clearSelection()`, and a `queueMicrotask` that waits for the gesture to
finish before writing OSC 52. A model that owned this path would have to mirror
widget state it cannot observe, which is worse than the asymmetry. Recorded here
rather than as a finding, deliberately: it is the right design given where the state
lives, and a future reader meeting it should not re-open it.

### A correction to this ticket's own facts

*"`apps/neoflow/src` is 7,285 lines across five files"* — the line total is exact,
the file count is not. It is **12** files. The claim the fact was supporting is
unaffected: `reviewingView.ts` and `reviewingModel.ts` are 4,953 of those 7,285
lines, still roughly two thirds of the package.

### Consequence for the rest of the map

[Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md)
inherits both the finding and the method. Its dead-code axis should count from
producers across all modules, and `apps/neoflow`'s effect union is already swept —
A-05 is the whole of that result, so it is not re-derived there.

This resolution also surfaced a question larger than itself, now
[Re-verify the ledger's ruled-out leads](./WF-062-re-verify-ruled-out-leads.md):
the wrong ruling was found only because this ticket happened to depend on it, and
the other 27 rulings in that section have never been re-checked by anyone. A wrong
entry there is load-bearing, because the section's whole purpose is to stop a lead
being investigated twice.
