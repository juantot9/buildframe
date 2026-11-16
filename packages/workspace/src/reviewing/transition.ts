import type { AuthoritativeState, StateRecordWrite } from '../authoritativeState.js';
import { decodeBytesBase64, encodeBytesBase64 } from '../bytesBase64.js';
import type {
  ContextItemVerdict,
  ContextRevalidateOccurrence,
  ContextSourceCandidate,
  ContextSourceCaptureItem,
  ContextSourceCaptureReadyView,
  ContextSourceOccurrenceConflict,
} from '../contextEvidence.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import {
  WorkspaceEvidence,
  reviewComparisonEndpointIdentity,
  type CurrentChangedFile,
  type CurrentChangesCaptureReadyView,
  type CurrentChangesManifestSummary,
  type ReviewComparisonCaptureReadyView,
  type ReviewComparisonDynamicInput,
  type ReviewComparisonResolutionIdentity,
  type ReviewComparisonSelection,
} from '../workspaceEvidence/index.js';
import { decideReviewContextCandidate, reviewContextEvidenceSelection } from './context.js';
import type {
  ReviewAnchorInput,
  ReviewAnchorRejectionReason,
  ReviewContextContributionScope,
  ReviewContextRule,
  ReviewQuestionAnchor,
} from './contracts.js';
import {
  buildReviewDiff,
  capturedContextScope,
  capturedReviewContextSemanticDigest,
  requiredWholeFileAnchorContent,
  reviewSnapshotContextSourceGroups,
  type PrepareReviewSnapshotRequest,
  type PreparedReviewSnapshot,
  type ProjectedReviewCapture,
} from './diff.js';
import {
  reviewContextSelectionIdentity,
  reviewSnapshotContextIdentity,
  reviewSnapshotContextManifestWindowIdentity,
  reviewingRecordIdentity,
  stableRecordIdentity,
  type ReviewContextContributionIdentity,
  type ReviewContextRuleIdentity,
  type ReviewIdentity,
  type ReviewSnapshotContextContentIdentity,
  type ReviewSnapshotContextItemIdentity,
  type ReviewSnapshotIdentity,
} from './identities.js';
import {
  ReviewingStateProblem,
  type CaptureSnapshotFailure,
  type CapturedReviewContext,
  type CapturedReviewContextContent,
  type CapturedReviewContextItem,
  type CapturedReviewSnapshot,
  type CapturedSnapshotFile,
  type ReviewContextVerification,
  type ReviewDiffWindowPayload,
  type ReviewManifestWindowPayload,
  type ReviewSnapshotCaptureRequest,
  type ReviewSnapshotContextContentPayload,
  type ReviewSnapshotContextContentReference,
  type ReviewSnapshotContextItem,
  type ReviewSnapshotContextManifestWindowPayload,
  type ReviewSnapshotContextPayload,
  type ReviewSnapshotFilePayload,
  type ReviewSnapshotPayload,
} from './internalTypes.js';
import {
  ANCHOR_LINE_MAX_BYTES,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES,
  REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
} from './limits.js';
import {
  emptyReviewContextSelection,
  parseReviewContextContribution,
  parseReviewContextSelection,
} from './parsingCommands.js';
import {
  immutableRecord,
  parseReviewManifestWindow,
  parseReviewSnapshot,
  parseReviewSnapshotContextManifestWindow,
  parseReviewSnapshotFile,
} from './parsingReview.js';
import { contentEqual, decodeReviewingBytesBase64, decodeReviewingPayload, nthLine } from './utils.js';

/**
 * Private Snapshot transition Module shared by Reviewing and the atomic Ask
 * owner. It captures and verifies evidence, then prepares one complete immutable
 * Snapshot record set without committing it independently.
 */
export class ReviewSnapshotTransition {
  readonly #evidence: WorkspaceEvidence;
  readonly #state: AuthoritativeState;

  constructor(options: { readonly evidence: WorkspaceEvidence; readonly state: AuthoritativeState }) {
    this.#evidence = options.evidence;
    this.#state = options.state;
  }

