# BuildFrame

BuildFrame is a workspace-centered companion that makes the workflows between developers, AI coding harnesses, and editors easier to understand and control.

## Language

**BuildFrame**:
A companion for durable, visual planning, review, annotation, and context-exchange workflows around existing AI coding tools. It is neither an AI coding agent nor a code editor.
_Avoid_: Coding agent, editor, harness replacement

**Interaction Language**:
The concise user-facing vocabulary that translates BuildFrame’s precise domain records into familiar actions, objects, and outcomes. The TUI exposes internal concept names only when a distinction changes consent, authority, recovery, or what BuildFrame can truthfully claim; exact terminology remains available in progressive detail and history.
_Avoid_: Domain model as menu labels, jargon for every transition, simplification that creates false equivalence

**User Configuration**:
The versioned, manually portable set of user preferences for presentation, layout, navigation, keybindings, and bounded Harness and Editor attachment-selection policy. It is separate from Authoritative Workflow State and contains no Workspace Identity, selected Attachment Identity, credentials, or workflow history.
_Avoid_: Workflow state, repository configuration, automatic failover rules, automatic device sync, Portable Workflow Bundle

**Truth-Critical Distinction**:
A domain distinction that must remain visible because collapsing it would change consent or permit a false conclusion. This includes approval versus implementation, discussion versus mutation authority, prepared versus started versus ended versus unresolved, enforced versus communicated constraints, current versus stale versus unverified content, recoverable versus permanent deletion, and correlated versus Manual Handoff.
_Avoid_: Simplicity through false parity, Sent as a universal state, approval presented as execution

**Workspace Identity**:
The stable local identity of one canonical workspace checkout, independent of path aliases, moves, and branch changes. Linked worktrees and separate clones have distinct identities; state moves between them only through explicit bundle import.
_Avoid_: Repository remote, canonical path, Git branch

**Workspace Writer**:
The single local BuildFrame process authorized to commit Authoritative Workflow State for one Workspace Identity. Other processes connect to it or remain read-only rather than creating competing histories.
_Avoid_: Multi-writer store, last-write-wins

**Workflow**:
A bounded developer activity with durable state and an explicit lifecycle, such as creating a plan or reviewing changes.
_Avoid_: Mode, chat

**Home**:
The workspace-level entry surface for starting a Planning or Reviewing Workflow, seeing durable conditions that need human attention, and returning to retained Workflows. It is neither history or storage nor a Harness activity dashboard.
_Avoid_: Lifecycle board, recency feed, storage browser

**Workflow Attention**:
An evidence-derived projection that a retained Workflow currently requires human judgment, recovery, or awareness of a truth-critical change. It never mutates lifecycle, invents a task, or derives urgency from recency alone.
_Avoid_: Unread notification, activity feed, every warning or active Harness turn

**Workflow Resume**:
A user-controlled, explained return to the most relevant point supported by a Workflow’s current durable semantic state, such as an exact decision, recovery need, Invocation, open Annotation, draft, or focused Artifact. Resume neither performs a lifecycle transition or external effect nor invents tasks or restores ephemeral interface or Harness state.
_Avoid_: Session replay, automatic continuation, inferred task list, UI-state restoration

**Workflow Archive**:
An organizational visibility state that removes a Workflow from ordinary continuation while preserving its complete semantic lifecycle and evidence. Unarchive restores visibility only; it never reopens, restarts, refreshes, or resumes activity.
_Avoid_: Completion, Workflow Cancellation, deletion, evidence suppression

**Workflow Cancellation**:
A durable user decision ending active work and archiving the Workflow without deleting its drafts, Artifacts, decisions, Batches, receipts, or prior Completion. It neither proves nor changes any active Invocation’s outcome, and later valid evidence remains appendable.
_Avoid_: Deletion, confirmed harness interruption, reversal of completion

**Workflow Trash**:
A recoverable holding state entered only by explicit whole-Workflow deletion. It preserves the complete record until the user explicitly restores it or empties Trash; individual referenced Artifacts are never deleted in isolation.
_Avoid_: Archive, Review Retention, cache cleanup

**Review Retention**:
The automatic atomic expiry of one entire completed or cancelled Review after its outcome is more than 30 days old and it falls outside the 20 newest past Reviews. A Review is eligible only when no retained Workflow references it and no awaiting, active, unresolved, or otherwise truth-critical external activity remains; uncertain eligibility preserves it. Expiry leaves no per-Review tombstone in Past reviews, though quiet aggregate storage status may report cleanup.
_Avoid_: Workflow Archive, Workflow Trash, cache eviction, selective Artifact or receipt deletion

**Destructive Consent Gate**:
The blocking preflight reserved for an irreversible purge such as Empty Trash. It shows the exact scope and irreversibility before one clearly labelled action, without requiring a typed phrase. Archive, Approval Withdrawal, ordinary Workflow Cancellation, Delete to Trash, and Clear Caches remain explicit but uninterrupted; cancelling while an Invocation is active instead requires a preflight because it does not stop the harness.
_Avoid_: Confirmation for recoverable actions, typed ceremony, cancellation presented as interruption

**Authoritative Workflow State**:
The single private durable source of truth for one workspace’s BuildFrame records, kept locally and independently from the repository working tree. V1 permits neither network synchronization nor a repository-local live-state mode; repository files may contain only explicit exports.
_Avoid_: `.neoflow/` working state, Git history, cloud state, harness transcript

**Durable Commit**:
The all-or-nothing establishment of one semantic workflow transition in Authoritative Workflow State before any dependent external effect. Failure leaves the prior authoritative state unchanged.
_Avoid_: Best-effort save, in-memory success

**Commitment Receipt**:
An immutable semantic audit record for one consequential commitment. It references the exact destination, workflow records, authority, selected Capability Snapshot or explicit Manual Handoff basis, consent or downgrade decision, and Durable Commit time; later local presentation, delivery, start, terminal, interruption, recovery, and repetition facts remain distinct records. Receipts reference existing sensitive content rather than duplicating it and never capture transcripts, streams, clipboard content, or tool telemetry.
_Avoid_: Surveillance log, transcript archive, settlement presented as consent or correctness

**Receipt Integrity**:
Application-level immutability of Commitment Receipts: BuildFrame permits neither editing nor selective deletion, corrections append superseding facts, and history disappears only with explicit whole-Workflow purge or eligible whole-Review expiry under Review Retention. V1 records local time and evidence provenance but claims no cryptographic signature, independent attestation, or protection from modification outside BuildFrame.
_Avoid_: Editable audit history, selective evidence cleanup, forensic tamper-proof claim

**Consent Boundary**:
The point where an explicit user action authorizes a visible destination, scope, and effect. The action itself is sufficient when those facts are unambiguous; a separate preflight is reserved for mutation authority, destructive action, Capability Downgrade, destination change, duplicate-execution risk, or comparable ambiguity.
_Avoid_: Confirmation for every action, hidden side effect, consent inferred from navigation

**Consent Scope**:
The exact action, destination, content, authority, and selected Capability Snapshot or explicit Manual Handoff basis covered by one consent decision. BuildFrame carries no standing “trust this harness” grant: a known limitation remains visible without an extra acknowledgment, while any weaker destination, route, Effect Constraint, Evidence Profile, or correlation guarantee requires a Capability Downgrade decision.
_Avoid_: Permanent trust, warning suppression, consent inherited by weaker guarantees

