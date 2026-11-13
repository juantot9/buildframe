import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AuthoritativeStateError,
  openAuthoritativeState,
  type AuthoritativeState,
  type StateCommitRequest,
  type StateTestFailpoint,
} from '../../src/authoritativeState.js';
import type { WorkspaceIdentity } from '../../src/index.js';

const WORKSPACE_IDENTITY = 'wsp_11111111-1111-4111-8111-111111111111' as WorkspaceIdentity;
const fixtures: string[] = [];
const openStates: AuthoritativeState[] = [];
const GOLDEN_FORMAT_1 = path.resolve('packages/workspace/test/fixtures/authoritative-state/format-1');

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'buildframe-authoritative-state-p05-'));
  fixtures.push(directory);
  return directory;
}

async function openState(
  privateStateDirectory: string,
  failpoint?: StateTestFailpoint,
  timeout?: {
    readonly commandIdentity: string;
    readonly milliseconds: number;
  },
): Promise<AuthoritativeState> {
  const state = await openAuthoritativeState({
    privateStateDirectory,
    workspaceIdentity: WORKSPACE_IDENTITY,
    ...(failpoint === undefined && timeout === undefined
      ? {}
      : {
          testControl: {
            ...(failpoint === undefined ? {} : { failpoint }),
            ...(timeout === undefined
              ? {}
              : {
                  pauseAfterCommitCommandIdentity: timeout.commandIdentity,
                  requestTimeoutMilliseconds: timeout.milliseconds,
                }),
          },
        }),
  });
  openStates.push(state);
  return state;
}

function stateRoot(privateStateDirectory: string): string {
  return path.join(privateStateDirectory, 'workspaces', WORKSPACE_IDENTITY, 'authoritative-state');
}

async function activeGeneration(
  privateStateDirectory: string,
): Promise<{ readonly name: string; readonly file: string }> {
  const root = stateRoot(privateStateDirectory);
  const name = (await readFile(path.join(root, 'CURRENT'), 'utf8')).trim();
  return { name, file: path.join(root, name) };
}

