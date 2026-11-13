import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { openAuthoritativeState, type OpenAuthoritativeStateRequest } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import {
  legacyReviewImportCommandRecordIdentity,
  legacyReviewImportIndexIdentity,
  legacyReviewMovedSourceAssociationIdentity,
  legacyReviewSourceOccurrenceIdentity,
  type LegacyReviewMovedReceiptSourceSummary,
} from '../../src/legacyReviewImport/index.js';
import { reviewingRecordIdentity } from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import {
  bootstrapWorkspace,
  openRuntimeWorkspace,
  workspaceGitDirectory,
  type RuntimeWorkspaceInternalOptions,
  type WorkspaceIdentity,
} from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);
const roots = new Set<string>();
const owners = new Set<WorkspaceRuntimeOwner>();
const originalStateHome = process.env.XDG_STATE_HOME;
const OTHER_WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000002' as WorkspaceIdentity;

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
  readonly currentCheckoutHash: string;
}

interface DiscoveredSource {
  readonly source: LegacyReviewMovedReceiptSourceSummary;
  readonly digest: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

function legacyHash(exactCanonicalCheckout: string): string {
  return createHash('sha256').update(exactCanonicalCheckout).digest('hex');
}

function receiptPath(state: string, hash: string): string {
  return path.join(state, 'neoflow', 'workspaces', hash, 'review-receipts.json');
}

async function fixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-moved-association-v1-'));
  roots.add(root);
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await fs.mkdir(checkout, { recursive: true });
  await fs.mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  const canonicalCheckout = await fs.realpath(checkout);
  process.env.XDG_STATE_HOME = state;
  return {
    root,
    checkout,
    state,
    currentCheckoutHash: legacyHash(canonicalCheckout),
  };
}