**Consent Validity**:
Consent remains valid while its exact content, destination, authority, selected Capability Snapshot or Manual Handoff basis, and route prerequisites remain valid; elapsed time alone does not invalidate it. Native Gate deadlines, explicit User Pull withdrawal, Attachment Identity loss, or other semantic route expiry ends the prepared action and requires a new commitment.
_Avoid_: Arbitrary confirmation timeout, stale authorization after identity loss, time passage treated as route evidence

**Local Semantic Commitment**:
A durable human workflow decision with no immediate external or destructive effect, such as Plan Approval, normal Review completion, or Approval Withdrawal. The exact decision surface and one clearly labelled action form its Consent Boundary without a separate dialog; an exceptional state such as completing with unresolved findings adds a focused preflight naming the exception.
_Avoid_: Treating approval as handoff, confirmation for every durable choice, hiding unresolved completion

**Commitment Summary**:
The compact primary presentation of a proposed commitment: action, human-readable destination label when external, concrete scope, and at most one plain-language material limitation. The limitation appears only for mutation, Manual Handoff, Capability Downgrade, unresolved activity, or comparable risk; exact disclosure and capability contracts remain immediately inspectable through progressive detail.
_Avoid_: Technical contract headings, repeated boilerplate, hiding a material limitation to save space

**Composed Commitment Gate**:
The single preflight that combines every acknowledgment required for one proposed commitment, such as mutation authority, Context Drift, missing baseline, Capability Downgrade, or unresolved activity. Its compact hierarchy leads to one accurately labelled action while recording each accepted limitation separately; a non-overridable safety condition remains a blocker rather than masquerading as another acknowledgment.
_Avoid_: Stacked dialogs, one generic warning blob, allow-anyway for a true blocker

**Commitment Blocker**:
A missing fact or unmet invariant without which BuildFrame cannot truthfully establish a commitment: failed durability, unvalidated Attachment Identity, unknown payload or authority, invalid Capability contract, stale or unverified Review source where currentness is required, unresolved approval-blocking disposition, or absent Direct or Native Gate prerequisite. Unlike a known limitation, it has no “allow anyway” path.
_Avoid_: Warning as substitute for required truth, override checkbox, treating a known limitation as unknowable

**Route Consent Point**:
The last BuildFrame-controlled commitment before a Handoff Route can produce its effect. Direct consent authorizes immediate dispatch or durable queueing toward the exact Attachment after the Durable Commit; a User Pull Preparation authorizes only the named Attachment to retrieve the exact payload; a Native Gate decision applies only to its exact Harness Offer; and Manual Handoff authorizes only revealing material to the user. Any later identity, payload, authority, or guarantee mismatch invalidates the authorization rather than inheriting it.
_Avoid_: Consent at settlement, managed setup as message consent, duplicate confirmation for a matching User Pull, authorization surviving a route mismatch

**Handoff Disclosure Preview**:
The pre-commitment account of the exact destination and material BuildFrame intends to disclose, including the message text and location, exact quoted historical material where applicable, literal Live Repository References, deliberately shared metadata, limitations, local exclusions, and differences from previously accepted sharing. It is inspectable detail behind the optional What-will-be-shared preview, not a compulsory screen or an inventory of the Harness's later tool reads.
_Avoid_: Hidden context, mandatory sharing wizard, filesystem-access guarantee, reconfirming unchanged sharing

**Handoff Disclosure Delta**:
The exact difference between proposed outgoing material and previously accepted destination-scoped sharing, preserving inspectable source, range, representation, and provenance changes. It describes what BuildFrame will disclose, not every change to current code or the contents of files the Harness may independently read later.
_Avoid_: Code-comparison baseline, item count as disclosure, inferred Harness reads, opaque expansion

**Mutation Consent Gate**:
The single batch-level preflight required before a Workflow Handoff authorizes workspace mutation. It names the exact Attachment Identity or declared Manual Handoff Destination, bounded Artifact, Anchor, file, or approved Plan scope, the Effect Constraint and its limitations, harness ownership of tools and permission policy, and the action that will begin, prepare, or manually present the mutation authority. It never multiplies into one confirmation per Annotation.
_Avoid_: Prompt wording as enforcement, blanket edit authority, confirmation per finding

**Authority Separation**:
The independence of BuildFrame’s semantic Handoff authority from a Harness’s runtime tool and permission authority. Neither substitutes for the other: BuildFrame never answers harness permission prompts, a harness permission grant never expands Handoff scope, and harness permission or execution never establishes approval, correctness, or Annotation disposition.
_Avoid_: Pre-approved harness permissions, duplicate-consent framing, harness execution as workflow authority

**As-Written Disclosure**:
The rule that material sent to a Harness goes exactly as the user wrote or selected it. BuildFrame never scans outgoing text, locations, or quoted source for secrets, never flags it as sensitive, and never asks before sending it; the user decides what to share. Private-data care still applies to what BuildFrame stores and exports locally, through the Sensitive Export Gate.
_Avoid_: Secret scanning, sensitive-disclosure warning, "send anyway", redacting or rewriting a Message

**Unsaved Workflow Edit**:
User-authored draft text retained only in memory after a Durable Commit failure. It is visibly non-authoritative and may be copied or retried, but cannot support a commitment or be promised after restart.
_Avoid_: Persisted draft, recoverable state

**Recovery Quarantine**:
Read-only isolation of the smallest corrupted workflow record while preserving its original bytes and a recovery report. Verified unaffected workflows remain usable; quarantine never silently resets or overwrites damaged evidence.
_Avoid_: Empty-state fallback, whole-workspace lockout, automatic repair

**Recovery Summary**:
A persistent compact projection of unresolved Invocations or Offer deliveries, quarantined records, stale or unverified workspace-dependent Artifacts, and other recovery needs. It blocks only unsafe commitments in affected workflows and never replays or dismisses items automatically.
_Avoid_: Startup modal, global lockout, automatic reconciliation

**Portable Workflow Bundle**:
An explicit full-fidelity point-in-time export of selected workflow records, exact Artifacts, and required source snapshots for backup or transfer. It is importable and sensitive, but is not live state, synchronization, or authoritative until deliberately imported.
_Avoid_: Shareable report, automatic workspace mirror, shared collaboration state

**Sensitive Export Gate**:
The preflight required before creating an exact portable output. It names the destination, selected Workflows, output size, and included sensitive categories such as source snapshots, unsaved captures, and raw local identifiers. A default-redacted Shareable Workflow Report needs only its visible export action; weakening redaction or copying marked-sensitive material requires a new acknowledgment scoped to that exact output.
_Avoid_: Local destination means safe, hidden raw identifiers, one acknowledgment for future exports

**Shareable Workflow Report**:
A human-readable, explicitly redacted Markdown rendering of selected workflow history. It excludes unsaved source and raw session identifiers by default and carries no import or recovery promise.
_Avoid_: Portable Workflow Bundle, authoritative backup

**Workspace Rebinding**:
The explicit import decision that binds validated workflow records to a destination Workspace Identity while preserving their original identities and provenance. Workspace-dependent Artifacts remain stale or unverified until refreshed, and historical harness activity never resumes.
_Avoid_: Automatic merge, Invocation continuation, identity rewrite

