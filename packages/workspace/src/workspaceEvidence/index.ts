import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { encodeBytesBase64 } from '../bytesBase64.js';
import {
  readContextSourceCapture,
  readContextSourceContentWindow,
  readContextSourceManifest,
  readContextSourceResolution,
  readContextSourceRevalidate,
  readContextSourceVerify,
  type ContextSelectionRevalidateRequest,
  type ContextSelectionRevalidateView,
  type ContextSourceCaptureAdmission,
  type ContextSourceCaptureRequest,
  type ContextSourceCaptureView,
  type RetainedContextCapture,
} from '../contextEvidence.js';
import { GitInspectionError } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type { WorkspaceIdentity } from '../workspace.js';
import {
  captureCommitSides,
  captureLargeFilePayloads,
  captureObjectSymlinkTargets,
  captureOldSides,
  captureWorkingSides,
  capturedBytes,
  capturedContents,
  inspectabilityFingerprint,
  planCapture,
  planLargeFilePayloadCapture,
  prepareCommitDrafts,
  prepareDrafts,
  revalidateWorking,
  summaryForDrafts,
  workingEvidenceComplete,
} from './capture.js';
import {
  enumeratePairedFacts,
  freshWorkingFacts,
  inspectResolvedReviewComparison,
  preparePairedDrafts,
} from './comparisonFacts.js';
import {
  WORKING_FINGERPRINT_PATTERN,
  comparisonBasisEndpoint,
  comparisonEndpointMatchesScope,
  comparisonResolutionFields,
  endpointHasScopeWitness,
  freshPairedScopeCount,
  isRevisionComparisonEndpoint,
  noWorkingFacts,
  normalizeReviewComparisonDynamicInputs,
  pairedComparisonEndpoints,
  revisionEndpoint,
  validReviewComparisonResolution,
} from './comparisonIdentity.js';
import { streamRegularFile } from './content.js';
import {
  MEBIBYTE,
  checkedLimits,
  type CurrentChangesCaptureReadyView,
  type CurrentChangesCaptureView,
  type CurrentChangesContentRequest,
  type CurrentChangesContentView,
  type CurrentChangesManifestRequest,
  type CurrentChangesManifestView,
  type CurrentChangesVerificationView,
  type CurrentRepositoryFileContent,
  type CurrentRepositoryFiles,
  type ReviewCommitGraph,
  type ReviewComparedState,
  type ReviewComparisonBasis,
  type ReviewComparisonCaptureReadyView,
  type ReviewComparisonCaptureView,
  type ReviewComparisonInspection,
  type ReviewComparisonSelection,
  type ReviewComparisonVerificationTarget,
  type VerifyCurrentChangesEvidenceRequest,
  type WorkspaceEvidenceLimits,
  type WorkspaceEvidenceViewFor,
  type WorkspaceEvidenceViewRequest,
  type WorkspaceVerificationState,
} from './contracts.js';
import {
  commitEntriesFingerprint,
  commitObjectsAvailable,
  currentObjectsAvailable,
  enumerateCurrentRepositoryPaths,
  inspect,
} from './enumeration.js';
import { runGit, withGitInspection } from './inspection.js';
import type {
  CaptureAttemptResult,
  CapturedEvidence,
  Inspection,
  RawCommitDiffEntry,
  ResolvedReviewComparison,
  ResolvedRevisionEndpoint,
} from './internalTypes.js';
import {
  ComparisonResolutionError,
  comparisonUnavailableReason,
  inspectDynamicReferenceIdentities,
  resolveReviewComparison,
} from './resolution.js';
import {
  isPairedEndpointSelection,
  normalizeReviewComparisonSelection,
  reviewComparisonUsesExactResolution,
} from './selection.js';
import { absolutePath, validateRelativePath } from './utils.js';
import {
  COMPARED_STATE,
  basis,
  capturedKey,
  contentUnavailable,
  evidencePath,
  parseCommitGraph,
  publicFile,
  unavailableCapture,
  verification,
} from './views.js';

// One FIFO is shared by current-change and comparison captures. It must hold
// the projection's live set (MAX_LIVE_CAPTURES, two reviews) plus an in-flight
// Message commit's fresh capture, with one slot of slack for a concurrent
// comparison capture; when it does not, a projection read can evict the
// capture a commit is about to verify (WF-247).
const MAX_RETAINED_CAPTURES = 4;

// Context captures keep their own, separate two-entry bound: their readers
// verify one retained capture at a time, so the commit bound above does not
// apply to them (WF-247).
const MAX_RETAINED_CONTEXT_CAPTURES = 2;

const EVIDENCE_ID_PATTERN = /^evd_[0-9a-f-]{36}$/u;

const FILE_ID_PATTERN = /^fil_[0-9a-f]{64}$/u;

export interface WorkspaceEvidenceInternalOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly gitDirectory?: string;
  readonly limits?: Partial<WorkspaceEvidenceLimits>;
  /** Internal deterministic race seams used only by owner-local evidence tests. */
  readonly afterInitialInspection?: (attempt: number) => void | Promise<void>;
  readonly afterContentCapture?: (attempt: number) => void | Promise<void>;
  readonly afterContextContent?: (attempt: number) => void | Promise<void>;
}

/** Private Workspace Evidence Module. Callers reach it only through Workspace.read. */
export class WorkspaceEvidence {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #canonicalCheckout: string;
  readonly #gitDirectory: string;
  readonly #limits: WorkspaceEvidenceLimits;
  readonly #afterInitialInspection: ((attempt: number) => void | Promise<void>) | undefined;
  readonly #afterContentCapture: ((attempt: number) => void | Promise<void>) | undefined;
  readonly #afterContextContent: ((attempt: number) => void | Promise<void>) | undefined;
  readonly #captures = new Map<string, CapturedEvidence>();
  readonly #contextCaptures = new Map<string, RetainedContextCapture>();

