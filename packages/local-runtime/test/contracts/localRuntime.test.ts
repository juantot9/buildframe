import { randomUUID } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';

import type { Workspace, WorkspaceIdentity, WorkspaceViewUpdate } from '@buildframe/workspace';
import type { ReviewIdentity, ReviewSnapshotIdentity } from '@buildframe/workspace/reviewing';
import type { ReviewComparisonResolutionIdentity } from '@buildframe/workspace/workspace-evidence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LOCAL_RUNTIME_PROTOCOL_VERSION,
  LocalRuntimeSessionError,
  connectWorkspaceRuntime,
  type RuntimeCodeIdentity,
  type RuntimeGeneration,
} from '../../src/index.js';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/launcher.js';
import { waitForLocalRuntimeServerIdle } from '../../src/server.js';
import { MAX_FRAME_BYTES } from '../../src/protocol.js';
import { runtimeLocationForWorkspace } from '../../src/runtimeLocation.js';
import { connectRawPeer, type RawPeer } from './rawRuntimePeer.js';
import { shortScratchRoot } from '../shortScratchRoot.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000001' as WorkspaceIdentity;
const OTHER_WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000002' as WorkspaceIdentity;
const RUNTIME_CODE_IDENTITY = `rtc_${'1'.repeat(64)}` as RuntimeCodeIdentity;

function runtimeGeneration(): RuntimeGeneration {
  return `rtg_${randomUUID()}` as RuntimeGeneration;
}

function identityProjection(
  workspaceIdentity: WorkspaceIdentity = WORKSPACE_IDENTITY,
  stateVersion = 1,
): Record<string, unknown> {
  return {
    kind: 'workspace.identity',
    interfaceVersion: 1,
    workspaceIdentity,
    canonicalCheckout: '/semantic/checkout',
    stateVersion,
  };
}

function legacyWindow(text: string): Record<string, unknown> {
  return {
    text,
    totalUtf8Bytes: Buffer.byteLength(text),
    shownUtf8Bytes: Buffer.byteLength(text),
    truncated: false,
  };
}

function legacyDisclosure(): Record<string, unknown> {
  return {
    label: 'LEGACY REVIEW HISTORY',
    provenance: 'imported-legacy-receipt-source',
    recordStatus: 'migration-evidence-not-v1-history',
    sourceMutability: 'legacy-source-was-mutable',
    retention: 'at-most-100-terminal-batches',
    cannotProve: [
      'complete-history',
      'human-consent',
      'delivery',
      'harness-start',
      'terminal-correlation',
      'human-disposition',
      'correctness',
      'v1-workflow-facts',
    ],
  };
}

function legacySourcesProjection(stateVersion = 1): Record<string, unknown> {
  return {
    kind: 'legacy-review.sources',
    projectionVersion: 1,
    stateVersion,
    sources: [
      {
        sourceIdentity: `lgs_${'1'.repeat(64)}`,
        sourceKind: 'queue',
        location: 'current-checkout',
        sourcePath: '/semantic/checkout/.neoflow/review.json',
        observation: {
          status: 'detected',
          byteLength: 512,
          digest: 'a'.repeat(64),
          mode: 0o100600,
          modifiedNanoseconds: '1000',
          changedNanoseconds: '1001',
          migration: { status: 'undecided' },
          recognition: {
            status: 'recognized',
            format: 'queue-v2',
            totalAnnotations: 7,
          },
        },
      },
      {
        sourceIdentity: `lgs_${'2'.repeat(64)}`,
        sourceKind: 'receipts',
        location: 'current-legacy-state',
        sourcePath: '/semantic/state/neoflow/workspaces/hash/review-receipts.json',
        observation: {
          status: 'detected',
          byteLength: 1_024,
          digest: 'b'.repeat(64),
          mode: 0o100600,
          modifiedNanoseconds: '1002',
          changedNanoseconds: '1003',
          migration: { status: 'undecided' },
          recognition: {
            status: 'recognized',
            format: 'receipts-v1',
            totalBatches: 1,
            totalAnnotations: 1,
            legacyWorkspacePaths: {
              totalDistinct: 1,
              values: ['/legacy/workspace'],
              omitted: 0,
            },
          },
        },
      },
    ],
  };
}

function legacyReceiptBatchSummary(): Record<string, unknown> {
  return {
    batchAbsolute: 0,
    legacyBatchId: legacyWindow('legacy-batch'),
    legacyWorkspacePath: legacyWindow('/legacy/workspace'),
    legacyHarness: {
      legacyHarnessId: legacyWindow('legacy-harness'),
      legacyName: legacyWindow('Legacy Harness'),
      legacySessionId: legacyWindow('legacy-session'),
      legacyWorkspacePath: legacyWindow('/legacy/workspace'),
    },
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    harnessOutcome: 'pending',
    queueDisposition: 'pending',
    totalAnnotations: 1,
  };
}

function legacyReceiptHistoryProjection(
  stateVersion: number,
  sourceOccurrenceIdentity: unknown,
): Record<string, unknown> {
  return {
    kind: 'legacy-review.receipt-history',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    sourceIdentity: `lgs_${'2'.repeat(64)}`,
    sourceOccurrenceIdentity,
    digest: 'b'.repeat(64),
    disclosure: legacyDisclosure(),
    legacyUpdatedAt: '2026-09-02T10:00:00.000Z',
    totalBatches: 1,
    totalAnnotations: 1,
    batchOffset: 0,
    batches: [legacyReceiptBatchSummary()],
  };
}

function legacyCandidateDisclosure(): Record<string, unknown> {
  return {
    label: 'LEGACY QUEUE CANDIDATE',
    recordStatus: 'migration-candidate-not-v1-draft',
    authority: 'none',
    legacyValues: 'intent-path-lines-and-excerpt-are-hints-only',
    promotionRequires: 'explicit-intent-and-exact-anchor-on-verified-current-v1-snapshot',
  };
}

function legacyCandidatePromotion(): Record<string, unknown> {
  return {
    promotionIdentity: `lcp_${'7'.repeat(64)}`,
    reviewIdentity: `rev_${'8'.repeat(64)}`,
    reviewSnapshotIdentity: `rsn_${'9'.repeat(64)}`,
    draftIdentity: `qdr_${'a'.repeat(64)}`,
    intent: 'question',
  };
}

function legacyQueueCandidatesProjection(
  stateVersion: number,
  sourceOccurrenceIdentity: unknown,
  migrationDecision: 'undecided' | 'deferred' | 'dismissed' | 'promoted' = 'undecided',
): Record<string, unknown> {
  return {
    kind: 'legacy-review.queue-candidates',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    sourceIdentity: `lgs_${'1'.repeat(64)}`,
    sourceOccurrenceIdentity,
    digest: 'a'.repeat(64),
    legacySourceFormat: 'queue-v2',
    disclosure: legacyCandidateDisclosure(),
    totalCandidates: 1,
    candidateOffset: 0,
    candidates: [
      {
        candidateIdentity: `lgc_${'5'.repeat(64)}`,
        candidateAbsolute: 0,
        migrationDecision,
        ...(migrationDecision === 'promoted' ? { promotion: legacyCandidatePromotion() } : {}),
        legacyAnnotationId: legacyWindow('legacy-annotation'),
        legacyKind: 'question',
        legacyAnchorHint: { side: 'file' },
        legacyTextPreview: legacyWindow('legacy question'),
      },
    ],
  };
}