**Artifact**:
A durable, structured work product owned by a workflow, such as a Plan Revision, Source Snapshot, Inquiry Response, Implementation Baseline, Review Snapshot, or Review Result. Concrete Artifact kinds share durable identity, immutable self-contained historical content, workflow ownership, creation provenance, and stable anchorability—not one generic lifecycle. Storage may deduplicate identical content without merging Artifact identities.
_Avoid_: Message, transcript, repository-dependent reference, generic artifact lifecycle

**Workflow Record Identity**:
The stable occurrence identity of any durable workflow record, independent of its content, display label, ordinal, path, or transport identifier. Each Plan, Artifact, Annotation, Submission Batch, decision, and Invocation has its own identity.
_Avoid_: Filename, revision number, message ID

**Artifact Identity**:
The Workflow Record Identity of one Artifact occurrence. Separate creation events may produce distinct Artifacts with identical content; a content digest may verify content but never defines identity.
_Avoid_: Content hash, revision number, path

**Artifact Provenance**:
The durable observed facts surrounding an Artifact’s creation, including its workflow action, source records, and correlated Invocation where available. Provenance supports explanation without claiming semantic derivation, correctness, or harness compliance.
_Avoid_: Causal proof, transcript ownership

**Artifact Lineage**:
The chronological history of same-kind Artifacts within one workflow, used for navigation and exact historical comparison. Lineage order records occurrence, not semantic derivation or supersession; a workflow’s focused Artifact is only a cursor.
_Avoid_: Mutable latest version, replacement chain

**Artifact Lineage Comparison**:
A read-only projection between two distinct same-kind Artifacts in one Artifact Lineage. It compares their complete saved semantic payloads while keeping identity, provenance, Anchors, Annotations, confirmed Re-anchor Mappings, and Review Coverage as side-specific evidence; it never reads a live workspace or implies semantic derivation, replacement, supersession, correctness, or resolution. Current Review changes become eligible only after capture as an exact Review Snapshot in the same lineage.
_Avoid_: Live diff, cross-lineage comparison, generated judgment, version replacement

**Artifact Location**:
A stable editor-facing reference containing Artifact Identity and an optional Anchor, resolved by BuildFrame to an Artifact Buffer or exact TUI location. Persistence paths are storage details rather than Artifact locations.
_Avoid_: State file path, line number alone

**Plan**:
The stable lineage of candidate Plan Revisions owned by one Planning workflow. A Plan may have no revisions yet; its content is never mutable, and only an exact Plan Revision can be viewed, annotated, or approved.
_Avoid_: Current plan content, approved plan

**Planning Origin**:
The immutable provenance-bearing basis on which one Planning Workflow begins. It binds one user-confirmed goal to the exact Planning Context Snapshot committed before exploration or the exact Offer Association and initial Plan Revision that created the Workflow. The associated-offer form records that BuildFrame captured no pre-Offer Harness context; its goal frames the Workflow from association onward, not claiming the Harness received it or generated the Revision from it. A Workflow has one Origin; later context, Revisions, Handoffs or session changes never rewrite it.
_Avoid_: Harness-specific origin type, nullable Snapshot as provenance, inferred conversation goal, retrospective context capture

**Planning Context Snapshot**:
The immutable goal and `file:line` pointers handed to a harness when exploration starts; the harness reads the files itself, so no content is captured. It is the context-bearing form of a Planning Origin; later changes never alter it.
_Avoid_: Prompt, captured file contents, context inferred after an Offer

**Context Reuse**:
An explicit action that seeds a new Workflow’s draft context selection from an existing Planning Context Snapshot or Review’s supporting context. It never carries context forward automatically: refreshed, changed, or missing material remains visible and subject to the new Workflow’s own preview and Handoff commitment.
_Avoid_: Context template, inherited consent, automatic attachment, silent refresh

**Context Drift**:
Observable divergence between a Plan’s captured Planning Context Snapshot and the later workspace evidence it represented. It warns that a Plan Revision may no longer fit but neither mutates nor proves the revision invalid. Drift is unassessable—not absent—when an associated-offer Planning Origin has no captured pre-Offer context; later captures and workspace inspection never establish that baseline retroactively.
_Avoid_: Plan staleness, automatic invalidation, no captured context means no drift

**Plan Revision**:
An immutable candidate Plan Artifact materialized only when explicit generation or an attached Harness’s native Plan Offer satisfies its Artifact Result Contract. Revisions coexist in history rather than replacing one another; exact capture proves neither semantic completeness nor correctness.
_Avoid_: Plan response, latest message, partial output, settled run

**Submission Batch**:
A durable, immutable record of one deliberate submission decision. It preserves one exact target Artifact, one or more committed Annotations, their declared intent, and their order at commitment; it is never edited, split, merged, or assigned a mutable delivery status. Acceptance, start, and outcome belong to separate Invocations.
_Avoid_: Transport envelope, prompt, mutable queue, sent batch

**Feedback Batch**:
The Planning-specific Submission Batch created by an explicit request for revision against one Plan Revision. Its commitment or delivery does not prove the harness addressed the feedback.
_Avoid_: Prompt, comments

**Plan Approval**:
A durable user decision selecting one exact Plan Revision as ready for Implementation Handoff. It is available only after every disposition-requiring Annotation carried into that revision’s Re-review is resolved or dismissed; undispositioned or still-open feedback blocks approval. Approval does not begin or complete Planning, is not silently revoked by later Context Drift, and remains eligible after standalone Planning Completion until withdrawn or consumed by an Implementation Handoff.
_Avoid_: Completion, execution, approval with unresolved feedback

**Planning Completion**:
An immutable local human decision establishing that successful Planning has ended around one exact active Plan Approval and its Plan Revision. `Finish planning` commits it alone; `Begin implementation` commits it atomically when none already exists. It neither requires nor establishes Handoff, Archive, Harness activity or outcome, implementation, compliance, or correctness; later Reopening or Cancellation preserves it as history.
_Avoid_: Plan Approval, Workflow Archive, Harness settlement, implementation success

**Planning Reopening**:
An explicit durable decision returning a completed Planning Workflow to revision work without rewriting any prior Completion, Handoff, Artifact, or evidence. If the completed Approval remains unconsumed, Reopening includes Approval Withdrawal; inspection, a later eligible Handoff, a linked Review, or late evidence never reopens Planning automatically.
_Avoid_: Resume view, unarchive, completion deletion, automatic latest-revision focus

**Approval Withdrawal**:
A separate durable user decision ending one Plan Approval’s active eligibility before an Implementation Handoff consumes it. It never mutates or deletes the Approval, later reapproval creates a new Plan Approval identity, and withdrawal of the Approval supporting current Planning Completion includes Planning Reopening.
_Avoid_: Approval deletion, status edit, Handoff cancellation

**Implementation Handoff**:
An explicit durable commitment authorizing implementation of one approved Plan Revision through a correlated Attached Harness or declared Manual Handoff Destination, referencing and consuming the exact active Plan Approval it relies on. If Planning is not already complete, the same commitment establishes Planning Completion. If Context Drift exists or complete Implementation Baseline capture fails, the Handoff records the user’s deliberate choice to proceed with that limitation or returns to Planning. Harness receipt or settlement does not prove correct implementation.
_Avoid_: Plan Approval, completion by Harness outcome, silent limitation acceptance

