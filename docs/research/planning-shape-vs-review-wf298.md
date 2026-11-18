# WF-298: shape the plan together, or review a finished plan?

## Question

Which shape should Planning's first slice take?

- **(a) Review a finished plan.** The connected agent produces a plan.
  BuildFrame shows it as a document. The developer leaves feedback anchored to
  plan lines, the agent revises, and the developer approves and asks it to
  implement.
- **(b) Shape the plan together from the start.** Before the agent explores,
  the developer states a goal and picks context (files, lines, notes) in
  BuildFrame. BuildFrame sends that, the agent explores and plans with it, and
  the developer then iterates.

This note compares them on feasibility, user impact and smallest first slice.
Cited per-tool evidence is in
[planning-shape-vs-review-wf298-evidence.md](./planning-shape-vs-review-wf298-evidence.md)
(below: **[E]**). Nothing was run against a real agent or account.

## Verdict — 2026-11-18

**Build both, but unevenly: a thin (b) start and a full (a) loop.** The first
slice is:

1. **Start a plan.** A goal plus optional line pointers, picked in BuildFrame
   and sent as one Message.
2. **Show and comment.** The agent's plan becomes a Plan Revision document in
   BuildFrame. The developer comments on its lines and sends the comments as
   one batch.
3. **Approve and implement.** Approve a revision, then send "implement this
   revision" in a separate step.

The reasons, in short:

- **(b) alone has nowhere to land.** Once the agent answers, the plan is just a
  Response, a block of text BuildFrame cannot comment on line by line. Without
  (a)'s document and feedback, (b) is a nicer prompt box, and the agents already
  have one with `@file` mentions and their own plan modes.
- **(a) is what the tools lack, and what Plannotator is built around.** Native
  plan modes accept only free-text "keep planning" feedback or a whole-plan
  edit. Plannotator's default, no-command feature is plan review with anchored
  comments on at least seven hosts. Its one "shape first" feature is an optional extra skill,
  and even that is agent-led: the agent drafts and the human marks up. [E: Plannotator, Claude Code]
- **(b)'s real value is cheap if it stays small.** BuildFrame is the only place
  that can truthfully record "this goal and these pointers were sent before the
  agent explored" (a Planning Origin with context). Picking lines in BuildFrame's
  file view is easier than typing paths. Both work with pointers (`path:line`).
  Neither needs WF-024's captured-bytes context package, which the owner
  already rejected for Reviewing in WF-225.

Both shapes share one hard blocker: **a Response is capped at 16 KiB and must
be the final answer**. That cap is enforced by Workspace for Pi and Claude
alike. A plan must be captured some other way, or the cap raised for a new
plan-result contract, before either shape works reliably.

## Comparison