function legacyQueueCandidateProjection(
  stateVersion: number,
  sourceOccurrenceIdentity: unknown,
  migrationDecision: 'undecided' | 'deferred' | 'dismissed' | 'promoted' = 'undecided',
): Record<string, unknown> {
  return {
    kind: 'legacy-review.queue-candidate',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    sourceIdentity: `lgs_${'1'.repeat(64)}`,
    sourceOccurrenceIdentity,
    digest: 'a'.repeat(64),
    legacySourceFormat: 'queue-v2',
    disclosure: legacyCandidateDisclosure(),
    candidateIdentity: `lgc_${'5'.repeat(64)}`,
    candidateAbsolute: 0,
    migrationDecision,
    ...(migrationDecision === 'promoted' ? { promotion: legacyCandidatePromotion() } : {}),
    legacyAnnotationId: legacyWindow('legacy-annotation'),
    legacyKind: 'question',
    legacyAnchorHint: { side: 'file' },
    legacyText: {
      text: 'legacy question',
      totalUtf8Bytes: 15,
      utf8Offset: 0,
      shownUtf8Bytes: 15,
      complete: true,
    },
  };
}

function movedReceiptMigration(associated: boolean): Record<string, unknown> {
  return associated
    ? {
        status: 'associated-and-imported',
        associationIdentity: `lma_${'8'.repeat(64)}`,
        sourceOccurrenceIdentity: `lso_${'9'.repeat(64)}`,
      }
    : { status: 'unassociated' };
}

function movedReceiptSourcesProjection(
  stateVersion: number,
  search: 'directory' | 'former' = 'directory',
  associated = false,
): Record<string, unknown> {
  return {
    kind: 'legacy-review.moved-receipt-sources',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    search:
      search === 'directory'
        ? { kind: 'legacy-state-directory' }
        : {
            kind: 'former-checkout-path',
            exactFormerCanonicalCheckout: legacyWindow('/legacy/former/checkout'),
          },
    totalSources: 1,
    sourceOffset: 0,
    sources: [
      {
        sourceIdentity: `lgs_${'7'.repeat(64)}`,
        sourceKind: 'receipts',
        location: 'moved-legacy-state',
        legacyCheckoutHash: 'c'.repeat(64),
        legacyReceiptPath: legacyWindow(`/semantic/state/neoflow/workspaces/${'c'.repeat(64)}/review-receipts.json`),
        observation: {
          status: 'detected',
          byteLength: 2_048,
          digest: 'd'.repeat(64),
          mode: 0o100600,
          modifiedNanoseconds: '2000',
          changedNanoseconds: '2001',
          migration: movedReceiptMigration(associated),
          recognition: {
            status: 'recognized',
            format: 'receipts-v1',
            totalBatches: 2,
            totalAnnotations: 3,
            totalLegacyWorkspacePaths: 2,
          },
        },
      },
    ],
  };
}

function movedReceiptSourceProjection(stateVersion: number, associated = false): Record<string, unknown> {
  return {
    kind: 'legacy-review.moved-receipt-source',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    sourceIdentity: `lgs_${'7'.repeat(64)}`,
    sourceKind: 'receipts',
    location: 'moved-legacy-state',
    legacyCheckoutHash: 'c'.repeat(64),
    legacyReceiptPath: legacyWindow(`/semantic/state/neoflow/workspaces/${'c'.repeat(64)}/review-receipts.json`),
    byteLength: 2_048,
    digest: 'd'.repeat(64),
    mode: 0o100600,
    modifiedNanoseconds: '2000',
    changedNanoseconds: '2001',
    migration: movedReceiptMigration(associated),
    recognition: {
      status: 'recognized',
      format: 'receipts-v1',
      totalBatches: 2,
      totalAnnotations: 3,
      totalLegacyWorkspacePaths: 2,
    },
    totalLegacyWorkspacePaths: 2,
    legacyWorkspacePathOffset: 0,
    legacyWorkspacePaths: [legacyWindow('/legacy/former/checkout'), legacyWindow('/legacy/former/\u0001🙂-worktree')],
    omittedLegacyWorkspacePathsBefore: 0,
    omittedLegacyWorkspacePathsAfter: 0,
  };
}

function legacyReceiptBatchProjection(
  stateVersion: number,
  sourceOccurrenceIdentity: unknown,
): Record<string, unknown> {
  return {
    kind: 'legacy-review.receipt-batch',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    sourceIdentity: `lgs_${'2'.repeat(64)}`,
    sourceOccurrenceIdentity,
    digest: 'b'.repeat(64),
    disclosure: legacyDisclosure(),
    batch: legacyReceiptBatchSummary(),
    annotationOffset: 0,
    annotations: [
      {
        annotationAbsolute: 0,
        legacyAnnotationId: legacyWindow('legacy-annotation'),
        legacyKind: 'question',
        legacyAnchor: { side: 'file' },
        legacyText: legacyWindow('legacy text'),
      },
    ],
  };
}

class ScriptedWorkspace {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #subscribers = new Set<(update: unknown) => void>();
  #stateVersion = 1;
  #candidateDecision: 'undecided' | 'deferred' | 'dismissed' | 'promoted' = 'undecided';
  #movedReceiptAssociated = false;
  #blockedRead:
    | {
        readonly started: () => void;
        readonly result: Promise<unknown>;
      }
    | undefined;

  readonly attention: string[] = [];

  constructor(workspaceIdentity: WorkspaceIdentity = WORKSPACE_IDENTITY) {
    this.#workspaceIdentity = workspaceIdentity;
  }

  asWorkspace(): Workspace {
    return this as unknown as Workspace;
  }

  setAttention(attention: string): void {
    this.attention.push(attention);
  }