**Implementation Baseline**:
A first-class immutable Artifact capturing the canonical workspace checkout immediately before an Implementation Handoff starts and linking that Handoff to its approved Plan Revision. It can bound a later comparison of workspace changes since handoff, but cannot attribute those changes exclusively to the harness. Branch or ref movement never alters the baseline, partial capture is never accepted as a baseline, and an explicitly acknowledged Handoff may proceed without one.
_Avoid_: Harness changes, hidden comparison metadata, partial baseline

**Plan-to-Review Continuity**:
The immutable cross-Workflow relationship created when a new Review starts from one exact committed Implementation Handoff. It retains that Handoff’s approved Plan Revision as inspectable supporting context, may use its Implementation Baseline as the Change Set basis, and permits Plan Anchors only as Evidence References without coupling lifecycles or claiming attribution, tasks, mappings, progress, or compliance.
_Avoid_: Plan execution tracker, implementation attribution, automatic plan compliance, completed plan item

**Code Inquiry**:
A lightweight, discussion-only workflow for navigating workspace source and submitting anchored Questions or Notes without creating a Review. It carries no mutation authority; changing to a mutation-authorizing intent requires a Review.
_Avoid_: Chat, lightweight Review, code-change request

**Source Snapshot**:
An immutable Artifact capturing the exact workspace source needed to anchor one Code Inquiry. It prevents a later file change from altering what the user asked about.
_Avoid_: Live file, Review Snapshot, attachment

**Inquiry Batch**:
The Code Inquiry-specific Submission Batch containing only Questions or Notes against one Source Snapshot.
_Avoid_: Chat prompt, Review Batch, change request

**Inquiry Response**:
An immutable Artifact containing one complete correlated answer to an exact Inquiry Batch when the Harness Capability can capture it reliably. It excludes the surrounding harness transcript and never resolves the Question automatically; settlement without a complete answer creates no response Artifact.
_Avoid_: Chat transcript, streamed text, automatic disposition

**Review**:
A durable, retained workspace for browsing repository code, comparing changes, and keeping messages and captured Harness Responses about current or deliberately selected historical source. It is not limited to changed files and requires no completion judgment; messages stay anchored to the review point where they were asked (current-diff messages accept visible drift and are viewed at their origin when opened), and starting another Review preserves the former one as Previous.
_Avoid_: Diff-only activity, saved-copy manager, task requiring completion, conversation transcript

**Repository Now**:
The ordinary Reviewing view of files as they currently exist in the canonical checkout, with changes highlighted against an explicitly selected basis. It remains useful for unchanged files and clean checkouts; changing the comparison basis neither opens a past version nor checks out different files.
_Avoid_: Latest saved Snapshot, uncommitted changes only, implicit historical checkout

**Review History**:
The secondary Reviewing view of Git commits and exact saved Review versions, with their distinct provenance and associated Questions and Responses. Inspecting, comparing, or questioning past code leaves current files untouched; applying selected past changes is a separate explicit decision, and chronology never proves Harness authorship.
_Avoid_: Automatic rollback, competing-branch manager, inferred Harness authorship, whole-repository backup

**Current Review**:
The one retained Review offered for ordinary continuation. Starting another Review atomically changes this pointer without completing, cancelling, deleting, or otherwise judging the former Current Review. Focus, selected file, and scroll remain ephemeral UI state.
_Avoid_: Active workflow lifecycle, unfinished task, newest Review inferred by timestamp

**Previous Review**:
Any retained Review that is not the Current Review. It remains inspectable with its exact Snapshot, Questions, Responses, Handoffs, and evidence, and may be revisited without becoming completed or deleted.
_Avoid_: Completed Review, cancelled Review, archive, disposable history

**Change Set**:
An explicit comparison intent naming a canonical checkout, a basis, a compared state, and optional file scope; its basis may be a Git comparison or an Implementation Baseline. It describes differences rather than the full scope of code available for Reviewing, and selecting a comparison never changes the checkout.
_Avoid_: Entire Review, live diff, smallest available diff, implicit checkout

**Live Changes**:
A non-Artifact Workspace projection resolving a current-change Change Set against the latest authoritative effective working state, including staged, unstaged, untracked, added, deleted, and otherwise identified in-scope files. It may change without recording an Artifact; durable Questions use an exact reused or successor Review Snapshot.
_Avoid_: Live Snapshot, mutable Review Snapshot, filesystem guess, harness-attributed changes

**No Current Changes**:
The observed outcome of an exact current-change inspection whose comparison contains zero changed files. It is a comparison fact, not a human judgment or a reason to prevent inspecting and questioning unchanged source.
_Avoid_: Nothing reviewable, no-findings Review, completion, cancellation

**Workspace Verification**:
The evidence state of one workspace-dependent Artifact: current when required inputs are available and match, stale when they differ, or unverified when BuildFrame cannot inspect them. Unverified is never treated as current or stale and blocks commitments that require an exact workspace.
_Avoid_: Git error means stale, assumed current

**Review Snapshot**:
An immutable capture of reviewed source, any selected Change Set comparison, and supporting material deliberately captured for that version. Its exact captured scope, provenance, unavailable-content limitations, and Anchors remain fixed as current files change; it is not the live repository view or a promise of a complete repository backup.
_Avoid_: Live diff, current files, implicit whole-repository backup, source rewritten on refresh

**Review Message**:
The one discussion message type in Reviewing: the user's text plus a `file:line` location, attached to one review basis. BuildFrame does not classify it as a question or a change request; its words and the Harness's later action express the intent, and recording or answering it never authorizes an edit. A message about a saved past point additionally carries the exact labelled historical lines when sent.
_Avoid_: Question versus change-request types, quoted current code, staged batch, chat transcript

**Review Basis**:
One node of the change-driven review tree: the live working diff, a Git commit, a saved Review point, or a change-event node. Messages attach to the basis where they were asked; opening an old message moves the review to its origin basis. The tree is navigational history, not a competing-branch manager.
_Avoid_: Snapshot per message, branch manager, arbitrary AI-round grouping

**Change Event**:
A confirmed unit of change that forks a new Review Basis: a Harness-completed requested change observed through reviewed correlation, or an explicit user fork or snapshot point. Ordinary typing, saving, and observed file churn never fork a node; consecutive messages without a change event share the same basis.
_Avoid_: Every file edit, inferred authorship, automatic snapshotting, keystroke history

**Review Batch**:
The Reviewing-specific Handoff payload kind binding one exact committed message and its destination to one review basis. It is no longer a staged user-facing batch: ordinary Ask atomically commits the exact message, this Handoff, receipt, and Invocation before dispatch, and later source changes never alter what was committed. The dispatched authority comes from the Attachment's Capability, not from the message: workspace write is the default for a direct Review Capability, and the owner may narrow an attached session to discussion-only. A write Capability communicates that the Harness may modify the workspace with its session tools and never claims BuildFrame sandboxes their effects. Historical payloads keep their original meaning.
_Avoid_: User-visible staging step, past code presented as current, mutable submission, quoted current code, message-inferred edit authority

