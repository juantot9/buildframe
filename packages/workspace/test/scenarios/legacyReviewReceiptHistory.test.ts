import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import {
  legacyReviewSourceOccurrenceIdentity,
  type LegacyReviewSourceIdentity,
  type LegacyReviewSourceOccurrenceIdentity,
} from '../../src/legacyReviewImport/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);
const GOLDEN_DIRECTORY = fileURLToPath(new URL('../fixtures/legacy-review-v1/', import.meta.url));
const roots = new Set<string>();
const owners = new Set<WorkspaceRuntimeOwner>();
const originalStateHome = process.env.XDG_STATE_HOME;

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
  readonly queueFile: string;
  readonly receiptFile: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function fixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-legacy-history-v1-'));
  roots.add(root);
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await fs.mkdir(checkout, { recursive: true });
  await fs.mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  const canonicalCheckout = await fs.realpath(checkout);
  const legacyHash = createHash('sha256').update(canonicalCheckout).digest('hex');
  process.env.XDG_STATE_HOME = state;
  return {
    root,
    checkout,
    state,
    queueFile: path.join(checkout, '.neoflow', 'review.json'),
    receiptFile: path.join(state, 'neoflow', 'workspaces', legacyHash, 'review-receipts.json'),
  };
}

async function install(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  const modified = new Date('2026-09-02T10:00:00.000Z');
  await fs.utimes(file, modified, modified);
}

async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
  const opened = await openWorkspaceRuntimeOwner({
    startPath: created.checkout,
  });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owners.add(opened.owner);
  return opened.owner;
}

async function close(owner: WorkspaceRuntimeOwner): Promise<void> {
  owners.delete(owner);
  await owner.dispose();
}

async function importSource(
  owner: WorkspaceRuntimeOwner,
  sourceAbsolute: 0 | 1,
  commandIdentity: string,
  expectedStateVersion: number,
): Promise<{
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly digest: string;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
}> {
  const sources = await owner.workspace.read({ kind: 'legacy-review.sources' });
  const source = sources.sources[sourceAbsolute];
  if (source.observation.status !== 'detected') {
    throw new Error('Legacy source was not detected');
  }
  const result = await owner.workspace.execute({
    kind: 'legacy-review.source.import',
    commandIdentity,
    expectedStateVersion,
    sourceIdentity: source.sourceIdentity,
    expectedDigest: source.observation.digest,
  });
  expect(result).toMatchObject({
    kind: 'legacy-review.source.imported',
    status: 'accepted',
    stateVersion: expectedStateVersion + 1,
  });
  if (result.kind !== 'legacy-review.source.imported') {
    throw new Error('Legacy source was not imported');
  }
  return {
    sourceIdentity: source.sourceIdentity,
    digest: source.observation.digest,
    sourceOccurrenceIdentity: result.sourceOccurrenceIdentity,
  };
}

function window(text: string): {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly shownUtf8Bytes: number;
  readonly truncated: false;
} {
  const bytes = Buffer.byteLength(text);
  return {
    text,
    totalUtf8Bytes: bytes,
    shownUtf8Bytes: bytes,
    truncated: false,
  };
}

function worstCaseReceipt(): Buffer {
  const control = '\u0001';
  const timestamp = '2026-09-02T10:00:00.000Z';
  const workspace = `/${control.repeat(2_000)}`;
  const text = `a${'🙂'.repeat(3_000)}`;
  const excerpt = 'é'.repeat(3_000);
  return Buffer.from(
    `${JSON.stringify({
      version: 1,
      updatedAt: timestamp,
      batches: Array.from({ length: 24 }, (_, batchAbsolute) => ({
        id: `${control.repeat(300)}-${batchAbsolute}`,
        workspace,
        annotations: Array.from({ length: 8 }, (_, annotationAbsolute) => ({
          id: `${control.repeat(300)}-${batchAbsolute}-${annotationAbsolute}`,
          kind: 'question',
          file: `/src/${control.repeat(2_000)}`,
          anchor: { side: 'both', oldLine: 1, newLine: 2 },
          text,
          excerpt,
        })),
        harness: {
          id: control.repeat(300),
          name: control.repeat(600),
          version: control.repeat(600),
          sessionId: control.repeat(300),
          model: control.repeat(600),
          workspace,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        harnessOutcome: 'failed',
        harnessCompletedAt: timestamp,
        harnessError: control.repeat(2_000),
        queueDisposition: 'retained',
        queueUpdatedAt: timestamp,
        queueReason: 'harness_failed',
        queueError: control.repeat(2_000),
      })),
    })}\n`,
  );
}

