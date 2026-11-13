import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { openAuthoritativeState, type OpenAuthoritativeStateRequest } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import {
  legacyReviewImportCommandRecordIdentity,
  legacyReviewImportIndexIdentity,
  legacyReviewSourceDecisionIdentity,
  legacyReviewSourceOccurrenceIdentity,
  legacyReviewStateDirectory,
} from '../../src/legacyReviewImport/index.js';
import { reviewingRecordIdentity } from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import {
  bootstrapWorkspace,
  openRuntimeWorkspace,
  workspaceGitDirectory,
  type RuntimeWorkspaceInternalOptions,
} from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);
const GOLDEN_DIRECTORY = fileURLToPath(new URL('../fixtures/legacy-review-v1/', import.meta.url));
const roots = new Set<string>();
const owners = new Set<WorkspaceRuntimeOwner>();
const originalStateHome = process.env.XDG_STATE_HOME;

interface DiscoveryFixture {
  readonly root: string;
  readonly checkout: string;
  readonly canonicalCheckout: string;
  readonly state: string;
  readonly queueFile: string;
  readonly receiptFile: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function fixture(): Promise<DiscoveryFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-legacy-discovery-v1-'));
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
    canonicalCheckout,
    state,
    queueFile: path.join(checkout, '.neoflow', 'review.json'),
    receiptFile: path.join(state, 'neoflow', 'workspaces', legacyHash, 'review-receipts.json'),
  };
}

async function installGolden(target: string, golden: 'queue-v2.json' | 'receipts-v1.json'): Promise<Buffer> {
  const bytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, golden));
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, bytes, { mode: 0o640 });
  await fs.chmod(target, 0o640);
  const modified = new Date('2026-09-02T08:00:00.000Z');
  await fs.utimes(target, modified, modified);
  return bytes;
}

async function metadata(file: string): Promise<{
  readonly bytes: Buffer;
  readonly mode: number;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly entries: readonly string[];
}> {
  const information = await fs.stat(file, { bigint: true });
  return {
    bytes: await fs.readFile(file),
    mode: Number(information.mode),
    size: information.size,
    mtimeNs: information.mtimeNs,
    ctimeNs: information.ctimeNs,
    entries: await fs.readdir(path.dirname(file)),
  };
}

async function open(fixture: DiscoveryFixture): Promise<WorkspaceRuntimeOwner> {
  const result = await openWorkspaceRuntimeOwner({
    startPath: fixture.checkout,
  });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Workspace runtime was rejected');
  owners.add(result.owner);
  return result.owner;
}

async function openControlled(
  fixture: DiscoveryFixture,
  testControl: NonNullable<OpenAuthoritativeStateRequest['testControl']> = {},
  internal: RuntimeWorkspaceInternalOptions = {},
): Promise<WorkspaceRuntimeOwner> {
  const bootstrapped = await bootstrapWorkspace({
    startPath: fixture.checkout,
  });
  expect(bootstrapped.status).toBe('ready');
  if (bootstrapped.status !== 'ready') {
    throw new Error('Workspace bootstrap was rejected');
  }
  const identity = await bootstrapped.workspace.read({
    kind: 'workspace.identity',
  });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(fixture.checkout),
    testControl,
  });
  const assembly = openRuntimeWorkspace(
    identity.workspaceIdentity,
    identity.canonicalCheckout,
    state,
    internal,
    workspaceGitDirectory(bootstrapped.workspace),
  );
  const owner: WorkspaceRuntimeOwner = {
    workspaceIdentity: identity.workspaceIdentity,
    workspace: assembly.workspace,
    harnessAdapters: assembly.harnessAdapters,
    async dispose(): Promise<void> {
      await state.close();
    },
  };
  owners.add(owner);
  return owner;
}

async function close(owner: WorkspaceRuntimeOwner): Promise<void> {
  owners.delete(owner);
  await owner.dispose();
}

function receiptDocument(workspacePaths: readonly string[]): string {
  const timestamp = '2026-09-02T08:00:00.000Z';
  return `${JSON.stringify(
    {
      version: 1,
      updatedAt: timestamp,
      batches: workspacePaths.map((workspace, index) => ({
        id: `batch-${index}`,
        workspace,
        annotations: [
          {
            id: `annotation-${index}`,
            kind: 'question',
            anchor: { side: 'file' },
            text: `private legacy text ${index}`,
          },
        ],
        harness: {
          id: 'sanitized-harness',
          name: 'Sanitized Harness',
          sessionId: `private-session-${index}`,
          model: `private-model-${index}`,
          workspace,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        harnessOutcome: 'pending',
        queueDisposition: 'pending',
      })),
    },
    null,
    2,
  )}\n`;
}