**Review Response**:
An immutable Artifact containing one complete correlated Harness answer to an exact Review Question when the selected Capability can capture it reliably. BuildFrame displays it directly with the Question, excludes the surrounding Harness transcript, and never asks whether it resolved anything. Settlement without a complete capturable answer creates no Response.
_Avoid_: Harness transcript, lifecycle evidence, automatic disposition, answer hidden in another terminal

**Review Coverage**:
The file-level content availability and human progress recorded for one exact Review Snapshot, including viewed, unviewed, collapsed, and unrenderable states. Unchanged files may retain viewed status in a successor Snapshot, while changed files return to unviewed. Editor viewing counts only after an explicit action on the exact Snapshot file comparison; opening a working file is insufficient. Coverage is informative and never proves semantic correctness or requires a completion decision.
_Avoid_: Approval proof, silent omission, workspace-wide progress

**Anchor**:
An immutable binding to one exact Artifact and a target scope: the whole Artifact, a structural region, a bounded text or diff range, or an insertion point. It preserves selected content and structural context after successors exist; line numbers are display hints, and old-side and new-side Review locations remain distinct.
_Avoid_: Current line number, moving pointer, side-less diff location

**Evidence Reference**:
A non-authoritative pointer from an Annotation to another Artifact or location that supports the statement without expanding its target scope or mutation authority.
_Avoid_: Additional Anchor, implicit change scope

**Re-anchor Mapping**:
A human-confirmed correspondence between an Annotation’s original Anchor and a location in a successor Artifact. It supplements rather than replaces the original Anchor; suggested, ambiguous, and missing matches are not confirmed mappings.
_Avoid_: Moved Annotation, automatic resolution

**Annotation Draft**:
Mutable, local feedback with exactly one primary Anchor. It remains editable until the user deliberately commits it through the workflow’s submission action.
_Avoid_: Annotation, submitted comment

**Annotation**:
An immutable committed statement with exactly one authoritative Anchor, optional Evidence References, and membership in one immutable Submission Batch. Harness delivery, settlement, and later disposition never rewrite it.
_Avoid_: Annotation Draft, chat message, multi-anchor authority

**Annotation Intent**:
The user’s explicit declaration of an Annotation’s authority; BuildFrame never infers it from prose. Question and Note are discussion-only, and a Note is non-blocking and requires no disposition. Change Request and Concrete Replacement authorize only the workflow-specific effect within the Annotation’s anchored scope; a Concrete Replacement also carries an explicit replacement payload. Planning authority is limited to producing a successor Plan Revision. Reviewing no longer uses this taxonomy for its ordinary flow: its one message type is recorded without an intent classification, and whether the Harness may modify the workspace follows the Attachment’s Capability rather than the message text.
_Avoid_: Inferred command, harness interpretation

**Annotation Disposition**:
A durable human judgment only for an intent whose later workflow authority genuinely requires resolution, such as a Change Request evaluated during re-review. Discussion-only Questions and Notes require no disposition: their exact Responses remain visible and the developer decides whether to ask again, leave, or start another Workflow without BuildFrame soliciting a judgment. A later valid judgment may supersede current status without erasing history; harness activity can never create one.
_Avoid_: Harness outcome, Question-answer confirmation, automatic resolution, mutable Annotation

**Planning Feedback**:
The Planning-specific role of a committed Annotation together with its Re-anchor Mappings and disposition history. It does not introduce a separate identity or copy of the Annotation.
_Avoid_: Separate feedback record

**Review Finding**:
The Reviewing-specific role of a committed mutation-authorizing Annotation together with its Re-anchor Mappings and disposition history. Discussion-only Questions and their Responses remain Review discussion, not Findings. A Finding does not introduce a separate identity or copy of the Annotation.
_Avoid_: Review Question, separate finding record

**Re-review**:
The human evaluation of committed Annotations against one exact successor Artifact, using confirmed Re-anchor Mappings and explicit Annotation Dispositions. Planning Feedback and Review Findings share this semantic; generation, refresh, delivery, and harness settlement never perform it automatically.
_Avoid_: Harness verification, automatic resolution

**Workflow Handoff**:
An immutable workflow-owned, destination-scoped commitment defining exact material and authority intended for a Harness, such as starting exploration, requesting a Plan Revision, submitting a Feedback or Review Batch, beginning implementation, or continuing a Workflow in another session. A correlated Handoff targets an Attached Harness through a Handoff Route; Manual Handoff instead binds a declared destination and reveals exact material to the user. Its identity and meaning do not depend on route or presentation.
_Avoid_: Prompt string, Invocation, transport request

**Handoff Payload Contract**:
The closed versioned semantic contract for one Workflow Handoff kind. It separates authority and provenance, exact destination disclosure, and local-only evidence so routes may represent the same meaning differently without adding ambient material, inheriting authority, or silently omitting content.
_Avoid_: Prompt template, transport envelope, generic context bag, attachment list

**Handoff Route**:
The correlated initiation pattern for a Harness Capability: Direct when BuildFrame initiates immediately or from its durable Direct Delivery queue, User Pull when BuildFrame prepares and the user invokes a correlated harness action, or Native Gate when the harness offers a proposal and waits for a durable BuildFrame decision.
User Pull is retired (2026-11-12; WF-290): no command prepares, claims or observes it. State written before 0.1.0 may still hold its records; they stay readable, are not projected, and a runtime start resolves any of its Invocations still awaiting start or active as unresolved.
_Avoid_: Transport name, uncorrelated instruction

**Native Dispatch Provenance**:
The reviewed native guarantee that a Harness can distinguish one exact authorized Direct dispatch from unrelated native or local input before the Handoff's authority can be exercised. Content similarity, sender labels, shared operating-system identity, setup trust, and post-submit correlation do not establish it.
_Avoid_: Hook correlation as authority, peer message means consent, transport access means provenance

**Direct Delivery**:
The durable ordered authorization for one exact committed Direct Handoff to be dispatched to its bound Attachment. A queued Direct Delivery is not Harness activity; Workspace creates its Invocation only when it claims that Delivery for single-flight dispatch, and it never silently retargets or replays it. A route that cannot establish required Native Dispatch Provenance cannot exercise this authorization merely because it can deliver matching bytes.
_Avoid_: Queued Invocation, Adapter-owned queue, pending prompt, automatic retry

**User Pull Preparation** and **User Pull Claim** (retired route):
A one-use authorization for one Attachment Identity to retrieve one Workflow Handoff, and the Durable Commit that consumed it into an Invocation. Neither proves payload receipt or Harness activity.
_Avoid_: Queued Invocation, Sent Handoff, Harness start

**Harness Offer**:
An immutable, deadline-bound proposal occurrence initiated by an Attached Harness through a Native Gate. It preserves the exact native occurrence, Attachment and Workspace evidence, and captured proposal before Workflow association; it is not an Invocation, and matching content or destination evidence establishes neither ownership nor consent.
_Avoid_: Workflow Handoff, Plan Approval, harness turn, content-addressed proposal

**Offer Association**:
The explicit durable relationship that materializes one exact native Plan Offer capture as a Plan Revision in one new or existing Planning Workflow. When it creates the Workflow, the same Durable Commit establishes its user-confirmed goal and associated-offer Planning Origin without inventing pre-Offer context. Workspace and Attachment evidence and prior Manual Handoffs constrain or explain candidates but never establish conversation ownership; only an exact natively correlated revision after a delivered decision may retain its predecessor’s association.
_Avoid_: Active Workflow inference, content match, Manual Handoff correlation, inherited consent, retroactive exploration context