afterEach(async () => {
  await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
  owners.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('imported legacy receipt history', () => {
  it('projects labelled golden history only from the BLOB after its source disappears', async () => {
    const created = await fixture();
    const receiptBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json'));
    await install(created.receiptFile, receiptBytes);
    const before = await fs.stat(created.receiptFile, { bigint: true });
    const owner = await open(created);
    const imported = await importSource(owner, 1, 'import-receipt-history', 0);

    const first = await owner.workspace.read({
      kind: 'legacy-review.receipt-history',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchOffset: 0,
      batchLimit: 1,
    });
    expect(first).toEqual({
      kind: 'legacy-review.receipt-history',
      status: 'available',
      projectionVersion: 1,
      stateVersion: 1,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: imported.digest,
      disclosure: {
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
      },
      legacyUpdatedAt: '2026-07-12T12:10:00.000Z',
      totalBatches: 2,
      totalAnnotations: 2,
      batchOffset: 0,
      batches: [
        {
          batchAbsolute: 0,
          legacyBatchId: window('legacy-batch-cleared'),
          legacyWorkspacePath: window('/sanitized/workspace'),
          legacyHarness: {
            legacyHarnessId: window('pi'),
            legacyName: window('Pi'),
            legacyVersion: window('0.80.6'),
            legacySessionId: window('sanitized-session-one'),
            legacyModel: window('sanitized-model'),
            legacyWorkspacePath: window('/sanitized/workspace'),
          },
          createdAt: '2026-07-12T12:00:00.000Z',
          updatedAt: '2026-07-12T12:02:00.000Z',
          harnessOutcome: 'succeeded',
          harnessCompletedAt: '2026-07-12T12:01:00.000Z',
          queueDisposition: 'cleared',
          queueUpdatedAt: '2026-07-12T12:02:00.000Z',
          totalAnnotations: 1,
        },
      ],
    });
    if (first.status !== 'available') {
      throw new Error('Golden legacy receipt history was unavailable');
    }
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.disclosure)).toBe(true);
    const after = await fs.stat(created.receiptFile, { bigint: true });
    expect({
      mode: after.mode,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
      bytes: await fs.readFile(created.receiptFile),
    }).toEqual({
      mode: before.mode,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
      bytes: receiptBytes,
    });

    await fs.rm(created.receiptFile);
    const detail = await owner.workspace.read({
      kind: 'legacy-review.receipt-batch',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchAbsolute: 0,
      annotationOffset: 0,
      annotationLimit: 8,
    });
    expect(detail).toMatchObject({
      kind: 'legacy-review.receipt-batch',
      status: 'available',
      stateVersion: 1,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: imported.digest,
      disclosure: first.disclosure,
      batch: first.batches[0],
      annotationOffset: 0,
      annotations: [
        {
          annotationAbsolute: 0,
          legacyAnnotationId: window('legacy-receipt-question'),
          legacyKind: 'question',
          legacyFile: window('src/api.ts'),
          legacyAnchor: { side: 'old', oldLine: 5 },
          legacyText: window('Why did this branch disappear?'),
          legacyExcerpt: window('-return fallback;'),
        },
      ],
    });
    if (detail.status !== 'available') {
      throw new Error('Golden legacy receipt batch was unavailable');
    }
    expect(Object.keys(detail.annotations[0] ?? {}).sort()).toEqual([
      'annotationAbsolute',
      'legacyAnchor',
      'legacyAnnotationId',
      'legacyExcerpt',
      'legacyFile',
      'legacyKind',
      'legacyText',
    ]);
    expect(Object.hasOwn(detail.batch, 'id')).toBe(false);
    expect(Object.hasOwn(detail.batch.legacyHarness, 'id')).toBe(false);
    const serialized = JSON.stringify(detail);
    for (const forbidden of [
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'annotationIdentity',
      'reviewBatchIdentity',
      'workflowIdentity',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const second = await owner.workspace.read({
      kind: 'legacy-review.receipt-history',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchOffset: 1,
      batchLimit: 24,
    });
    expect(second).toMatchObject({
      status: 'available',
      stateVersion: 1,
      batchOffset: 1,
      batches: [
        {
          batchAbsolute: 1,
          legacyBatchId: window('legacy-batch-retained'),
          harnessOutcome: 'failed',
          legacyHarnessError: window('sanitized failure'),
          queueDisposition: 'retained',
          queueReason: 'harness_failed',
          totalAnnotations: 1,
        },
      ],
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        batchOffset: 2,
        batchLimit: 24,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 1,
      batchOffset: 2,
      batches: [],
    });
    await close(owner);

    const restarted = await open(created);
    await expect(
      restarted.workspace.read({
        kind: 'legacy-review.receipt-batch',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        batchAbsolute: 1,
        annotationOffset: 0,
        annotationLimit: 8,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 1,
      batch: { batchAbsolute: 1 },
      annotations: [
        {
          annotationAbsolute: 0,
          legacyKind: 'change',
          legacyAnchor: { side: 'file' },
          legacyText: window('Retain this source occurrence as legacy history only.'),
        },
      ],
    });
  });

  it('fails closed for unimported, wrong-kind, unrecognized, absent, and malformed requests', async () => {
    const created = await fixture();
    const queueBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json'));
    const receiptBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json'));
    await install(created.queueFile, queueBytes);
    await install(created.receiptFile, receiptBytes);
    const owner = await open(created);
    const queue = await importSource(owner, 0, 'import-queue-not-history', 0);
    const sources = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const receipt = sources.sources[1];
    if (receipt.observation.status !== 'detected') {
      throw new Error('Receipt source was not detected');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'defer-receipt-not-history',
        expectedStateVersion: 1,
        sourceIdentity: receipt.sourceIdentity,
        expectedDigest: receipt.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 2 });
    const deferredOccurrence = legacyReviewSourceOccurrenceIdentity(
      owner.workspaceIdentity,
      receipt.sourceIdentity,
      receipt.observation.digest,
    );
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: deferredOccurrence,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 2,
      reason: 'source-not-imported',
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: queue.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 2,
      reason: 'source-kind-mismatch',
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: `lso_${'f'.repeat(64)}`,
        batchOffset: 0,
        batchLimit: 1,
      } as never),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 2,
      reason: 'source-not-imported',
    });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: deferredOccurrence,
        batchOffset: 0,
        batchLimit: 25,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 2,
      reason: 'projection-limit',
    });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: deferredOccurrence,
        batchOffset: 0,
        batchLimit: 1,
        contentRole: 'caller-controlled',
      }),
    ).rejects.toThrow('Invalid legacy receipt history request');

    const importedReceipt = await importSource(owner, 1, 'import-deferred-receipt', 2);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-batch',
        sourceOccurrenceIdentity: importedReceipt.sourceOccurrenceIdentity,
        batchAbsolute: 2,
        annotationOffset: 0,
        annotationLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 3,
      reason: 'batch-not-found',
    });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.receipt-batch',
        sourceOccurrenceIdentity: importedReceipt.sourceOccurrenceIdentity,
        batchAbsolute: 0,
        annotationOffset: 0,
        annotationLimit: 9,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 3,
      reason: 'projection-limit',
    });
    await close(owner);

    const malformed = await fixture();
    await install(malformed.receiptFile, Buffer.from('{malformed}\n'));
    const malformedOwner = await open(malformed);
    const importedMalformed = await importSource(malformedOwner, 1, 'import-malformed-receipt-history', 0);
    await expect(
      malformedOwner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: importedMalformed.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 1,
      reason: 'source-unrecognized',
    });
  });

  it('reports quarantined BLOB content without falling back to the still-valid source', async () => {
    const created = await fixture();
    const receiptBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json'));
    await install(created.receiptFile, receiptBytes);
    const owner = await open(created);
    const imported = await importSource(owner, 1, 'import-receipt-before-content-damage', 0);
    const workspaceIdentity = owner.workspaceIdentity;
    await close(owner);

    const stateRoot = path.join(
      userStateDirectory(created.checkout),
      'workspaces',
      workspaceIdentity,
      'authoritative-state',
    );
    const generation = (await fs.readFile(path.join(stateRoot, 'CURRENT'), 'utf8')).trim();
    const database = new DatabaseSync(path.join(stateRoot, generation));
    database
      .prepare('UPDATE content_objects SET bytes = ? WHERE digest = ?')
      .run(new Uint8Array([0xca, 0xfe]), imported.digest);
    database.close();

    const recovered = await open(created);
    const currentSource = await recovered.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(currentSource.sources[1].observation).toMatchObject({
      status: 'detected',
      digest: imported.digest,
      migration: {
        status: 'imported',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      },
    });
    await expect(
      recovered.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.receipt-history',
      status: 'unavailable',
      projectionVersion: 1,
      stateVersion: 1,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      reason: 'content-unavailable',
    });
    expect(await fs.readFile(created.receiptFile)).toEqual(receiptBytes);
  });

  it('windows UTF-8 at scalar boundaries and stays below the existing frame body bound', async () => {
    const created = await fixture();
    const receiptBytes = worstCaseReceipt();
    expect(receiptBytes.byteLength).toBeLessThan(16 * 1024 * 1024);
    await install(created.receiptFile, receiptBytes);
    const owner = await open(created);
    const imported = await importSource(owner, 1, 'import-worst-case-receipt-history', 0);

    const history = await owner.workspace.read({
      kind: 'legacy-review.receipt-history',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchOffset: 0,
      batchLimit: 24,
    });
    expect(history).toMatchObject({
      status: 'available',
      totalBatches: 24,
      totalAnnotations: 192,
      batchOffset: 0,
    });
    if (history.status !== 'available') {
      throw new Error('Worst-case history was unavailable');
    }
    expect(history.batches).toHaveLength(24);
    expect(history.batches[0]?.legacyBatchId).toMatchObject({
      totalUtf8Bytes: 302,
      shownUtf8Bytes: 128,
      truncated: true,
    });
    expect(history.batches[0]?.legacyWorkspacePath).toMatchObject({
      totalUtf8Bytes: 2_001,
      shownUtf8Bytes: 1_024,
      truncated: true,
    });
    expect(Buffer.byteLength(JSON.stringify(history)) + 2_048).toBeLessThan(1024 * 1024);

    const detail = await owner.workspace.read({
      kind: 'legacy-review.receipt-batch',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      batchAbsolute: 0,
      annotationOffset: 0,
      annotationLimit: 8,
    });
    expect(detail.status).toBe('available');
    if (detail.status !== 'available') {
      throw new Error('Worst-case receipt batch was unavailable');
    }
    expect(detail.annotations).toHaveLength(8);
    const text = detail.annotations[0]?.legacyText;
    expect(text).toMatchObject({
      totalUtf8Bytes: 12_001,
      shownUtf8Bytes: 8_189,
      truncated: true,
    });
    expect(text?.text).toBe(`a${'🙂'.repeat(2_047)}`);
    expect(detail.annotations[0]?.legacyExcerpt).toMatchObject({
      totalUtf8Bytes: 6_000,
      shownUtf8Bytes: 4_096,
      truncated: true,
    });
    expect(Buffer.byteLength(JSON.stringify(detail)) + 2_048).toBeLessThan(1024 * 1024);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-batch',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        batchAbsolute: 0,
        annotationOffset: 8,
        annotationLimit: 8,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      annotationOffset: 8,
      annotations: [],
    });
  });
});
