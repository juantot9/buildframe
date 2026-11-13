---
id: WF-225
title: "Reframe Reviewing around the current repository"
status: open
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: []
created: 2026-09-08
---

## Resolution

Product direction accepted (2026-09-08), during the WF-221 grilling pass. **Implementation is not settled.** The user rejected treating everyday Reviewing as managing saved context packages. Reviewing should start from the current repository, keep Questions small and human-readable, and expose past code through a separate history flow. Questions may concern unchanged files or a clean checkout. Ordinary additional repository reading belongs to the Harness's existing tools, not a new Neoflow file server.

This is the next planning frontier. WF-221 is paused pending this replan, and WF-222–224 must not proceed from their original contracts unchanged. WF-217–220 remain landed evidence and behavior, not work to undo automatically. This issue records the accepted direction and the earlier decisions that survive it; it neither authorizes production implementation nor claims that the revised behavior already exists.

## Accepted product experience

### Repository now is the ordinary view

- Show files as they currently exist in the canonical checkout. Highlight changed files first, but allow browsing and Questions about unchanged files too. A clean checkout is not a dead end.
- Current uncommitted changes and recent committed work are the normal use cases. Keep recent commits and ranges easy to choose without making saved Neoflow versions the primary workspace.
- **Compare with this commit** keeps current files as the target and changes the basis used to explain their differences. **Open this past version** enters history and shows the code as it existed then. Neither action silently checks out, restores, or edits files.
- Preserve the chosen comparison explicitly. A prior Handoff used for sharing comparisons never chooses the code being reviewed, pins the main view to old code, or silently changes a fixed historical comparison.
- When files change, ordinary browsing follows current files. A committed Question retains its exact original source and answer; it never silently moves to newer lines. A source change while composing or approving a current-code Question invalidates the old target rather than sending it as current.
- Ask remains one ordinary action with the Response visible in Neoflow. No staged Batch/Handoff, Finish action, or answer-disposition ceremony returns.

### History is a separate inspect-and-reuse flow

- Open history from the current repository. Keep Git commits and Neoflow's saved source occurrences distinguishable, with Questions and Responses attached to their exact source.
- Start with a history/tree for inspection, comparison, Questions, and deliberate reuse—not a manager for actively developing competing branches.
- Asking about a past version must clearly target that past version. It does not claim the old code is current or authorize a change to current files.
- **Apply selected changes to current files** is a separate explicit action. It must show the proposed changes and conflicts first, preserve newer work, and never mean an implicit whole-repository rollback. Its executor and conflict behavior still require a focused design; no mutation implementation is authorized here.
- Describe saved points around requests as **before the request** and **changes observed afterwards** where evidence supports those relationships. Timing alone does not prove that the Harness caused every change.
- This direction does not promise a whole-repository backup, a saved version on every keystroke, or historical content that Neoflow never captured. History coverage and capture points remain part of the replan.

## Accepted Question and sharing model

### Small messages, normal Harness reads

**Reopened by prototype feedback:** the user rejected making manual quote-range selection part of ordinary discussion and suggested Question plus file/line, with the Harness reading the necessary code. The earlier quote-first formulation below is not a settled default for implementation. Representation of historical/deleted source still needs reconciliation; removing a manual selection step does not make a current path identify past code.

1. The ordinary outgoing message contains the user's Question, its file/location, and the exact passage deliberately selected to quote. Use concise human-readable Markdown resembling a normal chat message, not an internal JSON record dump or every related file's contents.
2. Additional current repository material may be named with a **Live Repository Reference**. The Harness reads it with its existing tools and permissions. Such a reference names live source; it is neither a frozen capture nor proof that the destination already holds the same immutable content.
3. Files can change while the Harness answers. Neoflow preserves what the Question originally referred to but does not claim that every later Harness read saw those same bytes. The exact-message guarantee is not a guarantee about the Harness's entire model context or subsequent tool reads.
4. Historical code and unsaved editor text cannot be represented by an ordinary path to potentially different current code. Include the exact deliberately selected saved material, clearly labelled with its origin; do not send an entire past repository automatically.
5. The Adapter remains an encoder of the committed outgoing material, not a context selector. It must not read State, workspace files, editor state, or conversation history to enrich the outgoing message. This does not prohibit the Harness's own tool reads or the existing reviewed correlation and complete-Response capture mechanism.
6. Keep source authority separate from supporting references and quotes. A Question remains discussion-only; referencing a file never authorizes editing it.