  async execute(command: unknown): Promise<unknown> {
    if (
      typeof command === 'object' &&
      command !== null &&
      'kind' in command &&
      command.kind === 'legacy-review.moved-receipt-source.associate-and-import'
    ) {
      if (
        Object.keys(command).length !== 7 ||
        !('commandIdentity' in command) ||
        !('expectedStateVersion' in command) ||
        !('confirmedWorkspaceIdentity' in command) ||
        !('sourceIdentity' in command) ||
        !('legacyCheckoutHash' in command) ||
        !('expectedDigest' in command)
      ) {
        throw new TypeError('Invalid moved legacy receipt association command');
      }
      this.#stateVersion += 1;
      this.#movedReceiptAssociated = true;
      return {
        kind: 'legacy-review.moved-receipt-source.associated-and-imported',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: this.#stateVersion,
        sourceIdentity: command.sourceIdentity,
        associationIdentity: `lma_${'8'.repeat(64)}`,
        sourceOccurrenceIdentity: `lso_${'9'.repeat(64)}`,
        sourceKind: 'receipts',
        location: 'moved-legacy-state',
        legacyCheckoutHash: command.legacyCheckoutHash,
        digest: command.expectedDigest,
        association: 'recorded',
        preservation: 'preserved',
      };
    }
    if (
      typeof command === 'object' &&
      command !== null &&
      'kind' in command &&
      command.kind === 'review.legacy-question-candidate.promote'
    ) {
      if (
        Object.keys(command).length !== 10 ||
        !('commandIdentity' in command) ||
        !('expectedStateVersion' in command) ||
        !('sourceOccurrenceIdentity' in command) ||
        !('candidateIdentity' in command) ||
        !('expectedSourceDigest' in command) ||
        !('reviewIdentity' in command) ||
        !('expectedReviewSnapshotIdentity' in command) ||
        !('intent' in command) ||
        command.intent !== 'question' ||
        !('anchor' in command)
      ) {
        throw new TypeError('Invalid legacy Question promotion command');
      }
      this.#stateVersion += 1;
      this.#candidateDecision = 'promoted';
      return {
        kind: 'review.legacy-question-candidate.promoted',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: this.#stateVersion,
        reviewIdentity: command.reviewIdentity,
        reviewSnapshotIdentity: command.expectedReviewSnapshotIdentity,
        draftIdentity: `qdr_${'a'.repeat(64)}`,
        draftRevision: 1,
        anchor: {
          kind: 'review.whole-file',
          reviewSnapshotIdentity: command.expectedReviewSnapshotIdentity,
          fileIdentity: `fil_${'b'.repeat(64)}`,
          side: 'new',
          scope: 'file',
          content: {
            status: 'available',
            classification: 'text',
            byteLength: 15,
            contentIdentity: {
              algorithm: 'sha256',
              value: 'c'.repeat(64),
            },
          },
        },
        sourceIdentity: `lgs_${'1'.repeat(64)}`,
        sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
        sourceDigest: command.expectedSourceDigest,
        candidateIdentity: command.candidateIdentity,
        promotionIdentity: `lcp_${'7'.repeat(64)}`,
        intent: 'question',
      };
    }
    if (
      typeof command === 'object' &&
      command !== null &&
      'kind' in command &&
      command.kind === 'legacy-review.queue-candidate.decision.set'
    ) {
      if (
        Object.keys(command).length !== 6 ||
        !('commandIdentity' in command) ||
        !('expectedStateVersion' in command) ||
        !('sourceOccurrenceIdentity' in command) ||
        !('candidateIdentity' in command) ||
        !('decision' in command) ||
        (command.decision !== 'deferred' && command.decision !== 'dismissed')
      ) {
        throw new TypeError('Invalid legacy Review candidate decision command');
      }
      this.#stateVersion += 1;
      this.#candidateDecision = command.decision;
      return {
        kind: 'legacy-review.queue-candidate.decision-recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: this.#stateVersion,
        sourceIdentity: `lgs_${'1'.repeat(64)}`,
        sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
        digest: 'a'.repeat(64),
        candidateIdentity: command.candidateIdentity,
        candidateDecisionIdentity: `lcd_${'6'.repeat(64)}`,
        decision: command.decision,
        recording: 'recorded',
      };
    }
    if (
      typeof command === 'object' &&
      command !== null &&
      'kind' in command &&
      command.kind === 'legacy-review.source.decision.set'
    ) {
      if (
        Object.keys(command).length !== 6 ||
        !('commandIdentity' in command) ||
        !('sourceIdentity' in command) ||
        !('expectedDigest' in command) ||
        !('decision' in command)
      ) {
        throw new TypeError('Invalid legacy Review source decision command');
      }
      this.#stateVersion += 1;
      return {
        kind: 'legacy-review.source.decision-recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: this.#stateVersion,
        sourceIdentity: command.sourceIdentity,
        sourceDecisionIdentity: `lsd_${'4'.repeat(64)}`,
        sourceKind: 'queue',
        digest: command.expectedDigest,
        decision: command.decision,
        recording: 'recorded',
      };
    }
    if (
      typeof command === 'object' &&
      command !== null &&
      'kind' in command &&
      command.kind === 'legacy-review.source.import'
    ) {
      if (
        Object.keys(command).length !== 5 ||
        !('commandIdentity' in command) ||
        !('sourceIdentity' in command) ||
        !('expectedDigest' in command)
      ) {
        throw new TypeError('Invalid legacy Review import command');
      }
      this.#stateVersion += 1;
      return {
        kind: 'legacy-review.source.imported',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: this.#stateVersion,
        sourceIdentity: command.sourceIdentity,
        sourceOccurrenceIdentity: `lso_${'3'.repeat(64)}`,
        sourceKind: command.sourceIdentity === `lgs_${'2'.repeat(64)}` ? 'receipts' : 'queue',
        digest: command.expectedDigest,
        preservation: 'preserved',
      };
    }
    this.#stateVersion += 1;
    return {
      kind: 'command.accepted',
      stateVersion: this.#stateVersion,
      command,
    };
  }