**Offer Decision**:
A durable user allow or deny decision against one exact associated Harness Offer. An allow derives authority only from its exact active Plan Approval and Implementation Handoff, while a feedback deny derives authority only from its exact Submit Feedback Batch Workflow Handoff; no later Offer inherits the decision or its consent.
_Avoid_: Plan Approval, Native Gate Refusal, gate receipt, reusable decision

**Offer Decision Delivery**:
The independent evidence of whether one exact committed Offer Decision reached its exact live Native Gate before the route deadline. Delivery proves only the gate response; proven non-delivery and unresolved delivery remain distinct, and neither redirects the decision to a later Offer.
_Avoid_: Offer Decision, Harness start, feedback addressed, implementation outcome

**Native Gate Refusal**:
A fail-closed response to one live Harness Offer when BuildFrame cannot establish a valid user Offer Decision before the route closes. It proves only that BuildFrame did not authorize that Offer through the gate and creates no Workflow association, Submit Feedback Batch Workflow Handoff, Plan Approval, or reusable deny decision.
_Avoid_: Offer Decision, user rejection, Planning Feedback

**Manual Handoff Destination**:
The destination declared for one Manual Handoff: the intended Harness, the owning Workspace Identity and canonical checkout, any user-recognizable session label, and the evidence source and verification state of those facts. A validated Attachment Identity may supply destination evidence, but no live Attached Harness is required and the record never implies that the user carried material to that destination.
_Avoid_: Clipboard as destination, guessed session identity, Attachment Identity without validation, delivery address

**Manual Handoff**:
An explicit destination-scoped, capability-honest local fallback when no correlated Harness Capability is selected. It may be the prominent action when it is the only viable option, but otherwise remains a clearly distinguished alternative. Before reveal, BuildFrame durably preserves the exact human-carriable workflow material, Manual Handoff Destination, and Commitment Receipt. Revealing or copying that material produces only local presentation evidence; Manual Handoff creates no Invocation and claims no delivery, start, execution, outcome, Effect Constraint, or correlation. Later human decisions may advance the Workflow but cannot manufacture harness evidence. Reopening or retrying presentation of the same committed material is not another Handoff; authorizing another attempt or redirecting it requires a new destination-scoped decision because external use is unknowable.
_Avoid_: Generic Continue action, hidden automatic fallback, Sent status, clipboard success as delivery, retroactive Invocation

**Harness**:
An external AI coding environment responsible for agent execution, conversations, models, tools, and their safety policy. Product workflow language names this Harness role, while a concrete Attachment destination may identify Pi, Claude Code, OpenCode, Codex, or another reviewed implementation; its execution history remains separate from BuildFrame’s workflow state.
_Avoid_: BuildFrame backend, model, one provider name as the generic workflow role

**Continue in Another Session**:
The explicit user-controlled orientation of a fresh Harness destination to one eligible Continuation Point in an existing Workflow. It commits a Continuation Brief through a discussion-only Continue Workflow Handoff while preserving the Workflow and every prior Handoff, Invocation, decision, and evidence record; a correlated route requires a distinct validated Attachment Identity, while Manual Handoff may retain an honestly unverified declared session.
_Avoid_: Session migration, conversation transfer, automatic failover, Invocation continuation, generic chat

**Continuation Point**:
The exact durable semantic position a user selects as the source for Continue in Another Session: one primary Artifact or committed milestone plus the owning Workflow’s current lifecycle, unresolved records, and relevant Harness evidence. Selecting a historical point emphasizes it without rolling back or hiding later truth-critical facts, and ephemeral Harness or interface state can never supply the point.
_Avoid_: Transcript cursor, latest message, UI checkpoint, Workflow rollback, inferred current task

**Continuation Brief**:
An immutable Artifact committed for Continue in Another Session that captures a compact source-backed Workflow goal, Continuation Point, current position, unresolved items, optional user transition note, and exact references to deliberately selected Artifacts and context captures. Its complete payload, provenance, exclusions, limitations, and destination disclosure are previewed before Handoff, and it excludes Harness transcripts, hidden conversation state, ambient context, and generated semantic summaries.
_Avoid_: Transcript summary, automatic memory, full Workflow replay, conversation export

**Continue Workflow Handoff**:
The dedicated discussion-only Workflow Handoff that carries one exact Continuation Brief to one fresh destination for orientation. It grants no mutation, Artifact-generation, Feedback, Review Batch, Approval, or implementation authority, has no Artifact Result Contract, and proves neither destination understanding nor semantic progress; every consequential next action retains its existing decision and Handoff boundary.
_Avoid_: Generic chat, inherited authority, repeated prior Handoff, implementation continuation, semantic success

**Managed Harness Session**:
An explicitly user-authorized Harness conversation that BuildFrame launches and keeps available as one exact Attachment for later Direct Handoffs, but only through a reviewed route that preserves Native Dispatch Provenance. The Harness retains its authentication, tools, and permission policy, the user may attach through its native interface, and BuildFrame never substitutes an arbitrary foreground session or a fresh conversation.
_Avoid_: Embedded agent, arbitrary session injection, implicit fallback, BuildFrame-owned model

**Managed Session Setup**:
The durable workspace-scoped choice that binds one Managed Harness Session as a destination until the user withdraws it or its exact identity is lost. Setup authorizes launch and future availability only; every disclosed Handoff retains its own Consent Boundary, and setup never makes unrelated peer traffic inherit later Handoff authority.
_Avoid_: Standing message consent, global Harness preference, conversation migration, trust-all-peers instruction

**Attached Harness**:
A validated live Harness session, either user-started or established through an explicit Managed Session Setup, that retains ownership of its conversation, authentication, tools, and permission policy while connected to BuildFrame. At most one awaiting-start or active Invocation may occupy an Attachment Identity; queued Direct Deliveries and open User Pull Preparations remain distinct durable authority.
_Avoid_: Embedded agent, transport connection as identity, concurrent Harness turns

**Attachment Candidate**:
A discovered Harness session or editor instance with enough bridge and identity evidence for BuildFrame to assess compatibility and canonical-checkout fit. Discovery alone creates no attachment, selected destination, context disclosure, or consent.
_Avoid_: Attached Harness, active Editor Companion, available capability, automatic destination

**Integration Health**:
The layered current evidence for an integration’s compatibility, bridge reachability, candidate or attachment identity, checkout match, and Handoff-specific availability. No healthy layer implies another layer is healthy or that workflow consent exists.
_Avoid_: Connected Boolean, universal readiness, attachment as consent

**Attachment Establishment**:
The identity and capability handshake that creates or revalidates an Attachment Identity using only the minimum session, checkout, availability, and correlation metadata. It discloses no workflow context, restores no prepared payload to a different identity, and resumes no Invocation; attachment itself therefore carries no workflow consent.
_Avoid_: Connection means consent, automatic context synchronization, reconnect means replay

**Harness Host Compatibility Policy**:
The reviewed Adapter-owned rule for admitting an exactly observed Harness host to one compatibility family. It distinguishes exact live-probed versions from any deliberately bounded forward-compatible lane, requires changed native prerequisites to fail closed, and excludes versions outside the policy; neither a wildcard package peer nor user configuration can strengthen it.
_Avoid_: Every admitted version was independently tested, latest means compatible, user version override