No restricted on-demand file server, access grant lasting for one Question, new Harness read tool, or read-access audit subsystem was approved. The earlier proposal for that mechanism was replaced by ordinary Harness-owned reads.

### Exclusions govern Neoflow's message, not Harness filesystem access

- By default, an excluded source contributes no content, path, content hash, or other identity to Neoflow's outgoing message. Keep its exclusion locally inspectable.
- The user may explicitly choose to share only its selected file/range label, excluded status, and exclusion reason. Do not include content, content hashes, or internal machine/session identifiers in that metadata form.
- Make this choice per excluded source, for one exact saved Review basis and exact Harness session. An optional “apply to all exclusions in this Handoff” shortcut covers the inspected exclusions, not a standing global grant. A different source basis or session does not inherit the choice.
- The disclosed label or reason may itself be sensitive and must be assessed as actual outgoing material.
- State plainly that exclusion does not prevent the Harness from independently reading the file. Filesystem restrictions remain the Harness's responsibility; the existing Pi tool-kind gate is not a path-access sandbox.

### Sharing detail is inspectable, not a compulsory wizard

Use plain language such as **What will be shared** for Handoff Disclosure Preview. It is a local account of the destination, Question source, exact outgoing quotes/references/metadata, local exclusions, differences, size, and limitations. Merely opening it saves or sends nothing. Ordinary Ask does not require visiting a separate screen; only genuinely necessary acknowledgments belong in one composed gate.

Keep **Code being reviewed** separate from **Changes to extra supporting material**. Preserve user source-group order and stable path order within expansions. Lists and exact content must remain completely inspectable through bounded reads; the existing 64-entry manifests and 256-KiB content windows were accepted as the starting pattern, not as limits on what a user may ask about. Binary or unrenderable quoted material must remain exact or explicitly unsupported, never lossily decoded or silently substituted.

### Previously accepted sharing is a comparison point, not a code baseline

- Compare against the latest successfully Durable-Committed Handoff for this Review and this exact destination session. Opening an inspection or failing to save establishes no comparison point.
- With no earlier sharing basis, mark proposed outgoing material as new. For a first Handoff to a different session, the Review's latest Handoff may explain the destination change, but grants no inherited permission. Returning to a previously used exact session may use that session's own comparison point.
- A saved Handoff whose delivery later fails or remains unresolved still records the user's approved outgoing material. It proves no delivery and authorizes no automatic resend.
- Match logical sources across saved versions, not Snapshot-scoped temporary identities or content equality alone. Compare scope/range and content separately so expansion can be explained. Preserve all applicable change reasons rather than assigning only one category.
- Retain inspectable added, refreshed, expanded, representation-changed, destination-changed, and newly sensitive facts **for the material Neoflow actually proposes to send**. Final delta rules for literal Live Repository References need design: do not silently capture every referenced file or pretend the outgoing-message delta describes future Harness reads.

## Accepted size and compaction rules

