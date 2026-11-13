import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAuthoritativeState } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import {
  bootstrapWorkspace,
  openRuntimeWorkspace,
  workspaceGitDirectory,
  type RuntimeWorkspaceInternalOptions,
} from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

// Keep moved-receipt filesystem/State scenarios in one Vitest worker so their
// disposable Git and SQLite process load remains serialized and bounded.
import './legacyReviewMovedReceiptAssociation.scenarios.js';

const execFileAsync = promisify(execFile);
const roots = new Set<string>();
const owners = new Set<WorkspaceRuntimeOwner>();
const originalStateHome = process.env.XDG_STATE_HOME;

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly canonicalCheckout: string;
  readonly state: string;
  readonly currentCheckoutHash: string;
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-moved-legacy-receipts-v1-'));
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
    canonicalCheckout,
    state,
    currentCheckoutHash: legacyHash(canonicalCheckout),
  };
}

function receiptDocument(workspacePaths: readonly string[], marker = 'sanitized'): Buffer {
  const timestamp = '2026-09-02T12:00:00.000Z';
  return Buffer.from(
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: timestamp,
        batches: workspacePaths.map((workspace, index) => ({
          id: `${marker}-batch-${index}`,
          workspace,
          annotations: [
            {
              id: `${marker}-annotation-${index}`,
              kind: 'question',
              anchor: { side: 'file' },
              text: `${marker} private legacy question ${index}`,
            },
          ],
          harness: {
            id: `${marker}-harness`,
            name: `${marker} Private Harness`,
            sessionId: `${marker}-private-session-${index}`,
            model: `${marker}-private-model-${index}`,
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
    )}\n`,
  );
}

function pathOnlyReceiptDocument(workspacePaths: readonly string[]): Buffer {
  const timestamp = '2026-09-02T12:00:00.000Z';
  return Buffer.from(
    `${JSON.stringify({
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
            text: 'sanitized',
          },
        ],
        harness: {
          id: 'harness',
          name: 'Harness',
          sessionId: `session-${index}`,
          workspace,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        harnessOutcome: 'pending',
        queueDisposition: 'pending',
      })),
    })}\n`,
  );
}

async function install(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  const modified = new Date('2026-09-02T12:00:00.000Z');
  await fs.utimes(file, modified, modified);
}

async function metadata(file: string): Promise<{
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
  const opened = await openWorkspaceRuntimeOwner({
    startPath: created.checkout,
  });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owners.add(opened.owner);
  return opened.owner;
}

async function openControlled(
  created: Fixture,
  internal: RuntimeWorkspaceInternalOptions,
): Promise<WorkspaceRuntimeOwner> {
  const bootstrapped = await bootstrapWorkspace({ startPath: created.checkout });
  expect(bootstrapped.status).toBe('ready');
  if (bootstrapped.status !== 'ready') {
    throw new Error(bootstrapped.diagnostic.code);
  }
  const identity = await bootstrapped.workspace.read({
    kind: 'workspace.identity',
  });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
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

function fullWindow(text: string): {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly shownUtf8Bytes: number;
  readonly truncated: false;
} {
  const byteLength = Buffer.byteLength(text);
  return {
    text,
    totalUtf8Bytes: byteLength,
    shownUtf8Bytes: byteLength,
    truncated: false,
  };
}

async function makeEntries(directory: string, names: readonly string[]): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  for (let offset = 0; offset < names.length; offset += 128) {
    await Promise.all(
      names.slice(offset, offset + 128).map(async name => {
        await fs.writeFile(path.join(directory, name), '');
      }),
    );
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
  owners.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('explicit moved legacy receipt discovery', () => {
  it('finds one old locator in either explicit mode and pages every embedded path without authority', async () => {
    const created = await fixture();
    const exactFormerCanonicalCheckout = path.join(created.root, 'former-checkout-that-does-not-exist');
    const movedHash = legacyHash(exactFormerCanonicalCheckout);
    const movedFile = receiptPath(created.state, movedHash);
    const bytes = receiptDocument([
      '/sanitized/former/workspace-one',
      '/sanitized/former/workspace-two',
      '/sanitized/former/workspace-one',
    ]);
    await install(movedFile, bytes);
    await install(
      receiptPath(created.state, created.currentCheckoutHash),
      receiptDocument(['/sanitized/current/workspace'], 'current'),
    );
    const sourceBefore = await metadata(movedFile);
    await expect(fs.lstat(exactFormerCanonicalCheckout)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const owner = await open(created);
    const identityBefore = await owner.workspace.read({
      kind: 'workspace.identity',
    });

    const directoryView = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 32,
    });
    expect(directoryView).toMatchObject({
      kind: 'legacy-review.moved-receipt-sources',
      status: 'available',
      projectionVersion: 1,
      stateVersion: 0,
      search: { kind: 'legacy-state-directory' },
      totalSources: 1,
      sourceOffset: 0,
      sources: [
        {
          sourceIdentity: expect.stringMatching(/^lgs_[0-9a-f]{64}$/u),
          sourceKind: 'receipts',
          location: 'moved-legacy-state',
          legacyCheckoutHash: movedHash,
          legacyReceiptPath: fullWindow(await fs.realpath(movedFile)),
          observation: {
            status: 'detected',
            byteLength: bytes.byteLength,
            digest: createHash('sha256').update(bytes).digest('hex'),
            mode: sourceBefore.mode,
            modifiedNanoseconds: sourceBefore.mtimeNs.toString(),
            changedNanoseconds: sourceBefore.ctimeNs.toString(),
            recognition: {
              status: 'recognized',
              format: 'receipts-v1',
              totalBatches: 3,
              totalAnnotations: 3,
              totalLegacyWorkspacePaths: 2,
            },
          },
        },
      ],
    });
    if (directoryView.status !== 'available') {
      throw new Error(directoryView.reason);
    }
    const source = directoryView.sources[0];
    if (source === undefined) throw new Error('Moved source was absent');
    const serializedList = JSON.stringify(directoryView);
    expect(serializedList).not.toContain('private legacy question');
    expect(serializedList).not.toContain('private-session');
    expect(serializedList).not.toContain('private-model');
    expect(serializedList).not.toContain('/sanitized/former/workspace-one');

    const formerPathView = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: {
        kind: 'former-checkout-path',
        exactFormerCanonicalCheckout,
      },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    expect(formerPathView).toMatchObject({
      status: 'available',
      search: {
        kind: 'former-checkout-path',
        exactFormerCanonicalCheckout: fullWindow(exactFormerCanonicalCheckout),
      },
      totalSources: 1,
      sources: [
        {
          sourceIdentity: source.sourceIdentity,
          legacyCheckoutHash: movedHash,
          observation: { status: 'detected' },
        },
      ],
    });
    await expect(fs.lstat(exactFormerCanonicalCheckout)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const firstPath = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-source',
      sourceIdentity: source.sourceIdentity,
      legacyCheckoutHash: movedHash,
      legacyWorkspacePathOffset: 0,
      legacyWorkspacePathLimit: 1,
    });
    expect(firstPath).toMatchObject({
      status: 'available',
      stateVersion: 0,
      sourceIdentity: source.sourceIdentity,
      legacyCheckoutHash: movedHash,
      recognition: {
        status: 'recognized',
        totalLegacyWorkspacePaths: 2,
      },
      totalLegacyWorkspacePaths: 2,
      legacyWorkspacePathOffset: 0,
      legacyWorkspacePaths: [fullWindow('/sanitized/former/workspace-one')],
      omittedLegacyWorkspacePathsBefore: 0,
      omittedLegacyWorkspacePathsAfter: 1,
    });
    const secondPath = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-source',
      sourceIdentity: source.sourceIdentity,
      legacyCheckoutHash: movedHash,
      legacyWorkspacePathOffset: 1,
      legacyWorkspacePathLimit: 1,
    });
    expect(secondPath).toMatchObject({
      status: 'available',
      legacyWorkspacePaths: [fullWindow('/sanitized/former/workspace-two')],
      omittedLegacyWorkspacePathsBefore: 1,
      omittedLegacyWorkspacePathsAfter: 0,
    });
    expect(Object.isFrozen(directoryView)).toBe(true);
    expect(Object.isFrozen(directoryView.sources)).toBe(true);
    expect(Object.isFrozen(firstPath)).toBe(true);
    expect(Object.isFrozen(firstPath.status === 'available' ? firstPath.legacyWorkspacePaths : [])).toBe(true);

    expect(await metadata(movedFile)).toEqual(sourceBefore);
    expect(await owner.workspace.read({ kind: 'workspace.identity' })).toEqual(identityBefore);
  });

  it('orders bounded locator slots, reports failures without following them, and rejects open request shapes', async () => {
    const created = await fixture();
    const hashes = ['1', '2', '3', '4', '5', '6', '7', '8'].map(digit => digit.repeat(64));
    await install(receiptPath(created.state, hashes[0] as string), receiptDocument(['/legacy/recognized']));
    await install(receiptPath(created.state, hashes[1] as string), Buffer.from('{not json'));
    await install(
      receiptPath(created.state, hashes[2] as string),
      Buffer.from('{"version":2,"updatedAt":"2026-09-02T12:00:00.000Z","batches":[]}'),
    );
    await fs.mkdir(path.dirname(receiptPath(created.state, hashes[3] as string)), {
      recursive: true,
    });
    const outside = path.join(created.root, 'outside-hash-directory');
    await fs.mkdir(outside, { recursive: true });
    await install(path.join(outside, 'review-receipts.json'), receiptDocument(['/must/not/be/read']));
    await fs.symlink(outside, path.dirname(receiptPath(created.state, hashes[4] as string)));
    const oversized = receiptPath(created.state, hashes[5] as string);
    await fs.mkdir(path.dirname(oversized), { recursive: true });
    const oversizedHandle = await fs.open(oversized, 'w');
    await oversizedHandle.truncate(16 * 1024 * 1024 + 1);
    await oversizedHandle.close();
    await fs.mkdir(receiptPath(created.state, hashes[6] as string), {
      recursive: true,
    });
    const fifo = receiptPath(created.state, hashes[7] as string);
    await fs.mkdir(path.dirname(fifo), { recursive: true });
    await execFileAsync('mkfifo', [fifo]);
    await fs.mkdir(path.join(created.state, 'neoflow', 'workspaces', 'not-a-hash'), { recursive: true });
    await fs.mkdir(path.join(created.state, 'neoflow', 'workspaces', 'z'.repeat(255)));
    await install(
      path.join(created.state, 'neoflow', 'workspaces', 'not-a-hash', '6'.repeat(64), 'review-receipts.json'),
      receiptDocument(['/nested/must/not/appear']),
    );
    await install(
      receiptPath(created.state, created.currentCheckoutHash),
      receiptDocument(['/current/must/not/appear']),
    );
    const owner = await open(created);

    const view = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 32,
    });
    expect(view).toMatchObject({
      status: 'available',
      totalSources: 8,
      sources: [
        {
          legacyCheckoutHash: hashes[0],
          observation: {
            status: 'detected',
            recognition: { status: 'recognized' },
          },
        },
        {
          legacyCheckoutHash: hashes[1],
          observation: {
            status: 'detected',
            recognition: { status: 'unrecognized', reason: 'malformed-json' },
          },
        },
        {
          legacyCheckoutHash: hashes[2],
          observation: {
            status: 'detected',
            recognition: {
              status: 'unrecognized',
              reason: 'unsupported-newer-version',
              observedVersion: 2,
            },
          },
        },
        { legacyCheckoutHash: hashes[3], observation: { status: 'missing' } },
        {
          legacyCheckoutHash: hashes[4],
          observation: { status: 'unavailable', reason: 'unsafe-path' },
        },
        {
          legacyCheckoutHash: hashes[5],
          observation: { status: 'unavailable', reason: 'source-too-large' },
        },
        {
          legacyCheckoutHash: hashes[6],
          observation: {
            status: 'unavailable',
            reason: 'not-regular-file',
          },
        },
        {
          legacyCheckoutHash: hashes[7],
          observation: {
            status: 'unavailable',
            reason: 'not-regular-file',
          },
        },
      ],
    });
    if (view.status !== 'available') throw new Error(view.reason);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 1,
        sourceLimit: 2,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      totalSources: 8,
      sourceOffset: 1,
      sources: [{ legacyCheckoutHash: hashes[1] }, { legacyCheckoutHash: hashes[2] }],
    });
    const malformed = view.sources[1];
    if (malformed === undefined) throw new Error('Malformed slot absent');
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: malformed.sourceIdentity,
        legacyCheckoutHash: malformed.legacyCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 32,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'source-unrecognized',
      recognition: { status: 'unrecognized', reason: 'malformed-json' },
    });
    const readUnknown = owner.workspace.read.bind(owner.workspace) as (request: unknown) => Promise<unknown>;
    await expect(
      readUnknown({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: `lgs_${'0'.repeat(64)}`,
        legacyCheckoutHash: hashes[0],
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'source-identity-mismatch',
    });
    await expect(
      readUnknown({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: `lgs_${'0'.repeat(64)}`,
        legacyCheckoutHash: created.currentCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'current-source-ineligible',
    });
    const malformedRequests: readonly unknown[] = [
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory', extra: true },
        sourceOffset: 0,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: {
          kind: 'former-checkout-path',
          exactFormerCanonicalCheckout: 'relative/checkout',
        },
        sourceOffset: 0,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: {
          kind: 'former-checkout-path',
          exactFormerCanonicalCheckout: '/former/../not-canonical',
        },
        sourceOffset: 0,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: {
          kind: 'former-checkout-path',
          exactFormerCanonicalCheckout: '/former/\ud800/not-scalar',
        },
        sourceOffset: 0,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: {
          kind: 'former-checkout-path',
          exactFormerCanonicalCheckout: `/former/${'x'.repeat(16 * 1024)}`,
        },
        sourceOffset: 0,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: -1,
        sourceLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: malformed.sourceIdentity,
        legacyCheckoutHash: 'A'.repeat(64),
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 1,
      },
      {
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: malformed.sourceIdentity,
        legacyCheckoutHash: malformed.legacyCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 1,
        bytes: 'must-not-cross',
      },
    ];
    for (const request of malformedRequests) {
      await expect(readUnknown(request)).rejects.toThrow(TypeError);
    }

    await close(owner);
    const outsideRoot = path.join(created.root, 'outside-state-root');
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.rm(path.join(created.state, 'neoflow'), {
      recursive: true,
      force: true,
    });
    await fs.symlink(outsideRoot, path.join(created.state, 'neoflow'));
    const unsafeOwner = await open(created);
    await expect(
      unsafeOwner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'search-root-unavailable',
    });
  });

  it('enforces aggregate/page limits and keeps scalar-safe worst-case views below the frame body bound', async () => {
    const created = await fixture();
    const workspaceDirectory = path.join(created.state, 'neoflow', 'workspaces');
    await makeEntries(
      workspaceDirectory,
      Array.from({ length: 4_097 }, (_, index) => `entry-${index}`),
    );
    let owner = await open(created);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 32,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'search-entry-limit',
    });
    await close(owner);

    await fs.rm(workspaceDirectory, { recursive: true, force: true });
    const hashes = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(64, '0'));
    const longPaths = Array.from(
      { length: 100 },
      (_, index) => `/${'\u0001'.repeat(2_000)}-${index}-${'🙂'.repeat(1_000)}`,
    );
    const worstBytes = pathOnlyReceiptDocument(longPaths);
    expect(worstBytes.byteLength).toBeLessThan(16 * 1024 * 1024);
    for (const [index, hash] of hashes.entries()) {
      await install(
        receiptPath(created.state, hash),
        index === 0 ? worstBytes : pathOnlyReceiptDocument([`/legacy/workspace-${index}`]),
      );
    }
    owner = await open(created);
    const list = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 32,
    });
    expect(list).toMatchObject({
      status: 'available',
      totalSources: 32,
      sourceOffset: 0,
    });
    if (list.status !== 'available') throw new Error(list.reason);
    expect(list.sources).toHaveLength(32);
    expect(Buffer.byteLength(JSON.stringify(list)) + 2_048).toBeLessThan(1024 * 1024);
    const worst = list.sources[0];
    if (worst === undefined) throw new Error('Worst source absent');
    const detail = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-source',
      sourceIdentity: worst.sourceIdentity,
      legacyCheckoutHash: worst.legacyCheckoutHash,
      legacyWorkspacePathOffset: 0,
      legacyWorkspacePathLimit: 32,
    });
    expect(detail).toMatchObject({
      status: 'available',
      totalLegacyWorkspacePaths: 100,
      legacyWorkspacePathOffset: 0,
      omittedLegacyWorkspacePathsBefore: 0,
      omittedLegacyWorkspacePathsAfter: 68,
    });
    if (detail.status !== 'available') throw new Error(detail.reason);
    expect(detail.legacyWorkspacePaths).toHaveLength(32);
    expect(
      detail.legacyWorkspacePaths.every(
        entry =>
          entry.shownUtf8Bytes <= 1_024 && Buffer.byteLength(entry.text) === entry.shownUtf8Bytes && entry.truncated,
      ),
    ).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(detail)) + 2_048).toBeLessThan(1024 * 1024);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: worst.sourceIdentity,
        legacyCheckoutHash: worst.legacyCheckoutHash,
        legacyWorkspacePathOffset: 100,
        legacyWorkspacePathLimit: 32,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      legacyWorkspacePaths: [],
      omittedLegacyWorkspacePathsBefore: 100,
      omittedLegacyWorkspacePathsAfter: 0,
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 33,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'projection-limit',
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-source',
        sourceIdentity: worst.sourceIdentity,
        legacyCheckoutHash: worst.legacyCheckoutHash,
        legacyWorkspacePathOffset: 0,
        legacyWorkspacePathLimit: 33,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'projection-limit',
    });
  }, 30_000);

  it('does not scan implicitly and reports changing, replaced, deleted, and restarted source truth without State writes', async () => {
    const created = await fixture();
    const former = path.join(created.root, 'former');
    const hash = legacyHash(former);
    const movedFile = receiptPath(created.state, hash);
    await install(movedFile, receiptDocument(['/legacy/first'], 'first'));
    const canonicalMovedFile = await fs.realpath(movedFile);
    const capturedPaths: string[] = [];
    let mutateMoved = false;
    let mutation = 0;
    const openDirectory = vi.spyOn(fs, 'opendir');
    const owner = await openControlled(created, {
      legacyReviewSourceTestControl: {
        afterBytesRead: async ({ sourcePath }) => {
          capturedPaths.push(sourcePath);
          if (mutateMoved && sourcePath === canonicalMovedFile) {
            mutation += 1;
            await fs.writeFile(movedFile, receiptDocument([`/legacy/changing-${mutation}`], 'changing'));
          }
        },
      },
    });
    await owner.workspace.read({ kind: 'workspace.identity' });
    await owner.workspace.read({ kind: 'legacy-review.sources' });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.receipt-history',
        sourceOccurrenceIdentity: `lso_${'0'.repeat(64)}`,
        batchOffset: 0,
        batchLimit: 1,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(capturedPaths).not.toContain(canonicalMovedFile);
    expect(openDirectory).not.toHaveBeenCalled();

    const first = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    expect(first).toMatchObject({
      status: 'available',
      stateVersion: 0,
      sources: [{ observation: { status: 'detected' } }],
    });
    if (first.status !== 'available' || first.sources[0] === undefined) {
      throw new Error('Initial moved source unavailable');
    }
    const sourceIdentity = first.sources[0].sourceIdentity;
    expect(capturedPaths).toContain(canonicalMovedFile);
    expect(openDirectory).toHaveBeenCalledTimes(1);

    mutateMoved = true;
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 0,
      sources: [
        {
          sourceIdentity,
          observation: {
            status: 'unavailable',
            reason: 'changed-during-read',
          },
        },
      ],
    });
    mutateMoved = false;
    await close(owner);

    const restarted = await open(created);
    const afterRestart = await restarted.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 1,
    });
    expect(afterRestart).toMatchObject({
      status: 'available',
      stateVersion: 0,
      sources: [
        {
          sourceIdentity,
          observation: {
            status: 'detected',
            recognition: { status: 'recognized' },
          },
        },
      ],
    });
    await fs.rm(movedFile);
    await expect(
      restarted.workspace.read({
        kind: 'legacy-review.moved-receipt-sources',
        search: { kind: 'legacy-state-directory' },
        sourceOffset: 0,
        sourceLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 0,
      sources: [{ sourceIdentity, observation: { status: 'missing' } }],
    });
    expect(await restarted.workspace.read({ kind: 'workspace.identity' })).not.toHaveProperty('stateVersion');
  });
});
