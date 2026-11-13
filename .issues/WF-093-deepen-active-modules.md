---
id: WF-093
title: "Deepen the active Modules"
status: closed
labels:
  - wayfinder:map
parent: WF-051
assignee: juanan
blocked_by: [WF-079]
created: 2026-08-12
---

## Destination

P16C of [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md) is complete. Every fixed active-code finding in `docs/audit/pre-p17-codebase-findings.md` is implemented through its owning Module's existing Interface, in the declared package order: Workspace, Local Runtime, Pi Adapter, Neoflow Application, then root scripts, packaging, and configuration. Every accepted or already-completed finding stays traceable, every package boundary is re-proved, and no speculative abstraction or shallow Interface is introduced.

## Authority

- P16C outcome, package order, evidence, and learning gate: [Design the solo-developer execution plan](./WF-051-design-solo-developer-execution-plan.md)
- Settled findings, ranks, coordination, and obligations: [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
- Target Module seams: [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- Verification obligations: [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Route

Work one child at a time from the dependency frontier. Split each owning package before implementation where one child could not produce focused Interface evidence in one reviewable outcome.

1. Complete the remaining Workspace `first` band, then its `normal` band, then its diagnostic-only `last` finding.
2. Re-prove the Workspace package boundary with canonical v1 verification and all four compiled risk probes.
3. Deepen Local Runtime, then re-prove its package boundary.
4. Deepen Pi Adapter, then re-prove its package boundary.
5. Deepen the Neoflow Application, then re-prove its package boundary.
6. Complete root scripts, packaging, and configuration findings and close P16C with canonical verification and all four risk probes.

The first child removes the ledger's only high risk and the two adjacent defects in the same private Git process runner. Later Workspace children are created and dependency-linked before their implementation begins; rank bands are shared across the package and ties carry no hidden order.

## Constraints

- Every production change traces to a settled `fixed` finding. Do not reopen `accepted`, `deferred`, or deletion-bound work as cleanup.
- Tests and callers cross the owning Module Interface. Internal test seams stay private and do not widen the package Interface.
- Preserve the closed Workspace Interface and current package dependency firewall. Do not add a generic validation, process, or test-support package.
- A bug regression must fail against the old implementation and assert an observable result, not a private implementation detail.
- Bounds and deadlines are explicit, settle exactly once, clean up their resources, and have edge coverage.
- Keep the unrelated local root `package.json` pnpm bump outside every P16C commit unless it receives its own explicit decision.
- Stop rather than widen a Module Interface, invent a speculative abstraction, or weaken a settled truth, durability, compatibility, or no-replay rule for convenience.

## Blocked by

- [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)

## Decisions so far

- [Harden Workspace Git process execution](./WF-094-harden-workspace-git-process-execution.md) — W-07, W-08, and W-09 are closed behind one package-private process Module: early-exit stdin failure cannot crash Neoflow, every Git process has a bounded exactly-once deadline, and failed inspection retains only an exact 64 KiB stderr prefix.
- [Resolve the Git executable and retest the Node ceiling](./WF-095-resolve-git-executable-and-retest-node-ceiling.md) — W-14 now selects one canonical absolute Git executable for every production and verification spawn; complete 114-test runs pass on Node 26.5.1, 26.6.0, and 26.7.0, so the latter two are no longer known-bad after the repair.
- [Prevent checkout-controlled Git execution](./WF-096-prevent-checkout-controlled-git-execution.md) — S-01 now prepares a provenance-isolated private Git metadata context before both Workspace Git seams: checkout-owned config, includes, hooks, worktree config, and unversioned attributes cannot select commands; operator system/global config and tracked attributes remain native, unsupported repositories fail closed, and linked-worktree Evidence is preserved without widening the Workspace Interface.
- [Bound Authoritative State requests](./WF-097-bound-authoritative-state-requests.md) — W-03 now gives every private State worker request a 30-second owner-side deadline; timeout retires and awaits the whole synchronous worker lifetime before reporting an unknown outcome, and a Workspace Interface fault scenario proves no Harness effect or replay.
- [Fix Question discussion paging](./WF-098-fix-question-discussion-paging.md) — A-01 is closed: Terminal.app's legacy Ctrl+J byte, PageUp/PageDown, and pointer controls now share the expanded card's exact size-aware page and bound, with truthful edge and resize clamping from 80x24 through the human 213x64 viewport.
- [Cover capability-shaped Workspace commands](./WF-099-cover-capability-shaped-workspace-commands.md) — X-08 and A-05's accepted-half obligation is closed: Draft revision and intent-only Harness interruption now have Workspace Interface scenarios proving exact State versions, bounded views, restart-stable recall, terminal/missing rejection, and no duplicate directive.
- [Pin durable manifest digest order](./WF-100-pin-durable-manifest-digest-order.md) — X-01 is closed: one restart-crossing Interface scenario pins the exact Review and Capability Manifest digests, while comments mark every plain-JSON producer/verifier order as durable and no serializer or migration changes stored facts.
- [Prove key-order-independent Harness replay](./WF-101-prove-key-order-independent-harness-replay.md) — X-03's Workspace durable-comparison half is closed: all three Harness commands return their exact durable results after restart from separately reordered objects, with fixed versions and no duplicate record or Adapter directive; the Pi Adapter half remains with its later package turn.
- [Durably publish the Workspace Identity registry](./WF-102-durably-publish-workspace-identity-registry.md) — W-06's Workspace half is closed: bootstrap now reports ready only after temp-file sync, registry rename/chmod, and containing-directory sync; a directory-only sync fault rejects visibly and the same identity recovers without replacement.
- [Reject oversized Review diffs before row construction](./WF-103-reject-oversized-review-diffs-before-row-build.md) — W-11 is closed: the first over-limit file returns the existing comparison limit under a 96 MiB V8 old-space ceiling before projected rows or identities are built, while the old implementation exhausts that heap.
- [Prove silent Workspace replay with an observed update](./WF-104-prove-silent-workspace-replay-with-observed-update.md) — X-04's Workspace half is closed: replay silence is bounded by an observed State-version-3 subscription round trip and exact `[0, 1, 2, 3]` sequence; both Local Runtime repairs are now closed by WF-111.
- [Unify Workspace Evidence capture retention](./WF-105-unify-workspace-evidence-capture-retention.md) — W-02 is closed: one private constant and helper now own the two-entry FIFO, while an interleaved Interface scenario proves both current-change and comparison producers evict through that shared rule.
- [Centralize canonical bytesBase64 coding](./WF-106-centralize-canonical-bytes-base64-coding.md) — W-12 is closed: one two-function Workspace-owned representation Module now serves all 24 active encode/decode operations, rejects non-canonical spellings by default, and leaves the semantic Workspace root unchanged.
- [Trim dead Authoritative State re-exports](./WF-107-trim-dead-authoritative-state-re-exports.md) — W-15 is closed: the private State forwarding Interface now contains exactly its 11 consumed protocol types, while all 33 protocol declarations, runtime JavaScript, and the package Interface remain unchanged.
- [Label Workspace Projection wait timeouts](./WF-108-label-workspace-projection-wait-timeouts.md) — X-06's Workspace diagnostic half is closed: all 11 bounded projection waits now name their condition without changing polling policy; the two Local Runtime helpers are now closed by WF-114, while consolidation stays accepted.
- [Re-prove the Workspace package boundary](./WF-109-re-prove-workspace-package-boundary.md) — the Workspace checkpoint proved zero package dependencies, its then-four deliberate subpaths, exact source and compiled value surfaces, live negative-control guards, canonical verification, and all four risk probes; WF-118 later adds and independently verifies the settled SHA-256 representation subpath.
- [Make bootstrap version types truthful](./WF-110-make-bootstrap-version-types-truthful.md) — L-04 is closed: accepted literal versions are proved once inside the parser, peer-supported rejection versions are honest numbers, and both connection callers retain only their Identity and role checks.
- [Prove Local Runtime unsubscribe acknowledgement](./WF-111-prove-local-runtime-unsubscribe-acknowledgement.md) — X-04 is closed across both packages: Local Runtime now proves exact ordered acknowledgement, tolerated retirement races, and post-acknowledgement non-delivery with positive read/result barriers and no fixed X-04 sleeps.
- [Correct unsubscribe tombstone rationale](./WF-112-correct-unsubscribe-tombstone-rationale.md) — L-01 is closed: the client now explains that queued updates precede the ordered acknowledgement and only a known retired stream is tolerated until it arrives.
- [Assemble incoming frames linearly](./WF-113-assemble-incoming-frames-linearly.md) — L-02 is closed: incoming chunks are scanned independently, unfinished fragments retain an exact bounded byte total, and a fragmented line is concatenated only once at its delimiter.
- [Label Local Runtime wait timeouts](./WF-114-label-local-runtime-wait-timeouts.md) — X-06's fixed half is fully closed: both Local Runtime poller Interfaces and all three calls now carry condition labels, with their 100-attempt / 5 ms policy unchanged and cross-package consolidation still accepted.
- [Re-prove the Local Runtime package boundary](./WF-115-re-prove-local-runtime-package-boundary.md) — the Local Runtime turn is closed: one inward Workspace dependency, three deliberate seams, exact source and compiled surfaces, private transport declarations, live negative-control guards, canonical verification, and all four risk probes re-prove the package boundary before Pi Adapter begins.
- [Contain Pi extension event failures](./WF-116-contain-pi-extension-event-failures.md) — P-01 is closed: all ten Pi registrations share one private failure-containment Interface, and the detached runtime loop receives its rejection handler at creation rather than shutdown.
- [Match Pi correlation markers by fields](./WF-117-match-pi-correlation-markers-by-fields.md) — X-03 is fully closed: the Pi Adapter compares all five correlation fields directly, accepts an exact marker regardless of key order, and still fails closed on every field mismatch.
- [Share array-form SHA-256 coding](./WF-118-share-array-form-sha256-coding.md) — W-13's digest and Pi inheritance are closed: one Workspace-owned representation seam preserves every digest byte while an array-shaped multi-part Interface excludes the silent unary substitution.
- [Re-prove the Pi Adapter package boundary](./WF-119-re-prove-pi-adapter-package-boundary.md) — the Pi Adapter turn is closed: two inward package dependencies, one default-only host extension seam, private reviewed/native internals, live dependency/export controls, clean declarations, canonical verification, and all four risk probes re-prove the package boundary before Application work begins.
- [Make launcher Node support truthful](./WF-120-make-launcher-node-support-truthful.md) — A-04 is closed: the executable refuses only below the FFI floor, runs silently in the declared range, and warns once while continuing above it, with no stale known-bad Node claim.
- [Strip controls at the Question composer seam](./WF-121-strip-controls-at-question-composer-seam.md) — S-05 is closed: one private Textarea specialization removes C0, DEL, and C1 controls after OpenTUI decoding/ANSI handling but before native insertion, preserving printable text, cursor, copy, and Ask behavior.
- [Filter bordered box titles at one seam](./WF-122-filter-bordered-box-titles-at-one-seam.md) — S-07 is closed: all five top titles and the one bottom title pass through the existing rendered-text policy after caller options, while Workspace path escaping remains complementary and load-bearing.
- [Delete the unreachable Application revise editor](./WF-123-delete-unreachable-application-revise-editor.md) — A-05's Application half is closed: the producerless effect/editor path and its impossible branches are gone, while the covered Workspace Draft-revision capability remains intact.
- [Carry fragmented SGR styles across no-color writes](./WF-124-carry-fragmented-sgr-styles-across-no-color-writes.md) — last-ranked A-02 is closed: the no-color stream retains one copied 64 KiB-bounded SGR candidate across writes while the complete-buffer filter and terminal controls remain unchanged.
- [Re-prove the Neoflow Application package boundary](./WF-125-re-prove-neoflow-application-package-boundary.md) — the Application turn is closed: three deliberate dependencies, exact root/launcher/bin surfaces, private rendering and process mechanics, live dependency/export controls, canonical verification, and all four risk probes re-prove the package boundary before root work begins.
- [Enable the dependency release cooldown](./WF-126-enable-the-dependency-release-cooldown.md) — first-ranked S-02 is closed: root configuration now owns the 24-hour pnpm cooldown while retaining all 13 reviewed Pi and OpenTUI exceptions and no redundant strictness override.
- [Enforce reviewed external dependencies](./WF-127-enforce-reviewed-external-dependencies.md) — S-03 is closed: the existing firewall now rejects unreviewed external packages by owner, source/test lane, and manifest field while retaining top-level approval for reviewed subpaths.
- [Explain short runtime fixture roots](./WF-128-explain-short-runtime-fixture-roots.md) — X-05 is closed: both short `/tmp` fixture roots now record the measured 100-byte endpoint/fallback reason, while hostile Vitest configurations confirm no worker defaults need pinning.
- [Enforce unused declaration checks](./WF-129-enforce-unused-declaration-checks.md) — the settled compiler-only posture is now enforced: both v1 unused-declaration flags gate all active source/tests after removal of the current 17 diagnostics, while legacy configuration remains unchanged.
- [Explain empty Projection actions](./WF-130-explain-empty-projection-actions.md) — the recorded Projection obligation is closed: each intentionally empty action helper now states its distinct direct-retained no-Finish or no-disposition semantic reason.
- [Make Harness command dispatch exhaustive](./WF-131-make-harness-command-dispatch-exhaustive.md) — the recorded dispatch obligation is closed: all three normalized command kinds branch explicitly, and a temporary fourth member now fails at the private `never` check instead of routing as interruption.
- [Close active Module deepening](./WF-132-close-active-module-deepening.md) — closed: all 46 classifications, every ordered child and final-gate discovery, exact source/compiled surfaces, root guards, legacy typecheck, canonical verification, and all four risks reconcile without another Interface or source change.
- [Make Local Runtime probe cleanup race-safe](./WF-133-make-local-runtime-probe-cleanup-race-safe.md) — closed: root fixture teardown uses Node's finite recursive-removal retry contract; the old zero-retry call produced `ENOTEMPTY`, while five clean-build repetitions and the final risk suite pass.
- [Converge through self-launched endpoint hardening](./WF-134-converge-through-self-launched-endpoint-hardening.md) — closed: initial insecure endpoints still fail without spawning, while only an already-launched bounded attempt retries the brief hardening window; the old predicate fails the focused regression and ten compiled launch storms converge.

## Resolution comment

P16C is complete at implementation checkpoint `d757ed9`. The 46-finding ledger remains fully decided; every fixed active-code portion and every execution obligation is traced through the P16B pull-forwards or the closed WF-094–WF-134 children. Work proceeded in the declared Workspace → Local Runtime → Pi Adapter → Application → root order, with each package's source island, declarations, manifest targets, private subpaths, dependency direction, and compiled surfaces re-proved before moving outward.

The final gate preserved exact Workspace 2 / 1 / 2 / 2 / 0, Local Runtime 3 / 4 / 2, Pi default-only, and Application 1 / 2 runtime surfaces. Root policy now enforces the 24-hour dependency cooldown with 13 reviewed exceptions, owner/lane/manifest-field dependency allowlists, and v1 unused declarations; no aggregate risk script, formatter/linter churn, compatibility path, or speculative Interface was added. Two final verification failures were not waived: WF-134 narrowed secure startup convergence and WF-133 bounded transient fixture cleanup before the checkpoint was rerun.

On Node 26.5.1 with pnpm 11.20.0, legacy typecheck passes, canonical v1 verification passes 26 files / 147 tests, all four compiled risk probes pass, independent source/compiled surface proofs pass, negative controls fail at their intended guards and are removed, and `git diff --check` passes. Accepted/deferred findings remain unchanged. LG-02 legacy work, support-manifest/release assembly, packed/human quality evidence, import, and deletion remain with P16D/P16E/P17/P18/P54; no legacy or user data was changed.

## Out of scope

- P16D legacy blocker work.
- P16E Live Changes presentation redesign and fresh UX acceptance.
- P17 legacy Review import.