- Show exact outgoing-message byte and character size, with truthful file/material counts. Do not show token estimates. The initial message size is not the total future context use of a Harness that can read additional files.
- Encourage focused Questions and narrow quoted ranges without mandatory warnings merely for exceeding advisory guidance. Do not silently shorten, summarize, omit, or replace selected outgoing content to save space.
- Only a demonstrable technical acceptance/transport bound can prevent sending on size grounds. Explain that bound and let the user choose how to reduce the message or use another supported route. Do not convert an arbitrary recommended size into a non-overridable product rule, and do not bypass actual protocol/storage bounds.
- Keep current model/session capacity or usage optional and evidence-based. Compaction, model/session change, or evidence loss invalidates old usage until fresh matching evidence exists. Unknown remains unknown.
- Do not assume material remains in the model's context after compaction. A Live Repository Reference is an invitation to read current files, not a memory claim; any future destination-native reference requires its own reviewed exact-occurrence and continued-validity proof. Compaction never authorizes automatic Handoff replay, hidden summarization, or reconstructing a transcript.

## Retained exactness and safety rules

- Harness Interaction owns construction and validation of the accepted outgoing material; Reviewing owns exact Question/source history; Workspace Evidence owns live repository facts. Keep one deep semantic owner at each Interface rather than pushing policy into Adapters or application code.
- Preserve the accepted outgoing material and its integrity identity before external dispatch. Handoff, receipt references, command recovery, and Adapter directive must agree about exactly what was approved. Receipts reference sensitive material rather than duplicating it. Native framing and human-readable-message bytes must be distinguished when specifying hashes and size checks.
- Revalidate the relevant current Question target, chosen historical source, destination, Capability, representation, order, and sharing choices before commitment. A changed commitment basis performs no effect. This does not claim to freeze independent Harness tool reads after commitment.
- Failed durability sends nothing. A committed but uncertain attempt remains explicit, with no automatic replay. A connector cannot repair an encoding problem by silently adding, dropping, or changing material.
- Representation support is a reviewed Capability/route fact, not inferred from a Harness name. A known metadata/unavailable limitation must be explicit and semantically valid for that role; missing required quoted content, unknown committed scope, or incoherent capture is not overridable. Unknown future live-file bytes are not falsely presented as part of the known outgoing message.
- Advisory sensitivity remains separate from exactness, scope, and authority. The composed assessment belongs to the replanned WF-223, not a second WF-221 consent mechanism. Earlier discussion of sensitive-content policy did not authorize bypassing it during implementation; keep unsafe commitment paths closed until their owner is ready.

## Earlier proposals replaced or still unapproved

| Earlier proposal or assumption | Settled direction |
| --- | --- |
| Every supporting file is a frozen content package to transmit | Quote only deliberately selected exact material; additional current files may be referenced for normal Harness reads |
| A restricted Neoflow file server serves frozen content on demand | Not approved; use existing Harness tools |
| Saved versions are the primary Reviewing surface | Repository now is primary; history is separate |
| A Review requires a non-empty diff | Unchanged files and clean repositories are reviewable |
| Visiting sharing detail is required before every Ask | Optional inspection; one ordinary Ask, with exceptional composed gates only |
| Named model-specific token estimates | No estimates; show outgoing-message size |
| Any existing size constant is proof of a native limit | Identify and justify actual acceptance/transport bounds |
| Excluding a file protects it from Harness access | Exclusion controls Neoflow's outgoing material only |
| A live path is a correlation-proven destination-native reference | Distinct meanings and guarantees; never substitute one for the other |

The earlier deterministic native-reference/content/metadata/unavailable precedence was discussed for frozen captures. It must not be reused unchanged for Live Repository References. Likewise, do not carry forward acknowledgments or delta semantics simply because an earlier batch received agreement before this product change.

## Checked implementation starting point

Inspected at `6720f73`; these are source observations, not new test or human-acceptance claims.