afterEach(async () => {
  await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
  owners.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('explicit legacy Review import', () => {
  it('projects two content-silent current source slots without changing source or State', async () => {
    const created = await fixture();
    const queueBytes = await installGolden(created.queueFile, 'queue-v2.json');
    const receiptBytes = await installGolden(created.receiptFile, 'receipts-v1.json');
    const queueBefore = await metadata(created.queueFile);
    const receiptsBefore = await metadata(created.receiptFile);
    const owner = await open(created);

    const first = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(first).toEqual({
      kind: 'legacy-review.sources',
      projectionVersion: 1,
      stateVersion: 0,
      sources: [
        {
          sourceIdentity: expect.stringMatching(/^lgs_[0-9a-f]{64}$/u),
          sourceKind: 'queue',
          location: 'current-checkout',
          sourcePath: await fs.realpath(created.queueFile),
          observation: {
            status: 'detected',
            byteLength: queueBytes.byteLength,
            digest: 'a1392d00bb1d72ed6a038f0b66120223d72f7991a03400339815ff4c300d0eb1',
            mode: queueBefore.mode,
            modifiedNanoseconds: queueBefore.mtimeNs.toString(),
            changedNanoseconds: queueBefore.ctimeNs.toString(),
            migration: { status: 'undecided' },
            recognition: {
              status: 'recognized',
              format: 'queue-v2',
              totalAnnotations: 2,
            },
          },
        },
        {
          sourceIdentity: expect.stringMatching(/^lgs_[0-9a-f]{64}$/u),
          sourceKind: 'receipts',
          location: 'current-legacy-state',
          sourcePath: await fs.realpath(created.receiptFile),
          observation: {
            status: 'detected',
            byteLength: receiptBytes.byteLength,
            digest: '42df009c5eada89921701082b28ec15ac4ec36ad3b276552798e6492db9af944',
            mode: receiptsBefore.mode,
            modifiedNanoseconds: receiptsBefore.mtimeNs.toString(),
            changedNanoseconds: receiptsBefore.ctimeNs.toString(),
            migration: { status: 'undecided' },
            recognition: {
              status: 'recognized',
              format: 'receipts-v1',
              totalBatches: 2,
              totalAnnotations: 2,
              legacyWorkspacePaths: {
                totalDistinct: 1,
                values: ['/sanitized/workspace'],
                omitted: 0,
              },
            },
          },
        },
      ],
    });
    expect(first.sources[0].sourceIdentity).not.toBe(first.sources[1].sourceIdentity);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.sources)).toBe(true);

    const serialized = JSON.stringify(first);
    for (const privateValue of [
      'Should this reject an expired session?',
      'Why did this branch disappear?',
      'sanitized-session-one',
      'sanitized-model',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).not.toContain(Buffer.from(queueBytes).toString('base64'));

    const second = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(second).toEqual(first);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(0);
    expect(await metadata(created.queueFile)).toEqual(queueBefore);
    expect(await metadata(created.receiptFile)).toEqual(receiptsBefore);
  });

  it('keeps missing, malformed, and unsafe sources from affecting runtime readiness', async () => {
    const absent = await fixture();
    const absentOwner = await open(absent);
    const missing = await absentOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(missing.stateVersion).toBe(0);
    expect(missing.sources.map(source => source.observation)).toEqual([{ status: 'missing' }, { status: 'missing' }]);
    await absentOwner.dispose();
    owners.delete(absentOwner);

    const damaged = await fixture();
    await fs.mkdir(path.dirname(damaged.queueFile), { recursive: true });
    await fs.writeFile(damaged.queueFile, '{not JSON}\n');
    await fs.mkdir(path.dirname(damaged.receiptFile), { recursive: true });
    const target = path.join(damaged.root, 'receipt-target.json');
    await fs.writeFile(target, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json')));
    await fs.symlink(target, damaged.receiptFile);

    const damagedOwner = await open(damaged);
    const view = await damagedOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(view.sources[0].observation).toMatchObject({
      status: 'detected',
      recognition: {
        status: 'unrecognized',
        reason: 'malformed-json',
      },
    });
    expect(view.sources[1].observation).toEqual({
      status: 'unavailable',
      reason: 'unsafe-path',
    });
    await expect(
      damagedOwner.workspace.read({
        kind: 'legacy-review.sources',
        extra: true,
      } as never),
    ).rejects.toThrow('Invalid legacy Review discovery request');
  });

  it('bounds exact embedded workspace paths without exposing receipt content', async () => {
    const created = await fixture();
    const paths = [...Array.from({ length: 40 }, (_, index) => `/legacy/workspace-${index}`), `/${'x'.repeat(5_000)}`];
    await fs.mkdir(path.dirname(created.receiptFile), { recursive: true });
    await fs.writeFile(created.receiptFile, receiptDocument(paths), {
      mode: 0o600,
    });
    const owner = await open(created);
    const view = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const receipts = view.sources[1].observation;
    expect(receipts.status).toBe('detected');
    if (receipts.status !== 'detected' || receipts.recognition.status !== 'recognized') {
      throw new Error('Receipt source was not recognized');
    }
    expect(receipts.recognition).toMatchObject({
      format: 'receipts-v1',
      totalBatches: 41,
      totalAnnotations: 41,
      legacyWorkspacePaths: {
        totalDistinct: 41,
        values: Array.from({ length: 32 }, (_, index) => `/legacy/workspace-${index}`),
        omitted: 9,
      },
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('private legacy text');
    expect(serialized).not.toContain('private-session');
    expect(serialized).not.toContain('private-model');
    expect(Buffer.byteLength(serialized)).toBeLessThan(32 * 4_096 + 16_384);
  });

  it('atomically preserves one exact source and reconstructs idempotency after restart', async () => {
    const created = await fixture();
    const queueBytes = await installGolden(created.queueFile, 'queue-v2.json');
    const sourceBefore = await metadata(created.queueFile);
    const owner = await open(created);
    const preview = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const queue = preview.sources[0];
    expect(queue.observation.status).toBe('detected');
    if (queue.observation.status !== 'detected') {
      throw new Error('Queue source was not detected');
    }
    const command = {
      kind: 'legacy-review.source.import' as const,
      commandIdentity: 'import-current-queue-once',
      expectedStateVersion: preview.stateVersion,
      sourceIdentity: queue.sourceIdentity,
      expectedDigest: queue.observation.digest,
    };

    const imported = await owner.workspace.execute(command);
    expect(imported).toMatchObject({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: 1,
      sourceIdentity: queue.sourceIdentity,
      sourceKind: 'queue',
      digest: queue.observation.digest,
      preservation: 'preserved',
    });
    if (imported.kind !== 'legacy-review.source.imported') {
      throw new Error('Legacy queue was not imported');
    }
    expect(Object.isFrozen(imported)).toBe(true);
    await expect(owner.workspace.execute(command)).resolves.toEqual(imported);

    const repeated = await owner.workspace.execute({
      ...command,
      commandIdentity: 'import-current-queue-again',
      expectedStateVersion: 1,
    });
    expect(repeated).toEqual({
      ...imported,
      commandIdentity: 'import-current-queue-again',
      stateVersion: 2,
      preservation: 'already-preserved',
    });
    const importedView = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(importedView.stateVersion).toBe(2);
    expect(importedView.sources[0].observation).toMatchObject({
      migration: {
        status: 'imported',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      },
    });
    expect(await metadata(created.queueFile)).toEqual(sourceBefore);
    await close(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: owner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const indexIdentity = legacyReviewImportIndexIdentity(owner.workspaceIdentity);
      const read = await state.read({
        recordIdentities: [
          imported.sourceOccurrenceIdentity,
          indexIdentity,
          legacyReviewImportCommandRecordIdentity(command.commandIdentity),
          legacyReviewImportCommandRecordIdentity('import-current-queue-again'),
          reviewingRecordIdentity('rvi', owner.workspaceIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(2);
      expect(read.quarantineReports).toEqual([]);
      const [occurrence, index, firstCommand, secondCommand, reviewIndex] = read.records;
      expect(occurrence).toMatchObject({
        recordIdentity: imported.sourceOccurrenceIdentity,
        workflowIdentity: indexIdentity,
        kind: 'legacy-review.source-occurrence',
        schemaVersion: 1,
        recordClass: 'immutable',
        revision: 1,
        content: [
          {
            role: 'legacy-source',
            digest: queue.observation.digest,
          },
        ],
      });
      expect(Buffer.from(occurrence?.content[0]?.bytes ?? [])).toEqual(queueBytes);
      const occurrencePayload = JSON.parse(Buffer.from(occurrence?.payload ?? []).toString('utf8')) as Record<
        string,
        unknown
      >;
      expect(occurrencePayload).toMatchObject({
        formatVersion: 1,
        parserVersion: 1,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        sourceIdentity: queue.sourceIdentity,
        workspaceIdentity: owner.workspaceIdentity,
        sourceKind: 'queue',
        location: 'current-checkout',
        sourcePath: await fs.realpath(created.queueFile),
        digest: queue.observation.digest,
        byteLength: queueBytes.byteLength,
        metadata: {
          mode: sourceBefore.mode,
          byteLength: queueBytes.byteLength,
          modifiedNanoseconds: sourceBefore.mtimeNs.toString(),
          changedNanoseconds: sourceBefore.ctimeNs.toString(),
        },
        recognition: {
          status: 'recognized',
          format: 'queue-v2',
          totalAnnotations: 2,
        },
        decision: 'imported',
        importCommandIdentity: command.commandIdentity,
        importedStateVersion: 1,
      });
      expect(JSON.stringify(occurrencePayload)).not.toContain('Should this reject an expired session?');
      expect(index).toMatchObject({
        recordIdentity: indexIdentity,
        workflowIdentity: indexIdentity,
        kind: 'legacy-review.import-index',
        schemaVersion: 1,
        recordClass: 'revisioned',
        revision: 1,
        content: [],
      });
      expect(JSON.parse(Buffer.from(index?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [
          {
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            sourceIdentity: queue.sourceIdentity,
            sourceKind: 'queue',
            digest: queue.observation.digest,
            decision: 'imported',
          },
        ],
      });
      expect(firstCommand).toMatchObject({
        kind: 'legacy-review.command',
        recordClass: 'immutable',
        workflowIdentity: indexIdentity,
        content: [],
      });
      expect(secondCommand).toMatchObject({
        kind: 'legacy-review.command',
        recordClass: 'immutable',
        workflowIdentity: indexIdentity,
        content: [],
      });
      expect(reviewIndex).toBeUndefined();
    } finally {
      await state.close();
    }

    const restarted = await open(created);
    const restartedView = await restarted.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(restartedView.stateVersion).toBe(2);
    expect(restartedView.sources[0].observation).toMatchObject({
      migration: {
        status: 'imported',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      },
    });
  });

  it('requires a fresh digest and preserves unsupported or malformed bytes only as diagnostics', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const owner = await open(created);
    const original = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const source = original.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Queue source was not detected');
    }

    const unsupportedBytes = Buffer.from('{"version":99,"annotations":[]}\n');
    await fs.writeFile(created.queueFile, unsupportedBytes);
    const stale = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'stale-preview-import',
      expectedStateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
    });
    expect(stale).toMatchObject({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-changed',
      observedDigest: createHash('sha256').update(unsupportedBytes).digest('hex'),
    });
    const unsupported = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const unsupportedObservation = unsupported.sources[0].observation;
    expect(unsupportedObservation).toMatchObject({
      status: 'detected',
      migration: { status: 'undecided' },
      recognition: {
        status: 'unrecognized',
        reason: 'unsupported-newer-version',
        observedVersion: 99,
      },
    });
    if (unsupportedObservation.status !== 'detected') {
      throw new Error('Unsupported source was not captured');
    }
    const unsupportedImport = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'preserve-unsupported-source',
      expectedStateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: unsupportedObservation.digest,
    });
    expect(unsupportedImport).toMatchObject({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      stateVersion: 1,
      preservation: 'preserved',
    });
    if (unsupportedImport.kind !== 'legacy-review.source.imported') {
      throw new Error('Unsupported source was not preserved');
    }

    const malformedBytes = Buffer.from('{malformed}\n');
    await fs.writeFile(created.queueFile, malformedBytes);
    const changed = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(changed.sources[0].observation).toMatchObject({
      status: 'detected',
      migration: {
        status: 'changed-since-decision',
        currentDecision: 'undecided',
        priorDecision: 'imported',
      },
      recognition: {
        status: 'unrecognized',
        reason: 'malformed-json',
      },
    });
    const malformedObservation = changed.sources[0].observation;
    if (malformedObservation.status !== 'detected') {
      throw new Error('Malformed source was not captured');
    }
    const malformedImport = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'preserve-malformed-source',
      expectedStateVersion: 1,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: malformedObservation.digest,
    });
    expect(malformedImport).toMatchObject({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      stateVersion: 2,
      preservation: 'preserved',
    });
    if (malformedImport.kind !== 'legacy-review.source.imported') {
      throw new Error('Malformed source was not preserved');
    }
    const current = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(current.sources[0].observation).toMatchObject({
      migration: {
        status: 'imported',
        sourceOccurrenceIdentity: malformedImport.sourceOccurrenceIdentity,
      },
    });
    await close(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: owner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await state.read({
        recordIdentities: [
          unsupportedImport.sourceOccurrenceIdentity,
          malformedImport.sourceOccurrenceIdentity,
          legacyReviewImportIndexIdentity(owner.workspaceIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(2);
      expect(Buffer.from(read.records[0]?.content[0]?.bytes ?? [])).toEqual(unsupportedBytes);
      expect(Buffer.from(read.records[1]?.content[0]?.bytes ?? [])).toEqual(malformedBytes);
      expect(JSON.parse(Buffer.from(read.records[0]?.payload ?? []).toString('utf8'))).toMatchObject({
        recognition: {
          status: 'unrecognized',
          reason: 'unsupported-newer-version',
          observedVersion: 99,
        },
      });
      expect(JSON.parse(Buffer.from(read.records[1]?.payload ?? []).toString('utf8'))).toMatchObject({
        recognition: {
          status: 'unrecognized',
          reason: 'malformed-json',
        },
      });
      expect(JSON.parse(Buffer.from(read.records[2]?.payload ?? []).toString('utf8')).occurrences).toHaveLength(2);
    } finally {
      await state.close();
    }
  });

  it('fails closed for invalid sources, command reuse, and the occurrence bound', async () => {
    const created = await fixture();
    const missingOwner = await open(created);
    const missingView = await missingOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const sourceIdentity = missingView.sources[0].sourceIdentity;
    await expect(
      missingOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'stale-missing-import',
        expectedStateVersion: 9,
        sourceIdentity,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'state-version-mismatch',
    });
    await expect(
      missingOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'unknown-source-import',
        expectedStateVersion: 0,
        sourceIdentity: `lgs_${'f'.repeat(64)}` as typeof sourceIdentity,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-identity-unknown',
    });
    await expect(
      missingOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'missing-source-import',
        expectedStateVersion: 0,
        sourceIdentity,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-not-found',
    });
    await expect(
      (missingOwner.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.source.import',
        commandIdentity: 'malformed-import',
        expectedStateVersion: 0,
        sourceIdentity,
        expectedDigest: '0'.repeat(64),
        bytes: 'caller-controlled',
      }),
    ).rejects.toThrow('Invalid legacy Review import command');

    await fs.mkdir(path.dirname(created.queueFile), { recursive: true });
    const target = path.join(created.root, 'legacy-source-target.json');
    await fs.writeFile(target, '[]\n');
    await fs.symlink(target, created.queueFile);
    await expect(
      missingOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'unsafe-source-import',
        expectedStateVersion: 0,
        sourceIdentity,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unavailable',
      sourceFailure: 'unsafe-path',
    });
    await fs.rm(created.queueFile);
    const oversized = await fs.open(created.queueFile, 'w');
    await oversized.truncate(16 * 1024 * 1024 + 1);
    await oversized.close();
    await expect(
      missingOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'oversized-source-import',
        expectedStateVersion: 0,
        sourceIdentity,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unavailable',
      sourceFailure: 'source-too-large',
    });
    await close(missingOwner);

    await fs.rm(created.queueFile);
    await installGolden(created.queueFile, 'queue-v2.json');
    const boundedOwner = await openControlled(
      created,
      {},
      {
        legacyReviewImportMaximumOccurrences: 1,
      },
    );
    const firstView = await boundedOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const firstSource = firstView.sources[0];
    if (firstSource.observation.status !== 'detected') {
      throw new Error('Bounded source was not detected');
    }
    const firstCommand = {
      kind: 'legacy-review.source.import' as const,
      commandIdentity: 'bounded-first-import',
      expectedStateVersion: 0,
      sourceIdentity: firstSource.sourceIdentity,
      expectedDigest: firstSource.observation.digest,
    };
    await expect(boundedOwner.workspace.execute(firstCommand)).resolves.toMatchObject({
      status: 'accepted',
      stateVersion: 1,
    });
    await expect(
      boundedOwner.workspace.execute({
        ...firstCommand,
        expectedStateVersion: 1,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 1,
      reason: 'command-identity-conflict',
    });
    await fs.writeFile(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const changed = await boundedOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const changedSource = changed.sources[0];
    if (changedSource.observation.status !== 'detected') {
      throw new Error('Changed bounded source was not detected');
    }
    await expect(
      boundedOwner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'bounded-second-import',
        expectedStateVersion: 1,
        sourceIdentity: changedSource.sourceIdentity,
        expectedDigest: changedSource.observation.digest,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 1,
      reason: 'source-occurrence-limit',
    });
  });

  it('refuses a conflicting occurrence record without inventing index membership', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const previewOwner = await open(created);
    const preview = await previewOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = preview.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Conflict source was not detected');
    }
    const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      previewOwner.workspaceIdentity,
      source.sourceIdentity,
      source.observation.digest,
    );
    const workspaceIdentity = previewOwner.workspaceIdentity;
    await close(previewOwner);

    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const poisoned = await state.commit({
        commandIdentity: 'install-conflicting-legacy-occurrence',
        expectedStateVersion: 0,
        records: [
          {
            recordClass: 'immutable',
            recordIdentity: occurrenceIdentity,
            workflowIdentity: legacyReviewImportIndexIdentity(workspaceIdentity),
            kind: 'test.conflicting-record',
            schemaVersion: 1,
            payload: new Uint8Array([0]),
            content: [],
          },
        ],
        result: {
          kind: 'test.conflicting-record-installed',
          schemaVersion: 1,
          payload: new Uint8Array([1]),
        },
      });
      expect(poisoned).toMatchObject({ status: 'committed', stateVersion: 1 });
    } finally {
      await state.close();
    }

    const owner = await open(created);
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'import-conflicting-legacy-occurrence',
        expectedStateVersion: 1,
        sourceIdentity: source.sourceIdentity,
        expectedDigest: source.observation.digest,
      }),
    ).resolves.toMatchObject({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      stateVersion: 1,
      reason: 'state-conflict',
    });
    const view = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(view.stateVersion).toBe(1);
    expect(view.sources[0].observation).toMatchObject({
      migration: { status: 'undecided' },
    });
    await close(owner);

    const inspected = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await inspected.read({
        recordIdentities: [
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity('import-conflicting-legacy-occurrence'),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(1);
      expect(read.records).toEqual([undefined, undefined]);
    } finally {
      await inspected.close();
    }
  });

  it('rolls back before commit and recalls an unknown post-commit outcome without source replay', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const previewOwner = await open(created);
    const preview = await previewOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = preview.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Fault source was not detected');
    }
    const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      previewOwner.workspaceIdentity,
      source.sourceIdentity,
      source.observation.digest,
    );
    await close(previewOwner);

    const beforeOwner = await openControlled(created, {
      failpoint: 'after-first-record-write',
    });
    const beforeCommand = {
      kind: 'legacy-review.source.import' as const,
      commandIdentity: 'legacy-import-before-commit-fault',
      expectedStateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
    };
    await expect(beforeOwner.workspace.execute(beforeCommand)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    await close(beforeOwner);

    const afterRollback = await openAuthoritativeState({
      workspaceIdentity: beforeOwner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const absent = await afterRollback.read({
        recordIdentities: [
          occurrenceIdentity,
          legacyReviewImportIndexIdentity(beforeOwner.workspaceIdentity),
          legacyReviewImportCommandRecordIdentity(beforeCommand.commandIdentity),
        ],
        includeContent: true,
      });
      expect(absent.stateVersion).toBe(0);
      expect(absent.records).toEqual([undefined, undefined, undefined]);
    } finally {
      await afterRollback.close();
    }

    const afterCommand = {
      ...beforeCommand,
      commandIdentity: 'legacy-import-after-commit-fault',
    };
    const unknownOwner = await openControlled(created, {
      pauseAfterCommitCommandIdentity: afterCommand.commandIdentity,
      requestTimeoutMilliseconds: 1_000,
    });
    await expect(unknownOwner.workspace.execute(afterCommand)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    owners.delete(unknownOwner);
    await unknownOwner.dispose().catch(() => undefined);
    await fs.rm(created.queueFile);

    const recovered = await open(created);
    const recalled = await recovered.workspace.execute(afterCommand);
    expect(recalled).toMatchObject({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      commandIdentity: afterCommand.commandIdentity,
      stateVersion: 1,
      sourceOccurrenceIdentity: occurrenceIdentity,
      preservation: 'preserved',
    });
    const status = await recovered.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(status.stateVersion).toBe(1);
    expect(status.sources[0].observation).toEqual({ status: 'missing' });
  });

  it('retires an exact source race without committing a preservation claim', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const previewOwner = await open(created);
    const preview = await previewOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = preview.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Race source was not detected');
    }
    await close(previewOwner);

    const racing = await openControlled(
      created,
      {},
      {
        legacyReviewSourceTestControl: {
          async afterBytesRead({ sourcePath }): Promise<void> {
            if (sourcePath.endsWith(`${path.sep}.neoflow${path.sep}review.json`)) {
              await fs.appendFile(sourcePath, ' ');
            }
          },
        },
      },
    );
    await expect(
      racing.workspace.execute({
        kind: 'legacy-review.source.import',
        commandIdentity: 'racing-source-import',
        expectedStateVersion: 0,
        sourceIdentity: source.sourceIdentity,
        expectedDigest: source.observation.digest,
      }),
    ).resolves.toMatchObject({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unavailable',
      sourceFailure: 'changed-during-read',
    });
    const identity = racing.workspaceIdentity;
    await close(racing);
    const state = await openAuthoritativeState({
      workspaceIdentity: identity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await state.read({
        recordIdentities: [
          legacyReviewImportIndexIdentity(identity),
          legacyReviewImportCommandRecordIdentity('racing-source-import'),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(0);
      expect(read.records).toEqual([undefined, undefined]);
    } finally {
      await state.close();
    }
  });

  it('records content-free defer and dismiss decisions with exact restart status', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const sourceBefore = await metadata(created.queueFile);
    const owner = await open(created);
    const preview = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const source = preview.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Decision source was not detected');
    }
    const deferredCommand = {
      kind: 'legacy-review.source.decision.set' as const,
      commandIdentity: 'defer-current-legacy-source',
      expectedStateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
      decision: 'deferred' as const,
    };
    const deferred = await owner.workspace.execute(deferredCommand);
    expect(deferred).toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      commandIdentity: deferredCommand.commandIdentity,
      stateVersion: 1,
      sourceIdentity: source.sourceIdentity,
      sourceKind: 'queue',
      digest: source.observation.digest,
      decision: 'deferred',
      recording: 'recorded',
    });
    if (deferred.kind !== 'legacy-review.source.decision-recorded') {
      throw new Error('Deferred source decision was not recorded');
    }
    expect(deferred.sourceDecisionIdentity).toBe(
      legacyReviewSourceDecisionIdentity(
        owner.workspaceIdentity,
        source.sourceIdentity,
        source.observation.digest,
        'deferred',
      ),
    );
    expect(Object.isFrozen(deferred)).toBe(true);
    await expect(owner.workspace.execute(deferredCommand)).resolves.toEqual(deferred);
    await expect(
      owner.workspace.execute({
        ...deferredCommand,
        expectedStateVersion: 1,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 1,
      reason: 'command-identity-conflict',
    });

    const repeated = await owner.workspace.execute({
      ...deferredCommand,
      commandIdentity: 'defer-current-legacy-source-again',
      expectedStateVersion: 1,
    });
    expect(repeated).toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      stateVersion: 2,
      sourceDecisionIdentity: deferred.sourceDecisionIdentity,
      decision: 'deferred',
      recording: 'already-recorded',
    });
    const dismissed = await owner.workspace.execute({
      ...deferredCommand,
      commandIdentity: 'dismiss-current-legacy-source',
      expectedStateVersion: 2,
      decision: 'dismissed',
    });
    expect(dismissed).toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      stateVersion: 3,
      decision: 'dismissed',
      recording: 'recorded',
    });
    if (dismissed.kind !== 'legacy-review.source.decision-recorded') {
      throw new Error('Dismissed source decision was not recorded');
    }
    expect(dismissed.sourceDecisionIdentity).not.toBe(deferred.sourceDecisionIdentity);
    const dismissedView = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(dismissedView.sources[0].observation).toMatchObject({
      migration: {
        status: 'dismissed',
        sourceDecisionIdentity: dismissed.sourceDecisionIdentity,
      },
    });
    const reselected = await owner.workspace.execute({
      ...deferredCommand,
      commandIdentity: 'reselect-deferred-legacy-source',
      expectedStateVersion: 3,
    });
    expect(reselected).toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      stateVersion: 4,
      sourceDecisionIdentity: deferred.sourceDecisionIdentity,
      decision: 'deferred',
      recording: 'recorded',
    });
    const view = await owner.workspace.read({ kind: 'legacy-review.sources' });
    expect(view.stateVersion).toBe(4);
    expect(view.sources[0].observation).toMatchObject({
      migration: {
        status: 'deferred',
        sourceDecisionIdentity: deferred.sourceDecisionIdentity,
      },
    });
    expect(await metadata(created.queueFile)).toEqual(sourceBefore);
    await close(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: owner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
        owner.workspaceIdentity,
        source.sourceIdentity,
        source.observation.digest,
      );
      const indexIdentity = legacyReviewImportIndexIdentity(owner.workspaceIdentity);
      const read = await state.read({
        recordIdentities: [
          deferred.sourceDecisionIdentity,
          dismissed.sourceDecisionIdentity,
          indexIdentity,
          occurrenceIdentity,
          legacyReviewImportCommandRecordIdentity('defer-current-legacy-source-again'),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(4);
      const [deferredRecord, dismissedRecord, index, occurrence, command] = read.records;
      for (const record of [deferredRecord, dismissedRecord]) {
        expect(record).toMatchObject({
          workflowIdentity: indexIdentity,
          kind: 'legacy-review.source-decision',
          schemaVersion: 1,
          recordClass: 'immutable',
          revision: 1,
          content: [],
        });
        const payload = JSON.parse(Buffer.from(record?.payload ?? []).toString('utf8')) as Record<string, unknown>;
        expect(payload).toMatchObject({
          formatVersion: 1,
          parserVersion: 1,
          sourceIdentity: source.sourceIdentity,
          workspaceIdentity: owner.workspaceIdentity,
          sourceKind: 'queue',
          location: 'current-checkout',
          sourcePath: await fs.realpath(created.queueFile),
          digest: source.observation.digest,
          byteLength: sourceBefore.bytes.byteLength,
          metadata: {
            mode: sourceBefore.mode,
            byteLength: sourceBefore.bytes.byteLength,
            modifiedNanoseconds: sourceBefore.mtimeNs.toString(),
            changedNanoseconds: sourceBefore.ctimeNs.toString(),
          },
          recognition: {
            status: 'recognized',
            format: 'queue-v2',
            totalAnnotations: 2,
          },
        });
        expect(JSON.stringify(payload)).not.toContain('Should this reject an expired session?');
      }
      expect(index).toMatchObject({
        recordIdentity: indexIdentity,
        kind: 'legacy-review.import-index',
        recordClass: 'revisioned',
        revision: 3,
        content: [],
      });
      expect(JSON.parse(Buffer.from(index?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [],
        decisions: [
          {
            sourceDecisionIdentity: deferred.sourceDecisionIdentity,
            sourceIdentity: source.sourceIdentity,
            sourceKind: 'queue',
            digest: source.observation.digest,
            decision: 'deferred',
          },
        ],
      });
      expect(occurrence).toBeUndefined();
      expect(command).toMatchObject({
        kind: 'legacy-review.command',
        recordClass: 'immutable',
        content: [],
      });
    } finally {
      await state.close();
    }

    const restarted = await open(created);
    const restartedView = await restarted.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(restartedView.stateVersion).toBe(4);
    expect(restartedView.sources[0].observation).toMatchObject({
      migration: {
        status: 'deferred',
        sourceDecisionIdentity: deferred.sourceDecisionIdentity,
      },
    });
  });

  it('keeps changed decisions undecided and lets exact import irreversibly win', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const owner = await open(created);
    const initial = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const firstSource = initial.sources[0];
    if (firstSource.observation.status !== 'detected') {
      throw new Error('Initial decision source was not detected');
    }
    const deferred = await owner.workspace.execute({
      kind: 'legacy-review.source.decision.set',
      commandIdentity: 'defer-prior-legacy-digest',
      expectedStateVersion: 0,
      sourceIdentity: firstSource.sourceIdentity,
      expectedDigest: firstSource.observation.digest,
      decision: 'deferred',
    });
    if (deferred.kind !== 'legacy-review.source.decision-recorded') {
      throw new Error('Prior digest was not deferred');
    }

    const currentBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json'));
    await fs.writeFile(created.queueFile, currentBytes);
    const currentBefore = await metadata(created.queueFile);
    const changed = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const currentSource = changed.sources[0];
    expect(currentSource.observation).toMatchObject({
      status: 'detected',
      migration: {
        status: 'changed-since-decision',
        currentDecision: 'undecided',
        priorDecision: 'deferred',
      },
    });
    if (currentSource.observation.status !== 'detected') {
      throw new Error('Changed decision source was not detected');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'reject-stale-decision-digest',
        expectedStateVersion: 1,
        sourceIdentity: currentSource.sourceIdentity,
        expectedDigest: firstSource.observation.digest,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 1,
      reason: 'source-changed',
      observedDigest: currentSource.observation.digest,
    });
    const dismissed = await owner.workspace.execute({
      kind: 'legacy-review.source.decision.set',
      commandIdentity: 'dismiss-current-legacy-digest',
      expectedStateVersion: 1,
      sourceIdentity: currentSource.sourceIdentity,
      expectedDigest: currentSource.observation.digest,
      decision: 'dismissed',
    });
    expect(dismissed).toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      stateVersion: 2,
      decision: 'dismissed',
    });
    if (dismissed.kind !== 'legacy-review.source.decision-recorded') {
      throw new Error('Current digest was not dismissed');
    }

    const imported = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'import-dismissed-legacy-digest',
      expectedStateVersion: 2,
      sourceIdentity: currentSource.sourceIdentity,
      expectedDigest: currentSource.observation.digest,
    });
    expect(imported).toMatchObject({
      kind: 'legacy-review.source.imported',
      status: 'accepted',
      stateVersion: 3,
      preservation: 'preserved',
    });
    if (imported.kind !== 'legacy-review.source.imported') {
      throw new Error('Dismissed digest was not imported');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'cannot-dismiss-imported-legacy-digest',
        expectedStateVersion: 3,
        sourceIdentity: currentSource.sourceIdentity,
        expectedDigest: currentSource.observation.digest,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      stateVersion: 3,
      reason: 'source-already-imported',
    });
    const importedView = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(importedView.stateVersion).toBe(3);
    expect(importedView.sources[0].observation).toMatchObject({
      migration: {
        status: 'imported',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      },
    });
    expect(await metadata(created.queueFile)).toEqual(currentBefore);
    await close(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: owner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await state.read({
        recordIdentities: [
          deferred.sourceDecisionIdentity,
          dismissed.sourceDecisionIdentity,
          imported.sourceOccurrenceIdentity,
          legacyReviewImportIndexIdentity(owner.workspaceIdentity),
          legacyReviewImportCommandRecordIdentity('cannot-dismiss-imported-legacy-digest'),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(3);
      expect(read.records[0]).toMatchObject({
        kind: 'legacy-review.source-decision',
        content: [],
      });
      expect(read.records[1]).toMatchObject({
        kind: 'legacy-review.source-decision',
        content: [],
      });
      expect(Buffer.from(read.records[2]?.content[0]?.bytes ?? [])).toEqual(currentBytes);
      expect(JSON.parse(Buffer.from(read.records[3]?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [
          {
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            sourceIdentity: currentSource.sourceIdentity,
            sourceKind: 'queue',
            digest: currentSource.observation.digest,
            decision: 'imported',
          },
        ],
        decisions: [
          {
            sourceDecisionIdentity: deferred.sourceDecisionIdentity,
            sourceIdentity: firstSource.sourceIdentity,
            sourceKind: 'queue',
            digest: firstSource.observation.digest,
            decision: 'deferred',
          },
        ],
      });
      expect(read.records[4]).toBeUndefined();
    } finally {
      await state.close();
    }
  });

  it('bounds source decisions and rejects a conflicting immutable fact', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const owner = await openControlled(
      created,
      {},
      {
        legacyReviewImportMaximumOccurrences: 1,
      },
    );
    const firstView = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const firstSource = firstView.sources[0];
    if (firstSource.observation.status !== 'detected') {
      throw new Error('Bounded decision source was not detected');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'bounded-first-source-decision',
        expectedStateVersion: 0,
        sourceIdentity: firstSource.sourceIdentity,
        expectedDigest: firstSource.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 1 });
    await expect(
      (owner.workspace.execute as (command: unknown) => Promise<unknown>)({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'malformed-source-decision',
        expectedStateVersion: 1,
        sourceIdentity: firstSource.sourceIdentity,
        expectedDigest: firstSource.observation.digest,
        decision: 'ignored-forever',
      }),
    ).rejects.toThrow('Invalid legacy Review source decision command');

    await fs.writeFile(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const changed = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const changedSource = changed.sources[0];
    if (changedSource.observation.status !== 'detected') {
      throw new Error('Changed bounded decision source was not detected');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'bounded-second-source-decision',
        expectedStateVersion: 1,
        sourceIdentity: changedSource.sourceIdentity,
        expectedDigest: changedSource.observation.digest,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 1,
      reason: 'source-decision-limit',
    });
    const workspaceIdentity = owner.workspaceIdentity;
    await close(owner);

    const conflictingIdentity = legacyReviewSourceDecisionIdentity(
      workspaceIdentity,
      changedSource.sourceIdentity,
      changedSource.observation.digest,
      'dismissed',
    );
    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const installed = await state.commit({
        commandIdentity: 'install-conflicting-source-decision',
        expectedStateVersion: 1,
        records: [
          {
            recordClass: 'immutable',
            recordIdentity: conflictingIdentity,
            workflowIdentity: legacyReviewImportIndexIdentity(workspaceIdentity),
            kind: 'test.conflicting-source-decision',
            schemaVersion: 1,
            payload: new Uint8Array([0]),
            content: [],
          },
        ],
        result: {
          kind: 'test.conflicting-source-decision-installed',
          schemaVersion: 1,
          payload: new Uint8Array([1]),
        },
      });
      expect(installed).toMatchObject({ status: 'committed', stateVersion: 2 });
    } finally {
      await state.close();
    }

    const conflicted = await open(created);
    await expect(
      conflicted.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'reject-conflicting-source-decision',
        expectedStateVersion: 2,
        sourceIdentity: changedSource.sourceIdentity,
        expectedDigest: changedSource.observation.digest,
        decision: 'dismissed',
      }),
    ).rejects.toThrow('legacy-review-import-state-invalid');
    const current = await conflicted.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(current.stateVersion).toBe(2);
    expect(current.sources[0].observation).toMatchObject({
      migration: {
        status: 'changed-since-decision',
        priorDecision: 'deferred',
      },
    });
  });

  it('rolls back a source decision and recalls its unknown committed outcome without source access', async () => {
    const created = await fixture();
    await installGolden(created.queueFile, 'queue-v2.json');
    const previewOwner = await open(created);
    const preview = await previewOwner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const source = preview.sources[0];
    if (source.observation.status !== 'detected') {
      throw new Error('Fault decision source was not detected');
    }
    const decisionIdentity = legacyReviewSourceDecisionIdentity(
      previewOwner.workspaceIdentity,
      source.sourceIdentity,
      source.observation.digest,
      'dismissed',
    );
    const workspaceIdentity = previewOwner.workspaceIdentity;
    await close(previewOwner);

    const beforeCommand = {
      kind: 'legacy-review.source.decision.set' as const,
      commandIdentity: 'legacy-decision-before-commit-fault',
      expectedStateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      expectedDigest: source.observation.digest,
      decision: 'dismissed' as const,
    };
    const beforeOwner = await openControlled(created, {
      failpoint: 'after-first-record-write',
    });
    await expect(beforeOwner.workspace.execute(beforeCommand)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    await close(beforeOwner);

    const afterRollback = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await afterRollback.read({
        recordIdentities: [
          decisionIdentity,
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity(beforeCommand.commandIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(0);
      expect(read.records).toEqual([undefined, undefined, undefined]);
    } finally {
      await afterRollback.close();
    }

    const afterCommand = {
      ...beforeCommand,
      commandIdentity: 'legacy-decision-after-commit-fault',
    };
    const unknownOwner = await openControlled(created, {
      pauseAfterCommitCommandIdentity: afterCommand.commandIdentity,
      requestTimeoutMilliseconds: 1_000,
    });
    await expect(unknownOwner.workspace.execute(afterCommand)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    owners.delete(unknownOwner);
    await unknownOwner.dispose().catch(() => undefined);
    await fs.rm(created.queueFile);

    const recovered = await open(created);
    await expect(recovered.workspace.execute(afterCommand)).resolves.toMatchObject({
      kind: 'legacy-review.source.decision-recorded',
      status: 'accepted',
      commandIdentity: afterCommand.commandIdentity,
      stateVersion: 1,
      sourceDecisionIdentity: decisionIdentity,
      decision: 'dismissed',
      recording: 'recorded',
    });
    const missing = await recovered.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(missing.stateVersion).toBe(1);
    expect(missing.sources[0].observation).toEqual({ status: 'missing' });
  });

  it('retains the old product state-base rule independently of v1 State', () => {
    expect(legacyReviewStateDirectory({ XDG_STATE_HOME: '/configured/legacy-state' }, '/home/developer')).toBe(
      '/configured/legacy-state',
    );
    expect(legacyReviewStateDirectory({}, '/home/developer')).toBe('/home/developer/.local/state');
    expect(legacyReviewStateDirectory({ XDG_STATE_HOME: ' relative-state ' }, '/home/developer')).toBe(
      path.resolve('relative-state'),
    );
  });
});
