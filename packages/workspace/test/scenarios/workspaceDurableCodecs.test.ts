import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { openAuthoritativeState } from '../../src/authoritativeState.js';
import {
  parseReviewBasis,
  parseReviewContextContribution,
  parseReviewIndexEntry,
  parseReviewMessage,
  parseReviewMessageBatch,
  parseReviewMessageOutgoingMaterial,
  parseReviewMessageResponse,
  parseReviewingCommandRecord,
  parseReviewQuestion,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewMessageIdentity,
  reviewMessageMaterialIdentity,
  reviewingRecordIdentity,
  reviewSnapshotBasisIdentity,
  parseReviewSnapshot,
  parseReviewSnapshotFile,
} from '../../src/reviewing/index.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import { reviewComparisonResolutionIdentity } from '../../src/workspaceEvidence/index.js';
import type { WorkspaceIdentity } from '../../src/index.js';
import type { ReviewIdentity, ReviewSnapshotIdentity } from '@buildframe/workspace/reviewing';

const REVIEW_IDENTITY = `rev_${'1'.repeat(64)}`;
const SNAPSHOT_IDENTITY = `rsn_${'2'.repeat(64)}`;
const CHANGE_SET_IDENTITY = `cst_${'3'.repeat(64)}`;
const FILE_IDENTITY = `fil_${'4'.repeat(64)}`;
const BATCH_IDENTITY = `rbt_${'5'.repeat(64)}`;
const QUESTION_IDENTITY = `qst_${'6'.repeat(64)}`;
const CONTRIBUTION_IDENTITY = `rcc_${'7'.repeat(64)}`;
const RESPONSE_IDENTITY = `rrp_${'8'.repeat(64)}`;
const WORKSPACE_IDENTITY = 'wsp_11111111-1111-4111-8111-111111111111' as WorkspaceIdentity;

function harnessIdentity(prefix: string, ...parts: readonly string[]): string {
  const digest = createHash('sha256')
    .update(`neoflow-harness-interaction-v1\0${parts.join('\0')}`)
    .digest('hex');
  return `${prefix}_${digest}`;
}