  async capture(request: ReviewSnapshotCaptureRequest): Promise<CapturedReviewSnapshot | CaptureSnapshotFailure> {
    const capture =
      request.kind === 'current-changes'
        ? await this.#evidence.read({ kind: 'workspace.current-changes.capture' })
        : await this.#evidence.read({
            kind: 'workspace.review-comparison.capture',
            selection: request.selection,
          });
    if (capture.status !== 'captured') {
      if (capture.kind === 'workspace.review-comparison.capture') {
        if (request.kind === 'comparison-refresh') {
          // Refresh intent is unresolvable rather than raced: a vanished
          // endpoint, ref, or scope membership cannot produce a successor.
          return {
            reason:
              capture.reason === 'merge-parent-ambiguous' || capture.reason === 'merge-base-ambiguous'
                ? 'comparison-ambiguous'
                : capture.reason === 'revision-not-found' ||
                    capture.reason === 'ancestry-not-found' ||
                    capture.reason === 'local-ref-not-found' ||
                    capture.reason === 'merge-base-not-found' ||
                    capture.reason === 'scope-path-not-found' ||
                    capture.reason === 'scope-ignored-unavailable'
                  ? 'comparison-not-found'
                  : 'snapshot-unverified',
          };
        }
        return {
          reason:
            capture.reason === 'merge-parent-ambiguous' || capture.reason === 'merge-base-ambiguous'
              ? 'comparison-ambiguous'
              : capture.reason === 'scope-path-not-found' || capture.reason === 'scope-ignored-unavailable'
                ? 'comparison-changed'
                : capture.reason === 'revision-not-found' ||
                    capture.reason === 'ancestry-not-found' ||
                    capture.reason === 'local-ref-not-found' ||
                    capture.reason === 'merge-base-not-found'
                  ? 'comparison-not-found'
                  : 'snapshot-unverified',
        };
      }
      return { reason: 'snapshot-unverified' };
    }
    if (
      request.kind === 'comparison' &&
      (capture.kind !== 'workspace.review-comparison.capture' ||
        reviewComparisonEndpointIdentity(capture.basis) !== request.expectedBasisObjectIdentity ||
        reviewComparisonEndpointIdentity(capture.comparedState) !== request.expectedComparedObjectIdentity ||
        capture.comparisonResolutionIdentity !== request.expectedComparisonResolutionIdentity)
    ) {
      return { reason: 'comparison-changed' };
    }

    const files = await this.capturedFiles(capture);
    return files === undefined ? { reason: 'snapshot-unverified' } : { capture, files };
  }

  /**
   * Every changed file of a capture with its captured contents, read from the
   * retained evidence; undefined once that evidence is gone.
   */
  async capturedFiles(
    capture: CapturedReviewSnapshot['capture'],
  ): Promise<readonly CapturedSnapshotFile[] | undefined> {
    const files: CapturedSnapshotFile[] = [];
    let offset = 0;
    while (offset < capture.manifest.totalFiles) {
      const window = await this.#evidence.read({
        kind: 'workspace.current-changes.manifest',
        evidenceIdentity: capture.evidenceIdentity,
        offset,
        limit: capture.limits.maxManifestWindowFiles,
      });
      if (window.status !== 'available' || window.files.length === 0) return undefined;
      for (const file of window.files) {
        const oldContent =
          file.oldSide?.contentAvailability === 'captured' ? await this.#readContent(capture, file, 'old') : undefined;
        const newContent =
          file.newSide?.contentAvailability === 'captured' ? await this.#readContent(capture, file, 'new') : undefined;
        if (
          (file.oldSide?.contentAvailability === 'captured' && oldContent === undefined) ||
          (file.newSide?.contentAvailability === 'captured' && newContent === undefined)
        ) {
          return undefined;
        }
        files.push({
          file,
          ...(oldContent === undefined ? {} : { oldContent }),
          ...(newContent === undefined ? {} : { newContent }),
        });
      }
      if (window.nextOffset === null) break;
      offset = window.nextOffset;
    }
    return files.length === capture.manifest.totalFiles ? files : undefined;
  }

  async captureContext(
    reviewIdentity: ReviewIdentity,
    expectedStateVersion: number,
  ): Promise<CapturedReviewContext | CaptureSnapshotFailure> {
    const selectionIdentity = reviewContextSelectionIdentity(reviewIdentity);
    const selectionRead = await this.#state.read({
      recordIdentities: [selectionIdentity],
      includeContent: false,
    });
    if (selectionRead.stateVersion !== expectedStateVersion) return { reason: 'state-version-mismatch' };
    if (selectionRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const selectionRecord = selectionRead.records[0];
    let selection = emptyReviewContextSelection(reviewIdentity);
    let selectionRevision = 0;
    if (selectionRecord !== undefined) {
      if (
        selectionRecord.kind !== 'review.context-selection' ||
        selectionRecord.recordClass !== 'revisioned' ||
        selectionRecord.schemaVersion !== 1 ||
        selectionRecord.recordIdentity !== selectionIdentity ||
        selectionRecord.workflowIdentity !== reviewIdentity
      ) {
        throw new ReviewingStateProblem();
      }
      selection = parseReviewContextSelection(decodeReviewingPayload(selectionRecord.payload));
      selectionRevision = selectionRecord.revision;
      if (selection.reviewIdentity !== reviewIdentity || selection.selectionIdentity !== selectionIdentity) {
        throw new ReviewingStateProblem();
      }
    }

    const includeRules = selection.rules.filter(
      (rule): rule is Extract<ReviewContextRule, { readonly action: 'include' }> => rule.action === 'include',
    );
    let locatorCapture: ContextSourceCaptureReadyView | undefined;
    if (includeRules.length > 0) {
      const captured = await this.#evidence.captureContextWithAdmission(
        {
          kind: 'workspace.context.capture',
          selections: includeRules.map(rule => ({
            ...reviewContextEvidenceSelection(rule),
            ...(rule.scope === undefined ? {} : { scope: rule.scope }),
          })),
        },
        candidate =>
          decideReviewContextCandidate(selection.rules, includeRules, candidate).status === 'included'
            ? 'included'
            : 'excluded',
      );
      if (captured.status !== 'ready') return { reason: 'snapshot-unverified' };
      locatorCapture = captured;
    }

    const contributionRules = selection.rules
      .map((rule, order) => ({ rule, order }))
      .filter(
        (
          item,
        ): item is {
          readonly rule: Extract<ReviewContextRule, { readonly action: 'contribute' }>;
          readonly order: number;
        } => item.rule.action === 'contribute',
      );
    const contributionRead = await this.#state.read({
      recordIdentities: contributionRules.map(item => item.rule.contributionIdentity),
      includeContent: false,
    });
    if (contributionRead.stateVersion !== expectedStateVersion) return { reason: 'state-version-mismatch' };
    if (contributionRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const contributions = new Map<ReviewContextContributionIdentity, CapturedReviewContextItem>();
    for (const [index, selected] of contributionRules.entries()) {
      const record = contributionRead.records[index];
      if (
        record === undefined ||
        record.kind !== 'review.context-contribution' ||
        record.recordClass !== 'immutable' ||
        record.schemaVersion !== 1 ||
        record.recordIdentity !== selected.rule.contributionIdentity ||
        record.workflowIdentity !== reviewIdentity
      ) {
        throw new ReviewingStateProblem();
      }
      const contribution = parseReviewContextContribution(decodeReviewingPayload(record.payload));
      if (
        contribution.reviewIdentity !== reviewIdentity ||
        contribution.contributionIdentity !== selected.rule.contributionIdentity ||
        (contribution.content.status === 'available'
          ? record.content.length !== 1 ||
            record.content[0]?.role !== 'content' ||
            record.content[0].digest !== contribution.content.sha256
          : record.content.length !== 0)
      ) {
        throw new ReviewingStateProblem();
      }
      const bytes =
        contribution.content.status === 'available'
          ? await this.#readStateContent(
              expectedStateVersion,
              contribution.contributionIdentity,
              contribution.content.byteLength,
              contribution.content.sha256,
            )
          : undefined;
      if (contribution.content.status === 'available' && bytes === undefined) {
        throw new ReviewingStateProblem();
      }
      contributions.set(contribution.contributionIdentity, {
        kind: 'contribution',
        ruleIdentity: selected.rule.ruleIdentity,
        contribution,
        contents: bytes === undefined ? [] : [{ scope: contribution.scope, bytes }],
      });
    }

    const pinRules = selection.rules
      .map((rule, order) => ({ rule, order }))
      .filter(
        (
          item,
        ): item is {
          readonly rule: Extract<ReviewContextRule, { readonly action: 'pin' }>;
          readonly order: number;
        } => item.rule.action === 'pin',
      );
    const pinned = new Map<ReviewContextRuleIdentity, CapturedReviewContextItem>();
    for (const selected of pinRules) {
      pinned.set(
        selected.rule.ruleIdentity,
        await this.#capturePinnedOccurrence(reviewIdentity, expectedStateVersion, selected.rule),
      );
    }

    const locatorItems = new Map<string, CapturedReviewContextItem>();
    for (const source of locatorCapture?.items ?? []) {
      const candidate: ContextSourceCandidate = {
        origins: source.origins,
        ...(source.pathBytesBase64 === undefined
          ? { absolutePath: source.absolutePath! }
          : { pathBytesBase64: source.pathBytesBase64 }),
        sourceKind: source.sourceKind,
        eligibility: source.eligibility,
        ...(source.gitMode === undefined ? {} : { gitMode: source.gitMode }),
        ...(source.sourceIdentity === undefined ? {} : { contentIdentity: source.sourceIdentity }),
        ...(source.sourceSize === undefined ? {} : { size: source.sourceSize }),
        availability: source.sourceAvailability,
        ...(source.sourceAbsenceReason === undefined ? {} : { absenceReason: source.sourceAbsenceReason }),
        sensitive: source.sensitive,
        ...(source.classification === undefined ? {} : { classification: source.classification }),
      };
      const decision = decideReviewContextCandidate(selection.rules, includeRules, candidate);
      if ((source.status === 'excluded') !== (decision.status === 'excluded')) {
        throw new ReviewingStateProblem();
      }
      const scope = capturedContextScope(source, includeRules);
      const contents: CapturedReviewContextContent[] = [];
      if (source.status === 'captured') {
        const scopes: readonly ReviewContextContributionScope[] =
          scope.kind === 'whole' ? [{ kind: 'whole' }] : scope.intervals;
        for (const segmentScope of scopes) {
          const expectedLength = segmentScope.kind === 'whole' ? source.byteLength! : segmentScope.length;
          const bytes = await this.#readEvidenceContextContent(locatorCapture!, source, segmentScope, expectedLength);
          if (bytes === undefined) return { reason: 'snapshot-unverified' };
          contents.push({ scope: segmentScope, bytes });
        }
        if (
          contents.reduce((total, content) => total + content.bytes.byteLength, 0) !== source.byteLength ||
          sha256(Buffer.concat(contents.map(content => Buffer.from(content.bytes)))) !== source.contentDigest
        ) {
          return { reason: 'snapshot-unverified' };
        }
      }
      const key =
        source.pathBytesBase64 === undefined
          ? `outside:${Buffer.from(source.absolutePath ?? '', 'utf8').toString('hex')}`
          : `workspace:${Buffer.from(source.pathBytesBase64, 'base64').toString('hex')}`;
      locatorItems.set(key, { kind: 'locator', source, decision, scope, contents });
    }

    const ordered: CapturedReviewContextItem[] = [];
    const emittedLocators = new Set<string>();
    let origin = 0;
    for (const rule of selection.rules) {
      if (rule.action === 'include') {
        for (const [key, item] of locatorItems) {
          if (item.kind === 'locator' && item.source.origins.includes(origin) && !emittedLocators.has(key)) {
            ordered.push(item);
            emittedLocators.add(key);
          }
        }
        origin += 1;
      } else if (rule.action === 'pin') {
        const item = pinned.get(rule.ruleIdentity);
        if (item === undefined) throw new ReviewingStateProblem();
        ordered.push(item);
      } else if (rule.action === 'contribute') {
        const item = contributions.get(rule.contributionIdentity);
        if (item === undefined) throw new ReviewingStateProblem();
        ordered.push(item);
      }
    }
    if (
      emittedLocators.size !== locatorItems.size ||
      contributions.size !== contributionRules.length ||
      pinned.size !== pinRules.length
    ) {
      throw new ReviewingStateProblem();
    }

    const conflicts: ContextSourceOccurrenceConflict[] = [];
    for (const selected of contributionRules) {
      const captured = contributions.get(selected.rule.contributionIdentity);
      if (
        captured?.kind !== 'contribution' ||
        captured.contribution.kind !== 'editor' ||
        captured.contribution.editor.savedState !== 'unsaved' ||
        captured.contribution.source.kind === 'editor-buffer'
      ) {
        continue;
      }
      const editorSource = captured.contribution.source;
      const locator = [...locatorItems.values()].find(item => {
        if (item.kind !== 'locator' || item.decision.status !== 'included') return false;
        return editorSource.kind === 'workspace'
          ? item.source.pathBytesBase64 === editorSource.pathBytesBase64
          : item.source.absolutePath === editorSource.absolutePath;
      });
      if (locator?.kind !== 'locator') continue;
      conflicts.push({
        kind: 'saved-versus-unsaved',
        nominalSource:
          editorSource.kind === 'workspace'
            ? { kind: 'workspace', pathBytesBase64: editorSource.pathBytesBase64 }
            : { kind: 'outside-checkout', absolutePath: editorSource.absolutePath },
        liveOccurrence: { kind: 'context-locator', origins: locator.source.origins },
        immutableOccurrence: {
          kind: 'editor-context-contribution',
          occurrenceIdentity: captured.contribution.contributionIdentity,
          ruleIdentity: selected.rule.ruleIdentity,
          sourceGroupOrder: selected.order,
          scope: captured.contribution.scope,
        },
        resolution: 'keep-distinct',
      });
    }

    const final = await this.#state.read({ recordIdentities: [], includeContent: false });
    if (final.stateVersion !== expectedStateVersion) return { reason: 'state-version-mismatch' };
    if (final.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const sourceGroups = reviewSnapshotContextSourceGroups(selection.rules);
    return {
      selectionIdentity,
      selectionRevision,
      rules: selection.rules,
      sourceGroups,
      conflicts,
      items: ordered,
      semanticDigest: capturedReviewContextSemanticDigest(
        selectionIdentity,
        selectionRevision,
        selection.rules,
        sourceGroups,
        conflicts,
        ordered,
      ),
    };
  }

  /** Copies one exact prior occurrence into this basis; the live locator stops being followed. */
  async #capturePinnedOccurrence(
    reviewIdentity: ReviewIdentity,
    expectedStateVersion: number,
    rule: Extract<ReviewContextRule, { readonly action: 'pin' }>,
  ): Promise<CapturedReviewContextItem> {
    const snapshotRead = await this.#state.read({
      recordIdentities: [rule.reviewSnapshotIdentity],
      includeContent: false,
    });
    if (snapshotRead.stateVersion !== expectedStateVersion || snapshotRead.quarantineReports.length > 0) {
      throw new ReviewingStateProblem();
    }
    const snapshotRecord = snapshotRead.records[0];
    if (
      snapshotRecord === undefined ||
      snapshotRecord.kind !== 'review.snapshot' ||
      snapshotRecord.recordClass !== 'immutable'
    ) {
      throw new ReviewingStateProblem();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    if (snapshot.reviewIdentity !== reviewIdentity || snapshot.context === undefined) {
      throw new ReviewingStateProblem();
    }
    const items = await this.#readSnapshotContextItems(snapshot);
    const item = items.find(candidate => candidate.itemIdentity === rule.itemIdentity);
    if (item === undefined || item.kind !== 'locator') throw new ReviewingStateProblem();
    const targetPath = rule.target.kind === 'workspace' ? rule.target.pathBytesBase64 : rule.target.absolutePath;
    const itemPath = item.source.pathBytesBase64 ?? item.source.absolutePath;
    if (itemPath !== targetPath) throw new ReviewingStateProblem();
    const contents: CapturedReviewContextContent[] = [];
    for (const reference of item.contents) {
      const bytes = await this.#readStateContent(
        expectedStateVersion,
        reference.contentIdentity,
        reference.byteLength,
        reference.sha256,
      );
      if (bytes === undefined) throw new ReviewingStateProblem();
      contents.push({ scope: reference.scope, bytes });
    }
    if (item.source.status === 'captured') {
      const bytes = Buffer.concat(contents.map(content => Buffer.from(content.bytes)));
      if (bytes.byteLength !== item.source.byteLength || sha256(bytes) !== item.source.contentDigest) {
        throw new ReviewingStateProblem();
      }
    }
    return {
      kind: 'locator',
      source: item.source,
      decision: {
        status: 'included',
        decidingRuleIdentity: rule.ruleIdentity,
        inclusionRuleIdentities: [rule.ruleIdentity],
      },
      scope: item.scope,
      contents,
      pinnedFrom: { reviewSnapshotIdentity: rule.reviewSnapshotIdentity, itemIdentity: rule.itemIdentity },
    };
  }

  /** Complete owner read: reconstructs and verifies every context manifest window. */
  async #readSnapshotContextItems(snapshot: ReviewSnapshotPayload): Promise<readonly ReviewSnapshotContextItem[]> {
    const context = snapshot.context;
    if (context === undefined) throw new ReviewingStateProblem();
    const windowCount = Math.ceil(context.manifest.totalItems / REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS);
    const read = await this.#state.read({
      recordIdentities: Array.from({ length: windowCount }, (_, window) =>
        reviewSnapshotContextManifestWindowIdentity(snapshot.reviewSnapshotIdentity, window),
      ),
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const windows: ReviewSnapshotContextManifestWindowPayload[] = [];
    for (const record of read.records) {
      if (
        record === undefined ||
        record.kind !== 'review.snapshot-context-manifest-window' ||
        record.recordClass !== 'immutable'
      ) {
        throw new ReviewingStateProblem();
      }
      const window = parseReviewSnapshotContextManifestWindow(decodeReviewingPayload(record.payload));
      if (
        window.reviewIdentity !== snapshot.reviewIdentity ||
        window.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
        window.contextIdentity !== context.contextIdentity
      ) {
        throw new ReviewingStateProblem();
      }
      windows.push(window);
    }
    windows.sort((left, right) => left.offset - right.offset);
    const items = windows.flatMap(window => window.items);
    if (
      items.length !== context.manifest.totalItems ||
      windows.some((window, index) => window.offset !== index * REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS) ||
      sha256(JSON.stringify(items)) !== context.manifest.digest.value
    ) {
      throw new ReviewingStateProblem();
    }
    return items;
  }

  async #readEvidenceContextContent(
    capture: ContextSourceCaptureReadyView,
    source: ContextSourceCaptureItem,
    scope: ReviewContextContributionScope,
    expectedLength: number,
  ): Promise<Uint8Array | undefined> {
    if (expectedLength === 0) return new Uint8Array();
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < expectedLength) {
      const windowLength = Math.min(REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES, expectedLength - offset);
      const view =
        source.pathBytesBase64 === undefined
          ? await this.#evidence.read({
              kind: 'workspace.context.content',
              captureIdentity: capture.captureIdentity,
              absolutePath: source.absolutePath!,
              ...(scope.kind === 'whole' ? {} : { scope }),
              offset,
              length: windowLength,
            })
          : await this.#evidence.read({
              kind: 'workspace.context.content',
              captureIdentity: capture.captureIdentity,
              pathBytesBase64: source.pathBytesBase64,
              ...(scope.kind === 'whole' ? {} : { scope }),
              offset,
              length: windowLength,
            });
      if (
        view.status !== 'available' ||
        view.captureIdentity !== capture.captureIdentity ||
        view.offset !== offset ||
        view.totalByteLength !== expectedLength ||
        view.byteLength === 0
      ) {
        return undefined;
      }
      let bytes: Buffer;
      try {
        bytes = decodeBytesBase64(view.bytesBase64);
      } catch {
        return undefined;
      }
      if (bytes.byteLength !== view.byteLength) return undefined;
      chunks.push(bytes);
      offset += bytes.byteLength;
    }
    const bytes = Buffer.concat(chunks);
    return bytes.byteLength === expectedLength ? bytes : undefined;
  }

  async #readStateContent(
    expectedStateVersion: number,
    recordIdentity_: string,
    expectedLength: number,
    expectedDigest: string,
  ): Promise<Uint8Array | undefined> {
    if (expectedLength === 0) return sha256(new Uint8Array()) === expectedDigest ? new Uint8Array() : undefined;
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < expectedLength) {
      const read = await this.#state.readContent({
        windows: [
          {
            recordIdentity: recordIdentity_,
            role: 'content',
            offset,
            length: Math.min(REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES, expectedLength - offset),
          },
        ],
      });
      if (read.stateVersion !== expectedStateVersion) return undefined;
      if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
      const window = read.windows[0];
      if (
        window === undefined ||
        window.status !== 'available' ||
        window.recordIdentity !== recordIdentity_ ||
        window.role !== 'content' ||
        window.offset !== offset ||
        window.totalByteLength !== expectedLength ||
        window.digest !== expectedDigest ||
        window.byteLength === 0 ||
        window.byteLength !== window.bytes.byteLength
      ) {
        return undefined;
      }
      chunks.push(Buffer.from(window.bytes));
      offset += window.byteLength;
    }
    const bytes = Buffer.concat(chunks);
    return bytes.byteLength === expectedLength && sha256(bytes) === expectedDigest ? bytes : undefined;
  }

  #prepareContext(
    reviewIdentity: ReviewIdentity,
    reviewSnapshotIdentity: ReviewSnapshotIdentity,
    captured: CapturedReviewContext | undefined,
  ): { readonly payload?: ReviewSnapshotContextPayload; readonly records: readonly StateRecordWrite[] } {
    if (
      captured === undefined ||
      (captured.selectionRevision === 0 && captured.rules.length === 0 && captured.items.length === 0)
    ) {
      return { records: [] };
    }
    const contextIdentity = reviewSnapshotContextIdentity(reviewSnapshotIdentity);
    const contentRecords: StateRecordWrite[] = [];
    const items: ReviewSnapshotContextItem[] = captured.items.map((item, order) => {
      const itemIdentity = reviewingRecordIdentity(
        'rsi',
        reviewSnapshotIdentity,
        String(order),
      ) as ReviewSnapshotContextItemIdentity;
      const contents = item.contents.map((content, ordinal): ReviewSnapshotContextContentReference => {
        const contentIdentity = reviewingRecordIdentity(
          'rsx',
          reviewSnapshotIdentity,
          String(order),
          String(ordinal),
        ) as ReviewSnapshotContextContentIdentity;
        const digest = sha256(content.bytes);
        const reference: ReviewSnapshotContextContentReference = {
          contentIdentity,
          ordinal,
          scope: content.scope,
          byteLength: content.bytes.byteLength,
          sha256: digest,
        };
        const payload: ReviewSnapshotContextContentPayload = {
          formatVersion: 1,
          reviewIdentity,
          reviewSnapshotIdentity,
          contextIdentity,
          itemIdentity,
          itemOrder: order,
          ...reference,
        };
        contentRecords.push(
          immutableRecord(contentIdentity, reviewIdentity, 'review.snapshot-context-content', payload, [
            { role: 'content', bytes: content.bytes },
          ]),
        );
        return reference;
      });
      return item.kind === 'locator'
        ? {
            kind: 'locator',
            itemIdentity,
            order,
            source: item.source,
            decision: item.decision,
            scope: item.scope,
            contents,
            ...(item.pinnedFrom === undefined ? {} : { pinnedFrom: item.pinnedFrom }),
          }
        : {
            kind: 'contribution',
            itemIdentity,
            order,
            ruleIdentity: item.ruleIdentity,
            contribution: item.contribution,
            contents,
          };
    });
    const manifestWindowRecords: StateRecordWrite[] = [];
    for (let offset = 0; offset < items.length; offset += REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS) {
      manifestWindowRecords.push(
        immutableRecord(
          reviewSnapshotContextManifestWindowIdentity(
            reviewSnapshotIdentity,
            offset / REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
          ),
          reviewIdentity,
          'review.snapshot-context-manifest-window',
          {
            formatVersion: 1,
            reviewIdentity,
            reviewSnapshotIdentity,
            contextIdentity,
            offset,
            items: items.slice(offset, offset + REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS),
          } satisfies ReviewSnapshotContextManifestWindowPayload,
        ),
      );
    }
    const availableItems = items.filter(item =>
      item.kind === 'locator' ? item.source.status === 'captured' : item.contribution.content.status === 'available',
    ).length;
    const excludedItems = items.filter(item => item.kind === 'locator' && item.source.status === 'excluded').length;
    const unavailableItems = items.length - availableItems - excludedItems;
    const payload: ReviewSnapshotContextPayload = {
      formatVersion: 1,
      contextIdentity,
      selectionIdentity: captured.selectionIdentity,
      selectionRevision: captured.selectionRevision,
      rules: captured.rules,
      defaultIgnoredUntracked: 'excluded',
      semanticDigest: { algorithm: 'sha256', value: captured.semanticDigest },
      manifest: {
        formatVersion: 1,
        totalItems: items.length,
        digest: { algorithm: 'sha256', value: sha256(JSON.stringify(items)) },
        windowSize: REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
      },
      sourceGroups: captured.sourceGroups,
      conflicts: captured.conflicts,
      totals: {
        availableItems,
        unavailableItems,
        excludedItems,
        sensitiveItems: items.filter(item =>
          item.kind === 'locator' ? item.source.sensitive : item.contribution.sensitivity.sensitive,
        ).length,
        contentSegments: items.reduce((total, item) => total + item.contents.length, 0),
        contentBytes: items.reduce(
          (total, item) => total + item.contents.reduce((subtotal, content) => subtotal + content.byteLength, 0),
          0,
        ),
      },
    };
    return { payload, records: [...manifestWindowRecords, ...contentRecords] };
  }

  prepare(request: PrepareReviewSnapshotRequest): PreparedReviewSnapshot {
    const { captured } = request;
    return this.#assembleSuccessor({
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      ...(request.previousReviewSnapshotIdentity === undefined
        ? {}
        : { previousReviewSnapshotIdentity: request.previousReviewSnapshotIdentity }),
      changeSetIdentity: request.changeSetIdentity,
      facts: {
        sourceEvidenceIdentity: captured.capture.evidenceIdentity,
        basis: captured.capture.basis,
        comparedState: captured.capture.comparedState,
        ...(captured.capture.kind === 'workspace.review-comparison.capture'
          ? {
              comparison: {
                selection: captured.capture.selection,
                ...(captured.capture.comparisonResolutionIdentity === undefined
                  ? {}
                  : {
                      comparisonResolutionIdentity: captured.capture.comparisonResolutionIdentity,
                      comparisonDynamicInputs: captured.capture.comparisonDynamicInputs ?? [],
                    }),
              },
            }
          : {}),
        manifest: captured.capture.manifest,
        verifiedCurrent: captured.capture.verification.state === 'current',
      },
      files: captured.files,
      ...(request.context === undefined ? {} : { context: request.context }),
      capture: captured.capture,
    });
  }

  /**
   * One context-only successor: the prior Snapshot's frozen comparison evidence
   * is reused byte-for-byte (the caller verified it current), and only the
   * context basis is re-frozen from the freshly captured context.
   */
  prepareContextSuccessor(request: {
    readonly reviewIdentity: ReviewIdentity;
    readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    readonly previousReviewSnapshotIdentity: ReviewSnapshotIdentity;
    readonly changeSetIdentity: string;
    readonly snapshot: ReviewSnapshotPayload;
    readonly files: readonly CapturedSnapshotFile[];
    readonly context: CapturedReviewContext;
  }): PreparedReviewSnapshot {
    return this.#assembleSuccessor({
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      previousReviewSnapshotIdentity: request.previousReviewSnapshotIdentity,
      changeSetIdentity: request.changeSetIdentity,
      facts: {
        ...(request.snapshot.sourceEvidenceIdentity === undefined
          ? {}
          : { sourceEvidenceIdentity: request.snapshot.sourceEvidenceIdentity }),
        basis: request.snapshot.basis,
        comparedState: request.snapshot.comparedState,
        ...(request.snapshot.comparison === undefined
          ? {}
          : {
              comparison: {
                selection: request.snapshot.comparison,
                ...(request.snapshot.comparisonResolutionIdentity === undefined
                  ? {}
                  : {
                      comparisonResolutionIdentity: request.snapshot.comparisonResolutionIdentity,
                      comparisonDynamicInputs: request.snapshot.comparisonDynamicInputs ?? [],
                    }),
              },
            }),
        manifest: request.snapshot.manifest,
        verifiedCurrent: true,
      },
      files: request.files,
      context: request.context,
    });
  }

  #assembleSuccessor(request: {
    readonly reviewIdentity: ReviewIdentity;
    readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
    readonly changeSetIdentity: string;
    readonly facts: {
      readonly sourceEvidenceIdentity?: string;
      readonly basis: ReviewSnapshotPayload['basis'];
      readonly comparedState: ReviewSnapshotPayload['comparedState'];
      readonly comparison?: {
        readonly selection: ReviewComparisonSelection;
        readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
        readonly comparisonDynamicInputs?: readonly ReviewComparisonDynamicInput[];
      };
      readonly manifest: CurrentChangesManifestSummary;
      readonly verifiedCurrent: boolean;
    };
    readonly files: readonly CapturedSnapshotFile[];
    readonly context?: CapturedReviewContext;
    readonly capture?: CapturedReviewSnapshot['capture'];
  }): PreparedReviewSnapshot {
    const { facts } = request;
    const preparedContext = this.#prepareContext(
      request.reviewIdentity,
      request.reviewSnapshotIdentity,
      request.context,
    );
    const snapshot: ReviewSnapshotPayload = {
      formatVersion: 1,
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      ...(request.previousReviewSnapshotIdentity === undefined
        ? {}
        : {
            previousReviewSnapshotIdentity: request.previousReviewSnapshotIdentity,
          }),
      changeSetIdentity: request.changeSetIdentity,
      ...(facts.sourceEvidenceIdentity === undefined ? {} : { sourceEvidenceIdentity: facts.sourceEvidenceIdentity }),
      basis: facts.basis,
      comparedState: facts.comparedState,
      ...(facts.comparison === undefined
        ? {}
        : {
            comparison: facts.comparison.selection,
            ...(facts.comparison.comparisonResolutionIdentity === undefined
              ? {}
              : {
                  comparisonResolutionIdentity: facts.comparison.comparisonResolutionIdentity,
                  comparisonDynamicInputs: facts.comparison.comparisonDynamicInputs ?? [],
                }),
          }),
      manifest: facts.manifest,
      ...(preparedContext.payload === undefined ? {} : { context: preparedContext.payload }),
      workspaceVerificationAtCapture: facts.verifiedCurrent ? 'current' : 'unverified',
    };
    const captured = { files: request.files } as const;
    const preparedFiles = captured.files.map(item => ({
      captured: item,
      diff: buildReviewDiff(request.reviewSnapshotIdentity, item),
    }));
    const fileRecords = preparedFiles.map(({ captured: item, diff }) =>
      immutableRecord(
        stableRecordIdentity('rsf', request.reviewSnapshotIdentity, item.file.fileIdentity),
        request.reviewIdentity,
        'review.snapshot-file',
        {
          formatVersion: 1,
          reviewIdentity: request.reviewIdentity,
          reviewSnapshotIdentity: request.reviewSnapshotIdentity,
          file: item.file,
          diff: diff.index,
        } satisfies ReviewSnapshotFilePayload,
        [
          ...(item.oldContent === undefined ? [] : [{ role: 'old', bytes: item.oldContent }]),
          ...(item.newContent === undefined ? [] : [{ role: 'new', bytes: item.newContent }]),
        ],
      ),
    );
    const manifestWindowRecords: StateRecordWrite[] = [];
    for (let offset = 0; offset < captured.files.length; offset += REVIEW_MANIFEST_WINDOW_FILES) {
      manifestWindowRecords.push(
        immutableRecord(
          stableRecordIdentity('rmw', request.reviewSnapshotIdentity, String(offset / REVIEW_MANIFEST_WINDOW_FILES)),
          request.reviewIdentity,
          'review.snapshot-manifest-window',
          {
            formatVersion: 1,
            reviewIdentity: request.reviewIdentity,
            reviewSnapshotIdentity: request.reviewSnapshotIdentity,
            offset,
            files: captured.files.slice(offset, offset + REVIEW_MANIFEST_WINDOW_FILES).map(item => item.file),
          } satisfies ReviewManifestWindowPayload,
        ),
      );
    }
    const diffWindowRecords: StateRecordWrite[] = [];
    for (const { captured: item, diff } of preparedFiles) {
      for (let offset = 0; offset < diff.rows.length; offset += REVIEW_DIFF_WINDOW_ROWS) {
        diffWindowRecords.push(
          immutableRecord(
            stableRecordIdentity(
              'rdw',
              request.reviewSnapshotIdentity,
              item.file.fileIdentity,
              String(offset / REVIEW_DIFF_WINDOW_ROWS),
            ),
            request.reviewIdentity,
            'review.snapshot-diff-window',
            {
              formatVersion: 1,
              reviewIdentity: request.reviewIdentity,
              reviewSnapshotIdentity: request.reviewSnapshotIdentity,
              fileIdentity: item.file.fileIdentity,
              offset,
              rows: diff.rows.slice(offset, offset + REVIEW_DIFF_WINDOW_ROWS),
            } satisfies ReviewDiffWindowPayload,
          ),
        );
      }
    }
    return {
      ...(request.capture === undefined ? {} : { capture: request.capture }),
      snapshot,
      files: request.files.map(item => item.file),
      records: [
        immutableRecord(request.reviewSnapshotIdentity, request.reviewIdentity, 'review.snapshot', snapshot),
        ...fileRecords,
        ...manifestWindowRecords,
        ...diffWindowRecords,
        ...preparedContext.records,
      ],
      preparedFiles,
    };
  }

  project(captured: CapturedReviewSnapshot, comparisonIdentity: string): ProjectedReviewCapture {
    return {
      capture: captured.capture,
      files: captured.files.map(item => item.file),
      projectedFiles: captured.files.map(item => ({
        captured: item,
        diff: buildReviewDiff(comparisonIdentity, item),
      })),
    };
  }

  /**
   * Whether a retained live capture still describes the repository: current,
   * or incomplete with nothing changed since. Recapturing unchanged incomplete
   * evidence would reproduce the same limitation at full cost.
   */
  async stillDescribes(captured: CapturedReviewSnapshot): Promise<boolean> {
    if (captured.capture.kind !== 'workspace.current-changes.capture') return await this.verify(captured);
    const verified = await this.#evidence.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.capture.evidenceIdentity,
    });
    const { state, reason } = verified.verification;
    return state === 'current' || (state === 'unverified' && reason === 'capture-incomplete');
  }

  async verify(captured: CapturedReviewSnapshot): Promise<boolean> {
    if (captured.capture.kind === 'workspace.current-changes.capture') {
      const verified = await this.#evidence.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: captured.capture.evidenceIdentity,
      });
      return verified.verification.state === 'current';
    }
    return (
      (await this.#evidence.verifyReviewComparison({
        selection: captured.capture.selection,
        basis: captured.capture.basis,
        comparedState: captured.capture.comparedState,
        ...(captured.capture.comparisonResolutionIdentity === undefined
          ? {}
          : {
              comparisonResolutionIdentity: captured.capture.comparisonResolutionIdentity,
              comparisonDynamicInputs: captured.capture.comparisonDynamicInputs ?? [],
            }),
        manifest: captured.capture.manifest,
      })) === 'current'
    );
  }

  async verifyPersistedComparison(snapshot: ReviewSnapshotPayload): Promise<'current' | 'stale' | 'unverified'> {
    if (snapshot.comparison === undefined) {
      throw new ReviewingStateProblem();
    }
    return await this.#evidence.verifyReviewComparison({
      selection: snapshot.comparison,
      basis: snapshot.basis,
      comparedState: snapshot.comparedState,
      ...(snapshot.comparisonResolutionIdentity === undefined
        ? {}
        : {
            comparisonResolutionIdentity: snapshot.comparisonResolutionIdentity,
            comparisonDynamicInputs: snapshot.comparisonDynamicInputs ?? [],
          }),
      manifest: snapshot.manifest,
    });
  }

  /**
   * One owner-local context verdict: `stale` derives only from locator-occurrence
   * movement or selection movement over membership-complete revalidation;
   * contributions and pinned occurrences never stale; anything incompletely or
   * unstably observed is `unverified`, never a silent `stale`.
   */
  async verifyPersistedContext(snapshot: ReviewSnapshotPayload): Promise<ReviewContextVerification> {
    const start = await this.#state.read({ recordIdentities: [], includeContent: false });
    if (start.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const stateVersion = start.stateVersion;
    const selectionIdentity = reviewContextSelectionIdentity(snapshot.reviewIdentity);
    const selectionRead = await this.#state.read({
      recordIdentities: [selectionIdentity],
      includeContent: false,
    });
    if (selectionRead.stateVersion !== stateVersion)
      return { verdict: 'unverified', selectionChanged: false, verdicts: [] };
    if (selectionRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const selectionRecord = selectionRead.records[0];
    let selection = emptyReviewContextSelection(snapshot.reviewIdentity);
    let selectionRevision = 0;
    if (selectionRecord !== undefined) {
      if (
        selectionRecord.kind !== 'review.context-selection' ||
        selectionRecord.recordClass !== 'revisioned' ||
        selectionRecord.schemaVersion !== 1 ||
        selectionRecord.recordIdentity !== selectionIdentity ||
        selectionRecord.workflowIdentity !== snapshot.reviewIdentity
      ) {
        throw new ReviewingStateProblem();
      }
      selection = parseReviewContextSelection(decodeReviewingPayload(selectionRecord.payload));
      selectionRevision = selectionRecord.revision;
      if (selection.reviewIdentity !== snapshot.reviewIdentity || selection.selectionIdentity !== selectionIdentity) {
        throw new ReviewingStateProblem();
      }
    }
    const selectionChanged =
      snapshot.context === undefined
        ? selectionRevision !== 0 || selection.rules.length > 0
        : snapshot.context.selectionRevision !== selectionRevision ||
          snapshot.context.selectionIdentity !== selectionIdentity ||
          JSON.stringify(snapshot.context.rules) !== JSON.stringify(selection.rules);

    // Historical comparison rules: witnesses come from the frozen basis so the
    // verdict describes the Snapshot's own occurrences, never the live selection.
    // A Snapshot without a context basis has no occurrences to revalidate; its
    // truth is the selection-movement fact alone.
    const basisRules = snapshot.context?.rules ?? [];
    const includeRules = basisRules.filter(
      (rule): rule is Extract<ReviewContextRule, { readonly action: 'include' }> => rule.action === 'include',
    );
    const witnesses: ContextRevalidateOccurrence[] = [];
    if (snapshot.context !== undefined) {
      const items = await this.#readSnapshotContextItems(snapshot);
      for (const item of items) {
        if (item.kind !== 'locator' || item.decision.status === 'excluded' || item.pinnedFrom !== undefined) continue;
        witnesses.push({
          ...(item.source.pathBytesBase64 === undefined
            ? { absolutePath: item.source.absolutePath! }
            : { pathBytesBase64: item.source.pathBytesBase64 }),
          status: item.source.status,
          whole: item.scope.kind === 'whole',
          intervals: item.scope.kind === 'bytes' ? item.scope.intervals : [],
          ...(item.source.contentDigest === undefined ? {} : { contentDigest: item.source.contentDigest }),
          sourceKind: item.source.sourceKind,
          ...(item.source.gitMode === undefined ? {} : { gitMode: item.source.gitMode }),
          ...(item.source.sourceSize === undefined ? {} : { sourceSize: item.source.sourceSize }),
        });
      }
    }
    let verdicts: ContextItemVerdict[] = [];
    if (includeRules.length > 0) {
      const revalidated = await this.#evidence.revalidateContextWithAdmission(
        {
          kind: 'workspace.context.revalidate',
          selections: includeRules.map(rule => ({
            ...reviewContextEvidenceSelection(rule),
            ...(rule.scope === undefined ? {} : { scope: rule.scope }),
          })),
          occurrences: witnesses,
        },
        candidate =>
          decideReviewContextCandidate(basisRules, includeRules, candidate).status === 'included'
            ? 'included'
            : 'excluded',
      );
      if (revalidated.status !== 'settled') {
        return { verdict: 'unverified', selectionChanged, verdicts: [] };
      }
      verdicts = [...revalidated.verdicts];
    }
    const final = await this.#state.read({ recordIdentities: [], includeContent: false });
    if (final.stateVersion !== stateVersion) return { verdict: 'unverified', selectionChanged, verdicts: [] };
    if (final.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const contextStale = selectionChanged || verdicts.some(verdict => verdict.currency !== 'current');
    return { verdict: contextStale ? 'stale' : 'current', selectionChanged, verdicts };
  }

  /**
   * Reconstructs one verified-current comparison entirely from the prior
   * Snapshot's own immutable records: the Change Set evidence is reused
   * byte-for-byte without re-reading the checkout or the Git object store.
   */
  async reconstructComparisonFiles(snapshot: ReviewSnapshotPayload): Promise<readonly CapturedSnapshotFile[]> {
    const files = [...(await this.comparisonFileList(snapshot))];
    const fileRead = await this.#state.read({
      recordIdentities: files.map(item =>
        stableRecordIdentity('rsf', snapshot.reviewSnapshotIdentity, item.file.fileIdentity),
      ),
      includeContent: true,
    });
    if (fileRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const byIdentity = new Map(
      fileRead.records
        .filter((record): record is NonNullable<typeof record> => record !== undefined)
        .map(record => [record.recordIdentity, record] as const),
    );
    for (const [index, item] of files.entries()) {
      const record = byIdentity.get(
        stableRecordIdentity('rsf', snapshot.reviewSnapshotIdentity, item.file.fileIdentity),
      );
      if (record === undefined || record.kind !== 'review.snapshot-file' || record.recordClass !== 'immutable') {
        throw new ReviewingStateProblem();
      }
      const payload = parseReviewSnapshotFile(decodeReviewingPayload(record.payload));
      if (
        payload.reviewIdentity !== snapshot.reviewIdentity ||
        payload.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
        !contentEqual(payload.file, item.file)
      ) {
        throw new ReviewingStateProblem();
      }
      let oldContent: Buffer | undefined;
      let newContent: Buffer | undefined;
      for (const side of ['old', 'new'] as const) {
        const fileSide = side === 'old' ? item.file.oldSide : item.file.newSide;
        if (fileSide?.contentAvailability !== 'captured' || fileSide.contentIdentity === undefined) continue;
        const content = record.content.find(candidate => candidate.role === side);
        if (content === undefined || content.digest !== fileSide.contentIdentity.value || content.bytes === undefined) {
          throw new ReviewingStateProblem();
        }
        if (side === 'old') oldContent = Buffer.from(content.bytes);
        else newContent = Buffer.from(content.bytes);
      }
      files[index] = {
        file: item.file,
        ...(oldContent === undefined ? {} : { oldContent }),
        ...(newContent === undefined ? {} : { newContent }),
      };
    }
    return files;
  }

  /** The Snapshot's changed files from its manifest alone, without their contents. */
  async comparisonFileList(snapshot: ReviewSnapshotPayload): Promise<readonly CapturedSnapshotFile[]> {
    const files: CapturedSnapshotFile[] = [];
    let offset = 0;
    while (offset < snapshot.manifest.totalFiles) {
      const read = await this.#state.read({
        recordIdentities: [
          stableRecordIdentity('rmw', snapshot.reviewSnapshotIdentity, String(offset / REVIEW_MANIFEST_WINDOW_FILES)),
        ],
        includeContent: false,
      });
      if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
      const record = read.records[0];
      if (
        record === undefined ||
        record.kind !== 'review.snapshot-manifest-window' ||
        record.recordClass !== 'immutable'
      ) {
        throw new ReviewingStateProblem();
      }
      const window = parseReviewManifestWindow(decodeReviewingPayload(record.payload));
      if (
        window.reviewIdentity !== snapshot.reviewIdentity ||
        window.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
        window.offset !== offset
      ) {
        throw new ReviewingStateProblem();
      }
      files.push(...window.files.map(file => ({ file })));
      offset += window.files.length;
    }
    if (files.length !== snapshot.manifest.totalFiles) throw new ReviewingStateProblem();
    return files;
  }

  resolveAnchor(
    prepared: PreparedReviewSnapshot,
    input: ReviewAnchorInput,
  ): ReviewQuestionAnchor | ReviewAnchorRejectionReason {
    const fileAbsolute = prepared.files.findIndex(file => file.fileIdentity === input.fileIdentity);
    if (fileAbsolute < 0) return 'anchor-file-not-found';
    const preparedFile = prepared.preparedFiles[fileAbsolute];
    if (preparedFile === undefined) return 'anchor-file-not-found';
    const side = input.side === 'old' ? preparedFile.captured.file.oldSide : preparedFile.captured.file.newSide;
    if (side === undefined) return 'anchor-side-not-present';
    const bytes = input.side === 'old' ? preparedFile.captured.oldContent : preparedFile.captured.newContent;
    if (input.kind === 'review.whole-file') {
      if (input.fileAbsolute !== undefined && input.fileAbsolute !== fileAbsolute) {
        return 'anchor-file-not-found';
      }
      return deepFreeze({
        kind: 'review.whole-file',
        reviewSnapshotIdentity: prepared.snapshot.reviewSnapshotIdentity,
        fileIdentity: input.fileIdentity,
        side: input.side,
        scope: 'file',
        ...(input.fileAbsolute === undefined ? {} : { fileAbsolute: input.fileAbsolute }),
        content: requiredWholeFileAnchorContent(side, bytes),
      });
    }
    if (input.fileAbsolute !== undefined && input.fileAbsolute !== fileAbsolute) {
      return 'anchor-file-not-found';
    }
    let rowCoordinates:
      | {
          readonly rowIdentity: string;
          readonly rowAbsolute: number;
        }
      | undefined;
    if (input.rowIdentity !== undefined && input.rowAbsolute !== undefined) {
      const row = preparedFile.diff.rows[input.rowAbsolute];
      if (row === undefined || (input.side === 'old' ? row.oldLine : row.newLine) !== input.line) {
        return 'anchor-line-not-found';
      }
      rowCoordinates = {
        // Live row identities use their verified generation as a coordinate.
        // Persist the equivalent immutable Snapshot row identity instead.
        rowIdentity: row.rowIdentity,
        rowAbsolute: input.rowAbsolute,
      };
    }
    if (side.contentAvailability !== 'captured' || side.contentIdentity === undefined) {
      return 'anchor-content-unavailable';
    }
    if (bytes === undefined || sha256(bytes) !== side.contentIdentity.value) {
      throw new ReviewingStateProblem();
    }
    const line = nthLine(bytes, input.line);
    if (line === undefined) return 'anchor-line-not-found';
    if (line.bytes.byteLength > ANCHOR_LINE_MAX_BYTES) {
      return 'anchor-line-too-large';
    }
    return deepFreeze({
      kind: 'review.diff-line',
      reviewSnapshotIdentity: prepared.snapshot.reviewSnapshotIdentity,
      fileIdentity: input.fileIdentity,
      side: input.side,
      line: input.line,
      ...(input.fileAbsolute === undefined ? {} : { fileAbsolute: input.fileAbsolute }),
      ...(rowCoordinates ?? {}),
      byteOffset: line.offset,
      byteLength: line.bytes.byteLength,
      lineContent: {
        algorithm: 'sha256',
        value: sha256(line.bytes),
        bytesBase64: encodeBytesBase64(line.bytes),
      },
    });
  }

  async #readContent(
    capture: CurrentChangesCaptureReadyView | ReviewComparisonCaptureReadyView,
    file: CurrentChangedFile,
    side: 'old' | 'new',
  ): Promise<Uint8Array | undefined> {
    const expected = side === 'old' ? file.oldSide : file.newSide;
    if (expected === undefined || expected.byteLength === null || expected.contentIdentity === undefined) {
      return undefined;
    }
    const output = Buffer.alloc(expected.byteLength);
    let offset = 0;
    do {
      const window = await this.#evidence.read({
        kind: 'workspace.current-changes.content',
        evidenceIdentity: capture.evidenceIdentity,
        fileIdentity: file.fileIdentity,
        side,
        offset,
        length: capture.limits.maxContentWindowBytes,
      });
      if (window.status !== 'available') return undefined;
      const bytes = decodeReviewingBytesBase64(window.bytesBase64);
      if (bytes.byteLength !== window.byteLength || offset + bytes.byteLength > output.byteLength) {
        return undefined;
      }
      bytes.copy(output, offset);
      offset += bytes.byteLength;
      if (window.complete) break;
      if (bytes.byteLength === 0) return undefined;
    } while (offset <= output.byteLength);
    if (offset !== output.byteLength || sha256(output) !== expected.contentIdentity.value) {
      return undefined;
    }
    return output;
  }
}

export function capturedSnapshotMatches(snapshot: ReviewSnapshotPayload, captured: CapturedReviewSnapshot): boolean {
  const scoped =
    snapshot.comparison?.scope !== undefined && captured.capture.kind === 'workspace.review-comparison.capture';
  const basisMatches = scoped
    ? reviewComparisonEndpointIdentity(captured.capture.basis) === reviewComparisonEndpointIdentity(snapshot.basis)
    : contentEqual(captured.capture.basis, snapshot.basis);
  const comparedMatches = scoped
    ? reviewComparisonEndpointIdentity(captured.capture.comparedState) ===
      reviewComparisonEndpointIdentity(snapshot.comparedState)
    : contentEqual(captured.capture.comparedState, snapshot.comparedState);
  return (
    basisMatches &&
    comparedMatches &&
    contentEqual(captured.capture.manifest, snapshot.manifest) &&
    (captured.capture.kind !== 'workspace.review-comparison.capture' ||
      (contentEqual(captured.capture.selection, snapshot.comparison) &&
        captured.capture.comparisonResolutionIdentity === snapshot.comparisonResolutionIdentity &&
        (scoped || contentEqual(captured.capture.comparisonDynamicInputs, snapshot.comparisonDynamicInputs))))
  );
}