| | (a) Review a finished plan | (b) Shape the plan from the start |
| --- | --- | --- |
| What BuildFrame adds that the agent lacks | Line-anchored comments, revision history and diffs, a durable approval | A recorded goal and context, sent before exploration; line picking from a file view |
| Reuse of today's code | Send/Response path, saved-origin quoting for plan lines, anchors, history | Send path, line picking, `path:line` references; `contextEvidence.ts` only if bytes are captured |
| New work | Plan-result contract (kind and bound), plan document view, multi-comment batch, approval and implement Sends | Planning-start Message kind (goal + several pointers), Origin record; the plan still lands somewhere (needs (a)) |
| Main feasibility risk | 16 KiB Response bound; the plan must be the final answer | The same, plus vocabulary: the Snapshot is defined as captured bytes, not pointers |
| User friction | Low: the agent does the first draft, the user reacts | Up-front effort before any value; users often do not know the right files before exploring |
| Where it helps most | Medium to large changes where a wrong plan is expensive | Goals that need knowledge the repo cannot show: decisions, constraints, "done when" |
| What comparable tools do | Plannotator intercepts the plan on Claude Code (`ExitPlanMode`), Copilot and Gemini (their plan-mode hooks, per Plannotator's README), Codex (`Stop` hook + transcript), OpenCode and Pi (its own submit tools) | Docs advise goal, context, constraints and "done when" in the prompt, typed in the agent; none offers a separate context-curation step |
| Standalone value | Yes | Small: the agent's own prompt plus `@` covers most of it |

## Feasibility with today's architecture

**What already works for both.** The connector kit sends exact text and
returns the final answer as the Response, for Pi and Claude Code
(`connector/contracts.ts:47-52`). A Message body may be 64 KiB, the whole
Message 256 KiB, and a Claude prompt 768 KiB. That is plenty for a goal and
pointers. The kit already has a `render?` seam for "directive kinds other than
a Review Message" and a `prepare?` seam that narrows tools before a Send. [E: BuildFrame code]

**What blocks both: capturing the plan.**

- `artifactResultContract.maximumBytes` is `16 * 1024` for Pi
  (`pi-adapter/src/capability.ts:73`) and Claude
  (`claude-adapter/src/direct/capability.ts:84`). Workspace rejects any other
  value or any kind other than `review-response` (`normalization.ts:170-174`).
  An answer over 16 KiB is dropped silently. The turn settles "without a
  Response".
- Only the **last** assistant message's text is captured. If the agent ends
  with "Plan written to plan.md", that sentence is the Response.
- No plan-size measurement was made here. As signals, Plannotator moves
  feedback over 12 KiB into a file, and it accepts plan files up to 2 MiB. [E: Plannotator]
  A detailed plan can plausibly exceed 16 KiB.

There are three ways out:

1. **A plan-result contract.** Add a new `artifactKind` (for example
   `plan-revision`) with a larger, reviewed bound. Change it in Workspace
   normalization, both capabilities, the Claude mod's answer limit and the
   helper's request bound. This is the most direct route and matches the
   Plan Revision definition ("materialized only when … satisfies its Artifact
   Result Contract").
2. **The plan as a file in the checkout.** Ask the agent to write it to a
   known path. Workspace Evidence reads it after the Response settles. There is
   no size problem, and revisions show as ordinary diffs. Correlation is weaker:
   a file changed after a Send does not prove the agent wrote it (WF-225's
   "changes observed afterwards" wording applies). The file also sits in the
   developer's worktree.
3. **Native plan hand-off** (Claude `ExitPlanMode` input, Pi or OpenCode
   plugin tools). WF-298 round 1 already defers this to a later slice per host.

**Plan-mode interference (unverified).** If the developer's Claude session is
in plan mode when BuildFrame sends, the turn ends in `ExitPlanMode`'s native
dialog, or in Plannotator's if it is installed. The plan then sits in the
tool input and the plan file, not necessarily in the final text. The first
slice should ask for the plan as the final answer in normal mode and say so. [E: Claude Code]

**Authority.** Pi can enforce read-only exploration (`question-only`
capability). Claude can only be told not to edit ("communicated"). A Planning
start on Claude is honest only if it says so.

**(a)-specific gaps.**

- Plan lines are not repository files, so `path:line` cannot point at them.
  The saved-origin form already quotes exact labelled lines
  (`reviewMessage.ts:107-150`), and that is the natural template for quoting
  plan lines.
- Reviewing sends one note per Send (WF-228). Plan feedback is naturally a
  batch: Plannotator sends all comments as one message. That needs the Feedback
  Batch from CONTEXT.md, or an explicit decision to start with one note per Send.

**(b)-specific gaps.**

- Today a Message has one location. A Planning start needs a goal plus several
  pointers and notes: a new Handoff kind, since only `submit-review-batch`
  exists.
- The context engine (`contextEvidence.ts`: selection, manifest, byte capture,
  revalidate) exists, but no screen uses it and WF-228 removed it from Sends.
  Using pointers instead of bytes keeps (b) small. CONTEXT.md, however, defines
  a Planning Context Snapshot as "an immutable capture of the goal and selected
  context". A pointer-only Snapshot needs that entry amended, the same way
  WF-225 amended Reviewing.

## Impact on the user

**Where (a) helps.** The developer reacts instead of authoring: the agent has
already read the code. Anchored comments ("this step breaks X", delete this
step) are more precise than the free-text "No, keep planning" that Claude
Code offers. Revisions and diffs show what changed. Approval becomes a durable
record that a later Review can link to. This is the loop Plannotator made its
default on every host it supports. [E: Plannotator, Claude Code]

**Where (a) adds friction.** The plan appears in a second window, so the
developer switches between BuildFrame and the agent. Small tasks do not need a
plan at all. If the agent's direction is wrong from the start, the first round
of review is spent correcting it.

**Where (b) helps.** It fixes that wrong-start problem when the developer knows
something the repo cannot show: a decision, a constraint, a "done when", or
"follow the pattern in this file". Picking lines in BuildFrame's file view is
faster than typing paths. It also gives Planning a truthful origin (goal and
exactly what was sent), which an agent-initiated plan cannot have: Context
Drift is "unassessable" for an associated offer (CONTEXT.md).

**Where (b) adds friction.** All the effort comes before any result. The tools'
own guidance cuts against heavy curation: "Only write down what Claude can't
find by reading the repo", and models are "very good" at finding files. Codex
recommends goal, context, constraints and "done when" in one prompt, typed in
the agent with `@` mentions. When users are unsure, both vendors suggest
letting the agent interview them, not curating up front. The owner's own
WF-225 rejected "managing saved context packages" in Reviewing for the same
reason. [E: Claude Code, Codex]

**What users of comparable tools actually do.** No usage data was found. The
evidence is product shape: Claude Code, Codex, OpenCode and Copilot ship a
plan mode (Pi leaves it to extensions), review tools hook into each, and none
ships a separate context-curation step. Plannotator's
13k stars indicate interest in plan review, not frequency of use.

## Smallest first slices

**Slice 0, no code: dogfood (a) today.** Ask the agent to write its plan to a
file in the checkout. Open it in Reviewing, send line-anchored Messages
(`plan.md:12`), and let the agent revise the file. Revisions show as diffs.
This tests whether anchored plan feedback earns its place before anything is
built. Its limits: one note per Send, no approval record, and the file sits in
the worktree.

**(a) alone.** Planning screen → "Ask for a plan" (free text) → plan captured
under a plan-result contract → document view with anchored comments → "Request
revision" sends all comments as one batch, quoting the plan lines → new
revision with a diff → "Approve" → "Begin implementation" Send.

**(b) alone.** Planning screen → goal text plus pointers picked from the file
view (each `path:line-range` plus an optional note) → "Start planning" sends
one Message and records the Origin → the plan arrives as a Response, shown as
text → follow-ups are ordinary Messages. It is smaller to build, but it stops
where the developer's real work, judging the plan, begins.

**Combined (recommended).** Take (a)'s slice, and make its first step (b)'s
"Start planning": goal plus optional pointers, no byte capture, no exclusion
or sensitivity machinery. The extra cost over (a) is one Message kind and an
Origin record. Context curation stays optional, so an empty selection is the
fast path.

## Recommendation

1. Run **Slice 0** for a few real tasks first. It is free and answers the
   owner's question with evidence.
2. Build the **combined slice**. The plan loop is the core of it. The start is
   a goal plus pointers, sent as a Live Repository Reference list.
3. Settle the **plan-capture route** before any screen work. A plan-result
   contract (route 1) is the cleanest fit with CONTEXT.md. Route 2 (a file) is
   the fallback if plans regularly exceed any reasonable bound.
4. Leave native plan-mode capture (Claude `ExitPlanMode`, OpenCode, Pi) to the
   per-host later slice already agreed in WF-298. Plannotator shows each host
   needs its own hook.

If the owner prefers (b) first anyway, it is feasible with today's Send path.
It should still be followed directly by the plan document. Otherwise the plan
is read in the agent's terminal, and BuildFrame records only the question.

## Open questions and experiments

1. **Plan size.** Measure the byte size of the final-answer plans from Slice 0
   and pick a plan-result bound from the data. Do not read agent transcripts.
2. **Plan-mode interplay.** With a mock or throwaway session, send a Planning
   start to Claude in plan mode and in normal mode, and record what
   `turn.complete` reports as the answer. Check whether Plannotator, if
   installed, takes over.
3. **Feedback batch or one note per Send.** Reviewing chose one note. Plan
   review tools send a batch. This is the owner's call.
4. **Snapshot vocabulary.** Amend Planning Context Snapshot to allow pointers
   (Live Repository References) with exact quotes only for unsaved or
   historical material?
5. **Read-only on Claude.** Is "communicated" read-only acceptable for a
   Planning start, or should the first slice be Pi-only for exploration?
6. **Where the plan file lives** (route 2 only): inside the worktree, or
   outside it, read through Workspace Evidence as outside-checkout context?