describe('Workspace owner-local durable codecs', () => {
  it('round-trips exact context contribution evidence and rejects incoherent provenance', () => {
    const bytes = Buffer.from([0, 1, 2, 255]);
    const bytesSha256 = createHash('sha256').update(bytes).digest('hex');
    const editor = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      contributionIdentity: CONTRIBUTION_IDENTITY,
      kind: 'editor',
      source: { kind: 'editor-buffer', sourceIdentity: 'untitled://codec-fixture' },
      scope: { kind: 'bytes', offset: 4, length: bytes.byteLength },
      editor: {
        editorInstanceIdentity: 'codec-editor',
        bufferIdentity: 'codec-buffer',
        bufferVersion: 9,
        savedState: 'unsaved',
        attestation: 'unattested-editor-command',
      },
      content: { status: 'available', byteLength: bytes.byteLength, sha256: bytesSha256 },
      sensitivity: { sensitive: true, reasons: ['unsaved-editor'] },
    } as const;
    expect(parseReviewContextContribution(editor)).toEqual(editor);
    expect(() =>
      parseReviewContextContribution({
        ...editor,
        sensitivity: { sensitive: false, reasons: [] },
      }),
    ).toThrow('reviewing-state-invalid');

    const bodySha256 = createHash('sha256').update('body').digest('hex');
    const response = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      contributionIdentity: CONTRIBUTION_IDENTITY,
      kind: 'artifact',
      artifact: {
        kind: 'review-response',
        artifactIdentity: RESPONSE_IDENTITY,
        sourceReviewIdentity: `rev_${'9'.repeat(64)}`,
        questionIdentity: QUESTION_IDENTITY,
        sourceByteLength: 4,
        sourceSha256: bodySha256,
        sourceRecordChecksum: 'a'.repeat(64),
      },
      scope: { kind: 'whole' },
      content: { status: 'available', byteLength: 4, sha256: bodySha256 },
      sensitivity: { sensitive: false, reasons: [] },
    } as const;
    expect(parseReviewContextContribution(response)).toEqual(response);
    expect(() =>
      parseReviewContextContribution({
        ...response,
        content: { ...response.content, sha256: 'b'.repeat(64) },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewContextContribution({
        ...response,
        content: { status: 'unavailable', reason: 'contribution-limit', observedByteLength: 4 },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('round-trips every Review Basis provenance and rejects cross-kind or authorship claims', () => {
    const reviewIdentity = REVIEW_IDENTITY as ReviewIdentity;
    const reviewSnapshotIdentity = SNAPSHOT_IDENTITY as ReviewSnapshotIdentity;
    const liveReviewBasisIdentity = reviewLiveBasisIdentity(reviewIdentity);
    const savedReviewBasisIdentity = reviewSnapshotBasisIdentity(reviewIdentity, reviewSnapshotIdentity);
    const commitObjectIdentity = 'a'.repeat(40);
    const gitReviewBasisIdentity = reviewGitCommitBasisIdentity(reviewIdentity, commitObjectIdentity);
    const live = {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity: liveReviewBasisIdentity,
      kind: 'live',
    } as const;
    const saved = {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity: savedReviewBasisIdentity,
      kind: 'saved-review-point',
      parentReviewBasisIdentity: liveReviewBasisIdentity,
      reviewSnapshotIdentity,
    } as const;
    const commit = {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity: gitReviewBasisIdentity,
      kind: 'git-commit',
      parentReviewBasisIdentity: liveReviewBasisIdentity,
      reviewSnapshotIdentity,
      commit: {
        kind: 'commit',
        objectFormat: 'sha1',
        objectIdentity: commitObjectIdentity,
        abbreviatedObjectIdentity: commitObjectIdentity.slice(0, 7),
        subject: 'Exact historical commit',
      },
    } as const;
    const changeEvent = {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity: savedReviewBasisIdentity,
      kind: 'change-event',
      parentReviewBasisIdentity: liveReviewBasisIdentity,
      reviewSnapshotIdentity,
      provenance: {
        kind: 'changes-observed-after-response',
        responseIdentity: RESPONSE_IDENTITY,
      },
    } as const;
    expect(parseReviewBasis(live)).toEqual(live);
    expect(parseReviewBasis(saved)).toEqual(saved);
    expect(parseReviewBasis(commit)).toEqual(commit);
    expect(parseReviewBasis(changeEvent)).toEqual(changeEvent);
    expect(() => parseReviewBasis({ ...live, parentReviewBasisIdentity: savedReviewBasisIdentity })).toThrow(
      'reviewing-state-invalid',
    );
    expect(() =>
      parseReviewBasis({
        ...saved,
        reviewBasisIdentity: gitReviewBasisIdentity,
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewBasis({
        ...changeEvent,
        provenance: {
          kind: 'changes-made-by-harness',
          responseIdentity: RESPONSE_IDENTITY,
        },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('round-trips one-type Review Messages and their independently settled Responses', () => {
    const reviewIdentity = REVIEW_IDENTITY as ReviewIdentity;
    const messageIdentity = reviewMessageIdentity('codec-review-message');
    const outgoingMaterialIdentity = reviewMessageMaterialIdentity('codec-review-message');
    const originReviewBasisIdentity = reviewLiveBasisIdentity(reviewIdentity);
    const message = {
      formatVersion: 1,
      reviewIdentity,
      reviewMessageIdentity: messageIdentity,
      originReviewBasisIdentity,
      location: {
        file: { bytesBase64: Buffer.from('src/session.ts').toString('base64'), display: 'src/session.ts' },
        line: 3,
      },
      body: 'Why is this timeout one hour?',
      outgoingMaterialIdentity,
      repositoryStateAtCommitment: {
        kind: 'current-repository-state',
        basis: {
          kind: 'head',
          selector: 'HEAD',
          objectFormat: 'sha1',
          objectIdentity: 'a'.repeat(40),
          state: 'resolved',
        },
        comparedState: {
          kind: 'effective-working-state',
          staged: 'included',
          unstaged: 'included',
          nonIgnoredUntracked: 'included',
          ignoredUntracked: 'excluded',
        },
        manifest: {
          formatVersion: 1,
          totalFiles: 0,
          digest: { algorithm: 'sha256', value: '0'.repeat(64) },
        },
      },
    } as const;
    expect(parseReviewMessage(message)).toEqual(message);
    expect(() => parseReviewMessage({ ...message, intent: 'change-request' })).toThrow('reviewing-state-invalid');
    expect(() => parseReviewMessage({ ...message, body: 'invalid \ud800 text' })).toThrow('reviewing-state-invalid');
    expect(() => parseReviewMessage({ ...message, location: { ...message.location, line: 0 } })).toThrow(
      'reviewing-state-invalid',
    );
    const batch = {
      formatVersion: 1,
      reviewIdentity,
      reviewBatchIdentity: BATCH_IDENTITY,
      reviewMessageIdentity: messageIdentity,
      originReviewBasisIdentity,
    } as const;
    expect(parseReviewMessageBatch(batch)).toEqual(batch);
    expect(() => parseReviewMessageBatch({ ...batch, questionIdentities: [] })).toThrow('reviewing-state-invalid');
    const materialBody = `${message.body}\n\nsrc/session.ts:3`;
    const material = {
      formatVersion: 1,
      reviewIdentity,
      reviewMessageIdentity: messageIdentity,
      outgoingMaterialIdentity,
      representation: 'live-repository-reference',
      encoding: 'utf8',
      byteLength: Buffer.byteLength(materialBody),
      characterLength: [...materialBody].length,
      sha256: createHash('sha256').update(materialBody).digest('hex'),
    } as const;
    expect(parseReviewMessageOutgoingMaterial(material)).toEqual(material);
    expect(() => parseReviewMessageOutgoingMaterial({ ...material, byteLength: -1 })).toThrow(
      'reviewing-state-invalid',
    );

    const body = 'It is inherited from the session default.';
    const response = {
      formatVersion: 1,
      reviewIdentity,
      reviewMessageIdentity: messageIdentity,
      responseIdentity: RESPONSE_IDENTITY,
      handoffIdentity: harnessIdentity('hho', 'message-handoff'),
      invocationIdentity: harnessIdentity('hin', 'message-invocation'),
      terminalEvidenceIdentity: 'terminal-message-evidence',
      artifactResultContractIdentity: 'review-response-v1',
      body,
      bodySha256: createHash('sha256').update(body).digest('hex'),
      bodyByteLength: Buffer.byteLength(body),
    } as const;
    expect(parseReviewMessageResponse(response)).toEqual(response);
    expect(() => parseReviewMessageResponse({ ...response, body: `${body}!` })).toThrow('reviewing-state-invalid');
    expect(() => parseReviewMessageResponse({ ...response, questionIdentity: QUESTION_IDENTITY })).toThrow(
      'reviewing-state-invalid',
    );
  });

  it('strictly admits optional basis-tree indexes while preserving historical absence', () => {
    const reviewIdentity = REVIEW_IDENTITY as ReviewIdentity;
    const liveReviewBasisIdentity = reviewLiveBasisIdentity(reviewIdentity);
    const entry = {
      reviewIdentity,
      status: 'retained',
      changeSetIdentity: CHANGE_SET_IDENTITY,
      reviewSnapshotIdentities: [SNAPSHOT_IDENTITY],
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      draftIdentities: [],
      openDraftIdentities: [],
      batchIdentities: [],
      questionIdentities: [],
      dispositionIdentities: [],
      currentDispositions: [],
      responses: [],
    } as const;
    expect(parseReviewIndexEntry(entry)).not.toHaveProperty('basisTree');
    const messageIdentity = reviewMessageIdentity('indexed-codec-message');
    expect(
      parseReviewIndexEntry({
        ...entry,
        basisTree: {
          formatVersion: 1,
          liveReviewBasisIdentity,
          reviewBasisIdentities: [liveReviewBasisIdentity],
        },
        messageHistory: {
          formatVersion: 1,
          messages: [{ reviewMessageIdentity: messageIdentity, originReviewBasisIdentity: liveReviewBasisIdentity }],
          responses: [],
          changeObservations: [],
        },
      }),
    ).toMatchObject({
      basisTree: { liveReviewBasisIdentity, reviewBasisIdentities: [liveReviewBasisIdentity] },
      messageHistory: {
        messages: [{ reviewMessageIdentity: messageIdentity, originReviewBasisIdentity: liveReviewBasisIdentity }],
      },
    });
    expect(() =>
      parseReviewIndexEntry({
        ...entry,
        basisTree: {
          formatVersion: 1,
          liveReviewBasisIdentity,
          reviewBasisIdentities: [liveReviewBasisIdentity, liveReviewBasisIdentity],
        },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewIndexEntry({
        ...entry,
        basisTree: {
          formatVersion: 1,
          liveReviewBasisIdentity: `rbs_${'f'.repeat(64)}`,
          reviewBasisIdentities: [`rbs_${'f'.repeat(64)}`],
        },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('rejects malformed nested Review Snapshot evidence', () => {
    expect(() =>
      parseReviewSnapshot({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        changeSetIdentity: CHANGE_SET_IDENTITY,
        basis: {},
        comparedState: {},
        manifest: {},
        workspaceVerificationAtCapture: 'current',
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('validates frozen Snapshot context basis as one self-contained fact', () => {
    const selectionIdentity = reviewingRecordIdentity('rcs', REVIEW_IDENTITY, 'context-selection');
    const contextIdentity = reviewingRecordIdentity('rsc', SNAPSHOT_IDENTITY, 'snapshot-context');
    const ruleIdentity = `rcr_${'a'.repeat(64)}`;
    const itemIdentity = reviewingRecordIdentity('rsi', SNAPSHOT_IDENTITY, '0');
    const item = {
      kind: 'locator',
      itemIdentity,
      order: 0,
      source: {
        origins: [0],
        pathBytesBase64: Buffer.from('ctx/a.txt').toString('base64'),
        sourceKind: 'regular',
        eligibility: 'tracked',
        gitMode: '100644',
        sourceAvailability: 'available',
        sensitive: false,
        status: 'excluded',
      },
      decision: {
        status: 'excluded',
        decidingRuleIdentity: ruleIdentity,
        inclusionRuleIdentities: [ruleIdentity],
      },
      scope: { kind: 'bytes', intervals: [{ kind: 'bytes', offset: 0, length: 4 }] },
      contents: [],
    } as const;
    const context = {
      formatVersion: 1,
      contextIdentity,
      selectionIdentity,
      selectionRevision: 1,
      rules: [
        {
          ruleIdentity,
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ordinary',
            pathBytesBase64: Buffer.from('ctx/a.txt').toString('base64'),
          },
        },
      ],
      defaultIgnoredUntracked: 'excluded',
      semanticDigest: { algorithm: 'sha256', value: 'b'.repeat(64) },
      manifest: {
        formatVersion: 1,
        totalItems: 1,
        digest: {
          algorithm: 'sha256',
          value: createHash('sha256')
            .update(JSON.stringify([item]))
            .digest('hex'),
        },
        windowSize: 64,
      },
      sourceGroups: [{ kind: 'locator', order: 0, origin: 0, ruleIdentity }],
      conflicts: [],
      totals: {
        availableItems: 0,
        unavailableItems: 0,
        excludedItems: 1,
        sensitiveItems: 0,
        contentSegments: 0,
        contentBytes: 0,
      },
    } as const;
    const payload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis: {
        kind: 'head',
        selector: 'HEAD',
        objectFormat: 'sha1',
        objectIdentity: 'c'.repeat(40),
        state: 'resolved',
      },
      comparedState: {
        kind: 'effective-working-state',
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
      },
      manifest: {
        formatVersion: 1,
        totalFiles: 1,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      context,
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(payload)).toMatchObject({
      context: { contextIdentity, selectionRevision: 1, totals: { excludedItems: 1 } },
    });
    expect(parseReviewSnapshot({ ...payload, context: undefined })).not.toHaveProperty('context');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        context: {
          ...context,
          contextIdentity: reviewingRecordIdentity('rsc', `rsn_${'e'.repeat(64)}`, 'snapshot-context'),
        },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        context: { ...context, selectionRevision: 0 },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        context: {
          ...context,
          totals: { ...context.totals, availableItems: 2, excludedItems: 1 },
        },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        context: {
          ...context,
          manifest: {
            ...context.manifest,
            windowSize: 32,
          },
        },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        context: {
          ...context,
          sourceGroups: [{ kind: 'locator', order: 0, origin: 1, ruleIdentity }],
        },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('validates exact dynamic comparison evidence as one durable fact', () => {
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/review-target',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: 'b'.repeat(40),
      },
    } as const;
    const basis = {
      kind: 'tree',
      selector: 'refs/heads/review-target',
      objectFormat: 'sha1',
      objectIdentity: 'a'.repeat(40),
      abbreviatedObjectIdentity: 'a'.repeat(12),
    } as const;
    const comparedState = {
      kind: 'tree',
      selector: 'b'.repeat(40),
      objectFormat: 'sha1',
      objectIdentity: 'b'.repeat(40),
      abbreviatedObjectIdentity: 'b'.repeat(12),
    } as const;
    const comparisonDynamicInputs = [
      {
        kind: 'local-ref',
        role: 'basis',
        reference: 'refs/heads/review-target',
        objectFormat: 'sha1',
        referenceObjectIdentity: 'c'.repeat(40),
        resolvedObjectKind: 'tree',
        resolvedObjectIdentity: 'a'.repeat(40),
      },
    ] as const;
    const comparisonResolutionIdentity = reviewComparisonResolutionIdentity(
      selection,
      basis,
      comparedState,
      comparisonDynamicInputs,
    );
    const payload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis,
      comparedState,
      comparison: selection,
      comparisonResolutionIdentity,
      comparisonDynamicInputs,
      manifest: {
        formatVersion: 1,
        totalFiles: 1,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(payload)).toMatchObject({
      comparisonResolutionIdentity,
      comparisonDynamicInputs: [{ role: 'basis' }],
    });
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        comparisonDynamicInputs: undefined,
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        comparisonDynamicInputs: [
          {
            ...comparisonDynamicInputs[0],
            referenceObjectIdentity: 'e'.repeat(40),
          },
        ],
      }),
    ).toThrow('reviewing-state-invalid');
    const wrongRoleInputs = [
      {
        ...comparisonDynamicInputs[0],
        role: 'compared',
      },
    ] as const;
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        comparisonDynamicInputs: wrongRoleInputs,
        comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
          selection,
          basis,
          comparedState,
          wrongRoleInputs,
        ),
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('round-trips scoped endpoint witnesses and rejects mismatched scope evidence', () => {
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/scoped-target',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: 'b'.repeat(40),
      },
      scope: {
        kind: 'exact-paths',
        entries: [
          {
            pathBytesBase64: Buffer.from('selected.txt').toString('base64'),
            inclusion: 'ordinary',
          },
        ],
      },
    } as const;
    const basis = {
      kind: 'tree',
      selector: 'refs/heads/scoped-target',
      objectFormat: 'sha1',
      objectIdentity: 'a'.repeat(40),
      abbreviatedObjectIdentity: 'a'.repeat(12),
      scopeFingerprint: 'f'.repeat(64),
    } as const;
    const comparedState = {
      kind: 'tree',
      selector: 'b'.repeat(40),
      objectFormat: 'sha1',
      objectIdentity: 'b'.repeat(40),
      abbreviatedObjectIdentity: 'b'.repeat(12),
      scopeFingerprint: 'e'.repeat(64),
    } as const;
    const dynamicInputs = [
      {
        kind: 'local-ref',
        role: 'basis',
        reference: 'refs/heads/scoped-target',
        objectFormat: 'sha1',
        referenceObjectIdentity: 'c'.repeat(40),
        resolvedObjectKind: 'tree',
        resolvedObjectIdentity: 'a'.repeat(40),
      },
    ] as const;
    const comparisonResolutionIdentity = reviewComparisonResolutionIdentity(
      selection,
      basis,
      comparedState,
      dynamicInputs,
    );
    const payload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis,
      comparedState,
      comparison: selection,
      comparisonResolutionIdentity,
      comparisonDynamicInputs: dynamicInputs,
      manifest: {
        formatVersion: 1,
        totalFiles: 1,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(payload)).toMatchObject({
      basis: { scopeFingerprint: 'f'.repeat(64) },
      comparedState: { scopeFingerprint: 'e'.repeat(64) },
      comparison: { scope: selection.scope },
    });
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        basis: { ...basis, scopeFingerprint: undefined },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        comparedState: { ...comparedState, scopeFingerprint: '0'.repeat(64) },
      }),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshot({
        ...payload,
        comparison: {
          ...selection,
          scope: {
            kind: 'exact-paths',
            entries: [selection.scope.entries[0], selection.scope.entries[0]],
          },
        },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('validates paired index and working comparison evidence as durable facts', () => {
    const indexSelection = {
      kind: 'revision-to-index',
      basis: {
        kind: 'object',
        objectKind: 'commit',
        objectIdentity: 'a'.repeat(40),
      },
    } as const;
    const commitBasis = {
      kind: 'commit',
      selector: 'a'.repeat(40),
      objectFormat: 'sha1',
      objectIdentity: 'a'.repeat(40),
      abbreviatedObjectIdentity: 'a'.repeat(12),
      subject: 'paired basis',
    } as const;
    const indexComparedState = {
      kind: 'index',
      selector: 'index',
      objectFormat: 'sha1',
      entryCount: 2,
      indexFingerprint: 'f'.repeat(64),
    } as const;
    const indexIdentity = reviewComparisonResolutionIdentity(indexSelection, commitBasis, indexComparedState, []);
    const indexPayload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis: commitBasis,
      comparedState: indexComparedState,
      comparison: indexSelection,
      comparisonResolutionIdentity: indexIdentity,
      comparisonDynamicInputs: [],
      manifest: {
        formatVersion: 1,
        totalFiles: 1,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(indexPayload)).toMatchObject({
      comparedState: { kind: 'index', entryCount: 2 },
      comparisonDynamicInputs: [],
    });
    expect(() =>
      parseReviewSnapshot({
        ...indexPayload,
        comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
          indexSelection,
          commitBasis,
          { ...indexComparedState, entryCount: 3 },
          [],
        ),
      }),
    ).toThrow('reviewing-state-invalid');
    // Old records without the paired endpoint witnesses keep parsing.
    expect(
      parseReviewSnapshot({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        changeSetIdentity: CHANGE_SET_IDENTITY,
        basis: {
          kind: 'head',
          selector: 'HEAD',
          objectFormat: 'sha1',
          objectIdentity: 'a'.repeat(40),
          state: 'resolved',
        },
        comparedState: {
          kind: 'effective-working-state',
          staged: 'included',
          unstaged: 'included',
          nonIgnoredUntracked: 'included',
          ignoredUntracked: 'excluded',
        },
        manifest: {
          formatVersion: 1,
          totalFiles: 0,
          digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
        },
        workspaceVerificationAtCapture: 'current',
      }),
    ).toMatchObject({
      comparedState: { kind: 'effective-working-state' },
    });
    const workingSelection = {
      kind: 'revision-to-working-state',
      basis: {
        kind: 'local-ref',
        objectKind: 'commit',
        reference: 'refs/heads/review-target',
      },
    } as const;
    const workingComparedState = {
      kind: 'effective-working-state',
      selector: 'effective-working-state',
      objectFormat: 'sha1',
      staged: 'included',
      unstaged: 'included',
      nonIgnoredUntracked: 'included',
      ignoredUntracked: 'excluded',
      entryCount: 3,
      workingFingerprint: 'e'.repeat(64),
    } as const;
    const workingInputs = [
      {
        kind: 'local-ref',
        role: 'basis',
        reference: 'refs/heads/review-target',
        objectFormat: 'sha1',
        referenceObjectIdentity: 'c'.repeat(40),
        resolvedObjectKind: 'commit',
        resolvedObjectIdentity: 'a'.repeat(40),
      },
    ] as const;
    const workingPayload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis: {
        kind: 'commit',
        selector: 'refs/heads/review-target',
        objectFormat: 'sha1',
        objectIdentity: 'a'.repeat(40),
        abbreviatedObjectIdentity: 'a'.repeat(12),
        subject: 'working basis',
      },
      comparedState: workingComparedState,
      comparison: workingSelection,
      comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
        workingSelection,
        {
          kind: 'commit',
          selector: 'refs/heads/review-target',
          objectFormat: 'sha1',
          objectIdentity: 'a'.repeat(40),
          abbreviatedObjectIdentity: 'a'.repeat(12),
          subject: 'working basis',
        },
        workingComparedState,
        workingInputs,
      ),
      comparisonDynamicInputs: workingInputs,
      manifest: {
        formatVersion: 1,
        totalFiles: 2,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(workingPayload)).toMatchObject({
      comparedState: { kind: 'effective-working-state', entryCount: 3 },
      comparisonDynamicInputs: [{ role: 'basis' }],
    });
    expect(() =>
      parseReviewSnapshot({
        ...workingPayload,
        comparedState: {
          ...workingComparedState,
          workingFingerprint: '0'.repeat(64),
        },
      }),
    ).toThrow('reviewing-state-invalid');

    const pairedIndexSelection = { kind: 'index-to-working-tree' } as const;
    const pairedIndexBasis = {
      kind: 'index',
      selector: 'index',
      objectFormat: 'sha1',
      entryCount: 2,
      indexFingerprint: 'f'.repeat(64),
    } as const;
    const pairedIndexComparedState = {
      kind: 'working-tree',
      selector: 'working-tree',
      objectFormat: 'sha1',
      entryCount: 2,
      workingFingerprint: 'e'.repeat(64),
    } as const;
    const pairedIndexPayload = {
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      changeSetIdentity: CHANGE_SET_IDENTITY,
      basis: pairedIndexBasis,
      comparedState: pairedIndexComparedState,
      comparison: pairedIndexSelection,
      comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
        pairedIndexSelection,
        pairedIndexBasis,
        pairedIndexComparedState,
        [],
      ),
      comparisonDynamicInputs: [],
      manifest: {
        formatVersion: 1,
        totalFiles: 1,
        digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
      },
      workspaceVerificationAtCapture: 'current',
    } as const;
    expect(parseReviewSnapshot(pairedIndexPayload)).toMatchObject({
      basis: { kind: 'index' },
      comparedState: { kind: 'working-tree' },
      comparisonDynamicInputs: [],
    });
    expect(() =>
      parseReviewSnapshot({
        ...pairedIndexPayload,
        comparisonDynamicInputs: workingInputs,
        comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
          pairedIndexSelection,
          pairedIndexBasis,
          pairedIndexComparedState,
          workingInputs,
        ),
      }),
    ).toThrow('reviewing-state-invalid');

    // A witness-bearing compared state without a paired comparison is invalid.
    expect(() =>
      parseReviewSnapshot({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        changeSetIdentity: CHANGE_SET_IDENTITY,
        basis: {
          kind: 'head',
          selector: 'HEAD',
          objectFormat: 'sha1',
          objectIdentity: 'a'.repeat(40),
          state: 'resolved',
        },
        comparedState: {
          kind: 'effective-working-state',
          selector: 'effective-working-state',
          objectFormat: 'sha1',
          staged: 'included',
          unstaged: 'included',
          nonIgnoredUntracked: 'included',
          ignoredUntracked: 'excluded',
          entryCount: 1,
          workingFingerprint: 'e'.repeat(64),
        },
        manifest: {
          formatVersion: 1,
          totalFiles: 0,
          digest: { algorithm: 'sha256', value: 'd'.repeat(64) },
        },
        workspaceVerificationAtCapture: 'current',
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('round-trips optional per-side degradation facts while old format-1 sides remain valid', () => {
    const target = Buffer.from('../raw-target');
    const targetDigest = createHash('sha256').update(target).digest('hex');
    const payload = Buffer.from([0, 1, 2]);
    const payloadDigest = createHash('sha256').update(payload).digest('hex');
    const pointer = Buffer.from(
      `version https://git-lfs.github.com/spec/v1\n` + `oid sha256:${payloadDigest}\nsize ${payload.byteLength}\n`,
    );
    const pointerDigest = createHash('sha256').update(pointer).digest('hex');
    const wrapped = (file: unknown) => ({
      formatVersion: 1,
      reviewIdentity: REVIEW_IDENTITY,
      reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
      file,
      diff: { status: 'unavailable', reason: 'not-text' },
    });
    const symlinkFile = {
      fileIdentity: FILE_IDENTITY,
      status: 'modified',
      staging: { index: 'unchanged', workingTree: 'modified' },
      oldSide: {
        path: { bytesBase64: Buffer.from('link').toString('base64'), display: 'link' },
        kind: 'symlink',
        gitMode: '120000',
        byteLength: target.byteLength,
        evidenceSource: 'commit',
        contentIdentity: { algorithm: 'sha256', value: targetDigest },
        classification: 'text',
        contentAvailability: 'captured',
        symlinkTarget: {
          byteLength: target.byteLength,
          contentIdentity: { algorithm: 'sha256', value: targetDigest },
          bytesBase64: target.toString('base64'),
        },
      },
      newSide: {
        path: { bytesBase64: Buffer.from('link').toString('base64'), display: 'link' },
        kind: 'gitlink',
        gitMode: '160000',
        byteLength: null,
        evidenceSource: 'working-tree',
        objectIdentity: { algorithm: 'sha1', value: 'a'.repeat(40) },
        classification: 'unknown',
        contentAvailability: 'unavailable',
        contentLimitation: 'unsupported-file-kind',
        gitlink: {
          objectIdentity: { algorithm: 'sha1', value: 'a'.repeat(40) },
          checkout: {
            availability: 'available',
            checkedOutCommit: { algorithm: 'sha1', value: 'b'.repeat(40) },
            dirty: true,
            untracked: false,
          },
        },
      },
    } as const;
    expect(parseReviewSnapshotFile(wrapped(symlinkFile))).toMatchObject({
      file: {
        oldSide: { symlinkTarget: { bytesBase64: target.toString('base64') } },
        newSide: { gitlink: { checkout: { availability: 'available' } } },
      },
    });

    const pointerSide = {
      path: { bytesBase64: Buffer.from('large.bin').toString('base64'), display: 'large.bin' },
      kind: 'regular',
      gitMode: '100644',
      byteLength: pointer.byteLength,
      evidenceSource: 'index',
      objectIdentity: { algorithm: 'sha1', value: 'c'.repeat(40) },
      contentIdentity: { algorithm: 'sha256', value: pointerDigest },
      classification: 'text',
      contentAvailability: 'captured',
      largeFilePointer: {
        kind: 'git-lfs-pointer-v1',
        pointer: {
          byteLength: pointer.byteLength,
          contentIdentity: { algorithm: 'sha256', value: pointerDigest },
          bytesBase64: pointer.toString('base64'),
        },
        declaredPayload: {
          objectIdentity: { algorithm: 'sha256', value: payloadDigest },
          byteLength: payload.byteLength,
        },
        sideRepresentation: 'pointer',
        localPayload: {
          availability: 'available',
          contentAvailability: 'captured',
          contentIdentity: { algorithm: 'sha256', value: payloadDigest },
        },
      },
      generated: {
        classification: 'generated',
        source: 'git-attribute',
        attribute: 'linguist-generated',
      },
    } as const;
    const pointerFile = {
      fileIdentity: FILE_IDENTITY,
      status: 'added',
      staging: { index: 'added', workingTree: 'unchanged' },
      newSide: pointerSide,
      scopeMembership: [
        {
          selectionPath: {
            bytesBase64: Buffer.from('large.bin').toString('base64'),
            display: 'large.bin',
          },
          selectionKind: 'file',
          inclusion: 'ordinary',
          matchedSides: ['new'],
        },
      ],
    } as const;
    expect(parseReviewSnapshotFile(wrapped(pointerFile))).toMatchObject({
      file: {
        scopeMembership: [{ matchedSides: ['new'] }],
        newSide: {
          largeFilePointer: {
            declaredPayload: { objectIdentity: { value: payloadDigest } },
          },
          generated: { classification: 'generated' },
        },
      },
    });
    expect(() =>
      parseReviewSnapshotFile(
        wrapped({
          ...pointerFile,
          scopeMembership: [
            {
              ...pointerFile.scopeMembership[0],
              matchedSides: ['old'],
            },
          ],
        }),
      ),
    ).toThrow('reviewing-state-invalid');
    expect(() =>
      parseReviewSnapshotFile(
        wrapped({
          ...pointerFile,
          newSide: {
            ...pointerSide,
            largeFilePointer: {
              ...pointerSide.largeFilePointer,
              pointer: {
                ...pointerSide.largeFilePointer.pointer,
                bytesBase64: Buffer.from('tampered').toString('base64'),
              },
            },
          },
        }),
      ),
    ).toThrow('reviewing-state-invalid');

    const specialFile = {
      fileIdentity: FILE_IDENTITY,
      status: 'type-changed',
      staging: { index: 'unchanged', workingTree: 'type-changed' },
      newSide: {
        path: { bytesBase64: Buffer.from('pipe').toString('base64'), display: 'pipe' },
        kind: 'special',
        gitMode: '000000',
        byteLength: null,
        evidenceSource: 'working-tree',
        classification: 'unknown',
        contentAvailability: 'unavailable',
        contentLimitation: 'unsupported-file-kind',
        specialEntry: { kind: 'fifo', content: 'not-applicable' },
      },
    } as const;
    expect(parseReviewSnapshotFile(wrapped(specialFile))).toMatchObject({
      file: { newSide: { specialEntry: { kind: 'fifo' } } },
    });
  });

  it('rejects incomplete Snapshot files, Anchors, and command results', () => {
    expect(() =>
      parseReviewSnapshotFile({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        file: { fileIdentity: FILE_IDENTITY },
        diff: { status: 'available', totalRows: 0, windowSize: 64 },
      }),
    ).toThrow('reviewing-state-invalid');

    expect(() =>
      parseReviewQuestion({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        reviewBatchIdentity: BATCH_IDENTITY,
        questionIdentity: QUESTION_IDENTITY,
        intent: 'question',
        body: 'What changed?',
        anchor: {},
        ordinal: 0,
      }),
    ).toThrow('reviewing-state-invalid');

    expect(
      parseReviewQuestion({
        formatVersion: 1,
        reviewIdentity: REVIEW_IDENTITY,
        reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
        reviewBatchIdentity: BATCH_IDENTITY,
        questionIdentity: QUESTION_IDENTITY,
        intent: 'question',
        body: 'Why is the whole file unavailable?',
        anchor: {
          kind: 'review.whole-file',
          reviewSnapshotIdentity: SNAPSHOT_IDENTITY,
          fileIdentity: FILE_IDENTITY,
          side: 'new',
          scope: 'file',
          content: {
            status: 'unavailable',
            classification: 'unrenderable',
            availability: 'unavailable',
            byteLength: null,
            limitation: 'unsupported-file-kind',
          },
        },
        ordinal: 0,
      }).anchor,
    ).toMatchObject({
      kind: 'review.whole-file',
      scope: 'file',
      content: {
        status: 'unavailable',
        limitation: 'unsupported-file-kind',
      },
    });

    expect(() =>
      parseReviewingCommandRecord({
        formatVersion: 1,
        normalizedCommand: '{}',
        result: {
          status: 'accepted',
          commandIdentity: 'incomplete-reviewing-result',
          stateVersion: 1,
        },
      }),
    ).toThrow('reviewing-state-invalid');
  });

  it('surfaces permanent Projection record invalidity to subscribers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-workspace-codecs-'));
    const state = await openAuthoritativeState({
      workspaceIdentity: WORKSPACE_IDENTITY,
      privateStateDirectory: root,
    });
    try {
      const committed = await state.commit({
        commandIdentity: 'install-invalid-review-index',
        expectedStateVersion: 0,
        records: [
          {
            recordClass: 'revisioned',
            expectedRevision: 0,
            recordIdentity: reviewingRecordIdentity('rvi', WORKSPACE_IDENTITY),
            workflowIdentity: 'workflow-review-codec-fixture',
            kind: 'review.index',
            schemaVersion: 1,
            payload: new TextEncoder().encode('{}'),
            content: [],
          },
        ],
        result: {
          kind: 'test.invalid-review-index-installed',
          schemaVersion: 1,
          payload: new Uint8Array([1]),
        },
      });
      expect(committed.status).toBe('committed');
      const assembly = openRuntimeWorkspace(WORKSPACE_IDENTITY, root, state);
      const failure = await new Promise<{
        readonly kind: string;
        readonly reason?: string;
        readonly stateVersion: number;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Projection failure was swallowed')), 1_000);
        const unsubscribe = assembly.workspace.subscribe({ kind: 'workspace.home', offset: 0, limit: 8 }, update => {
          if (update.kind !== 'workspace.projection-failed') return;
          clearTimeout(timeout);
          unsubscribe();
          resolve(update);
        });
      });
      expect(failure).toEqual(
        expect.objectContaining({
          kind: 'workspace.projection-failed',
          reason: 'records-invalid',
          stateVersion: 1,
        }),
      );
    } finally {
      await state.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an incomplete durable Harness command result through Workspace.read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-workspace-codecs-'));
    const state = await openAuthoritativeState({
      workspaceIdentity: WORKSPACE_IDENTITY,
      privateStateDirectory: root,
    });
    try {
      const commandIdentity = 'incomplete-harness-result';
      const committed = await state.commit({
        commandIdentity: 'install-incomplete-harness-result',
        expectedStateVersion: 0,
        records: [
          {
            recordClass: 'immutable',
            recordIdentity: harnessIdentity('hcm', commandIdentity),
            workflowIdentity: 'workflow-review-codec-fixture',
            kind: 'harness.command',
            schemaVersion: 1,
            payload: new TextEncoder().encode(
              JSON.stringify({
                formatVersion: 1,
                normalizedCommand: '{}',
                result: {
                  status: 'accepted',
                  commandIdentity,
                  stateVersion: 1,
                },
              }),
            ),
            content: [],
          },
        ],
        result: {
          kind: 'test.incomplete-harness-result-installed',
          schemaVersion: 1,
          payload: new Uint8Array([1]),
        },
      });
      expect(committed.status).toBe('committed');

      const assembly = openRuntimeWorkspace(WORKSPACE_IDENTITY, root, state);
      await expect(
        assembly.workspace.read({
          kind: 'harness.command-result',
          commandIdentity,
        }),
      ).rejects.toThrow('harness-interaction-state-invalid');
    } finally {
      await state.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