function receiptDocument(workspace: string, marker: string): Buffer {
  const timestamp = '2026-09-02T13:00:00.000Z';
  return Buffer.from(
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: timestamp,
        batches: [
          {
            id: `${marker}-batch`,
            workspace,
            annotations: [
              {
                id: `${marker}-annotation`,
                kind: 'question',
                file: `${workspace}/src/example.ts`,
                anchor: { side: 'new', newLine: 7 },
                text: `${marker} private legacy question`,
                excerpt: '+ sanitized excerpt',
              },
            ],
            harness: {
              id: `${marker}-harness`,
              name: `${marker} Private Harness`,
              sessionId: `${marker}-private-session`,
              model: `${marker}-private-model`,
              workspace,
            },
            createdAt: timestamp,
            updatedAt: timestamp,
            harnessOutcome: 'pending',
            queueDisposition: 'pending',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

async function install(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  const modified = new Date('2026-09-02T13:00:00.000Z');
  await fs.utimes(file, modified, modified);
}

async function sourceMetadata(file: string): Promise<{
  readonly bytes: Buffer;
  readonly mode: number;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}> {
  const information = await fs.stat(file, { bigint: true });
  return {
    bytes: await fs.readFile(file),
    mode: Number(information.mode),
    size: information.size,
    mtimeNs: information.mtimeNs,
    ctimeNs: information.ctimeNs,
  };
}

async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
  const opened = await openWorkspaceRuntimeOwner({ startPath: created.checkout });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owners.add(opened.owner);
  return opened.owner;
}

async function openControlled(
  created: Fixture,
  stateControl: NonNullable<OpenAuthoritativeStateRequest['testControl']> = {},
  internal: RuntimeWorkspaceInternalOptions = {},
): Promise<WorkspaceRuntimeOwner> {
  const bootstrapped = await bootstrapWorkspace({ startPath: created.checkout });
  expect(bootstrapped.status).toBe('ready');
  if (bootstrapped.status !== 'ready') {
    throw new Error(bootstrapped.diagnostic.code);
  }
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
    testControl: stateControl,
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

async function discover(owner: WorkspaceRuntimeOwner, sourceOffset = 0): Promise<DiscoveredSource> {
  const view = await owner.workspace.read({
    kind: 'legacy-review.moved-receipt-sources',
    search: { kind: 'legacy-state-directory' },
    sourceOffset,
    sourceLimit: 1,
  });
  expect(view.status).toBe('available');
  if (view.status !== 'available') throw new Error(view.reason);
  const source = view.sources[0];
  if (source?.observation.status !== 'detected') {
    throw new Error('Moved receipt was not detected');
  }
  return { source, digest: source.observation.digest };
}

function command(
  owner: WorkspaceRuntimeOwner,
  discovered: DiscoveredSource,
  commandIdentity: string,
  expectedStateVersion: number,
) {
  return {
    kind: 'legacy-review.moved-receipt-source.associate-and-import' as const,
    commandIdentity,
    expectedStateVersion,
    confirmedWorkspaceIdentity: owner.workspaceIdentity,
    sourceIdentity: discovered.source.sourceIdentity,
    legacyCheckoutHash: discovered.source.legacyCheckoutHash,
    expectedDigest: discovered.digest,
  };
}

async function stateDatabasePath(created: Fixture, workspaceIdentity: string): Promise<string> {
  const stateRoot = path.join(
    userStateDirectory(created.checkout),
    'workspaces',
    workspaceIdentity,
    'authoritative-state',
  );
  const generation = (await fs.readFile(path.join(stateRoot, 'CURRENT'), 'utf8')).trim();
  return path.join(stateRoot, generation);
}

afterEach(async () => {
  await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
  owners.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('moved legacy receipt association and import', () => {
  it('atomically binds the confirmed Workspace and exact receipt before BLOB-only history survives deletion and restart', async () => {
    const created = await fixture();
    const former = path.join(created.root, 'former-checkout');
    const hash = legacyHash(former);
    const sourceFile = receiptPath(created.state, hash);
    const bytes = receiptDocument('/sanitized/former/workspace', 'first');
    await install(sourceFile, bytes);
    const before = await sourceMetadata(sourceFile);
    const owner = await open(created);
    const discovered = await discover(owner);
    expect(discovered.source.observation).toMatchObject({
      migration: { status: 'unassociated' },
    });
    const associate = command(owner, discovered, 'associate-moved-receipt', 0);
    const associationIdentity = legacyReviewMovedSourceAssociationIdentity(
      owner.workspaceIdentity,
      discovered.source.sourceIdentity,
      discovered.digest,
    );
    const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      owner.workspaceIdentity,
      discovered.source.sourceIdentity,
      discovered.digest,
    );

    const result = await owner.workspace.execute(associate);
    expect(result).toEqual({
      kind: 'legacy-review.moved-receipt-source.associated-and-imported',
      status: 'accepted',
      commandIdentity: associate.commandIdentity,
      stateVersion: 1,
      sourceIdentity: discovered.source.sourceIdentity,
      associationIdentity,
      sourceOccurrenceIdentity: occurrenceIdentity,
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      legacyCheckoutHash: hash,
      digest: discovered.digest,
      association: 'recorded',
      preservation: 'preserved',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(await sourceMetadata(sourceFile)).toEqual(before);

    const associated = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    expect(associated).toMatchObject({
      status: 'available',
      stateVersion: 1,
      sources: [
        {
          sourceIdentity: discovered.source.sourceIdentity,
          observation: {
            status: 'detected',
            migration: {
              status: 'associated-and-imported',
              associationIdentity,
              sourceOccurrenceIdentity: occurrenceIdentity,
            },
          },
        },
      ],
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: discovered.source.sourceIdentity,
        legacyCheckoutHash: hash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 32,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 1,
      migration: {
        status: 'associated-and-imported',
        associationIdentity,
        sourceOccurrenceIdentity: occurrenceIdentity,
      },
    });

    await fs.rm(sourceFile);
    const history = await owner.workspace.read({
      kind: 'legacy-review.receipt-history',
      sourceOccurrenceIdentity: occurrenceIdentity,
      batchOffset: 0,
      batchLimit: 24,
    });
    expect(history).toMatchObject({
      kind: 'legacy-review.receipt-history',
      status: 'available',
      stateVersion: 1,
      sourceIdentity: discovered.source.sourceIdentity,
      sourceOccurrenceIdentity: occurrenceIdentity,
      digest: discovered.digest,
      disclosure: {
        label: 'LEGACY REVIEW HISTORY',
        provenance: 'imported-legacy-receipt-source',
        recordStatus: 'migration-evidence-not-v1-history',
      },
      totalBatches: 1,
      totalAnnotations: 1,
      batches: [
        {
          legacyWorkspacePath: expect.objectContaining({
            text: '/sanitized/former/workspace',
          }),
        },
      ],
    });
    await close(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: owner.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const indexIdentity = legacyReviewImportIndexIdentity(owner.workspaceIdentity);
      const read = await state.read({
        recordIdentities: [
          associationIdentity,
          occurrenceIdentity,
          indexIdentity,
          legacyReviewImportCommandRecordIdentity(associate.commandIdentity),
          reviewingRecordIdentity('rvi', owner.workspaceIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(1);
      expect(read.quarantineReports).toEqual([]);
      const [association, occurrence, index, commandRecord, reviewIndex] = read.records;
      expect(association).toMatchObject({
        recordIdentity: associationIdentity,
        workflowIdentity: indexIdentity,
        kind: 'legacy-review.moved-source-association',
        recordClass: 'immutable',
        revision: 1,
        content: [],
      });
      const associationPayload = JSON.parse(Buffer.from(association?.payload ?? []).toString('utf8')) as Record<
        string,
        unknown
      >;
      expect(associationPayload).toEqual({
        formatVersion: 1,
        associationIdentity,
        workspaceIdentity: owner.workspaceIdentity,
        sourceIdentity: discovered.source.sourceIdentity,
        sourceOccurrenceIdentity: occurrenceIdentity,
        digest: discovered.digest,
        legacyCheckoutHash: hash,
        associationCommandIdentity: associate.commandIdentity,
        associatedStateVersion: 1,
      });
      expect(JSON.stringify(associationPayload)).not.toContain('/sanitized/former/workspace');
      expect(JSON.stringify(associationPayload)).not.toContain('private');
      expect(occurrence).toMatchObject({
        recordIdentity: occurrenceIdentity,
        workflowIdentity: indexIdentity,
        kind: 'legacy-review.source-occurrence',
        recordClass: 'immutable',
        content: [{ role: 'legacy-source', digest: discovered.digest }],
      });
      expect(Buffer.from(occurrence?.content[0]?.bytes ?? [])).toEqual(bytes);
      expect(JSON.parse(Buffer.from(occurrence?.payload ?? []).toString('utf8'))).toMatchObject({
        sourceIdentity: discovered.source.sourceIdentity,
        sourceOccurrenceIdentity: occurrenceIdentity,
        workspaceIdentity: owner.workspaceIdentity,
        sourceKind: 'receipts',
        location: 'moved-legacy-state',
        digest: discovered.digest,
        decision: 'imported',
        importCommandIdentity: associate.commandIdentity,
        importedStateVersion: 1,
      });
      expect(JSON.parse(Buffer.from(index?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [
          {
            sourceOccurrenceIdentity: occurrenceIdentity,
            sourceIdentity: discovered.source.sourceIdentity,
            sourceKind: 'receipts',
            digest: discovered.digest,
            decision: 'imported',
          },
        ],
        movedSourceAssociations: [
          {
            associationIdentity,
            sourceOccurrenceIdentity: occurrenceIdentity,
            sourceIdentity: discovered.source.sourceIdentity,
            digest: discovered.digest,
            legacyCheckoutHash: hash,
          },
        ],
      });
      expect(commandRecord).toMatchObject({
        kind: 'legacy-review.command',
        recordClass: 'immutable',
        content: [],
      });
      expect(reviewIndex).toBeUndefined();
    } finally {
      await state.close();
    }

    const restarted = await open(created);
    await expect(
      restarted.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: occurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 1,
      digest: discovered.digest,
      totalBatches: 1,
    });
  });

  it('replays, reuses, races, and scopes exact associations while replacement bytes require fresh confirmation', async () => {
    const created = await fixture();
    const hash = legacyHash(path.join(created.root, 'former'));
    const sourceFile = receiptPath(created.state, hash);
    const firstBytes = receiptDocument('/legacy/first', 'first');
    await install(sourceFile, firstBytes);
    const owner = await open(created);
    const first = await discover(owner);
    const firstCommand = command(owner, first, 'associate-first-digest', 0);
    const firstResult = await owner.workspace.execute(firstCommand);
    expect(firstResult).toMatchObject({
      status: 'accepted',
      stateVersion: 1,
      association: 'recorded',
      preservation: 'preserved',
    });
    if (firstResult.kind !== 'legacy-review.moved-receipt-source.associated-and-imported') {
      throw new Error('First moved source was not associated');
    }
    await expect(owner.workspace.execute(firstCommand)).resolves.toEqual(firstResult);
    const repeated = await owner.workspace.execute(command(owner, first, 'associate-first-digest-again', 1));
    expect(repeated).toMatchObject({
      status: 'accepted',
      stateVersion: 2,
      associationIdentity: firstResult.associationIdentity,
      association: 'already-recorded',
      preservation: 'already-preserved',
    });
    await expect(
      owner.workspace.execute({
        ...firstCommand,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 2,
      reason: 'command-identity-conflict',
    });

    const secondBytes = receiptDocument('/legacy/second', 'second');
    await fs.writeFile(sourceFile, secondBytes);
    const second = await discover(owner);
    expect(second.digest).not.toBe(first.digest);
    expect(second.source.sourceIdentity).toBe(first.source.sourceIdentity);
    expect(second.source.observation).toMatchObject({
      migration: { status: 'unassociated' },
    });
    await expect(owner.workspace.execute(command(owner, first, 'reject-stale-moved-digest', 2))).resolves.toMatchObject(
      {
        status: 'rejected',
        stateVersion: 2,
        reason: 'source-changed',
        observedDigest: second.digest,
      },
    );
    const secondResult = await owner.workspace.execute(command(owner, second, 'associate-second-digest', 2));
    expect(secondResult).toMatchObject({
      status: 'accepted',
      stateVersion: 3,
      association: 'recorded',
      preservation: 'preserved',
    });
    if (secondResult.kind !== 'legacy-review.moved-receipt-source.associated-and-imported') {
      throw new Error('Moved source was not associated');
    }
    expect(secondResult.associationIdentity).not.toBe(firstResult.associationIdentity);
    expect(secondResult.sourceOccurrenceIdentity).not.toBe(firstResult.sourceOccurrenceIdentity);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: firstResult.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      digest: first.digest,
      batches: [
        {
          legacyWorkspacePath: expect.objectContaining({ text: '/legacy/first' }),
        },
      ],
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: secondResult.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      digest: second.digest,
      batches: [
        {
          legacyWorkspacePath: expect.objectContaining({ text: '/legacy/second' }),
        },
      ],
    });
    await close(owner);

    const restarted = await open(created);
    const restartedSource = await discover(restarted);
    expect(restartedSource.source.observation).toMatchObject({
      migration: {
        status: 'associated-and-imported',
        associationIdentity: secondResult.associationIdentity,
        sourceOccurrenceIdentity: secondResult.sourceOccurrenceIdentity,
      },
    });

    const raced = await fixture();
    const racedHash = legacyHash(path.join(raced.root, 'former'));
    await install(receiptPath(raced.state, racedHash), receiptDocument('/legacy/raced', 'raced'));
    const raceOwner = await open(raced);
    const raceSource = await discover(raceOwner);
    const outcomes = await Promise.all([
      raceOwner.workspace.execute(command(raceOwner, raceSource, 'concurrent-moved-association-a', 0)),
      raceOwner.workspace.execute(command(raceOwner, raceSource, 'concurrent-moved-association-b', 0)),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'accepted')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({
      reason: 'state-version-mismatch',
      stateVersion: 1,
    });
  });

  it('preserves moved association membership through every current-source and candidate index writer', async () => {
    const created = await fixture();
    const hash = legacyHash(path.join(created.root, 'former'));
    await install(receiptPath(created.state, hash), receiptDocument('/legacy/preserved', 'preserved'));
    const queueFile = path.join(created.checkout, '.neoflow', 'review.json');
    await install(
      queueFile,
      Buffer.from(
        `${JSON.stringify({
          version: 2,
          annotations: [
            {
              id: 'current-question',
              kind: 'question',
              file: 'src/example.ts',
              anchor: { side: 'new', newLine: 1 },
              text: 'sanitized current candidate',
            },
          ],
        })}\n`,
      ),
    );
    const owner = await open(created);
    const moved = await discover(owner);
    const associated = await owner.workspace.execute(
      command(owner, moved, 'associate-before-current-index-writers', 0),
    );
    if (associated.kind !== 'legacy-review.moved-receipt-source.associated-and-imported') {
      throw new Error('Moved source was not associated');
    }

    const current = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const queue = current.sources[0];
    if (queue.observation.status !== 'detected') {
      throw new Error('Current queue was not detected');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'defer-current-after-moved-association',
        expectedStateVersion: 1,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 2 });
    const imported = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'import-current-after-moved-association',
      expectedStateVersion: 2,
      sourceIdentity: queue.sourceIdentity,
      expectedDigest: queue.observation.digest,
    });
    if (imported.kind !== 'legacy-review.source.imported') {
      throw new Error('Current queue was not imported');
    }
    const candidates = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (candidates.status !== 'available' || candidates.candidates[0] === undefined) {
      throw new Error('Current candidate was unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'decide-current-after-moved-association',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidates.candidates[0].candidateIdentity,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 4 });

    const retained = await discover(owner);
    expect(retained.source.observation).toMatchObject({
      migration: {
        status: 'associated-and-imported',
        associationIdentity: associated.associationIdentity,
        sourceOccurrenceIdentity: associated.sourceOccurrenceIdentity,
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: associated.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({ status: 'available', stateVersion: 4 });
  });

  it('rejects every unconfirmed, ineligible, unstable, or over-bound command without source or State mutation', async () => {
    const created = await fixture();
    const hash = legacyHash(path.join(created.root, 'former'));
    const sourceFile = receiptPath(created.state, hash);
    await install(sourceFile, receiptDocument('/legacy/eligible', 'eligible'));
    const before = await sourceMetadata(sourceFile);
    const owner = await open(created);
    const source = await discover(owner);
    const base = command(owner, source, 'rejected-moved-association', 0);

    await expect(
      owner.workspace.execute({
        ...base,
        confirmedWorkspaceIdentity: OTHER_WORKSPACE_IDENTITY,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'workspace-identity-mismatch',
    });
    await expect(
      owner.workspace.execute({
        ...base,
        commandIdentity: 'reject-current-receipt-hash',
        legacyCheckoutHash: created.currentCheckoutHash,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'current-source-ineligible',
    });
    await expect(
      owner.workspace.execute({
        ...base,
        commandIdentity: 'reject-mismatched-moved-identity',
        sourceIdentity: `lgs_${'0'.repeat(64)}`,
      } as never),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-identity-mismatch',
    });

    const missingFormer = path.join(created.root, 'missing-former');
    const missing = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: {
        kind: 'former-checkout-path',
        exactFormerCanonicalCheckout: missingFormer,
      },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    if (missing.status !== 'available' || missing.sources[0] === undefined) {
      throw new Error('Missing locator slot unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.moved-receipt-source.associate-and-import',
        commandIdentity: 'reject-missing-moved-source',
        expectedStateVersion: 0,
        confirmedWorkspaceIdentity: owner.workspaceIdentity,
        sourceIdentity: missing.sources[0].sourceIdentity,
        legacyCheckoutHash: missing.sources[0].legacyCheckoutHash,
        expectedDigest: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-not-found',
    });

    expect(await sourceMetadata(sourceFile)).toEqual(before);
    await fs.writeFile(sourceFile, '{malformed}\n');
    const malformed = await discover(owner);
    await expect(
      owner.workspace.execute(command(owner, malformed, 'reject-malformed-moved-source', 0)),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unrecognized',
    });
    await fs.writeFile(sourceFile, '{"version":99,"updatedAt":"2026-09-02T13:00:00.000Z","batches":[]}\n');
    const unsupported = await discover(owner);
    await expect(
      owner.workspace.execute(command(owner, unsupported, 'reject-unsupported-moved-source', 0)),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unrecognized',
    });
    expect(await owner.workspace.read({ kind: 'workspace.identity' })).not.toHaveProperty('stateVersion');

    const executeUnknown = owner.workspace.execute.bind(owner.workspace) as (command: unknown) => Promise<unknown>;
    for (const malformedCommand of [
      { ...base, path: sourceFile },
      { ...base, bytes: 'must-not-cross' },
      { ...base, confirmedWorkspaceIdentity: 'not-a-workspace' },
      { ...base, legacyCheckoutHash: 'A'.repeat(64) },
      { ...base, expectedDigest: 'short' },
    ]) {
      await expect(executeUnknown(malformedCommand)).rejects.toThrow(TypeError);
    }
    await close(owner);

    await fs.writeFile(sourceFile, before.bytes);
    const boundedBefore = await sourceMetadata(sourceFile);
    const bounded = await openControlled(
      created,
      {},
      {
        legacyReviewImportMaximumOccurrences: 1,
      },
    );
    const boundedSource = await discover(bounded);
    await expect(
      bounded.workspace.execute(command(bounded, boundedSource, 'reject-bounded-moved-association', 0)),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'moved-source-association-limit',
    });
    expect(await sourceMetadata(sourceFile)).toEqual(boundedBefore);
    await close(bounded);

    for (const failure of ['unsafe-path', 'not-regular-file', 'source-too-large'] as const) {
      const unavailable = await fixture();
      const unavailableHash = legacyHash(path.join(unavailable.root, `former-${failure}`));
      const unavailableFile = receiptPath(unavailable.state, unavailableHash);
      if (failure === 'unsafe-path') {
        const outside = path.join(unavailable.root, 'outside');
        await fs.mkdir(outside, { recursive: true });
        await install(path.join(outside, 'review-receipts.json'), receiptDocument('/must/not/be/read', 'unsafe'));
        await fs.mkdir(path.dirname(path.dirname(unavailableFile)), {
          recursive: true,
        });
        await fs.symlink(outside, path.dirname(unavailableFile));
      } else if (failure === 'not-regular-file') {
        await fs.mkdir(unavailableFile, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(unavailableFile), { recursive: true });
        const handle = await fs.open(unavailableFile, 'w');
        await handle.truncate(16 * 1024 * 1024 + 1);
        await handle.close();
      }
      const unavailableOwner = await open(unavailable);
      const unavailableView = await unavailableOwner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 1,
      });
      if (unavailableView.status !== 'available' || unavailableView.sources[0] === undefined) {
        throw new Error('Unavailable locator slot was absent');
      }
      const unavailableSource = unavailableView.sources[0];
      await expect(
        unavailableOwner.workspace.execute({
          kind: 'legacy-review.moved-receipt-source.associate-and-import',
          commandIdentity: `reject-${failure}-moved-source`,
          expectedStateVersion: 0,
          confirmedWorkspaceIdentity: unavailableOwner.workspaceIdentity,
          sourceIdentity: unavailableSource.sourceIdentity,
          legacyCheckoutHash: unavailableSource.legacyCheckoutHash,
          expectedDigest: '0'.repeat(64),
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        stateVersion: 0,
        reason: 'source-unavailable',
        sourceFailure: failure,
      });
      await close(unavailableOwner);
    }

    process.env.XDG_STATE_HOME = created.state;
    const racing = await openControlled(
      created,
      {},
      {
        legacyReviewSourceTestControl: {
          async afterBytesRead({ sourcePath }): Promise<void> {
            if (sourcePath.endsWith('review-receipts.json')) {
              await fs.appendFile(sourcePath, ' ');
            }
          },
        },
      },
    );
    const racePreview = await racing.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    expect(racePreview).toMatchObject({
      status: 'available',
      sources: [
        {
          observation: {
            status: 'unavailable',
            reason: 'changed-during-read',
          },
        },
      ],
    });
    await expect(
      racing.workspace.execute({
        ...base,
        commandIdentity: 'reject-racing-moved-association',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 0,
      reason: 'source-unavailable',
      sourceFailure: 'changed-during-read',
    });
  });

  it('rejects an unindexed conflicting immutable association instead of inventing membership', async () => {
    const created = await fixture();
    const hash = legacyHash(path.join(created.root, 'former-conflict'));
    await install(receiptPath(created.state, hash), receiptDocument('/legacy/conflict', 'conflict'));
    const preview = await open(created);
    const source = await discover(preview);
    const workspaceIdentity = preview.workspaceIdentity;
    const associationIdentity = legacyReviewMovedSourceAssociationIdentity(
      workspaceIdentity,
      source.source.sourceIdentity,
      source.digest,
    );
    const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      workspaceIdentity,
      source.source.sourceIdentity,
      source.digest,
    );
    await close(preview);

    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      await expect(
        state.commit({
          commandIdentity: 'install-conflicting-moved-association',
          expectedStateVersion: 0,
          records: [
            {
              recordClass: 'immutable',
              recordIdentity: associationIdentity,
              workflowIdentity: legacyReviewImportIndexIdentity(workspaceIdentity),
              kind: 'test.conflicting-moved-association',
              schemaVersion: 1,
              payload: new Uint8Array([0]),
              content: [],
            },
          ],
          result: {
            kind: 'test.conflicting-moved-association-installed',
            schemaVersion: 1,
            payload: new Uint8Array([1]),
          },
        }),
      ).resolves.toMatchObject({ status: 'committed', stateVersion: 1 });
    } finally {
      await state.close();
    }

    const conflicted = await open(created);
    const conflictCommand = command(conflicted, source, 'reject-conflicting-moved-association', 1);
    await expect(conflicted.workspace.execute(conflictCommand)).rejects.toThrow('legacy-review-import-state-invalid');
    await close(conflicted);
    const inspected = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await inspected.read({
        recordIdentities: [
          occurrenceIdentity,
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity(conflictCommand.commandIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(1);
      expect(read.records).toEqual([undefined, undefined, undefined]);
    } finally {
      await inspected.close();
    }
  });

  it('rolls back every record and recalls an unknown committed association after the source disappears', async () => {
    const created = await fixture();
    const hash = legacyHash(path.join(created.root, 'former'));
    const sourceFile = receiptPath(created.state, hash);
    await install(sourceFile, receiptDocument('/legacy/fault', 'fault'));
    const previewOwner = await open(created);
    const source = await discover(previewOwner);
    const workspaceIdentity = previewOwner.workspaceIdentity;
    const associationIdentity = legacyReviewMovedSourceAssociationIdentity(
      workspaceIdentity,
      source.source.sourceIdentity,
      source.digest,
    );
    const occurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      workspaceIdentity,
      source.source.sourceIdentity,
      source.digest,
    );
    await close(previewOwner);

    const before = await openControlled(created, {
      failpoint: 'after-first-record-write',
    });
    const beforeCommand = command(before, source, 'moved-association-before-commit-fault', 0);
    await expect(before.workspace.execute(beforeCommand)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    await close(before);
    const rollback = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await rollback.read({
        recordIdentities: [
          associationIdentity,
          occurrenceIdentity,
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity(beforeCommand.commandIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(0);
      expect(read.records).toEqual([undefined, undefined, undefined, undefined]);
    } finally {
      await rollback.close();
    }

    const unknown = await openControlled(created, {
      pauseAfterCommitCommandIdentity: 'moved-association-after-commit-fault',
      requestTimeoutMilliseconds: 1_000,
    });
    const unknownCommand = command(unknown, source, 'moved-association-after-commit-fault', 0);
    await expect(unknown.workspace.execute(unknownCommand)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    owners.delete(unknown);
    await unknown.dispose().catch(() => undefined);
    await fs.rm(sourceFile);

    const recovered = await open(created);
    await expect(recovered.workspace.execute(unknownCommand)).resolves.toEqual({
      kind: 'legacy-review.moved-receipt-source.associated-and-imported',
      status: 'accepted',
      commandIdentity: unknownCommand.commandIdentity,
      stateVersion: 1,
      sourceIdentity: source.source.sourceIdentity,
      associationIdentity,
      sourceOccurrenceIdentity: occurrenceIdentity,
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      legacyCheckoutHash: hash,
      digest: source.digest,
      association: 'recorded',
      preservation: 'preserved',
    });
    await expect(
      recovered.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: occurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({ status: 'available', stateVersion: 1 });
  });

  it('fails closed when indexed association, occurrence, or exact BLOB evidence is missing or quarantined', async () => {
    for (const damage of [
      'missing-association',
      'quarantined-association',
      'missing-occurrence',
      'quarantined-blob',
    ] as const) {
      const created = await fixture();
      const hash = legacyHash(path.join(created.root, `former-${damage}`));
      const sourceFile = receiptPath(created.state, hash);
      const sourceBytes = receiptDocument(`/legacy/${damage}`, damage);
      await install(sourceFile, sourceBytes);
      const owner = await open(created);
      const source = await discover(owner);
      const result = await owner.workspace.execute(command(owner, source, `associate-before-${damage}`, 0));
      if (result.kind !== 'legacy-review.moved-receipt-source.associated-and-imported') {
        throw new Error('Damage fixture was not associated');
      }
      const workspaceIdentity = owner.workspaceIdentity;
      await close(owner);

      const database = new DatabaseSync(await stateDatabasePath(created, workspaceIdentity));
      if (damage === 'missing-association') {
        database.prepare('DELETE FROM records WHERE record_identity = ?').run(result.associationIdentity);
      } else if (damage === 'quarantined-association') {
        database
          .prepare('UPDATE records SET payload = ? WHERE record_identity = ?')
          .run(new Uint8Array([0xff]), result.associationIdentity);
      } else if (damage === 'missing-occurrence') {
        database.prepare('DELETE FROM record_content WHERE record_identity = ?').run(result.sourceOccurrenceIdentity);
        database.prepare('DELETE FROM records WHERE record_identity = ?').run(result.sourceOccurrenceIdentity);
      } else {
        database
          .prepare('UPDATE content_objects SET bytes = ? WHERE digest = ?')
          .run(new Uint8Array([0xca, 0xfe]), result.digest);
      }
      database.close();

      const damaged = await open(created);
      await expect(
        damaged.workspace.read({
          kind: 'legacy-review.moved-receipt-sources',
          search: { kind: 'legacy-state-directory' },
          sourceOffset: 0,
          sourceLimit: 1,
        }),
      ).rejects.toThrow('legacy-review-import-state-invalid');
      const history = damaged.workspace.read({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: result.sourceOccurrenceIdentity,
        batchOffset: 0,
        batchLimit: 1,
      });
      if (damage === 'quarantined-blob') {
        await expect(history).resolves.toMatchObject({
          status: 'unavailable',
          reason: 'content-unavailable',
        });
      } else {
        await expect(history).rejects.toThrow('legacy-review-import-state-invalid');
      }
      expect(await fs.readFile(sourceFile)).toEqual(sourceBytes);
      await close(damaged);
    }
  });
});