async function installGoldenFormat1(privateStateDirectory: string): Promise<void> {
  const root = stateRoot(privateStateDirectory);
  await mkdir(path.dirname(root), { recursive: true, mode: 0o700 });
  await cp(GOLDEN_FORMAT_1, root, { recursive: true });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function immutableCommit(
  commandIdentity: string,
  expectedStateVersion: number,
  recordIdentity: string,
  payload: Uint8Array,
  content: Uint8Array,
): StateCommitRequest {
  return {
    commandIdentity,
    expectedStateVersion,
    records: [
      {
        recordClass: 'immutable',
        recordIdentity,
        workflowIdentity: 'workflow-review-1',
        kind: 'review.snapshot',
        schemaVersion: 1,
        payload,
        content: [{ role: 'exact-source', bytes: content }],
      },
    ],
    result: {
      kind: 'review.snapshot-recorded',
      schemaVersion: 1,
      payload: new Uint8Array([0x72, 0x65, 0x73, 0x75, 0x6c, 0x74]),
    },
  };
}

afterEach(async () => {
  await Promise.all(openStates.splice(0).map(state => state.close().catch(() => undefined)));
  await Promise.all(fixtures.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('Authoritative State transaction contract', () => {
  it('commits checksummed immutable envelopes and exact binary content', async () => {
    const state = await openState(await fixture());
    expect(await state.read({ recordIdentities: [], includeContent: false })).toEqual({
      stateVersion: 0,
      records: [],
      quarantineReports: [],
    });

    const payload = new Uint8Array([0x00, 0xff, 0xc3, 0x28, 0x0a]);
    const exactContent = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff, 0x0d, 0x0a, 0x00]);
    const request = immutableCommit('command-record-snapshot-1', 0, 'record-snapshot-1', payload, exactContent);

    const committed = await state.commit(request);
    expect(committed).toEqual({
      status: 'committed',
      commandIdentity: request.commandIdentity,
      stateVersion: 1,
      result: request.result,
    });

    const withoutContent = await state.read({
      recordIdentities: ['record-snapshot-1'],
      includeContent: false,
    });
    expect(withoutContent.stateVersion).toBe(1);
    expect(withoutContent.records[0]).toEqual(
      expect.objectContaining({
        recordIdentity: 'record-snapshot-1',
        recordClass: 'immutable',
        revision: 1,
        payload,
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/u),
        content: [
          {
            role: 'exact-source',
            digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
          },
        ],
      }),
    );

    const withContent = await state.read({
      recordIdentities: ['record-snapshot-1'],
      includeContent: true,
    });
    expect(withContent.records[0]?.content[0]?.bytes).toEqual(exactContent);

    const boundedContent = await state.readContent({
      windows: [
        {
          recordIdentity: 'record-snapshot-1',
          role: 'exact-source',
          offset: 2,
          length: 3,
        },
        {
          recordIdentity: 'record-snapshot-1',
          role: 'missing-role',
          offset: 0,
          length: 1,
        },
      ],
    });
    expect(boundedContent).toMatchObject({
      stateVersion: 1,
      quarantineReports: [],
      windows: [
        {
          status: 'available',
          offset: 2,
          byteLength: 3,
          totalByteLength: exactContent.byteLength,
          complete: false,
          digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
        { status: 'unavailable', reason: 'role-not-found' },
      ],
    });
    expect(boundedContent.windows[0]?.status === 'available' ? boundedContent.windows[0].bytes : undefined).toEqual(
      exactContent.slice(2, 5),
    );
    await expect(
      state.readContent({
        windows: [
          {
            recordIdentity: 'record-snapshot-1',
            role: 'exact-source',
            offset: 0,
            length: 256 * 1024 + 1,
          },
        ],
      }),
    ).rejects.toThrow('Exact-content window exceeds the private bound');

    const immutableRewrite = await state.commit(
      immutableCommit(
        'command-rewrite-snapshot-1',
        1,
        'record-snapshot-1',
        new Uint8Array([0x99]),
        new Uint8Array([0x98]),
      ),
    );
    expect(immutableRewrite).toEqual({
      status: 'rejected',
      reason: 'immutable-record-exists',
      stateVersion: 1,
      recordIdentity: 'record-snapshot-1',
    });
    expect(
      await state.read({
        recordIdentities: ['record-snapshot-1'],
        includeContent: true,
      }),
    ).toEqual(withContent);
  });

  it('compares and swaps revisioned records without weakening immutable history', async () => {
    const state = await openState(await fixture());
    const create = await state.commit({
      commandIdentity: 'command-create-draft-1',
      expectedStateVersion: 0,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: 'record-question-draft-1',
          workflowIdentity: 'workflow-review-1',
          kind: 'review.question-draft',
          schemaVersion: 1,
          expectedRevision: 0,
          payload: new TextEncoder().encode('first draft'),
          content: [],
        },
      ],
      result: {
        kind: 'review.question-draft-saved',
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      },
    });
    expect(create.status).toBe('committed');

    const update = await state.commit({
      commandIdentity: 'command-update-draft-1',
      expectedStateVersion: 1,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: 'record-question-draft-1',
          workflowIdentity: 'workflow-review-1',
          kind: 'review.question-draft',
          schemaVersion: 1,
          expectedRevision: 1,
          payload: new TextEncoder().encode('second draft'),
          content: [],
        },
      ],
      result: {
        kind: 'review.question-draft-saved',
        schemaVersion: 1,
        payload: new Uint8Array([2]),
      },
    });
    expect(update.status).toBe('committed');

    const staleRevision = await state.commit({
      commandIdentity: 'command-stale-draft-1',
      expectedStateVersion: 2,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: 'record-question-draft-1',
          workflowIdentity: 'workflow-review-1',
          kind: 'review.question-draft',
          schemaVersion: 1,
          expectedRevision: 1,
          payload: new TextEncoder().encode('stale replacement'),
          content: [],
        },
      ],
      result: {
        kind: 'review.question-draft-saved',
        schemaVersion: 1,
        payload: new Uint8Array([3]),
      },
    });
    expect(staleRevision).toEqual({
      status: 'rejected',
      reason: 'revision-conflict',
      stateVersion: 2,
      recordIdentity: 'record-question-draft-1',
      actualRevision: 2,
    });

    const record = (
      await state.read({
        recordIdentities: ['record-question-draft-1'],
        includeContent: false,
      })
    ).records[0];
    expect(record?.revision).toBe(2);
    expect(new TextDecoder().decode(record?.payload)).toBe('second draft');
  });

  it('uses expected State versions and a stable idempotent command ledger', async () => {
    const directory = await fixture();
    const state = await openState(directory);
    const firstRequest = immutableCommit(
      'command-stable-1',
      0,
      'record-stable-1',
      new Uint8Array([1]),
      new Uint8Array([2]),
    );
    const first = await state.commit(firstRequest);
    expect(first.status).toBe('committed');

    const second = await state.commit(
      immutableCommit('command-stable-2', 1, 'record-stable-2', new Uint8Array([3]), new Uint8Array([4])),
    );
    expect(second.status).toBe('committed');

    const duplicate = await state.commit(firstRequest);
    expect(duplicate).toEqual({
      ...(first as Exclude<typeof first, { readonly status: 'rejected' }>),
      status: 'duplicate',
    });

    const reusedIdentity = await state.commit({
      ...firstRequest,
      expectedStateVersion: 2,
    });
    expect(reusedIdentity).toEqual({
      status: 'rejected',
      reason: 'command-identity-conflict',
      stateVersion: 2,
    });

    const staleState = await state.commit(
      immutableCommit('command-stale-version', 1, 'record-never-written', new Uint8Array([5]), new Uint8Array([6])),
    );
    expect(staleState).toEqual({
      status: 'rejected',
      reason: 'state-version-mismatch',
      stateVersion: 2,
    });
    expect(
      (
        await state.read({
          recordIdentities: ['record-never-written'],
          includeContent: false,
        })
      ).records,
    ).toEqual([undefined]);

    await state.close();
    const reopened = await openState(directory);
    expect(await reopened.commit(firstRequest)).toEqual({
      ...(first as Exclude<typeof first, { readonly status: 'rejected' }>),
      status: 'duplicate',
    });
  });

  it('rolls back every record, content object, ledger fact, and State version together', async () => {
    const directory = await fixture();
    const state = await openState(directory, 'after-first-record-write');
    const request: StateCommitRequest = {
      commandIdentity: 'command-fail-atomically',
      expectedStateVersion: 0,
      records: [
        {
          recordClass: 'immutable',
          recordIdentity: 'record-before-failure',
          workflowIdentity: 'workflow-review-1',
          kind: 'review.snapshot',
          schemaVersion: 1,
          payload: new Uint8Array([1]),
          content: [{ role: 'exact-source', bytes: new Uint8Array([2]) }],
        },
        {
          recordClass: 'immutable',
          recordIdentity: 'record-after-failure',
          workflowIdentity: 'workflow-review-1',
          kind: 'review.batch',
          schemaVersion: 1,
          payload: new Uint8Array([3]),
          content: [],
        },
      ],
      result: {
        kind: 'review.transition-complete',
        schemaVersion: 1,
        payload: new Uint8Array([4]),
      },
    };

    await expect(state.commit(request)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    expect(
      await state.read({
        recordIdentities: ['record-before-failure', 'record-after-failure'],
        includeContent: true,
      }),
    ).toEqual({
      stateVersion: 0,
      records: [undefined, undefined],
      quarantineReports: [],
    });

    await state.close();
    const reopened = await openState(directory);
    expect(
      await reopened.read({
        recordIdentities: ['record-before-failure'],
        includeContent: true,
      }),
    ).toEqual({
      stateVersion: 0,
      records: [undefined],
      quarantineReports: [],
    });
  });

  it('quarantines a typed envelope that no longer matches its checksum', async () => {
    const directory = await fixture();
    const state = await openState(directory);
    await state.commit(
      immutableCommit(
        'command-checksummed-record',
        0,
        'record-checksummed',
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ),
    );
    await state.close();

    // State integrity tests may seed physical damage directly. No workflow
    // caller receives this path or table access through the State Interface.
    const generation = (await activeGeneration(directory)).file;
    const database = new DatabaseSync(generation);
    database
      .prepare('UPDATE records SET payload = ? WHERE record_identity = ?')
      .run(new Uint8Array([9, 9, 9]), 'record-checksummed');
    database.close();

    const corruptBytes = new Uint8Array([9, 9, 9]);
    const reopened = await openState(directory);
    const recovered = await reopened.read({
      recordIdentities: ['record-checksummed'],
      includeContent: true,
    });
    expect(await reopened.status()).toEqual({
      access: 'read-write',
      storeFormatVersion: 2,
      stateVersion: 1,
      recovery: {
        status: 'available',
        quarantinedRecordCount: 1,
        affectedWorkflowCount: 1,
      },
    });
    expect(recovered.records).toEqual([undefined]);
    expect(recovered.quarantineReports).toEqual([
      expect.objectContaining({
        recordIdentity: 'record-checksummed',
        reason: 'record-checksum-mismatch',
      }),
    ]);
    const inspection = new DatabaseSync(generation, { readOnly: true });
    const row = inspection
      .prepare('SELECT payload FROM records WHERE record_identity = ?')
      .get('record-checksummed') as { readonly payload: Uint8Array };
    inspection.close();
    expect(row.payload).toEqual(corruptBytes);
  });

  it('retires a timed-out unknown commit before reporting failure and recovers it without replay', async () => {
    const directory = await fixture();
    const state = await openState(directory, undefined, {
      commandIdentity: 'command-timeout-unknown-outcome',
      milliseconds: 100,
    });
    const request = immutableCommit(
      'command-timeout-unknown-outcome',
      0,
      'record-timeout-unknown-outcome',
      new Uint8Array([0x11]),
      new Uint8Array([0x22]),
    );

    await expect(state.commit(request)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    await expect(state.status()).rejects.toMatchObject({ code: 'state-closed' });

    // Timeout does not return until worker termination releases its writer
    // lease. Recovery reads the already-durable command outcome; it never
    // re-sends the timed-out command.
    const recovered = await openState(directory);
    expect(
      await recovered.read({
        recordIdentities: ['record-timeout-unknown-outcome'],
        includeContent: true,
      }),
    ).toMatchObject({
      stateVersion: 1,
      records: [
        {
          recordIdentity: 'record-timeout-unknown-outcome',
          payload: new Uint8Array([0x11]),
        },
      ],
    });
  });

  it('fails every queued request once when the synchronous worker times out', async () => {
    const directory = await fixture();
    const state = await openState(directory, undefined, {
      commandIdentity: 'command-timeout-with-queued-read',
      milliseconds: 100,
    });
    const commit = state.commit(
      immutableCommit(
        'command-timeout-with-queued-read',
        0,
        'record-timeout-with-queued-read',
        new Uint8Array([0x33]),
        new Uint8Array([0x44]),
      ),
    );
    const queuedRead = state.read({ recordIdentities: [], includeContent: false }).then(
      () => ({ status: 'resolved' as const }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );

    await expect(commit).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    expect(await queuedRead).toMatchObject({
      status: 'rejected',
      error: { code: 'state-closed' },
    });
    await expect(state.status()).rejects.toMatchObject({ code: 'state-closed' });
  });

  it('holds one lifetime writer lease and releases it on an orderly close', async () => {
    const directory = await fixture();
    const owner = await openState(directory);

    await expect(openState(directory)).rejects.toEqual(
      expect.objectContaining<Partial<AuthoritativeStateError>>({
        code: 'writer-lease-unavailable',
      }),
    );

    await owner.close();
    const successor = await openState(directory);
    expect(await successor.read({ recordIdentities: [], includeContent: false })).toEqual({
      stateVersion: 0,
      records: [],
      quarantineReports: [],
    });
  });
});

describe('Authoritative State generation and recovery contract', () => {
  it('migrates the immutable format-1 golden generation before switching authority', async () => {
    const directory = await fixture();
    await installGoldenFormat1(directory);
    const manifest = JSON.parse(await readFile(path.join(GOLDEN_FORMAT_1, 'manifest.json'), 'utf8')) as {
      readonly generationSha256: string;
      readonly currentGeneration: string;
    };
    const legacy = path.join(stateRoot(directory), manifest.currentGeneration);
    expect(sha256(await readFile(legacy))).toBe(manifest.generationSha256);

    const state = await openState(directory);
    expect(await state.status()).toEqual({
      access: 'read-write',
      storeFormatVersion: 2,
      stateVersion: 2,
      recovery: {
        status: 'available',
        quarantinedRecordCount: 0,
        affectedWorkflowCount: 0,
      },
    });
    const migrated = await state.read({
      recordIdentities: ['record-golden-stable', 'record-golden-secondary'],
      includeContent: true,
    });
    expect(migrated.stateVersion).toBe(2);
    expect(migrated.quarantineReports).toEqual([]);
    expect(migrated.records[0]).toEqual(
      expect.objectContaining({
        workflowIdentity: 'workflow-golden-stable',
        schemaVersion: 1,
        payload: new Uint8Array([0x00, 0xff, 0x53, 0x31]),
        content: [
          expect.objectContaining({
            bytes: new Uint8Array([0x00, 0x0a, 0x80, 0xff, 0x53]),
          }),
        ],
      }),
    );
    expect(migrated.records[1]).toEqual(
      expect.objectContaining({
        workflowIdentity: 'workflow-golden-secondary',
        schemaVersion: 2,
        recordClass: 'revisioned',
        revision: 3,
      }),
    );

    const selected = await activeGeneration(directory);
    expect(selected.name).not.toBe(manifest.currentGeneration);
    expect(await readFile(legacy)).toEqual(await readFile(path.join(GOLDEN_FORMAT_1, manifest.currentGeneration)));
    const database = new DatabaseSync(selected.file, { readOnly: true });
    const version = database.prepare('PRAGMA user_version').get() as Record<string, number>;
    database.close();
    expect(Object.values(version)[0]).toBe(2);
  });

  it('migrates a retrievable damaged source record into quarantine without mutating it', async () => {
    const directory = await fixture();
    await installGoldenFormat1(directory);
    const legacy = path.join(stateRoot(directory), 'generation-1.sqlite');
    const corruptPayload = new Uint8Array([0xfa, 0x11, 0xed]);
    const damage = new DatabaseSync(legacy);
    damage
      .prepare('UPDATE records SET payload = ? WHERE record_identity = ?')
      .run(corruptPayload, 'record-golden-stable');
    damage.close();

    const state = await openState(directory);
    const view = await state.read({
      recordIdentities: ['record-golden-stable', 'record-golden-secondary'],
      includeContent: true,
    });
    expect(view.records[0]).toBeUndefined();
    expect(view.records[1]).toEqual(
      expect.objectContaining({
        workflowIdentity: 'workflow-golden-secondary',
        schemaVersion: 2,
      }),
    );
    expect(view.quarantineReports).toEqual([
      expect.objectContaining({
        recordIdentity: 'record-golden-stable',
        workflowIdentity: 'workflow-golden-stable',
        reason: 'record-checksum-mismatch',
      }),
    ]);
    expect(await state.status()).toEqual(
      expect.objectContaining({
        stateVersion: 2,
        recovery: {
          status: 'available',
          quarantinedRecordCount: 1,
          affectedWorkflowCount: 1,
        },
      }),
    );
    const inspection = new DatabaseSync(legacy, { readOnly: true });
    const row = inspection
      .prepare('SELECT payload FROM records WHERE record_identity = ?')
      .get('record-golden-stable') as { readonly payload: Uint8Array };
    inspection.close();
    expect(row.payload).toEqual(corruptPayload);
  });

  it('preserves prior authority across every migration switch failpoint', async () => {
    const checkpoints: readonly StateTestFailpoint[] = [
      'candidate-created',
      'candidate-validated',
      'generation-installed',
      'current-prepared',
      'current-switched',
    ];
    for (const checkpoint of checkpoints) {
      const directory = await fixture();
      await installGoldenFormat1(directory);
      const legacy = path.join(stateRoot(directory), 'generation-1.sqlite');
      const legacyBytes = await readFile(legacy);

      await expect(openState(directory, checkpoint)).rejects.toMatchObject({
        code: 'state-migration-failed',
      });
      expect(await readFile(legacy)).toEqual(legacyBytes);
      const selectedAfterFailure = await activeGeneration(directory);
      expect(
        checkpoint === 'current-switched'
          ? selectedAfterFailure.name !== 'generation-1.sqlite'
          : selectedAfterFailure.name === 'generation-1.sqlite',
      ).toBe(true);

      const recovered = await openState(directory);
      expect(await recovered.status()).toEqual(
        expect.objectContaining({
          access: 'read-write',
          storeFormatVersion: 2,
          stateVersion: 2,
        }),
      );
      expect(
        (
          await recovered.read({
            recordIdentities: ['record-golden-stable'],
            includeContent: true,
          })
        ).records[0]?.payload,
      ).toEqual(new Uint8Array([0x00, 0xff, 0x53, 0x31]));
    }
  });

  it('rejects corrupt and semantically invalid candidates without switching', async () => {
    const failpoints: readonly StateTestFailpoint[] = [
      'migration-candidate-corrupt',
      'migration-candidate-semantic-invalid',
    ];
    for (const failpoint of failpoints) {
      const directory = await fixture();
      await installGoldenFormat1(directory);
      const legacy = path.join(stateRoot(directory), 'generation-1.sqlite');
      const legacyBytes = await readFile(legacy);

      await expect(openState(directory, failpoint)).rejects.toMatchObject({
        code: 'state-migration-failed',
      });
      expect((await activeGeneration(directory)).name).toBe('generation-1.sqlite');
      expect(await readFile(legacy)).toEqual(legacyBytes);

      const recovered = await openState(directory);
      expect((await recovered.status()).storeFormatVersion).toBe(2);
      expect(await readFile(legacy)).toEqual(legacyBytes);
    }
  });

  it('opens an unknown newer format without taking writer authority', async () => {
    const directory = await fixture();
    const original = await openState(directory);
    await original.close();
    const generation = (await activeGeneration(directory)).file;
    const database = new DatabaseSync(generation);
    database.prepare('UPDATE store_metadata SET format_version = 3 WHERE singleton = 1').run();
    database.exec('PRAGMA user_version = 3');
    database.close();

    const firstReader = await openState(directory);
    const secondReader = await openState(directory);
    expect(await firstReader.status()).toEqual({
      access: 'read-only-newer',
      storeFormatVersion: 3,
      recovery: {
        status: 'unknown-newer-format',
      },
    });
    expect(await secondReader.status()).toEqual(await firstReader.status());
    await expect(firstReader.read({ recordIdentities: [], includeContent: false })).rejects.toMatchObject({
      code: 'state-read-only-newer',
    });
    await expect(
      firstReader.commit(
        immutableCommit('command-refused-newer', 0, 'record-refused-newer', new Uint8Array([1]), new Uint8Array([2])),
      ),
    ).rejects.toMatchObject({ code: 'state-read-only-newer' });
  });

  it('quarantines only a damaged retrievable record and keeps other Workflows usable', async () => {
    const directory = await fixture();
    const state = await openState(directory);
    const committed = await state.commit({
      commandIdentity: 'command-two-workflows',
      expectedStateVersion: 0,
      records: [
        immutableCommit('unused-a', 0, 'record-damaged-workflow', new Uint8Array([1, 2, 3]), new Uint8Array([4]))
          .records[0]!,
        {
          ...immutableCommit('unused-b', 0, 'record-usable-workflow', new Uint8Array([5, 6, 7]), new Uint8Array([8]))
            .records[0]!,
          workflowIdentity: 'workflow-review-usable',
        },
      ],
      result: {
        kind: 'review.two-workflows-recorded',
        schemaVersion: 1,
        payload: new Uint8Array([9]),
      },
    });
    expect(committed.status).toBe('committed');
    await state.close();

    const generation = (await activeGeneration(directory)).file;
    const corruptPayload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const damage = new DatabaseSync(generation);
    damage
      .prepare('UPDATE records SET payload = ? WHERE record_identity = ?')
      .run(corruptPayload, 'record-damaged-workflow');
    damage.close();

    const recovered = await openState(directory);
    const view = await recovered.read({
      recordIdentities: ['record-damaged-workflow', 'record-usable-workflow'],
      includeContent: true,
    });
    expect(view.stateVersion).toBe(1);
    expect(view.records[0]).toBeUndefined();
    expect(view.records[1]).toEqual(
      expect.objectContaining({
        workflowIdentity: 'workflow-review-usable',
        payload: new Uint8Array([5, 6, 7]),
      }),
    );
    expect(view.quarantineReports).toEqual([
      expect.objectContaining({
        recordIdentity: 'record-damaged-workflow',
        workflowIdentity: 'workflow-review-1',
        reason: 'record-checksum-mismatch',
      }),
    ]);
    expect(await recovered.status()).toEqual(
      expect.objectContaining({
        stateVersion: 1,
        recovery: {
          status: 'available',
          quarantinedRecordCount: 1,
          affectedWorkflowCount: 1,
        },
      }),
    );

    const unaffectedRequest = immutableCommit(
      'command-unaffected-workflow-continues',
      1,
      'record-usable-workflow-next',
      new Uint8Array([10]),
      new Uint8Array([11]),
    );
    const unaffectedCommit = await recovered.commit({
      ...unaffectedRequest,
      records: [
        {
          ...unaffectedRequest.records[0]!,
          workflowIdentity: 'workflow-review-usable',
        },
      ],
    });
    expect(unaffectedCommit).toEqual(expect.objectContaining({ status: 'committed', stateVersion: 2 }));
    const inspection = new DatabaseSync(generation, { readOnly: true });
    const row = inspection
      .prepare('SELECT payload FROM records WHERE record_identity = ?')
      .get('record-damaged-workflow') as { readonly payload: Uint8Array };
    inspection.close();
    expect(row.payload).toEqual(corruptPayload);
  });

  it('loads exact content lazily and quarantines its record only when corrupt bytes are requested', async () => {
    const directory = await fixture();
    const state = await openState(directory);
    await state.commit(
      immutableCommit(
        'command-content-to-damage',
        0,
        'record-content-to-damage',
        new Uint8Array([1]),
        new Uint8Array([2, 3, 4]),
      ),
    );
    await state.close();

    const generation = (await activeGeneration(directory)).file;
    const corruptContent = new Uint8Array([0xca, 0xfe]);
    const damage = new DatabaseSync(generation);
    const reference = damage
      .prepare(`SELECT digest FROM record_content WHERE record_identity = ?`)
      .get('record-content-to-damage') as { readonly digest: string };
    damage.prepare('UPDATE content_objects SET bytes = ? WHERE digest = ?').run(corruptContent, reference.digest);
    damage.close();

    const recovered = await openState(directory);
    expect((await recovered.status()).recovery).toEqual({
      status: 'available',
      quarantinedRecordCount: 0,
      affectedWorkflowCount: 0,
    });
    const envelopeOnly = await recovered.read({
      recordIdentities: ['record-content-to-damage'],
      includeContent: false,
    });
    expect(envelopeOnly.records[0]).toEqual(
      expect.objectContaining({
        recordIdentity: 'record-content-to-damage',
        content: [expect.not.objectContaining({ bytes: expect.anything() })],
      }),
    );
    expect(envelopeOnly.quarantineReports).toEqual([]);

    const exactRead = await recovered.read({
      recordIdentities: ['record-content-to-damage'],
      includeContent: true,
    });
    expect(exactRead.records).toEqual([undefined]);
    expect(exactRead.quarantineReports).toEqual([
      expect.objectContaining({
        recordIdentity: 'record-content-to-damage',
        reason: 'record-content-invalid',
      }),
    ]);
    const inspection = new DatabaseSync(generation, { readOnly: true });
    const row = inspection.prepare('SELECT bytes FROM content_objects WHERE digest = ?').get(reference.digest) as {
      readonly bytes: Uint8Array;
    };
    inspection.close();
    expect(row.bytes).toEqual(corruptContent);
  });

  it('preserves an unreadable complete generation and never falls back to empty State', async () => {
    const directory = await fixture();
    const state = await openState(directory);
    await state.commit(
      immutableCommit(
        'command-before-container-damage',
        0,
        'record-before-container-damage',
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ),
    );
    await state.close();

    const selected = await activeGeneration(directory);
    const damagedBytes = new Uint8Array(await readFile(selected.file));
    damagedBytes.fill(0x58, 0, 16);
    await writeFile(selected.file, damagedBytes);

    await expect(openState(directory)).rejects.toMatchObject({
      code: 'state-corrupt',
    });
    expect((await activeGeneration(directory)).name).toBe(selected.name);
    expect(sha256(await readFile(selected.file))).toBe(sha256(damagedBytes));
    const generationQuarantine = path.join(stateRoot(directory), 'quarantine', 'generations');
    const preservedFiles = (await readdir(generationQuarantine)).filter(entry => entry.endsWith('.sqlite'));
    expect(preservedFiles).toHaveLength(1);
    expect(sha256(await readFile(path.join(generationQuarantine, preservedFiles[0]!)))).toBe(sha256(damagedBytes));
    expect((await readdir(stateRoot(directory))).filter(entry => /^generation-.*\.sqlite$/u.test(entry))).toEqual([
      selected.name,
    ]);
    await expect(openState(directory)).rejects.toMatchObject({
      code: 'state-corrupt',
    });
  });
});