- [WF-079](./WF-079-implement-accepted-live-changes-design.md), `packages/workspace/src/projection.ts`, and `apps/neoflow/src/reviewingApplication.ts` already separate live working changes from immutable saved versions. This is not a reason to rebuild Live Changes.
- `packages/workspace/src/reviewing.ts` rejects starting current-change Reviews with `no-current-changes`; unchanged-file/clean-checkout Reviewing needs a deliberate contract extension, not a fabricated changed-file manifest.
- `apps/neoflow/src/reviewingModel.ts` requires the live route to compose a Question. [WF-142](./WF-142-open-historical-review-dialog.md) and [WF-162](./WF-162-distinguish-historical-detail-from-live-reviewing.md) deliberately made saved history read-only. Asking about saved code and applying selected old changes require explicit new actions; do not weaken current-target validation to simulate them.
- `packages/workspace/src/harness-interaction/harnessInteraction.ts` still rejects non-empty Snapshot context with `snapshot-context-disclosure-unavailable`. No fail-closed path was removed in this decision pass.
- `packages/pi-adapter/src/piAdapter.ts` formats a JSON-heavy prompt and gates tool names rather than file paths. Its `MAX_NATIVE_PROMPT_BYTES = 768 * 1024` is a local Adapter guard checked after commitment, not by itself proof of a Pi-native maximum. Replanning must establish the actual size/encoding contract before calling a limit unavoidable.
- `CONTEXT.md` records the revised language. Earlier issue resolutions and blueprint details remain historical contracts requiring the explicit reconciliation below; glossary changes do not claim production support.

## Replanning work before implementation

1. Reconcile current-repository Reviewing, optional comparisons, unchanged-file Questions, saved-source Questions, and Current/Previous Review retention with the existing record graph. Preserve historical records without assuming a new full-checkout snapshot format or migration.
2. Settle how to select and compare current versus past source without unexpected route changes. Define bounded repository browsing, available history coverage, and how source changes while composing are explained. Reuse the existing Live Changes/history behavior where it already fits.
3. Design the explicit apply-selected-changes action separately: exact application versus Harness-assisted adaptation, executor, conflict checks, current-work preservation, and mutation consent are not implementation decisions made by this issue.
4. Specify the small human-readable Question message, exact quote and live-reference forms, local-only audit evidence, message-size measurement, and pre-effect integrity/encoding checks. Keep the Adapter out of semantic context selection.
5. Reconcile [WF-006](./WF-006-shape-reviewing-workflow.md), [WF-024](./WF-024-define-workflow-context-curation.md), [WF-031](./WF-031-define-v1-workflow-handoff-payloads.md), [WF-021](./WF-021-establish-context-budget-evidence.md), relevant architecture/trust documents, and the remaining P21 tasks. Scope amendments to Reviewing rather than silently replacing every Planning Handoff contract.
6. Split the revised work into focused children and settle which parts precede or replace WF-221–224. Validate the concrete interaction with the user using the explicitly authorized throwaway prototype below; its availability is not a human-acceptance verdict. Resume implementation only with the usual committed pre-implementation Resolution.

## Throwaway flow prototype

The user approved building an interactive flow/state prototype after this planning pass. It is deliberately not a final visual design or production implementation.

- **Primary source:** local branch `prototype/wf-225-repository-now`, commit `7c6a0e9`, based on `6720f73`. Nothing was merged into `main` or pushed.
- **Location:** `/tmp/neoflow-wf225-prototype/apps/neoflow/prototypes/repository-now/`. `README.md` contains the walkthrough and limits; `model.ts` isolates the in-memory reducer from the OpenTUI shell in `view.ts`.
- **Launch:** `bash /tmp/neoflow-wf225-prototype/apps/neoflow/prototypes/repository-now/run.sh`. The branch also has the app-local `pnpm prototype:repository-now` script. Existing installed dependencies are shared through ignored symlinks; no dependencies were installed.
- **Explores:** current and unchanged files, clean checkouts, comparison without checkout, separate historical browsing, exact-source Questions with mock replies, optional small-message inspection, live-reference wording, simulated external edits, and explicit reselection of a changed current Question target. Git commits and saved Question source are visibly different kinds of history; saved Question points contain only the sample source actually captured.
- **Not implemented:** real repository access, Git operations, Harness/network calls, persistence, selected-change application, branch management, exclusions, telemetry, production capture/retention limits, or a real diff algorithm. Fixture comparisons are line-aligned and the composer is single-line.
- **Runnable evidence:** strict type-check of the three prototype TypeScript files; native frame inspection at 110×32 and 80×24; keyboard-driven comparison, stale-current-target, historical-Question, saved-source, and clean-checkout flows; interactive terminal launch, paste, Ask, exit, and alternate-screen restoration. No production tests ran and no test suite was added.