**Harness Capability**:
A reliable way an Attached Harness can fulfill one kind of Workflow Handoff, including its initiation route, observable lifecycle evidence, Effect Constraint, Interruption Route, any Artifact Result Contract, and known limitations. Capabilities are specific to the Handoff rather than broad Harness-wide booleans, and unsupported behavior remains explicit.
_Avoid_: Feature flag, supports Planning, universal harness behavior

**Capability Manifest**:
The versioned set of Handoff-specific Harness Capabilities declared for one Attached Harness by a reviewed first-party Adapter, or by an Unverified Integration as its own claim. An Adapter may narrow its reviewed Harness Host Compatibility Policy to the exactly observed host in this Manifest; BuildFrame validates that exact attachment match and the contract schema. Hosts outside the policy and malformed guarantees are unsupported, and user configuration cannot strengthen a declared guarantee.
_Avoid_: User feature flags, public plugin claim, current Availability

**Unverified Integration**:
A Harness or tool attached through the public integration contract by an Adapter BuildFrame has not reviewed. It is offered the same Handoff authority choices as a reviewed Adapter, but its Capability Manifest is its own claim, and preview, History, and doctor mark it unverified.
_Avoid_: Reviewed Adapter, trusted plugin

**Capability Snapshot**:
The immutable copy of the exact Harness Capability and contract version relied on when a Workflow Handoff or Invocation is committed. Later Adapter upgrades, reconnects, or Manifest changes never rewrite it.
_Avoid_: Current Capability Manifest, mutable feature support

**Capability Downgrade**:
A deliberate user choice to proceed with a weaker Handoff Route, Effect Constraint, Evidence Profile, destination, or correlation guarantee than originally requested. BuildFrame presents the exact loss and never performs a downgrade or Manual Handoff silently.
_Avoid_: Automatic fallback, best effort

**Evidence Profile**:
The Handoff-specific declaration of which lifecycle facts an Adapter can reliably correlate: route acceptance, harness start, normal end, failure, interruption, and reconnect reconciliation or replay. Each fact remains independent, and absent evidence is explicit.
_Avoid_: Terminal evidence flag, Harness Observability, assumed outcome

**Artifact Result Contract**:
The versioned Handoff- or Harness Offer-specific rule under which one exact correlated native value may materialize as an immutable Artifact. It fixes the accepted source occurrence and shape, lossless semantic payload, capture bounds, completeness evidence, and required provenance independently from Invocation lifecycle; satisfaction proves capture completeness under that contract, never semantic completeness, correctness, or Harness compliance.
_Avoid_: Settled run means Artifact, response scraping, partial output as result, semantic validation

**Harness Availability**:
The current evidence-based readiness of one Harness Capability on an Attached Harness: unavailable when no verified attachment is present, revalidated when the exact identity and contract have been witnessed in the current runtime generation, blocked when a known temporary condition prevents the route, or stale when a durable attachment lacks a current-generation witness. Revalidation is readiness evidence only; it proves no idle state, delivery, start, or outcome. Direct routes block when authoritative readiness is absent; User Pull may remain prepared through transient blocked or stale evidence, and a live Harness Offer establishes Native Gate readiness.
_Avoid_: Capability flag, assumed ready, connected Boolean, reconnect means replay, idle guess

**Effect Constraint**:
A Handoff-specific account of how BuildFrame’s authorized effect is conveyed: enforced when a verified mechanism constrains it within stated limits, communicated only when intent is sent without enforceable compliance, or none when no constraint can be established. Prompt wording alone is never enforcement.
_Avoid_: Read-only prompt, inferred compliance, harness safety policy

**Context Budget Evidence**:
Advisory information separating exact outgoing-message byte, character, item, and file counts from reliably reported Harness model, capacity, and usage, with their units, provenance, and freshness intact. Message size is neither a token estimate nor the total cost of subsequent Harness reads; old usage becomes unknown after compaction, model/session change, or Attachment/telemetry loss until fresh matching evidence exists.
_Avoid_: Payload token estimate, transcript-length guess, stale usage after compaction, universal percentage, automatic payload reduction

**Harness Observability**:
Optional attached-session telemetry such as text deltas, tool activity, model labels, Context Budget Evidence, and busy hints that improves situational awareness without carrying workflow authority. Its absence or interruption never establishes start, terminal outcome, semantic correctness, or Annotation disposition.
_Avoid_: Harness Capability, execution history, lifecycle proof

**Attachment Identity**:
The combination of a live harness session and canonical workspace checkout that scopes attached workflow activity. A transport reconnect retains it only when both parts are revalidated; even then, reconnect restores no missing Invocation evidence without a verified replay or reconciliation capability.
_Avoid_: Process ID, transcript path, cwd, socket connection

**Attachment Destination Label**:
The compact human-readable presentation of an Attachment Identity: harness name, stable local session label or fingerprint, canonical checkout root and repository label, and connection state. The checkout path is a locator rather than identity; current `cwd` and observed model are optional telemetry, while raw diagnostic identifiers stay hidden and are redacted from shareable reports. Exact details remain inspectable without overwhelming the commitment surface.
_Avoid_: Cwd as identity, raw identifier as primary label, model observation as destination guarantee

**Invocation Identity**:
A durable binding between an immutable workflow handoff, its attachment identity, and one specific harness turn or request. It supports duplicate detection and terminal correlation without treating conversation history as workflow state.
_Avoid_: Prompt text, message ID alone

**Harness Interaction Failure**:
A normalized failure meaning that workflows may rely on: unsupported when no Capability exists, blocked when current Availability prevents commitment, rejected when correlated evidence proves an Invocation did not start, failed when correlated evidence reports failure after start, or unresolved when the outcome cannot be determined. User Pull withdrawal, expiry, or claim refusal before an Invocation exists is Preparation disposition rather than Harness failure; Adapter-specific text remains diagnostic detail.
_Avoid_: Generic error, string matching, disconnect means failed, expired Preparation means rejected

**Invocation Status**:
BuildFrame’s conservative evidence-derived account of one Invocation: awaiting start, active, rejected, ended normally, failed, interrupted, or unresolved. A queued Direct Delivery is not yet an Invocation; User Pull begins only after atomic claim, while Native Gate implementation begins only with an exact Implementation Handoff and allow decision, and absent or lost post-acceptance correlation remains unresolved.
_Avoid_: Queued means awaiting start, Prepared means awaiting start, Done, accepted means started, idle means complete

**Interruption Route**:
The supported way to pursue interruption for one active Invocation: Direct Request from BuildFrame, User Action in the harness, or Unavailable. Pursuing any route records intent only and never changes Invocation Status without correlated Terminal Evidence.
_Avoid_: Cancel flag, assumed interruption, local cancellation

**Terminal Evidence**:
Correlated harness evidence that a specific Invocation reached a terminal outcome. Submission return, local intent, partial output, or an idle observation are not Terminal Evidence; a normal end proves settlement only, never semantic correctness, and absence of Terminal Evidence never implies success.
_Avoid_: Done flag, semantic correctness