  constructor(options: WorkspaceEvidenceInternalOptions) {
    this.#workspaceIdentity = options.workspaceIdentity;
    this.#canonicalCheckout = options.canonicalCheckout;
    this.#gitDirectory = options.gitDirectory ?? path.join(options.canonicalCheckout, '.git');
    this.#limits = checkedLimits(options.limits);
    this.#afterInitialInspection = options.afterInitialInspection;
    this.#afterContentCapture = options.afterContentCapture;
    this.#afterContextContent = options.afterContextContent;
  }

  async inspectReviewComparison(value: ReviewComparisonSelection): Promise<ReviewComparisonInspection> {
    const selection = normalizeReviewComparisonSelection(value);
    try {
      const result = await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
        const resolved = await resolveReviewComparison(context, selection);
        if (resolved.workingComparison !== undefined) {
          const enumeration = await enumeratePairedFacts(context, resolved, this.#limits);
          const prepared = await preparePairedDrafts(context, resolved, enumeration, this.#limits);
          const facts =
            resolved.workingComparison.kind === 'revision-to-index'
              ? noWorkingFacts()
              : await freshWorkingFacts(
                  context,
                  enumeration,
                  resolved.workingComparison.kind === 'revision-to-working-state',
                  this.#limits,
                );
          const endpoints = pairedComparisonEndpoints(resolved, enumeration, facts, prepared.scopePaths.length);
          return {
            resolved,
            basis: endpoints.basis,
            comparedState: endpoints.comparedState,
            totalFiles: prepared.drafts.length,
          };
        }
        const entries = await inspectResolvedReviewComparison(context, resolved, this.#limits);
        return {
          resolved,
          basis: comparisonBasisEndpoint(resolved),
          comparedState: revisionEndpoint(
            resolved.compared as ResolvedRevisionEndpoint,
            resolved.objectFormat,
            resolved.comparedScopeFingerprint,
          ),
          totalFiles: entries.length,
        };
      });
      const resolved = result.resolved;
      const resolution = comparisonResolutionFields(resolved, result.basis, result.comparedState);
      return deepFreeze({
        status: 'available',
        selection: resolved.selection,
        basis: result.basis,
        comparedState: result.comparedState,
        ...(resolution ?? {}),
        totalFiles: result.totalFiles,
      });
    } catch (error) {
      return deepFreeze({
        status: 'unavailable',
        selection,
        reason: comparisonUnavailableReason(error, selection),
      });
    }
  }

  async verifyReviewComparison(target: ReviewComparisonVerificationTarget): Promise<WorkspaceVerificationState> {
    const selection = normalizeReviewComparisonSelection(target.selection);
    const exactResolution = reviewComparisonUsesExactResolution(selection);
    const dynamicInputs = normalizeReviewComparisonDynamicInputs(target.comparisonDynamicInputs ?? []);
    const explicitlyScopedIgnored =
      'explicitlyScopedIgnoredUntracked' in target.comparedState &&
      target.comparedState.explicitlyScopedIgnoredUntracked !== undefined;
    const scopeAllowsIgnored = selection.scope?.entries.some(entry => entry.inclusion === 'include-ignored') ?? false;
    if (
      target.manifest.inspectabilityFingerprint !== undefined &&
      !WORKING_FINGERPRINT_PATTERN.test(target.manifest.inspectabilityFingerprint)
    ) {
      throw new TypeError('Invalid Review comparison inspectability evidence');
    }
    if (
      (explicitlyScopedIgnored && !scopeAllowsIgnored) ||
      (selection.scope === undefined
        ? ('scopeFingerprint' in target.basis && target.basis.scopeFingerprint !== undefined) ||
          ('scopeFingerprint' in target.comparedState && target.comparedState.scopeFingerprint !== undefined)
        : !endpointHasScopeWitness(target.basis) || !endpointHasScopeWitness(target.comparedState)) ||
      (exactResolution
        ? target.comparisonResolutionIdentity === undefined ||
          !validReviewComparisonResolution(
            selection,
            target.basis,
            target.comparedState,
            dynamicInputs,
            target.comparisonResolutionIdentity,
          )
        : target.comparisonResolutionIdentity !== undefined || target.comparisonDynamicInputs !== undefined)
    ) {
      throw new TypeError('Invalid Review comparison resolution evidence');
    }

    try {
      return await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
        const currentReferences = await inspectDynamicReferenceIdentities(context, selection);
        for (const current of currentReferences) {
          const expected = dynamicInputs.find(input => input.role === current.role);
          if (
            current.referenceObjectIdentity === undefined ||
            expected === undefined ||
            expected.reference !== current.reference ||
            (selection.scope === undefined && expected.referenceObjectIdentity !== current.referenceObjectIdentity)
          ) {
            return 'stale' as const;
          }
        }

        if (isPairedEndpointSelection(selection)) {
          let resolved: ResolvedReviewComparison;
          try {
            resolved = await resolveReviewComparison(context, selection);
          } catch {
            return 'unverified' as const;
          }
          const form = resolved.workingComparison;
          if (form === undefined) return 'unverified' as const;
          if (form.kind !== 'index-to-working-tree' && !isRevisionComparisonEndpoint(target.basis)) {
            return 'stale' as const;
          }
          let endpoints: {
            readonly basis: ReviewComparisonBasis;
            readonly comparedState: ReviewComparedState;
          };
          let freshComplete = true;
          let inspectabilityChanged = false;
          try {
            const enumeration = await enumeratePairedFacts(context, resolved, this.#limits);
            const freshFacts =
              form.kind === 'revision-to-index'
                ? noWorkingFacts()
                : await freshWorkingFacts(
                    context,
                    enumeration,
                    form.kind === 'revision-to-working-state',
                    this.#limits,
                  );
            freshComplete = freshFacts.digestComplete;
            const prepared = await preparePairedDrafts(context, resolved, enumeration, this.#limits);
            const working = await captureWorkingSides(prepared.drafts, this.#limits);
            if (working.retry) return 'unverified' as const;
            await captureLargeFilePayloads(prepared.drafts, this.#limits, working.remainingVerificationBytes);
            inspectabilityChanged =
              inspectabilityFingerprint(prepared.drafts) !== target.manifest.inspectabilityFingerprint;
            endpoints = pairedComparisonEndpoints(
              resolved,
              enumeration,
              freshFacts,
              form.kind === 'revision-to-working-state'
                ? freshPairedScopeCount(enumeration)
                : (enumeration.index?.entryCount ?? 0),
            );
          } catch (error) {
            return error instanceof ComparisonResolutionError && error.reason === 'scope-path-not-found'
              ? ('stale' as const)
              : ('unverified' as const);
          }
          if (
            !comparisonEndpointMatchesScope(selection, endpoints.basis, target.basis) ||
            !comparisonEndpointMatchesScope(selection, endpoints.comparedState, target.comparedState)
          ) {
            return freshComplete ? ('stale' as const) : ('unverified' as const);
          }
          return freshComplete && !inspectabilityChanged ? ('current' as const) : ('unverified' as const);
        }

        let resolved: ResolvedReviewComparison;
        let entries: readonly RawCommitDiffEntry[];
        try {
          resolved = await resolveReviewComparison(context, selection);
          entries = await inspectResolvedReviewComparison(context, resolved, this.#limits);
        } catch (error) {
          return error instanceof ComparisonResolutionError && error.reason === 'scope-path-not-found'
            ? ('stale' as const)
            : ('unverified' as const);
        }
        const basis = comparisonBasisEndpoint(resolved);
        const comparedState = revisionEndpoint(
          resolved.compared as ResolvedRevisionEndpoint,
          resolved.objectFormat,
          resolved.comparedScopeFingerprint,
        );
        let inspectabilityChanged = false;
        try {
          if (target.manifest.inspectabilityFingerprint === undefined) {
            inspectabilityChanged = !(await commitObjectsAvailable(context, entries));
          } else {
            const drafts = await prepareCommitDrafts(
              context,
              entries,
              resolved.objectFormat,
              resolved.basis ?? null,
              resolved.compared as ResolvedRevisionEndpoint,
              this.#limits,
              resolved.fileScope,
            );
            await captureLargeFilePayloads(drafts, this.#limits);
            inspectabilityChanged = inspectabilityFingerprint(drafts) !== target.manifest.inspectabilityFingerprint;
          }
        } catch {
          return 'unverified' as const;
        }
        if (
          !comparisonEndpointMatchesScope(selection, basis, target.basis) ||
          !comparisonEndpointMatchesScope(selection, comparedState, target.comparedState) ||
          entries.length !== target.manifest.totalFiles
        ) {
          return 'stale' as const;
        }
        if (inspectabilityChanged) return 'unverified' as const;
        if (exactResolution) {
          const resolution = comparisonResolutionFields(resolved, basis, comparedState);
          if (
            resolution === undefined ||
            resolution.comparisonResolutionIdentity !== target.comparisonResolutionIdentity ||
            (selection.scope === undefined &&
              JSON.stringify(resolution.comparisonDynamicInputs) !== JSON.stringify(dynamicInputs))
          ) {
            return 'stale' as const;
          }
        }
        return 'current' as const;
      });
    } catch {
      return 'unverified';
    }
  }

  /** Package-private collaboration for the live Review's Changed ↔ All file list. */
  async readCurrentRepositoryFiles(): Promise<CurrentRepositoryFiles> {
    try {
      const paths = await withGitInspection(
        this.#canonicalCheckout,
        this.#gitDirectory,
        async context => await enumerateCurrentRepositoryPaths(context, this.#limits),
      );
      return deepFreeze({
        status: 'available',
        files: paths.map(pathBytes =>
          deepFreeze({
            fileIdentity: `fil_${sha256(Buffer.concat([Buffer.from('repository-file\0', 'ascii'), pathBytes]))}`,
            path: evidencePath(pathBytes),
          }),
        ),
      });
    } catch {
      return deepFreeze({ status: 'unavailable', reason: 'inspection-failed' });
    }
  }

  /** Bounded working-tree content for one unchanged file; never follows symlinks out. */
  async readCurrentRepositoryFileContent(pathBytes: Buffer): Promise<CurrentRepositoryFileContent> {
    try {
      return await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
        validateRelativePath(pathBytes);
        const filename = absolutePath(context.checkout, pathBytes);
        const read = await streamRegularFile(filename, this.#limits.maxCapturedContentBytes, true);
        if (read.status === 'limit') return deepFreeze({ status: 'too-large' });
        if (read.status !== 'read' || read.content === undefined) {
          return deepFreeze({ status: 'unavailable' });
        }
        if (read.classification !== 'text') {
          return deepFreeze({
            status: 'unsupported',
            classification: read.classification === 'binary' ? 'binary' : 'unrenderable',
          });
        }
        return deepFreeze({
          status: 'available',
          bytesBase64: read.content.toString('base64'),
          byteLength: read.content.byteLength,
          truncated: false,
        });
      });
    } catch {
      return deepFreeze({ status: 'unavailable' });
    }
  }

  async readReviewCommitGraph(maximumCommits = 100): Promise<ReviewCommitGraph> {
    if (!Number.isSafeInteger(maximumCommits) || maximumCommits < 1 || maximumCommits > 1_000) {
      throw new TypeError('Invalid bounded commit graph size');
    }
    try {
      const result = await withGitInspection(
        this.#canonicalCheckout,
        this.#gitDirectory,
        async context =>
          await runGit(
            context,
            [
              'log',
              '--graph',
              '--no-color',
              '--topo-order',
              '--decorate=short',
              `--max-count=${maximumCommits + 1}`,
              '--format=%x1e%H%x00%P%x00%D%x00%s',
              'HEAD',
              '--',
            ],
            { maxStdoutBytes: Math.min(this.#limits.maxManifestBytes, 4 * MEBIBYTE) },
          ),
      );
      return parseCommitGraph(result.stdout, maximumCommits);
    } catch {
      return deepFreeze({ status: 'unavailable', reason: 'inspection-failed' });
    }
  }

  /** Package-private collaboration: the semantic owner supplies only admission policy. */
  async captureContextWithAdmission(
    request: ContextSourceCaptureRequest,
    admission: ContextSourceCaptureAdmission,
  ): Promise<ContextSourceCaptureView> {
    const captured = await readContextSourceCapture(
      this.#canonicalCheckout,
      this.#gitDirectory,
      request,
      this.#limits,
      this.#afterContextContent,
      admission,
    );
    if (captured.view.status === 'ready') this.#retainContextCapture(captured);
    return captured.view;
  }

  /** Package-private collaboration: persisted witnesses in, coherent verdicts out. */
  async revalidateContextWithAdmission(
    request: ContextSelectionRevalidateRequest,
    admission: ContextSourceCaptureAdmission,
  ): Promise<ContextSelectionRevalidateView> {
    return await readContextSourceRevalidate(
      this.#canonicalCheckout,
      this.#gitDirectory,
      request,
      this.#limits,
      admission,
    );
  }

  async read<Request extends WorkspaceEvidenceViewRequest>(
    request: Request,
  ): Promise<WorkspaceEvidenceViewFor<Request>> {
    if (request.kind === 'workspace.current-changes.capture') {
      return (await this.#capture()) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.review-comparison.capture') {
      return (await this.#captureComparison(request.selection)) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.current-changes.manifest') {
      return this.#manifest(request) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.current-changes.content') {
      return this.#content(request) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.current-changes.verify') {
      return (await this.#verify(request)) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.context.manifest') {
      return (await readContextSourceManifest(
        this.#canonicalCheckout,
        this.#gitDirectory,
        request,
        this.#limits,
      )) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.context.capture') {
      const captured = await readContextSourceCapture(
        this.#canonicalCheckout,
        this.#gitDirectory,
        request,
        this.#limits,
        this.#afterContextContent,
      );
      if (captured.view.status === 'ready') this.#retainContextCapture(captured);
      return captured.view as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.context.content') {
      return readContextSourceContentWindow(
        this.#contextCaptures,
        request,
        this.#limits,
      ) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.context.resolution') {
      return readContextSourceResolution(this.#contextCaptures, request) as WorkspaceEvidenceViewFor<Request>;
    }
    if (request.kind === 'workspace.context.verify') {
      return (await readContextSourceVerify(
        this.#contextCaptures,
        this.#canonicalCheckout,
        this.#gitDirectory,
        request,
        this.#limits,
      )) as WorkspaceEvidenceViewFor<Request>;
    }
    throw new TypeError('Unknown Workspace Evidence request');
  }

  #retainContextCapture(capture: RetainedContextCapture): void {
    if (capture.view.status !== 'ready') return;
    this.#contextCaptures.set(capture.view.captureIdentity, capture);
    while (this.#contextCaptures.size > MAX_RETAINED_CONTEXT_CAPTURES) {
      const oldest = this.#contextCaptures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#contextCaptures.delete(oldest);
    }
  }

  #retainCapture(capture: CapturedEvidence): void {
    this.#captures.set(capture.evidenceIdentity, capture);
    while (this.#captures.size > MAX_RETAINED_CAPTURES) {
      const oldest = this.#captures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#captures.delete(oldest);
    }
  }

  async #capture(): Promise<CurrentChangesCaptureView> {
    for (let attempt = 1; attempt <= this.#limits.maxCaptureAttempts; attempt += 1) {
      let result: CaptureAttemptResult;
      try {
        result = await this.#captureAttempt(attempt);
      } catch {
        return unavailableCapture(this.#workspaceIdentity, this.#limits, attempt, 'inspection-failed');
      }
      if (result.status === 'ready') {
        this.#retainCapture(result.evidence);
        return result.evidence.publicView as CurrentChangesCaptureReadyView;
      }
    }
    return unavailableCapture(
      this.#workspaceIdentity,
      this.#limits,
      this.#limits.maxCaptureAttempts,
      'unstable-workspace',
    );
  }

  async #captureComparison(value: ReviewComparisonSelection): Promise<ReviewComparisonCaptureView> {
    const selection = normalizeReviewComparisonSelection(value);
    for (let attempt = 1; attempt <= this.#limits.maxCaptureAttempts; attempt += 1) {
      try {
        const result = isPairedEndpointSelection(selection)
          ? await this.#capturePairedComparisonAttempt(selection, attempt)
          : await this.#captureComparisonAttempt(selection, attempt);
        if (result.status === 'retry') continue;
        this.#retainCapture(result.evidence);
        return result.evidence.publicView as ReviewComparisonCaptureReadyView;
      } catch (error) {
        const reason = comparisonUnavailableReason(error, selection);
        return deepFreeze({
          kind: 'workspace.review-comparison.capture',
          status: 'unavailable',
          workspaceIdentity: this.#workspaceIdentity,
          selection,
          reason,
          verification: verification('unverified', 'inspection-failed'),
          limits: this.#limits,
        });
      }
    }
    return deepFreeze({
      kind: 'workspace.review-comparison.capture',
      status: 'unavailable',
      workspaceIdentity: this.#workspaceIdentity,
      selection,
      reason: 'inspection-failed',
      verification: verification('unverified', 'unstable-workspace'),
      limits: this.#limits,
    });
  }

  async #captureComparisonAttempt(
    selection: ReviewComparisonSelection,
    attempt: number,
  ): Promise<CaptureAttemptResult> {
    return await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
      const resolved = await resolveReviewComparison(context, selection);
      if (resolved.workingComparison !== undefined || resolved.compared === undefined) {
        throw new GitInspectionError('invalid-comparison');
      }
      const entries = await inspectResolvedReviewComparison(context, resolved, this.#limits);
      await this.#afterInitialInspection?.(attempt);
      const drafts = await prepareCommitDrafts(
        context,
        entries,
        resolved.objectFormat,
        resolved.basis ?? null,
        resolved.compared,
        this.#limits,
        resolved.fileScope,
      );
      const remainingCapture = planCapture(drafts, this.#limits);
      planLargeFilePayloadCapture(drafts, this.#limits, remainingCapture);
      await captureCommitSides(context, drafts, this.#limits);
      await captureObjectSymlinkTargets(context, drafts, this.#limits);
      await captureLargeFilePayloads(drafts, this.#limits);
      const initialInspectability = inspectabilityFingerprint(drafts);
      await this.#afterContentCapture?.(attempt);

      const final = await resolveReviewComparison(context, selection);
      if (
        selection.scope === undefined &&
        (final.basis?.kind !== resolved.basis?.kind ||
          final.basis?.objectIdentity !== resolved.basis?.objectIdentity ||
          final.compared?.kind !== resolved.compared.kind ||
          final.compared?.objectIdentity !== resolved.compared.objectIdentity ||
          JSON.stringify(final.comparisonDynamicInputs) !== JSON.stringify(resolved.comparisonDynamicInputs))
      ) {
        return { status: 'retry' as const };
      }
      const finalEntries = await inspectResolvedReviewComparison(context, final, this.#limits);
      if (
        commitEntriesFingerprint(finalEntries) !== commitEntriesFingerprint(entries) ||
        !comparisonEndpointMatchesScope(selection, comparisonBasisEndpoint(final), comparisonBasisEndpoint(resolved)) ||
        !comparisonEndpointMatchesScope(
          selection,
          revisionEndpoint(
            final.compared as ResolvedRevisionEndpoint,
            final.objectFormat,
            final.comparedScopeFingerprint,
          ),
          revisionEndpoint(resolved.compared, resolved.objectFormat, resolved.comparedScopeFingerprint),
        )
      ) {
        return { status: 'retry' as const };
      }
      if (initialInspectability === undefined) {
        if (!(await commitObjectsAvailable(context, finalEntries))) {
          return { status: 'retry' as const };
        }
      } else {
        const finalDrafts = await prepareCommitDrafts(
          context,
          finalEntries,
          final.objectFormat,
          final.basis ?? null,
          final.compared as ResolvedRevisionEndpoint,
          this.#limits,
          final.fileScope,
        );
        await captureLargeFilePayloads(finalDrafts, this.#limits);
        if (inspectabilityFingerprint(finalDrafts) !== initialInspectability) {
          return { status: 'retry' as const };
        }
      }

      const manifest = drafts.map(publicFile);
      const summary = summaryForDrafts(drafts, manifest);
      const evidenceIdentity = `evd_${randomUUID()}`;
      const basisEndpoint = comparisonBasisEndpoint(resolved);
      const comparedEndpoint = revisionEndpoint(
        resolved.compared,
        resolved.objectFormat,
        resolved.comparedScopeFingerprint,
      );
      const resolution = comparisonResolutionFields(resolved, basisEndpoint, comparedEndpoint);
      const publicView: ReviewComparisonCaptureReadyView = deepFreeze({
        kind: 'workspace.review-comparison.capture',
        status: 'captured',
        evidenceIdentity,
        workspaceIdentity: this.#workspaceIdentity,
        selection: resolved.selection,
        basis: basisEndpoint,
        comparedState: comparedEndpoint,
        ...(resolution ?? {}),
        manifest: summary,
        verification: verification('current', 'captured-coherently'),
        captureAttempts: attempt,
        capturedContentBytes: capturedBytes(drafts),
        limits: this.#limits,
      });
      return {
        status: 'ready' as const,
        evidence: {
          evidenceIdentity,
          publicView,
          manifest: deepFreeze(manifest),
          contents: capturedContents(drafts),
          workingBaselines: [],
          baselineComplete: true,
        },
      };
    });
  }

  async #capturePairedComparisonAttempt(
    selection: ReviewComparisonSelection,
    attempt: number,
  ): Promise<CaptureAttemptResult> {
    return await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
      const resolved = await resolveReviewComparison(context, selection);
      const enumeration = await enumeratePairedFacts(context, resolved, this.#limits);
      const prepared = await preparePairedDrafts(context, resolved, enumeration, this.#limits);
      await this.#afterInitialInspection?.(attempt);
      const remainingCapture = planCapture(prepared.drafts, this.#limits);
      planLargeFilePayloadCapture(prepared.drafts, this.#limits, remainingCapture);
      await captureCommitSides(context, prepared.drafts, this.#limits);
      await captureObjectSymlinkTargets(context, prepared.drafts, this.#limits);
      const working = await captureWorkingSides(prepared.drafts, this.#limits);
      if (working.retry) return { status: 'retry' as const };
      await captureLargeFilePayloads(prepared.drafts, this.#limits, working.remainingVerificationBytes);
      const initialInspectability = inspectabilityFingerprint(prepared.drafts);
      const facts =
        resolved.workingComparison?.kind === 'revision-to-index'
          ? noWorkingFacts()
          : await freshWorkingFacts(
              context,
              enumeration,
              resolved.workingComparison?.kind === 'revision-to-working-state',
              this.#limits,
            );
      const endpoints = pairedComparisonEndpoints(resolved, enumeration, facts, prepared.scopePaths.length);
      await this.#afterContentCapture?.(attempt);

      const final = await resolveReviewComparison(context, selection);
      const initialBasis =
        resolved.workingComparison?.kind === 'revision-to-index' ||
        resolved.workingComparison?.kind === 'revision-to-working-state'
          ? resolved.workingComparison.basis
          : undefined;
      const finalBasis =
        final.workingComparison?.kind === 'revision-to-index' ||
        final.workingComparison?.kind === 'revision-to-working-state'
          ? final.workingComparison.basis
          : undefined;
      if (
        final.workingComparison?.kind !== resolved.workingComparison?.kind ||
        (selection.scope === undefined &&
          (finalBasis?.kind !== initialBasis?.kind ||
            finalBasis?.objectIdentity !== initialBasis?.objectIdentity ||
            JSON.stringify(final.comparisonDynamicInputs) !== JSON.stringify(resolved.comparisonDynamicInputs)))
      ) {
        return { status: 'retry' as const };
      }

      let finalEndpoints: {
        readonly basis: ReviewComparisonBasis;
        readonly comparedState: ReviewComparedState;
      };
      try {
        const finalEnumeration = await enumeratePairedFacts(context, final, this.#limits);
        const freshFacts =
          final.workingComparison?.kind === 'revision-to-index'
            ? noWorkingFacts()
            : await freshWorkingFacts(
                context,
                finalEnumeration,
                final.workingComparison?.kind === 'revision-to-working-state',
                this.#limits,
              );
        const finalPrepared = await preparePairedDrafts(context, final, finalEnumeration, this.#limits);
        const finalWorking = await captureWorkingSides(finalPrepared.drafts, this.#limits);
        if (finalWorking.retry) return { status: 'retry' as const };
        await captureLargeFilePayloads(finalPrepared.drafts, this.#limits, finalWorking.remainingVerificationBytes);
        if (inspectabilityFingerprint(finalPrepared.drafts) !== initialInspectability) {
          return { status: 'retry' as const };
        }
        finalEndpoints = pairedComparisonEndpoints(
          final,
          finalEnumeration,
          freshFacts,
          freshPairedScopeCount(finalEnumeration),
        );
      } catch {
        return { status: 'retry' as const };
      }
      if (
        !comparisonEndpointMatchesScope(selection, finalEndpoints.basis, endpoints.basis) ||
        !comparisonEndpointMatchesScope(selection, finalEndpoints.comparedState, endpoints.comparedState)
      ) {
        return { status: 'retry' as const };
      }

      const manifest = prepared.drafts.map(publicFile);
      const summary = summaryForDrafts(prepared.drafts, manifest);
      const evidenceIdentity = `evd_${randomUUID()}`;
      const resolution = comparisonResolutionFields(resolved, endpoints.basis, endpoints.comparedState);
      const baselineComplete = facts.digestComplete && working.complete && workingEvidenceComplete(prepared.drafts);
      const publicView: ReviewComparisonCaptureReadyView = deepFreeze({
        kind: 'workspace.review-comparison.capture',
        status: 'captured',
        evidenceIdentity,
        workspaceIdentity: this.#workspaceIdentity,
        selection: resolved.selection,
        basis: endpoints.basis,
        comparedState: endpoints.comparedState,
        ...(resolution ?? {}),
        manifest: summary,
        verification: verification(
          baselineComplete ? 'current' : 'unverified',
          baselineComplete ? 'captured-coherently' : 'capture-incomplete',
        ),
        captureAttempts: attempt,
        capturedContentBytes: capturedBytes(prepared.drafts),
        limits: this.#limits,
      });
      return {
        status: 'ready' as const,
        evidence: {
          evidenceIdentity,
          publicView,
          manifest: deepFreeze(manifest),
          contents: capturedContents(prepared.drafts),
          workingBaselines: working.baselines,
          baselineComplete,
        },
      };
    });
  }

  async #captureAttempt(attempt: number): Promise<CaptureAttemptResult> {
    return await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
      const initial = await inspect(context, this.#limits);
      await this.#afterInitialInspection?.(attempt);
      const drafts = await prepareDrafts(context, initial, this.#limits);
      const remainingCapture = planCapture(drafts, this.#limits);
      planLargeFilePayloadCapture(drafts, this.#limits, remainingCapture);
      await captureOldSides(context, drafts, this.#limits);
      await captureObjectSymlinkTargets(context, drafts, this.#limits);
      const working = await captureWorkingSides(drafts, this.#limits);
      if (working.retry) return { status: 'retry' as const };
      await captureLargeFilePayloads(drafts, this.#limits, working.remainingVerificationBytes);
      const initialInspectability = inspectabilityFingerprint(drafts);
      await this.#afterContentCapture?.(attempt);

      const finalInspection = await inspect(context, this.#limits);
      if (finalInspection.statusFingerprint !== initial.statusFingerprint) {
        return { status: 'retry' as const };
      }
      if (initialInspectability === undefined) {
        if (!(await currentObjectsAvailable(context, finalInspection))) {
          return { status: 'retry' as const };
        }
      } else {
        const finalDrafts = await prepareDrafts(context, finalInspection, this.#limits);
        const finalWorking = await captureWorkingSides(finalDrafts, this.#limits);
        if (finalWorking.retry) return { status: 'retry' as const };
        await captureLargeFilePayloads(finalDrafts, this.#limits, finalWorking.remainingVerificationBytes);
        if (inspectabilityFingerprint(finalDrafts) !== initialInspectability) {
          return { status: 'retry' as const };
        }
      }
      const workingRevalidation = await revalidateWorking(working.baselines, this.#limits);
      if (workingRevalidation === 'different') return { status: 'retry' as const };

      const manifest = drafts.map(publicFile);
      const summary = summaryForDrafts(drafts, manifest);
      const baselineComplete = working.complete && workingRevalidation === 'same' && workingEvidenceComplete(drafts);
      const evidenceIdentity = `evd_${randomUUID()}`;
      const publicView: CurrentChangesCaptureReadyView = deepFreeze({
        kind: 'workspace.current-changes.capture',
        status: 'captured',
        evidenceIdentity,
        workspaceIdentity: this.#workspaceIdentity,
        basis: basis(initial),
        comparedState: COMPARED_STATE,
        manifest: summary,
        verification: verification(
          baselineComplete ? 'current' : 'unverified',
          baselineComplete ? 'captured-coherently' : 'capture-incomplete',
        ),
        captureAttempts: attempt,
        capturedContentBytes: capturedBytes(drafts),
        limits: this.#limits,
      });
      return {
        status: 'ready' as const,
        evidence: {
          evidenceIdentity,
          publicView,
          manifest: deepFreeze(manifest),
          contents: capturedContents(drafts),
          inspection: initial,
          workingBaselines: working.baselines,
          baselineComplete,
        },
      };
    });
  }

  #manifest(request: CurrentChangesManifestRequest): CurrentChangesManifestView {
    assertEvidenceIdentity(request.evidenceIdentity);
    assertWindow(request.offset, request.limit, this.#limits.maxManifestWindowFiles);
    const capture = this.#captures.get(request.evidenceIdentity);
    if (capture === undefined) {
      return deepFreeze({
        kind: 'workspace.current-changes.manifest',
        status: 'unavailable',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'evidence-not-retained'),
      });
    }
    const files = capture.manifest.slice(request.offset, request.offset + request.limit);
    const next = request.offset + files.length;
    return deepFreeze({
      kind: 'workspace.current-changes.manifest',
      status: 'available',
      evidenceIdentity: request.evidenceIdentity,
      manifest: capture.publicView.manifest,
      offset: request.offset,
      files,
      nextOffset: next < capture.manifest.length ? next : null,
    });
  }

  #content(request: CurrentChangesContentRequest): CurrentChangesContentView {
    assertEvidenceIdentity(request.evidenceIdentity);
    if (!FILE_ID_PATTERN.test(request.fileIdentity)) {
      throw new TypeError('Invalid file identity');
    }
    if (request.representation !== undefined && request.representation !== 'large-file-payload') {
      throw new TypeError('Invalid evidence representation');
    }
    assertWindow(request.offset, request.length, this.#limits.maxContentWindowBytes);
    const capture = this.#captures.get(request.evidenceIdentity);
    if (capture === undefined) {
      return contentUnavailable(request, 'evidence-not-retained');
    }
    const file = capture.manifest.find(candidate => candidate.fileIdentity === request.fileIdentity);
    if (file === undefined) return contentUnavailable(request, 'file-not-found');
    const side = request.side === 'old' ? file.oldSide : file.newSide;
    if (side === undefined) return contentUnavailable(request, 'side-not-present');
    const payload = request.representation === 'large-file-payload';
    if (payload && side.largeFilePointer === undefined) {
      return contentUnavailable(request, 'large-file-pointer-not-present');
    }
    const content = capture.contents.get(
      capturedKey(request.fileIdentity, request.side, payload ? 'large-file-payload' : 'side'),
    );
    if (content === undefined) {
      return contentUnavailable(
        request,
        payload
          ? (side.largeFilePointer?.localPayload.contentLimitation ?? 'read-failed')
          : (side.contentLimitation ?? 'read-failed'),
      );
    }
    const contentIdentity = payload ? side.largeFilePointer?.localPayload.contentIdentity : side.contentIdentity;
    if (contentIdentity === undefined) {
      return contentUnavailable(request, 'read-failed');
    }
    const bytes = content.subarray(request.offset, request.offset + request.length);
    return deepFreeze({
      kind: 'workspace.current-changes.content',
      status: 'available',
      evidenceIdentity: request.evidenceIdentity,
      fileIdentity: request.fileIdentity,
      side: request.side,
      ...(payload ? { representation: 'large-file-payload' as const } : {}),
      offset: request.offset,
      byteLength: bytes.byteLength,
      totalByteLength: content.byteLength,
      bytesBase64: encodeBytesBase64(bytes),
      complete: request.offset + bytes.byteLength >= content.byteLength,
      contentIdentity,
    });
  }

  async #verify(request: VerifyCurrentChangesEvidenceRequest): Promise<CurrentChangesVerificationView> {
    assertEvidenceIdentity(request.evidenceIdentity);
    const capture = this.#captures.get(request.evidenceIdentity);
    if (capture === undefined) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'evidence-not-retained'),
      });
    }
    if (capture.publicView.kind !== 'workspace.current-changes.capture' || capture.inspection === undefined) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'inspection-failed'),
      });
    }
    if (!capture.baselineComplete) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'capture-incomplete'),
      });
    }

    let current: Inspection;
    let inspectabilityChanged = false;
    try {
      const result = await withGitInspection(this.#canonicalCheckout, this.#gitDirectory, async context => {
        const inspection = await inspect(context, this.#limits);
        const targetFingerprint = capture.publicView.manifest.inspectabilityFingerprint;
        if (targetFingerprint === undefined) {
          return {
            inspection,
            inspectabilityChanged: !(await currentObjectsAvailable(context, inspection)),
          };
        }
        const drafts = await prepareDrafts(context, inspection, this.#limits);
        const working = await captureWorkingSides(drafts, this.#limits);
        if (working.retry) {
          return { inspection, inspectabilityChanged: true };
        }
        await captureLargeFilePayloads(drafts, this.#limits, working.remainingVerificationBytes);
        return {
          inspection,
          inspectabilityChanged: inspectabilityFingerprint(drafts) !== targetFingerprint,
        };
      });
      current = result.inspection;
      inspectabilityChanged = result.inspectabilityChanged;
    } catch {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'inspection-failed'),
      });
    }
    if (current.headObject !== capture.inspection.headObject) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('stale', 'head-moved'),
      });
    }
    if (current.statusFingerprint !== capture.inspection.statusFingerprint) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('stale', 'manifest-changed'),
      });
    }
    if (inspectabilityChanged) {
      return deepFreeze({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: request.evidenceIdentity,
        verification: verification('unverified', 'inspection-failed'),
      });
    }
    const working = await revalidateWorking(capture.workingBaselines, this.#limits);
    return deepFreeze({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: request.evidenceIdentity,
      verification:
        working === 'same'
          ? verification('current', 'captured-coherently')
          : working === 'different'
            ? verification('stale', 'content-changed')
            : verification('unverified', 'inspection-failed'),
    });
  }
}

function assertEvidenceIdentity(value: string): void {
  if (!EVIDENCE_ID_PATTERN.test(value)) {
    throw new TypeError('Invalid evidence identity');
  }
}

function assertWindow(offset: number, length: number, maximum: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > maximum) {
    throw new TypeError('Invalid bounded evidence window');
  }
}

export {
  normalizeReviewComparisonDynamicInputs,
  reviewComparisonEndpointIdentity,
  reviewComparisonResolutionIdentity,
  validReviewComparisonResolution,
} from './comparisonIdentity.js';
export type {
  CaptureCurrentChangesEvidenceRequest,
  CaptureReviewComparisonEvidenceRequest,
  CurrentChangeSide,
  CurrentChangeStage,
  CurrentChangeStagingProvenance,
  CurrentChangeStatus,
  CurrentChangedFile,
  CurrentChangesCaptureReadyView,
  CurrentChangesCaptureUnverifiedView,
  CurrentChangesCaptureView,
  CurrentChangesComparedState,
  CurrentChangesComparisonBasis,
  CurrentChangesContentAvailableView,
  CurrentChangesContentRequest,
  CurrentChangesContentUnavailableView,
  CurrentChangesContentView,
  CurrentChangesManifestAvailableView,
  CurrentChangesManifestRequest,
  CurrentChangesManifestSummary,
  CurrentChangesManifestUnavailableView,
  CurrentChangesManifestView,
  CurrentChangesVerificationView,
  CurrentRepositoryFile,
  CurrentRepositoryFileContent,
  CurrentRepositoryFiles,
  EvidenceContentAvailability,
  EvidenceContentClassification,
  EvidenceContentIdentity,
  EvidenceContentLimitation,
  EvidenceGeneratedClassification,
  EvidenceGitlink,
  EvidenceGitlinkCheckout,
  EvidenceLargeFilePointer,
  EvidencePath,
  EvidenceScopeMembership,
  EvidenceSideKind,
  EvidenceSparseAbsence,
  EvidenceSpecialEntry,
  EvidenceSpecialEntryKind,
  EvidenceSymlinkTarget,
  GitObjectIdentity,
  ReviewCommitGraph,
  ReviewCommitGraphRow,
  ReviewComparedState,
  ReviewComparisonBasis,
  ReviewComparisonCaptureReadyView,
  ReviewComparisonCaptureUnavailableView,
  ReviewComparisonCaptureView,
  ReviewComparisonCommitEndpoint,
  ReviewComparisonDynamicInput,
  ReviewComparisonEmptyTreeEndpoint,
  ReviewComparisonFileScope,
  ReviewComparisonFileScopeEntry,
  ReviewComparisonIndexEndpoint,
  ReviewComparisonInspection,
  ReviewComparisonResolutionIdentity,
  ReviewComparisonRevisionEndpoint,
  ReviewComparisonSelection,
  ReviewComparisonTreeEndpoint,
  ReviewComparisonUnavailableReason,
  ReviewComparisonVerificationTarget,
  ReviewComparisonWorkingStateEndpoint,
  ReviewComparisonWorkingTreeEndpoint,
  ReviewRevisionEndpointSelection,
  ReviewRevisionObjectKind,
  VerifyCurrentChangesEvidenceRequest,
  WorkspaceEvidenceLimits,
  WorkspaceEvidenceView,
  WorkspaceEvidenceViewFor,
  WorkspaceEvidenceViewRequest,
  WorkspaceVerification,
  WorkspaceVerificationReason,
  WorkspaceVerificationState,
} from './contracts.js';
export { enumerateIndex, enumerateUntracked } from './enumeration.js';
export { runGit, withGitInspection } from './inspection.js';
export type { IndexEnumeration, IndexRecord, UntrackedEnumeration } from './internalTypes.js';
export {
  isPairedEndpointSelection,
  normalizeReviewComparisonSelection,
  reviewComparisonUsesExactResolution,
} from './selection.js';
export { validateRelativePath } from './utils.js';
export { evidencePath } from './views.js';