**Question being tested:** does current repository → comparison → separate history → Ask feel natural while keeping exact Question history understandable?

**Human verdict: rejected as the overall interaction.** The user wants a GitLab-like diff review with navigable discussions beside the code, not a repository browser that sends the user to a separate Question screen. This prototype remains evidence of an unsuccessful design, not a candidate to promote.

### User feedback and next sketch

- Keep Questions visible at the side and allow moving through them alongside the code.
- Keep both changed-file browsing and access to all files, but switch between **Changed files / All files** within the file panel so either set is easy to find.
- Reserve the left panel for files and information about those files. Do not replace it with comparison-start choices. The location and interaction for comparison/history controls remain to be designed.
- Remove the burden of manually choosing a quote range for an ordinary Question. The user suggested sending the Question and where it was asked (file plus line), relying on the Harness to understand/read the relevant source. This reopens the earlier required-quote default; the final message and historical-source rules are not settled yet.
- Make the overall experience a diff viewer where the user can ask Questions **and request changes**, with the Harness/AI taking the place of a developer responding to a GitLab review. Change requests are new work to design explicitly, not permission to turn a discussion-only Ask into an implicit edit command. They are also distinct from applying selected old changes.
- Make successive changes easy to navigate as a tree. What its nodes and branches represent—requests, subsequent revisions, alternative attempts, or some combination—still needs clarification. The user's phrase “changes that the AI has been doing” describes the desired experience; timing alone still does not establish authorship.

The next prototype should explore the diff-and-discussion layout rather than polish this browser-led flow. Open questions include thread-list scope/navigation, the structure of the change tree, and whether a change request is sent individually or collected into a review. Preserve the original artifact; no revised prototype or production behavior has been implemented in this feedback pass.

### Second sketch (2026-09-08, later the same pass)

Built after the rejection above, on the same throwaway branch, explicitly exploring the requested diff-and-discussion direction.