**Explicit Resubmission**:
The only deliberate path to authorize another attempt for the same immutable Workflow Handoff after an earlier Invocation lacks a trustworthy outcome. For User Pull it creates a fresh Preparation whose claim creates the next Invocation; it warns of duplicate execution risk, names the destination Attachment Identity, and preserves both histories.
_Avoid_: Automatic retry, replay, continuation, re-preparing a proven-unclaimed Handoff

**Unresolved Activity Gate**:
The blocking preflight required before new work proceeds on an Attachment Identity whose earlier Invocation remains unresolved. Repeating the same Handoff uses Explicit Resubmission; a different Handoff instead discloses possible overlapping effects. Both name the prior Invocation, destination, last trustworthy evidence, and risk without dismissing or rewriting the unresolved history.
_Avoid_: Workspace deadlock, disconnect means failed, proceeding clears the warning

**Editor Companion**:
A persistent registered bidirectional integration that exchanges precise context, focused actions, Artifact locations, and compact status with BuildFrame. It may commit a discussion-only Code Inquiry directly when exact target, Source Snapshot, Anchor, and Attachment destination are visible and no exceptional acknowledgment is required. Manual Handoff, Capability Downgrade, identity change, unresolved activity, mutation-authorizing Batches, approvals, other handoffs, and workflow completion route to one composed gate in the TUI with an exact Editor Return Location.
_Avoid_: Editor plugin, one-shot command, BuildFrame frontend, second trust-dialog system

**Context Import**:
A limited one-shot contribution from a CLI or unregistered editor. It provides no Editor Attachment Identity, bidirectional navigation, projections, or Editor Status and never masquerades as an Editor Companion.
_Avoid_: Editor attachment, live integration

**Editor Attachment Identity**:
The combination of one live editor instance and one canonical workspace checkout that scopes bidirectional editor activity. Reconnect restores status and projections only after both parts are revalidated; changed buffers stale prior matches, and old navigation is never replayed. Changing editor instance or checkout requires reattachment.
_Avoid_: Window ID, cwd, active file, transport connection

**Editor Presence**:
Ephemeral editor state—active path, cursor location, selection bounds, and dirty status—used for navigation and compact awareness. Presence never becomes workflow context, an Artifact, or harness-visible content without an explicit user action.
_Avoid_: Context contribution, live attachment, automatic sharing

**Workflow Context Selection**:
The mutable workflow-owned curation intent assembled from Context Locators, immutable Editor Context Contributions, prior Artifacts, and explicit exclusions. Mutable locators may discover additions and changed or missing source while curation remains open, but the selection is neither immutable captured context nor permission for silent disclosure.
_Avoid_: Attachment list, live payload, Handoff consent

**Workflow Context Capture**:
An immutable provenance-bearing materialization of one selected source or bounded range for preview and snapshot commitment. Refresh creates a successor capture rather than rewriting it, while an explicitly pinned capture may preserve previously previewed content after its source changes or disappears.
_Avoid_: Live file, mutable attachment, source locator

**Context Source Eligibility**:
The independent account of whether a source may be deliberately selected, can be captured exactly, and can be represented by a proposed Handoff Route. Selection promises neither availability nor delivery; unavailable and unrepresented items remain explicit with exact reasons.
_Avoid_: Text-only eligibility, payload support means capturable, silent omission

**Context Locator**:
An explicit local path or bounded directory whose current expansion contributes to a Workflow Context Selection without itself capturing or sharing content. BuildFrame re-resolves it while curation is open and presents added, changed, or missing candidates before exact captures enter a workflow snapshot.
_Avoid_: Directory attachment, implicit workspace context

**Live Repository Reference**:
A repository file or range location deliberately named in a Review Question's outgoing material for the Harness to inspect with its own tools. It identifies live source, not captured bytes or proof that the Harness already holds them; later reads may see changed content and remain governed by the Harness's own access policy.
_Avoid_: Immutable capture, destination-native reference, filesystem permission, proof of reading

**Handoff Exclusion**:
The deliberate absence of source material from BuildFrame's outgoing Handoff, with source-identifying metadata disclosed only when separately chosen. It does not prevent the Harness from independently reading that source through its own tools and permissions.
_Avoid_: Filesystem deny rule, Harness sandbox, promise that excluded files cannot be read

**Editor Context Contribution**:
An explicit immutable capture of a selection, whole file, or supported editor-native evidence for workflow context curation. It preserves file identity, range, content, editor-buffer provenance and version, and whether content was unsaved; later buffer changes never rewrite it or send it automatically to a harness.
_Avoid_: Editor Presence, live buffer, automatic attachment

**Editor Target**:
The explicit BuildFrame-owned workflow destination for focused editor actions, such as Planning context, Review supporting context, or a Code Inquiry draft. The Editor Companion displays it and never infers it from stale TUI focus; ambiguity requires a small picker or return to the TUI.
_Avoid_: Last focused pane, implicit active workflow

**Editor Anchor Match**:
A verified correspondence between an editor selection and one exact Artifact Anchor, including canonical checkout, file identity, side, range, and captured content. Dirty, stale, or ambiguous source cannot silently become a Review Annotation Draft.
_Avoid_: Line-number match, best-effort Review anchor

**Editor Annotation Projection**:
An editor-native marker for an Annotation Anchor, never Anchor identity itself. A Draft projection may follow local edits but must be revalidated before commitment; a committed projection becomes stale rather than moving when content no longer matches.
_Avoid_: Persistent extmark identity, automatic re-anchoring

**Editor Annotation Navigation**:
An editor-native next, previous, or picker traversal of Annotation Projections, prioritizing actionable items in the current file before stable workspace order. Compact previews may expose intent, text, status, and source Artifact; stale targets open exact Artifact Buffers.
_Avoid_: Mirrored queue, approximate jump

**Artifact Buffer**:
A clearly labelled read-only editor representation of exact Artifact content used when the current working file cannot truthfully represent an Anchor. It preserves Artifact Identity and provenance; navigating to current source is a separate confirmed action.
_Avoid_: Working file, editable Artifact, approximate navigation

**Editor Navigation Request**:
An explicit acknowledged request to open an exact source location, Artifact Buffer, Annotation, or BuildFrame workflow location in the other interface. `Reveal in BuildFrame` focuses the exact Annotation within its owning workflow and Artifact. Editor Presence never triggers navigation, and attachment mismatch or stale location fails visibly rather than moving approximately.
_Avoid_: Cursor synchronization, fire-and-forget open

**Editor Return Location**:
The exact Editor Attachment, source or Artifact location, and buffer version preserved when an Editor Command opens a TUI commitment gate. Completion or cancellation offers an explicit return after revalidation and never steals focus automatically.
_Avoid_: Last cursor position, automatic focus return, approximate location

**Editor Command**:
An explicit idempotent action from one exact Editor Attachment and Editor Target, carrying stable command identity and receiving a structured applied, already-applied, rejected, or TUI-action-required acknowledgement.
_Avoid_: Fire-and-forget command, automatic duplicate retry

**Editor Status**:
A compact actionable projection of connection, Editor Target, focused Artifact, stale or Context Drift warnings, draft/open/unresolved counts, relevant Invocation state, and any commitment waiting in the TUI. It excludes transcripts, streamed text, tool activity, Artifact history, and full capability detail.
_Avoid_: Mirrored TUI, harness telemetry feed