  async read(request: unknown): Promise<unknown> {
    if (typeof request === 'object' && request !== null && 'kind' in request && request.kind === 'workspace.identity') {
      return identityProjection(this.#workspaceIdentity, this.#stateVersion);
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.sources'
    ) {
      if (Object.keys(request).length !== 1) {
        throw new TypeError('Invalid legacy Review discovery request');
      }
      return legacySourcesProjection(this.#stateVersion);
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.moved-receipt-sources'
    ) {
      if (
        Object.keys(request).length !== 4 ||
        !('search' in request) ||
        !('sourceOffset' in request) ||
        !('sourceLimit' in request) ||
        typeof request.search !== 'object' ||
        request.search === null ||
        !('kind' in request.search) ||
        (request.search.kind === 'legacy-state-directory'
          ? Object.keys(request.search).length !== 1
          : request.search.kind !== 'former-checkout-path' ||
            Object.keys(request.search).length !== 2 ||
            !('exactFormerCanonicalCheckout' in request.search))
      ) {
        throw new TypeError('Invalid moved legacy receipt sources request');
      }
      return movedReceiptSourcesProjection(
        this.#stateVersion,
        request.search.kind === 'legacy-state-directory' ? 'directory' : 'former',
        this.#movedReceiptAssociated,
      );
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.moved-receipt-source'
    ) {
      if (
        Object.keys(request).length !== 5 ||
        !('sourceIdentity' in request) ||
        !('legacyCheckoutHash' in request) ||
        !('legacyWorkspacePathOffset' in request) ||
        !('legacyWorkspacePathLimit' in request)
      ) {
        throw new TypeError('Invalid moved legacy receipt source request');
      }
      return movedReceiptSourceProjection(this.#stateVersion, this.#movedReceiptAssociated);
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.receipt-history'
    ) {
      if (Object.keys(request).length !== 4 || !('sourceOccurrenceIdentity' in request)) {
        throw new TypeError('Invalid legacy receipt history request');
      }
      return legacyReceiptHistoryProjection(this.#stateVersion, request.sourceOccurrenceIdentity);
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.receipt-batch'
    ) {
      if (Object.keys(request).length !== 5 || !('sourceOccurrenceIdentity' in request)) {
        throw new TypeError('Invalid legacy receipt batch request');
      }
      return legacyReceiptBatchProjection(this.#stateVersion, request.sourceOccurrenceIdentity);
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.queue-candidates'
    ) {
      if (Object.keys(request).length !== 4 || !('sourceOccurrenceIdentity' in request)) {
        throw new TypeError('Invalid legacy queue candidates request');
      }
      return legacyQueueCandidatesProjection(
        this.#stateVersion,
        request.sourceOccurrenceIdentity,
        this.#candidateDecision,
      );
    }
    if (
      typeof request === 'object' &&
      request !== null &&
      'kind' in request &&
      request.kind === 'legacy-review.queue-candidate'
    ) {
      if (Object.keys(request).length !== 7 || !('sourceOccurrenceIdentity' in request)) {
        throw new TypeError('Invalid legacy queue candidate request');
      }
      return legacyQueueCandidateProjection(
        this.#stateVersion,
        request.sourceOccurrenceIdentity,
        this.#candidateDecision,
      );
    }
    if (this.#blockedRead !== undefined) {
      const blocked = this.#blockedRead;
      this.#blockedRead = undefined;
      blocked.started();
      return await blocked.result;
    }
    return {
      kind: 'semantic.projection',
      stateVersion: this.#stateVersion,
      value: 'bounded',
    };
  }

  subscribe(_scope: unknown, onUpdate: (update: unknown) => void): () => void {
    this.#subscribers.add(onUpdate);
    onUpdate(identityProjection(this.#workspaceIdentity, this.#stateVersion));
    return () => this.#subscribers.delete(onUpdate);
  }

  publish(update: unknown): void {
    for (const subscriber of [...this.#subscribers]) subscriber(update);
  }

  blockNextRead(): {
    readonly started: Promise<void>;
    readonly complete: (value: unknown) => void;
  } {
    let markStarted!: () => void;
    let complete!: (value: unknown) => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const result = new Promise<unknown>(resolve => {
      complete = resolve;
    });
    this.#blockedRead = {
      started: markStarted,
      result,
    };
    return { started, complete };
  }
}

interface WorkspaceTestAdapter {
  asWorkspace(): Workspace;
}

interface OperationGate {
  readonly started: Promise<void>;
  complete(result: unknown): void;
}

class GatedOperationWorkspace implements WorkspaceTestAdapter {
  readonly events: string[] = [];
  readonly #gates = new Map<
    string,
    {
      readonly started: () => void;
      readonly result: Promise<unknown>;
    }
  >();

  asWorkspace(): Workspace {
    return this as unknown as Workspace;
  }

  gate(operation: 'read' | 'execute', kind: string): OperationGate {
    let started!: () => void;
    let complete!: (result: unknown) => void;
    const startedPromise = new Promise<void>(resolve => {
      started = resolve;
    });
    const result = new Promise<unknown>(resolve => {
      complete = resolve;
    });
    this.#gates.set(`${operation}:${kind}`, { started, result });
    return { started: startedPromise, complete };
  }

  async read(request: unknown): Promise<unknown> {
    const kind = this.#kind(request);
    if (kind === 'workspace.identity') {
      return identityProjection();
    }
    return await this.#run('read', kind);
  }

  async execute(command: unknown): Promise<unknown> {
    return await this.#run('execute', this.#kind(command));
  }

  subscribe(): () => void {
    return () => {};
  }

  async #run(operation: 'read' | 'execute', kind: string): Promise<unknown> {
    const identity = `${operation}:${kind}`;
    const gate = this.#gates.get(identity);
    if (gate === undefined) throw new Error(`Missing operation gate ${identity}`);
    this.events.push(`${identity}:start`);
    gate.started();
    const result = await gate.result;
    this.events.push(`${identity}:end`);
    return result;
  }

  #kind(value: unknown): string {
    if (typeof value !== 'object' || value === null || !('kind' in value) || typeof value.kind !== 'string') {
      throw new Error('Gated operation has no kind');
    }
    return value.kind;
  }
}

const connectRaw = async (): Promise<RawPeer> => await connectRawPeer(WORKSPACE_IDENTITY);

function bootstrapFrame(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    type: 'bootstrap',
    protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
    workspaceInterfaceVersion: 1,
    workspaceIdentity: WORKSPACE_IDENTITY,
    role: 'tui',
    ...overrides,
  };
}

function containsForbiddenMechanic(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenMechanic);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      /socket|frame|endpoint|process|pid|sqlite|persistence|transport/iu.test(key) || containsForbiddenMechanic(nested),
  );
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('semantic local-runtime client/server contract', () => {
  const servers = new Set<LocalRuntimeServer>();
  const controllers = new Set<AbortController>();
  let scratchRoot: string;
  let originalRuntimeDirectory: string | undefined;

  beforeEach(async () => {
    originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
    scratchRoot = await shortScratchRoot('buildframe-runtime-contract-');
    process.env.XDG_RUNTIME_DIR = scratchRoot;
  });

  afterEach(async () => {
    for (const controller of controllers) controller.abort();
    controllers.clear();
    await Promise.all([...servers].map(async server => server.dispose()));
    servers.clear();
    if (originalRuntimeDirectory === undefined) {
      delete process.env.XDG_RUNTIME_DIR;
    } else {
      process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    }
    await rm(scratchRoot, { recursive: true, force: true });
  });

  async function start(
    workspace: WorkspaceTestAdapter = new ScriptedWorkspace(),
    allowedRoles?: readonly ['tui'],
  ): Promise<{ readonly server: LocalRuntimeServer; readonly workspace: WorkspaceTestAdapter }> {
    const request = {
      workspace: workspace.asWorkspace(),
      runtimeGeneration: runtimeGeneration(),
      runtimeCodeIdentity: RUNTIME_CODE_IDENTITY,
      ...(allowedRoles === undefined ? {} : { allowedRoles }),
    };
    const server = await startLocalRuntimeServer(request);
    servers.add(server);
    return { server, workspace };
  }

  it('bootstraps identity, role, generation, and compatibility, then exposes only the Workspace Interface', async () => {
    const scripted = new ScriptedWorkspace();
    const { server } = await start(scripted);
    const controller = new AbortController();
    controllers.add(controller);

    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    expect(connected).toMatchObject({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      runtimeGeneration: server.runtimeGeneration,
      compatibility: {
        protocolVersion: 1,
        workspaceInterfaceVersion: 1,
      },
    });
    expect(Object.keys(connected.workspace).sort()).toEqual(['execute', 'read', 'setAttention', 'subscribe']);

    const dynamicWorkspace = connected.workspace as unknown as {
      execute(command: unknown): Promise<unknown>;
      read(request: unknown): Promise<unknown>;
    };
    const commandResult = await dynamicWorkspace.execute({
      kind: 'semantic.command',
      commandIdentity: 'cmd-1',
      expectedStateVersion: 1,
    });
    const projection = await dynamicWorkspace.read({ kind: 'semantic.view' });
    expect(commandResult).toMatchObject({
      kind: 'command.accepted',
      stateVersion: 2,
    });
    expect(projection).toEqual({
      kind: 'semantic.projection',
      stateVersion: 2,
      value: 'bounded',
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(containsForbiddenMechanic(commandResult)).toBe(false);
    expect(containsForbiddenMechanic(projection)).toBe(false);

    const updates: WorkspaceViewUpdate[] = [];
    const unsubscribe = connected.workspace.subscribe({ kind: 'workspace.identity' }, update => updates.push(update));
    await waitFor(() => updates.length === 1, 'initial Workspace Identity subscription update');
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 3));
    await waitFor(() => updates.length === 2, 'published Workspace Identity subscription update');
    unsubscribe();
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 4));
    const acknowledgementBarrier = await dynamicWorkspace.read({
      kind: 'semantic.view',
    });
    expect(acknowledgementBarrier).toMatchObject({
      kind: 'semantic.projection',
      stateVersion: 2,
    });
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 5));
    const deliveryBarrier = await dynamicWorkspace.read({
      kind: 'semantic.view',
    });
    expect(deliveryBarrier).toEqual(acknowledgementBarrier);

    expect(updates.map(update => (update as unknown as { stateVersion: number }).stateVersion)).toEqual([2, 3]);
    expect(updates.every(update => !containsForbiddenMechanic(update))).toBe(true);
  });

  it('carries exact revision selection and resolution authority through version-1 transport', async () => {
    const { server } = await start();
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected).toMatchObject({
      status: 'connected',
      compatibility: {
        protocolVersion: 1,
        workspaceInterfaceVersion: 1,
      },
      runtimeGeneration: server.runtimeGeneration,
    });
    if (connected.status !== 'connected') return;

    const command = {
      kind: 'review.comparison.start',
      commandIdentity: 'exact-revision-transport',
      expectedStateVersion: 1,
      selection: {
        kind: 'revision-pair',
        basis: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'refs/heads/review-target',
        },
        compared: {
          kind: 'object',
          objectKind: 'tree',
          objectIdentity: 'a'.repeat(40),
        },
      },
      expectedBasisObjectIdentity: 'b'.repeat(40),
      expectedComparedObjectIdentity: 'a'.repeat(40),
      expectedComparisonResolutionIdentity: `rcp_${'c'.repeat(64)}` as ReviewComparisonResolutionIdentity,
    } as const;
    const result = await connected.workspace.execute(command);
    expect(result).toEqual({
      kind: 'command.accepted',
      stateVersion: 2,
      command,
    });
    expect(containsForbiddenMechanic(result)).toBe(false);
  });

  it('carries paired index and working comparison selections through version-1 transport', async () => {
    const { server } = await start();
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected).toMatchObject({
      status: 'connected',
      compatibility: {
        protocolVersion: 1,
        workspaceInterfaceVersion: 1,
      },
      runtimeGeneration: server.runtimeGeneration,
    });
    if (connected.status !== 'connected') return;

    const command = {
      kind: 'review.comparison.start',
      commandIdentity: 'paired-index-transport',
      expectedStateVersion: 1,
      selection: {
        kind: 'revision-to-index',
        basis: {
          kind: 'local-ref',
          objectKind: 'commit',
          reference: 'refs/heads/review-target',
        },
      },
      expectedBasisObjectIdentity: 'b'.repeat(40),
      expectedComparedObjectIdentity: 'd'.repeat(64),
      expectedComparisonResolutionIdentity: `rcp_${'c'.repeat(64)}` as ReviewComparisonResolutionIdentity,
    } as const;
    const result = await connected.workspace.execute(command);
    expect(result).toEqual({
      kind: 'command.accepted',
      stateVersion: 2,
      command,
    });
    expect(containsForbiddenMechanic(result)).toBe(false);

    const workingCommand = {
      kind: 'review.comparison.start',
      commandIdentity: 'working-tree-transport',
      expectedStateVersion: 2,
      selection: { kind: 'index-to-working-tree' },
      expectedBasisObjectIdentity: 'd'.repeat(64),
      expectedComparedObjectIdentity: 'e'.repeat(64),
      expectedComparisonResolutionIdentity: `rcp_${'f'.repeat(64)}` as ReviewComparisonResolutionIdentity,
    } as const;
    const workingResult = await connected.workspace.execute(workingCommand);
    expect(workingResult).toEqual({
      kind: 'command.accepted',
      stateVersion: 3,
      command: workingCommand,
    });
    expect(containsForbiddenMechanic(workingResult)).toBe(false);
  });

  it('carries content-silent legacy source discovery through the unchanged operation transport', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    await expect(
      connected.workspace.read({
        kind: 'legacy-review.sources',
      }),
    ).resolves.toEqual(legacySourcesProjection());
    const view = await connected.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.sources)).toBe(true);
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });
    await expect(
      (connected.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.sources',
        extra: true,
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
  });

  it('carries bounded moved receipt searches and path detail through version-1 transport', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    const directory = await connected.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 32,
    });
    expect(directory).toEqual(movedReceiptSourcesProjection(1));
    expect(Object.isFrozen(directory)).toBe(true);
    expect(Object.isFrozen(directory.status === 'available' ? directory.sources : [])).toBe(true);
    if (directory.status !== 'available' || directory.sources[0] === undefined) {
      return;
    }
    const source = directory.sources[0];
    const detail = await connected.workspace.read({
      kind: 'legacy-review.moved-receipt-source',
      sourceIdentity: source.sourceIdentity,
      legacyCheckoutHash: source.legacyCheckoutHash,
      legacyWorkspacePathOffset: 0,
      legacyWorkspacePathLimit: 32,
    });
    expect(detail).toEqual(movedReceiptSourceProjection(1));
    expect(Object.isFrozen(detail)).toBe(true);
    expect(Object.isFrozen(detail.status === 'available' ? detail.legacyWorkspacePaths : [])).toBe(true);

    await expect(
      connected.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: {
          kind: 'former-checkout-path',
          exactFormerCanonicalCheckout: '/legacy/former/checkout',
        },
        sourceOffset: 0,
        sourceLimit: 1,
      }),
    ).resolves.toEqual(movedReceiptSourcesProjection(1, 'former'));
    if (source.observation.status !== 'detected') return;
    const associated = await connected.workspace.execute({
      kind: 'legacy-review.moved-receipt-source.associate-and-import',
      commandIdentity: 'runtime-associate-moved-receipt',
      expectedStateVersion: 1,
      confirmedWorkspaceIdentity: WORKSPACE_IDENTITY,
      sourceIdentity: source.sourceIdentity,
      legacyCheckoutHash: source.legacyCheckoutHash,
      expectedDigest: source.observation.digest,
    });
    expect(associated).toEqual({
      kind: 'legacy-review.moved-receipt-source.associated-and-imported',
      status: 'accepted',
      commandIdentity: 'runtime-associate-moved-receipt',
      stateVersion: 2,
      sourceIdentity: source.sourceIdentity,
      associationIdentity: `lma_${'8'.repeat(64)}`,
      sourceOccurrenceIdentity: `lso_${'9'.repeat(64)}`,
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      legacyCheckoutHash: source.legacyCheckoutHash,
      digest: source.observation.digest,
      association: 'recorded',
      preservation: 'preserved',
    });
    expect(Object.isFrozen(associated)).toBe(true);
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 32,
      }),
    ).resolves.toEqual(movedReceiptSourcesProjection(2, 'directory', true));
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: source.sourceIdentity,
        legacyCheckoutHash: source.legacyCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 32,
      }),
    ).resolves.toEqual(movedReceiptSourceProjection(2, true));
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });

    const readUnknown = connected.workspace.read as (request: unknown) => Promise<unknown>;
    await expect(
      readUnknown({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory', path: '/must/not/cross' },
        sourceOffset: 0,
        sourceLimit: 1,
      }),
    ).rejects.toMatchObject({ code: 'workspace-call-rejected' });
    await expect(
      readUnknown({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: source.sourceIdentity,
        legacyCheckoutHash: source.legacyCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 32,
        bytes: 'must-not-cross',
      }),
    ).rejects.toMatchObject({ code: 'workspace-call-rejected' });
    await expect(
      (connected.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.moved-receipt-source.associate-and-import',
        commandIdentity: 'runtime-malformed-moved-association',
        expectedStateVersion: 2,
        confirmedWorkspaceIdentity: WORKSPACE_IDENTITY,
        sourceIdentity: source.sourceIdentity,
        legacyCheckoutHash: source.legacyCheckoutHash,
        expectedDigest: source.observation.digest,
        sourcePath: '/must/not/cross',
      }),
    ).rejects.toMatchObject({ code: 'workspace-call-rejected' });
  });

  it('carries exact legacy import commands and results without changing transport semantics', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    const sources = await connected.workspace.read({
      kind: 'legacy-review.sources',
    });
    const queue = sources.sources[0];
    expect(queue.observation.status).toBe('detected');
    if (queue.observation.status !== 'detected') return;
    await expect(
      connected.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'runtime-legacy-import',
        expectedStateVersion: sources.stateVersion,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      commandIdentity: 'runtime-legacy-import',
      stateVersion: 2,
      sourceIdentity: queue.sourceIdentity,
      sourceOccurrenceIdentity: `lso_${'3'.repeat(64)}`,
      sourceKind: 'queue',
      digest: queue.observation.digest,
      preservation: 'preserved',
    });
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });
    await expect(
      (connected.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.source.import',
        commandIdentity: 'runtime-malformed-legacy-import',
        expectedStateVersion: 2,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        bytes: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
  });

  it('carries content-free legacy source decisions through the same transport', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    const sources = await connected.workspace.read({
      kind: 'legacy-review.sources',
    });
    const queue = sources.sources[0];
    expect(queue.observation.status).toBe('detected');
    if (queue.observation.status !== 'detected') return;
    await expect(
      connected.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'runtime-legacy-decision',
        expectedStateVersion: sources.stateVersion,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      commandIdentity: 'runtime-legacy-decision',
      stateVersion: 2,
      sourceIdentity: queue.sourceIdentity,
      sourceDecisionIdentity: `lsd_${'4'.repeat(64)}`,
      sourceKind: 'queue',
      digest: queue.observation.digest,
      decision: 'deferred',
      recording: 'recorded',
    });
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });
    await expect(
      (connected.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'runtime-malformed-legacy-decision',
        expectedStateVersion: 2,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'deferred',
        bytes: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
  });

  it('carries bounded labelled legacy receipt history through the same transport', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    const sources = await connected.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = sources.sources[1];
    if (source.observation.status !== 'detected') return;
    const imported = await connected.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'runtime-receipt-history-import',
      expectedStateVersion: sources.stateVersion,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
    });
    if (imported.kind !== 'legacy-review.source.imported') return;

    const history = await connected.workspace.read({
      kind: 'legacy-review.receipt-history',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchOffset: 0,
      batchLimit: 24,
    });
    expect(history).toEqual(legacyReceiptHistoryProjection(2, imported.sourceOccurrenceIdentity));
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.status === 'available' ? history.disclosure : {})).toBe(true);

    const batch = await connected.workspace.read({
      kind: 'legacy-review.receipt-batch',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchAbsolute: 0,
      annotationOffset: 0,
      annotationLimit: 8,
    });
    expect(batch).toEqual(legacyReceiptBatchProjection(2, imported.sourceOccurrenceIdentity));
    expect(Object.isFrozen(batch)).toBe(true);
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });
    await expect(
      (connected.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 24,
        bytes: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
  });

  it('carries bounded non-v1 legacy queue candidates through the same transport', async () => {
    await start(new ScriptedWorkspace());
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') return;

    const sources = await connected.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = sources.sources[0];
    if (source.observation.status !== 'detected') return;
    const imported = await connected.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'runtime-queue-candidate-import',
      expectedStateVersion: sources.stateVersion,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
    });
    if (imported.kind !== 'legacy-review.source.imported') return;

    const list = await connected.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    expect(list).toEqual(legacyQueueCandidatesProjection(2, imported.sourceOccurrenceIdentity));
    expect(Object.isFrozen(list)).toBe(true);
    if (list.status !== 'available' || list.candidates[0] === undefined) return;
    const detail = await connected.workspace.read({
      kind: 'legacy-review.queue-candidate',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: list.candidates[0].candidateIdentity,
      textUtf8Offset: 0,
      textUtf8Limit: 32 * 1024,
      excerptUtf8Offset: 0,
      excerptUtf8Limit: 16 * 1024,
    });
    expect(detail).toEqual(legacyQueueCandidateProjection(2, imported.sourceOccurrenceIdentity));
    expect(Object.isFrozen(detail)).toBe(true);

    const decision = await connected.workspace.execute({
      kind: 'legacy-review.queue-candidate.decision.set',
      commandIdentity: 'runtime-candidate-decision',
      expectedStateVersion: 2,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: list.candidates[0].candidateIdentity,
      decision: 'dismissed',
    });
    expect(decision).toEqual({
      kind: 'legacy-review.queue-candidate.decision-recorded',
      status: 'accepted',
      commandIdentity: 'runtime-candidate-decision',
      stateVersion: 3,
      sourceIdentity: `lgs_${'1'.repeat(64)}`,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: 'a'.repeat(64),
      candidateIdentity: list.candidates[0].candidateIdentity,
      candidateDecisionIdentity: `lcd_${'6'.repeat(64)}`,
      decision: 'dismissed',
      recording: 'recorded',
    });
    expect(Object.isFrozen(decision)).toBe(true);
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 32,
      }),
    ).resolves.toEqual(legacyQueueCandidatesProjection(3, imported.sourceOccurrenceIdentity, 'dismissed'));
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 16 * 1024,
      }),
    ).resolves.toEqual(legacyQueueCandidateProjection(3, imported.sourceOccurrenceIdentity, 'dismissed'));
    const promotion = await connected.workspace.execute({
      kind: 'review.legacy-question-candidate.promote',
      commandIdentity: 'runtime-candidate-promotion',
      expectedStateVersion: 3,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: list.candidates[0].candidateIdentity,
      expectedSourceDigest: 'a'.repeat(64),
      reviewIdentity: `rev_${'8'.repeat(64)}` as ReviewIdentity,
      expectedReviewSnapshotIdentity: `rsn_${'9'.repeat(64)}` as ReviewSnapshotIdentity,
      intent: 'question',
      anchor: {
        kind: 'review.whole-file',
        fileIdentity: `fil_${'b'.repeat(64)}`,
        side: 'new',
      },
    });
    expect(promotion).toEqual({
      kind: 'review.legacy-question-candidate.promoted',
      status: 'accepted',
      commandIdentity: 'runtime-candidate-promotion',
      stateVersion: 4,
      reviewIdentity: `rev_${'8'.repeat(64)}`,
      reviewSnapshotIdentity: `rsn_${'9'.repeat(64)}`,
      draftIdentity: `qdr_${'a'.repeat(64)}`,
      draftRevision: 1,
      anchor: {
        kind: 'review.whole-file',
        reviewSnapshotIdentity: `rsn_${'9'.repeat(64)}`,
        fileIdentity: `fil_${'b'.repeat(64)}`,
        side: 'new',
        scope: 'file',
        content: {
          status: 'available',
          classification: 'text',
          byteLength: 15,
          contentIdentity: {
            algorithm: 'sha256',
            value: 'c'.repeat(64),
          },
        },
      },
      sourceIdentity: `lgs_${'1'.repeat(64)}`,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      sourceDigest: 'a'.repeat(64),
      candidateIdentity: list.candidates[0].candidateIdentity,
      promotionIdentity: `lcp_${'7'.repeat(64)}`,
      intent: 'question',
    });
    expect(Object.isFrozen(promotion)).toBe(true);
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 32,
      }),
    ).resolves.toEqual(legacyQueueCandidatesProjection(4, imported.sourceOccurrenceIdentity, 'promoted'));
    await expect(
      connected.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 16 * 1024,
      }),
    ).resolves.toEqual(legacyQueueCandidateProjection(4, imported.sourceOccurrenceIdentity, 'promoted'));
    await expect(
      (connected.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'review.legacy-question-candidate.promote',
        commandIdentity: 'runtime-candidate-promotion-malformed',
        expectedStateVersion: 4,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        expectedSourceDigest: 'a'.repeat(64),
        reviewIdentity: `rev_${'8'.repeat(64)}`,
        expectedReviewSnapshotIdentity: `rsn_${'9'.repeat(64)}`,
        intent: 'question',
        anchor: {
          kind: 'review.whole-file',
          fileIdentity: `fil_${'b'.repeat(64)}`,
          side: 'new',
        },
        body: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({ code: 'workspace-call-rejected' });
    expect(connected.compatibility).toEqual({
      protocolVersion: 1,
      workspaceInterfaceVersion: 1,
    });
    await expect(
      (connected.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'runtime-candidate-decision-malformed',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        decision: 'dismissed',
        legacyText: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
    await expect(
      (connected.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 16 * 1024,
        bytes: 'must-not-cross-transport',
      }),
    ).rejects.toMatchObject({
      code: 'workspace-call-rejected',
    });
  });

  it('accepts split bootstrap frames and coalesced semantic calls', async () => {
    await start();
    const peer = await connectRaw();
    const encoded = Buffer.from(`${JSON.stringify(bootstrapFrame())}\n`);
    peer.socket.write(encoded.subarray(0, 7));
    peer.socket.write(encoded.subarray(7, 29));
    peer.socket.write(encoded.subarray(29));

    await expect(peer.next()).resolves.toMatchObject({
      type: 'bootstrap.accepted',
      runtimeGeneration: expect.stringMatching(/^rtg_/u),
    });

    const first = {
      type: 'workspace.operation',
      requestId: 'req_a',
      operation: 'read',
      payload: { kind: 'semantic.view' },
    };
    const second = {
      type: 'workspace.operation',
      requestId: 'req_b',
      operation: 'read',
      payload: { kind: 'semantic.view' },
    };
    peer.socket.write(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);

    await expect(peer.next()).resolves.toMatchObject({
      type: 'workspace.result',
      requestId: 'req_a',
      result: { kind: 'semantic.projection' },
    });
    await expect(peer.next()).resolves.toMatchObject({
      type: 'workspace.result',
      requestId: 'req_b',
      result: { kind: 'semantic.projection' },
    });
    peer.socket.destroy();
  });

  it('runs adjacent reads together while retaining accepted result order', async () => {
    const gated = new GatedOperationWorkspace();
    const first = gated.gate('read', 'read.first');
    const second = gated.gate('read', 'read.second');
    await start(gated);
    const peer = await connectRaw();
    peer.send(bootstrapFrame());
    await peer.next();
    peer.socket.write(
      `${JSON.stringify({
        type: 'workspace.operation',
        requestId: 'req_firstread',
        operation: 'read',
        payload: { kind: 'read.first' },
      })}\n${JSON.stringify({
        type: 'workspace.operation',
        requestId: 'req_secondread',
        operation: 'read',
        payload: { kind: 'read.second' },
      })}\n`,
    );

    try {
      await waitFor(
        () => gated.events.filter(event => event.endsWith(':start')).length === 2,
        'both adjacent Workspace reads to start',
      );
      second.complete({ kind: 'second.completed' });
      await waitFor(() => gated.events.includes('read:read.second:end'), 'second Workspace read to compute first');
      expect(gated.events).not.toContain('read:read.first:end');
      first.complete({ kind: 'first.completed' });

      await expect(peer.next()).resolves.toEqual({
        type: 'workspace.result',
        requestId: 'req_firstread',
        result: { kind: 'first.completed' },
      });
      await expect(peer.next()).resolves.toEqual({
        type: 'workspace.result',
        requestId: 'req_secondread',
        result: { kind: 'second.completed' },
      });
      expect(gated.events).toEqual([
        'read:read.first:start',
        'read:read.second:start',
        'read:read.second:end',
        'read:read.first:end',
      ]);
    } finally {
      first.complete({ kind: 'first.cleanup' });
      second.complete({ kind: 'second.cleanup' });
      peer.socket.destroy();
    }
  });

  it('holds every read behind commands and every command behind earlier reads', async () => {
    const gated = new GatedOperationWorkspace();
    const before = gated.gate('read', 'read.before');
    const command = gated.gate('execute', 'command.barrier');
    const secondCommand = gated.gate('execute', 'command.second');
    const after = gated.gate('read', 'read.after');
    await start(gated);
    const peer = await connectRaw();
    peer.send(bootstrapFrame());
    await peer.next();
    peer.socket.write(
      [
        {
          type: 'workspace.operation',
          requestId: 'req_before',
          operation: 'read',
          payload: { kind: 'read.before' },
        },
        {
          type: 'workspace.operation',
          requestId: 'req_command',
          operation: 'execute',
          payload: { kind: 'command.barrier' },
        },
        {
          type: 'workspace.operation',
          requestId: 'req_secondcommand',
          operation: 'execute',
          payload: { kind: 'command.second' },
        },
        {
          type: 'workspace.operation',
          requestId: 'req_after',
          operation: 'read',
          payload: { kind: 'read.after' },
        },
      ]
        .map(frame => JSON.stringify(frame))
        .join('\n') + '\n',
    );

    await before.started;
    before.complete({ kind: 'before.completed' });
    await command.started;
    expect(gated.events.indexOf('read:read.before:end')).toBeLessThan(
      gated.events.indexOf('execute:command.barrier:start'),
    );
    command.complete({ kind: 'command.completed' });
    await secondCommand.started;
    expect(gated.events.indexOf('execute:command.barrier:end')).toBeLessThan(
      gated.events.indexOf('execute:command.second:start'),
    );
    secondCommand.complete({ kind: 'second-command.completed' });
    await after.started;
    expect(gated.events.indexOf('execute:command.second:end')).toBeLessThan(
      gated.events.indexOf('read:read.after:start'),
    );
    after.complete({ kind: 'after.completed' });

    for (const [requestId, kind] of [
      ['req_before', 'before.completed'],
      ['req_command', 'command.completed'],
      ['req_secondcommand', 'second-command.completed'],
      ['req_after', 'after.completed'],
    ]) {
      await expect(peer.next()).resolves.toEqual({
        type: 'workspace.result',
        requestId,
        result: { kind },
      });
    }
    peer.socket.destroy();
  });

  it('fails bootstrap closed on protocol, Interface, workspace, and role mismatches', async () => {
    await start(new ScriptedWorkspace(), ['tui']);
    const cases = [
      {
        override: { protocolVersion: 2 },
        expected: {
          code: 'protocol-incompatible',
          supportedProtocolVersion: 1,
          receivedProtocolVersion: 2,
        },
      },
      {
        override: { workspaceInterfaceVersion: 2 },
        expected: {
          code: 'workspace-interface-incompatible',
          supportedWorkspaceInterfaceVersion: 1,
          receivedWorkspaceInterfaceVersion: 2,
        },
      },
      {
        override: { workspaceIdentity: OTHER_WORKSPACE_IDENTITY },
        expected: { code: 'workspace-mismatch' },
      },
      {
        override: { role: 'harness-adapter' },
        expected: { code: 'role-rejected' },
      },
      {
        override: { role: 'unknown-client' },
        expected: { code: 'role-rejected' },
      },
    ];

    for (const testCase of cases) {
      const peer = await connectRaw();
      peer.send(bootstrapFrame(testCase.override));
      await expect(peer.next()).resolves.toMatchObject({
        type: 'bootstrap.rejected',
        ...testCase.expected,
      });
      await peer.closed();
    }

    await expect(
      connectWorkspaceRuntime({
        workspaceIdentity: WORKSPACE_IDENTITY,
        role: 'harness-adapter',
      }),
    ).resolves.toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'runtime-role-rejected',
        role: 'harness-adapter',
      },
    });
  });

  it('rejects a different code identity before any Workspace call and requests one retirement', async () => {
    const { server } = await start();
    const retirement = waitForLocalRuntimeServerIdle(server, 3_600_000, new AbortController().signal);
    const peer = await connectRaw();
    peer.send(
      bootstrapFrame({
        runtimeCodeIdentity: `rtc_${'2'.repeat(64)}`,
        runtimeCodeMismatch: 'retire',
      }),
    );

    await expect(peer.next()).resolves.toEqual({
      type: 'bootstrap.rejected',
      code: 'runtime-code-mismatch',
    });
    await peer.closed();
    await expect(retirement).resolves.toBe('replacement-requested');
  });

  it('reports a different code identity to a read-only inspection without retiring', async () => {
    const { server } = await start();
    const retirement = waitForLocalRuntimeServerIdle(server, 3_600_000, new AbortController().signal);
    const peer = await connectRaw();
    peer.send(
      bootstrapFrame({
        runtimeCodeIdentity: `rtc_${'2'.repeat(64)}`,
        runtimeCodeMismatch: 'report',
      }),
    );

    await expect(peer.next()).resolves.toEqual({
      type: 'bootstrap.rejected',
      code: 'runtime-code-mismatch',
    });
    await peer.closed();
    // doctor from another install must leave this runtime and its clients alone.
    const outcome = await Promise.race([
      retirement,
      new Promise<'still-running'>(resolve => setTimeout(() => resolve('still-running'), 300)),
    ]);
    expect(outcome).toBe('still-running');
    await expect(
      connectWorkspaceRuntime({ workspaceIdentity: WORKSPACE_IDENTITY, role: 'tui' }),
    ).resolves.toMatchObject({ status: 'connected' });
  });

  it('creates an owner-private endpoint and rejects oversized frames', async () => {
    await start();
    const location = runtimeLocationForWorkspace(WORKSPACE_IDENTITY);
    // A Windows pipe has no mode; its privacy is the handshake (runtimeHandshake.test.ts).
    if (location.secret === undefined) {
      const directory = await lstat(location.directory);
      const endpoint = await lstat(location.endpoint);
      expect(directory.mode & 0o777).toBe(0o700);
      expect(endpoint.mode & 0o777).toBe(0o600);
      expect(endpoint.isSocket()).toBe(true);
      expect(directory.uid).toBe(process.getuid?.());
      expect(endpoint.uid).toBe(process.getuid?.());
    }

    const peer = await connectRaw();
    peer.send(bootstrapFrame());
    await peer.next();
    peer.socket.write(Buffer.alloc(MAX_FRAME_BYTES + 1, 0x61));
    await expect(peer.next()).resolves.toEqual({
      type: 'protocol.error',
      code: 'frame-too-large',
    });
    await peer.closed();
  });

  it('keeps the shared Workspace in the foreground while any client is', async () => {
    const scripted = new ScriptedWorkspace();
    await start(scripted);
    const connect = async (): Promise<{ readonly workspace: Workspace; readonly controller: AbortController }> => {
      const controller = new AbortController();
      controllers.add(controller);
      const connected = await connectWorkspaceRuntime({
        workspaceIdentity: WORKSPACE_IDENTITY,
        role: 'tui',
        signal: controller.signal,
      });
      if (connected.status !== 'connected') throw new Error('Runtime connection failed');
      return { workspace: connected.workspace, controller };
    };
    const first = await connect();
    const second = await connect();
    // A frame barrier: the attention frame before it has been handled.
    const settle = async (workspace: Workspace): Promise<void> => {
      await workspace.read({ kind: 'workspace.identity' });
    };

    first.workspace.setAttention('background');
    await settle(first.workspace);
    // The second client has not said, so it may be looking.
    expect(scripted.attention).toEqual(['background']);
    second.workspace.setAttention('foreground');
    await settle(second.workspace);
    expect(scripted.attention).toEqual(['background', 'foreground']);
    second.workspace.setAttention('background');
    await settle(second.workspace);
    expect(scripted.attention).toEqual(['background', 'foreground', 'background']);
    // A client that leaves no longer holds the Workspace in the background.
    second.controller.abort();
    first.controller.abort();
    await waitFor(() => scripted.attention.length === 4, 'foreground after every client left');
    expect(scripted.attention.at(-1)).toBe('foreground');
  });

  it('sequences subscription updates and stops them after unsubscribe', async () => {
    const scripted = new ScriptedWorkspace();
    await start(scripted);
    const peer = await connectRaw();
    peer.send(bootstrapFrame());
    await peer.next();
    peer.send({
      type: 'workspace.subscribe',
      subscriptionId: 'sub_versions',
      scope: { kind: 'workspace.identity' },
    });

    await expect(peer.next()).resolves.toEqual({
      type: 'workspace.subscribed',
      subscriptionId: 'sub_versions',
    });
    await expect(peer.next()).resolves.toMatchObject({
      type: 'workspace.update',
      subscriptionId: 'sub_versions',
      sequence: 1,
      update: { stateVersion: 1 },
    });
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 2));
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 3));
    await expect(peer.next()).resolves.toMatchObject({
      type: 'workspace.update',
      sequence: 2,
      update: { stateVersion: 2 },
    });
    await expect(peer.next()).resolves.toMatchObject({
      type: 'workspace.update',
      sequence: 3,
      update: { stateVersion: 3 },
    });

    peer.send({
      type: 'workspace.unsubscribe',
      subscriptionId: 'sub_versions',
    });
    await expect(peer.next()).resolves.toEqual({
      type: 'workspace.unsubscribed',
      subscriptionId: 'sub_versions',
    });
    scripted.publish(identityProjection(WORKSPACE_IDENTITY, 4));
    peer.send({
      type: 'workspace.operation',
      requestId: 'req_afterunsubscribe',
      operation: 'read',
      payload: { kind: 'semantic.view' },
    });
    await expect(peer.next()).resolves.toEqual({
      type: 'workspace.result',
      requestId: 'req_afterunsubscribe',
      result: {
        kind: 'semantic.projection',
        stateVersion: 1,
        value: 'bounded',
      },
    });
    peer.socket.destroy();
  });

  it('disconnects only a slow subscriber when bounded output backpressure is exceeded', async () => {
    const scripted = new ScriptedWorkspace();
    await start(scripted);
    const slow = await connectRaw();
    slow.send(bootstrapFrame());
    await slow.next();
    slow.send({
      type: 'workspace.subscribe',
      subscriptionId: 'sub_slow',
      scope: { kind: 'workspace.identity' },
    });
    await slow.next();
    await slow.next();
    slow.socket.pause();

    const largeUpdate = {
      kind: 'workspace.identity',
      interfaceVersion: 1,
      workspaceIdentity: WORKSPACE_IDENTITY,
      canonicalCheckout: '/semantic/checkout',
      stateVersion: 2,
      boundedContent: 'x'.repeat(256 * 1024),
    };
    for (let index = 0; index < 200; index += 1) {
      scripted.publish({ ...largeUpdate, stateVersion: index + 2 });
    }
    slow.socket.resume();
    await slow.closed();

    const controller = new AbortController();
    controllers.add(controller);
    const healthy = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    expect(healthy.status).toBe('connected');
    if (healthy.status === 'connected') {
      await expect(healthy.workspace.read({ kind: 'workspace.identity' })).resolves.toMatchObject({
        workspaceIdentity: WORKSPACE_IDENTITY,
      });
    }
  });

  it('waits for every active read in a cohort during graceful disposal', async () => {
    const gated = new GatedOperationWorkspace();
    const first = gated.gate('read', 'read.close-first');
    const second = gated.gate('read', 'read.close-second');
    const { server } = await start(gated);
    const peer = await connectRaw();
    peer.send(bootstrapFrame());
    await peer.next();
    peer.socket.write(
      [
        {
          type: 'workspace.operation',
          requestId: 'req_closefirst',
          operation: 'read',
          payload: { kind: 'read.close-first' },
        },
        {
          type: 'workspace.operation',
          requestId: 'req_closesecond',
          operation: 'read',
          payload: { kind: 'read.close-second' },
        },
      ]
        .map(frame => JSON.stringify(frame))
        .join('\n') + '\n',
    );
    await waitFor(
      () => gated.events.filter(event => event.endsWith(':start')).length === 2,
      'disposal read cohort to start',
    );

    let disposed = false;
    const disposal = server.dispose().then(() => {
      disposed = true;
    });
    await peer.closed();
    second.complete({ kind: 'close-second.completed' });
    await waitFor(() => gated.events.includes('read:read.close-second:end'), 'second disposal read to complete');
    expect(disposed).toBe(false);
    first.complete({ kind: 'close-first.completed' });
    await disposal;
    expect(disposed).toBe(true);
    servers.delete(server);
    await expect(lstat(runtimeLocationForWorkspace(WORKSPACE_IDENTITY).endpoint)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects pending calls on disconnect without replay or transport detail', async () => {
    const scripted = new ScriptedWorkspace();
    const { server } = await start(scripted);
    const controller = new AbortController();
    controllers.add(controller);
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    if (connected.status !== 'connected') throw new Error('runtime did not connect');

    const blocked = scripted.blockNextRead();
    const pending = (connected.workspace as unknown as { read(request: unknown): Promise<unknown> }).read({
      kind: 'blocked.projection',
    });
    const rejected = expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LocalRuntimeSessionError &&
        error.code === 'runtime-disconnected' &&
        !containsForbiddenMechanic(error),
    );
    await blocked.started;
    const disposed = server.dispose();
    await rejected;
    blocked.complete({ kind: 'read.finished-after-disconnect' });
    await disposed;
    servers.delete(server);
    await expect(lstat(runtimeLocationForWorkspace(WORKSPACE_IDENTITY).endpoint)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