- **Primary source:** `prototype/wf-225-repository-now` commits `dc7b292` (first iteration, superseded), `3e8507d` (second iteration, rebuilt in place after the follow-up answers), and `9c9b90d` (other-point messages de-emphasized with jump-to-origin per the message-and-history answers), in `/tmp/neoflow-wf225-prototype/apps/neoflow/prototypes/diff-review/`. Launch: `bash /tmp/neoflow-wf225-prototype/apps/neoflow/prototypes/diff-review/run.sh` (or `pnpm prototype:diff-review` in that worktree). Sketch #1 is preserved untouched at commit `7c6a0e9`.
- **Layout (second iteration):** files panel on the left (only files and per-file discussion counts; `f` toggles Changed ↔ All), a unified diff in the middle, and a Discussions panel on the right with one navigable message list, a detail pane, and Enter-to-jump to the anchored line. Visual chrome copies the product (`QUIET_GRAPHITE` palette, default pane widths 34/40, `▌ Title FOCUSED` headings, rounded bordered panes on `surface`, floating `position: 'absolute'` overlay for the picker); no production module is imported.
- **One message type (second iteration):** `a` at a diff line — or on a selected file, including unchanged files — composes a single message whose content is the user's text plus `file:line`. `F3` shows that exact message and size. The UI does not classify messages as questions or requests; the words and the Harness's later action carry the intent.
- **Rounds (second iteration):** `t` opens a **floating picker** styled after pi's `/tree` (gutter markers `●`/`○`, tree-depth indentation, discussion counts, `j/k`, Enter, Esc). Every point reviews exactly like the current one; the diff is always versus HEAD. The diff-basis toggle and round-walk keys were removed as confusing.
- **Superseded first-iteration details, kept for the record:** `a`/`r` split questions from change requests with `Q`/`R` badges and a resolve marker; rounds were a center-panel mode with a versus-parent diff basis and a simulated-edit action. The qualified verdict below rejected that shape.
- **Runnable evidence (second iteration):** strict type-check, oxlint, and oxfmt clean; 110×32 frame snapshots for default, compose/preview, thread-jump, floating-picker, and post-send scenes; keyboard-driven flows for jump/message/record/picker-select/Esc-close/unchanged-file ask/reset (with an observed mock-input escape-timing caveat needing a short delay); interactive PTY launch, paste, record, picker open/switch, exit, and alternate-screen restoration. No production tests ran.
- **Human verdict on the second iteration: preferred (2026-09-08).** The user said "I like it better" after trying the simplified diff-first review. Validated by this verdict: the GitLab-like diff-and-discussion layout as the everyday Reviewing surface; **one message type** whose intent is carried by its words and the Harness's later action (no UI-level question/request split); the floating `/tree`-style review picker over a fixed versus-HEAD diff; the `f` Changed ↔ All toggle with unchanged files askable; and the product-visual chrome direction. **Not yet settled by this verdict:** it is comparative praise for a throwaway sketch, not a signed-off design. Still open for the replan: thread anchoring across later edits, historical/unsaved source representation (a current path still cannot stand in for past code), how a request reaches the Harness without implying an edit command, real branching/round coverage, and all WF-225 reconciliation and task-mapping work. Production implementation still requires the usual committed pre-implementation Resolution.

The qualified first-iteration feedback that drove the second iteration, preserved verbatim:

- The rounds/tree picker should be a **floating window/modal**, not a mode inside the middle diff panel.
  - The **visual style should follow the current product's**, not the prototype's invented styling; the next iteration should be judged against the existing app's look.
  - **Questions and change requests should be one single thing.** The message's content and what the Harness then does express whether it is a question or a change request; Neoflow should not split discussions into separate `Q`/`R` types, panels, or compose actions. This simplifies the earlier prototype split and keeps the accepted "one ordinary Ask" direction: a request is just a message, and any actual editing remains the Harness's designed, consented action — Neoflow still does not turn a message into an edit command by itself.
  - `f` (Changed ↔ All) is wanted as-is.
  - Everything else in the sketch (round keys, diff-basis toggle, resolve markers, badges, extra modes) was not easy to understand or was dismissable; the next iteration should be radically simpler.

### Follow-up answers (2026-09-08)

To the three scoping questions, the user answered:

1. **Do not redo from scratch; iterate on the existing diff-review sketch.**
2. **Outgoing message: "a mix of both"** — the user's text plus the `file:line` location, as sketch #2 already does.
3. **Rounds picker: study how pi's `/tree` works and treat it as the example** (a floating, navigable selector).
4. **Default view: keep what the product has now** (current changes versus HEAD). Other rounds/points are like that same view, **selected within the review** (via the picker), not a separate mode.

Observed for reference: pi's `/tree` (`TreeSelectorComponent` in pi-coding-agent) is a floating bordered selector with a flattened, indented row list, an active-path/current-leaf marker, folding, search/filter, horizontal clipping, and Enter-to-navigate with Escape back to the same selection. Neoflow's own reviewing view (`apps/neoflow/src/reviewingView.ts`) already renders floating panels with `position: 'absolute'` overlays and a `SemanticTheme` (`QUIET_GRAPHITE` default; files pane 34, questions pane 40 wide, `▌ Title FOCUSED` headings, rounded borders on `surface`). The second iteration reused that visual vocabulary without importing production modules into the throwaway code. Full pi-`/tree` parity (search/filter, folding, summaries) remains out of scope for the sketch.

### Message-and-history answers (2026-09-08)

Answers to the three open message/history questions, given after trying the second iteration:

1. **Old discussions drift visibly but never misleadingly (modified option a).** A message keeps only its text and `file:line`; Neoflow does not silently re-anchor it. All discussions stay visible, but discussions from other review points are **de-emphasized** relative to the current point's. Opening an old discussion **moves the review to the tree side (review point) where it was asked** — snapshot-like, in the spirit of the product's existing saved Review snapshots (WF-217–220). The historical code is viewed at that saved origin, never spliced into the current diff. This preserves the earlier accepted rule's intent (a committed discussion never silently moves) without sending quoted content for current-code messages. The first written implication here — that every message origin needs a saved basis — was **corrected by the user** in "Basis sharing and the change-driven tree" below: not every message needs a saved basis.
2. **Change requests stay recorded messages; applying is parked.** The user is tentatively interested in being able to **apply some tree leaf** but explicitly undecided ("maybe … I don't know"). This stays parked as the separately-designed explicit **apply-selected-changes** action already reserved in the accepted direction: it must show proposed changes and conflicts first, preserve newer work, and never mean an implicit rollback; executor and conflict behavior are undecided. No prototype or production commitment is authorized by the tentative interest.
3. **Past-code messages include exact historical material, now backed by origin navigation.** Because opening a discussion lands on its saved review point, the earlier accepted rule stands for the past-code case only: a message about a past point carries the exact historical lines, clearly labelled with their origin, since a current path cannot stand in for past code. Current-code messages stay minimal (text + `file:line`).

With these answers, the message/history semantics are settled enough to begin contract reconciliation. Still open: history/capture coverage, the apply-leaf design, and real branching/round coverage.

### Basis sharing and the change-driven tree (2026-09-08)

The user corrected the "every message needs a saved basis" implication and clarified the tree model:

- **Only messages not attached to the current changes need a saved basis.** Messages about the current working diff attach to the live current basis and accept visible drift (the modified option a above). Messages asked at a past point are already covered: that point *is* a saved basis.
- **Bases are shared by conversation without change.** If the user keeps messaging and the answers do not require a change, those messages all attach to the **same basis**. A message does not create history by itself.
- **A change means a new branch in the tree.** When a change happens, the resulting state becomes a new node (a branch) in the review tree; subsequent messages attach to that new node until the next change. The sketch's "rounds" should be understood this way: tree nodes are change-created states, not arbitrary AI batches, and pure discussion accumulates on the node it was asked at.

Still open and now sharper: **what exactly counts as a change that forks a node** — settled below — and who records it; the tentative apply-a-leaf idea from above would interact with this tree (applying a leaf = adopting that node's state) and stays parked with it.

### Fork semantics settled (2026-09-08)

The user agreed with the recommended reading of the change-driven tree:

- **Confirmed change events fork nodes; edits never do.** A node is created when a unit of work completes — e.g., the harness finishes a requested change — or when the user explicitly takes a snapshot/commit point. Typing, saving, and ordinary file churn stay on the same basis and never fork.
- **Harness-completed change units fork automatically**; manual forking is explicit. Nodes therefore mean real change events, not observed diffs or keystrokes.
- This keeps the earlier "changes observed afterwards" language honest: observed edits without a completed unit (or explicit user fork) remain on the current basis, and authorship claims stay out of Neoflow's records.

With this, the message/history/tree semantics are settled. Remaining open items are narrow: capture retention details, the parked apply-a-leaf design, and production capture mechanics — planning work, not blockers to contract reconciliation. The proposed child map below records the split; children are only created after the user confirms it.

### Proposed child map (2026-09-08, draft — not yet confirmed or created)

The original WF-221–224 scope (frozen supporting-context packages, manifests/windows, disclosure deltas, context-budget evidence) is largely superseded by the validated diff-first direction. Proposed focused children (next free IDs from WF-226):

- **Child 1 — Message record model and change-driven tree** (Reviewing + Workspace records): discussions as one-type messages attached to a basis node; nodes fork only on confirmed change events or explicit user forks; basis sharing without change; unchanged files and clean checkouts reviewable (`no-current-changes` extension); jump-to-origin with de-emphasized other-point messages; origin bases reuse/mirror the existing snapshot mechanism.
- **Child 2 — Diff-first Reviewing view** (app): the validated three-pane layout with product chrome — files panel with `f` Changed/All, diff versus HEAD, discussions panel with one list and detail pane, floating `/tree`-style review picker, `Question composer` with `F3` What-will-be-shared preview, keyboard model from the sketch.
- **Child 3 — Outgoing message contract** (Harness Interaction): one message type; current-code messages carry text + `file:line` (a Live Repository Reference in the accepted vocabulary); past-code messages additionally carry exact labelled historical material; exact byte/char size shown, no token estimates; Adapter remains a pure encoder; revalidate the target before commitment and fail closed on a changed basis. Surviving pieces of WF-221 (exact-bytes integrity, revalidation) fold in here; WF-222's context-budget telemetry is superseded; WF-224's matrix proof is replaced by a smaller proof for this contract.
- **WF-223 stays and is re-scoped** (per the accepted direction): the composed sensitivity/commitment assessment for the much smaller outgoing material — not a second consent mechanism.
- **Parked placeholder — apply a tree leaf**: tentative user interest only; separately designed explicit action (proposed changes/conflicts first, preserve newer work, executor undecided). Created as an open issue recording that status, with no implementation authorization.

Reconciliation work alongside child creation: amend WF-006, WF-024, WF-031, WF-021, and `CONTEXT.md` to the settled Reviewing scope without touching Planning Handoff guarantees; mark WF-221/222/224 superseded-by-map; update WF-216's child list.

**Confirmed by the user (2026-09-08): "i think it is ok."** The children were created as [WF-226](./WF-226-own-review-message-records-and-the-change-driven-tree.md), [WF-227](./WF-227-implement-the-diff-first-reviewing-view.md), [WF-228](./WF-228-define-the-outgoing-review-message-contract.md), and parked [WF-229](./WF-229-apply-a-review-tree-leaf-to-current-files.md); WF-223 was re-scoped with `blocked_by: [WF-228]`; WF-221, WF-222, and WF-224 carry superseded notes; WF-006, WF-021, WF-024, WF-031, `CONTEXT.md`, and the harness capability seam blueprint carry reconciling amendments. Implementation of any child still requires its own committed pre-implementation Resolution.

## Acceptance

- [x] Record the accepted current-repository-first experience, historical inspection/reuse, and small-message versus independent-Harness-read distinction.
- [x] Distinguish existing behavior, superseded proposals, preserved safety requirements, and unresolved implementation choices.
- [x] Capture the explicitly authorized throwaway interaction prototype outside `main`, with its question, negative human verdict, and requested direction recorded here.
- [x] Record the user's preference for the simplified diff-first interaction (sketch #2, second iteration) while keeping the remaining design questions open.
- [x] Reconcile affected product contracts and map focused implementation children without silently broadening unrelated workflows.
- [x] Validate the concrete interaction and next implementation scope with the user before resuming WF-221 or its replacements. The interaction verdict is "preferred" and the child map is confirmed; production work still waits for each child's committed pre-implementation Resolution.

## Constraints

The primary checkout changes planning and vocabulary only. The explicitly authorized throwaway flow prototype is isolated on the branch above and must not be merged into `main`. Do not implement repository mutation, a new file server, telemetry, route selection, or a production UI prototype as a side effect. Preserve the landed WF-217–220 records and existing safety checks. Leave unrelated `package.json`, WF-205–215, and the repository-health report untouched; stage exact paths only when a documentation commit is requested or settled.
