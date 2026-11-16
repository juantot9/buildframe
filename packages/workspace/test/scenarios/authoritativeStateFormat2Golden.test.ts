import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, expect, it } from 'vitest';

import { openAuthoritativeState, type AuthoritativeState } from '../../src/authoritativeState.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import type { WorkspaceIdentity } from '../../src/index.js';
import type { ReviewIdentity } from '@buildframe/workspace/reviewing';

/**
 * The State a BuildFrame 0.1.0 user has on disk, written by
 * scripts/generate-authoritative-state-format-2.mjs and never regenerated.
 * Every later format must keep opening it with its Review, Messages, Responses
 * and session history intact.
 */
const GOLDEN_FORMAT_2 = path.resolve('packages/workspace/test/fixtures/authoritative-state/format-2');

interface GoldenManifest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly currentGeneration: string;
  readonly generationSha256: string;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly messages: readonly {
    readonly reviewMessageIdentity: string;
    readonly invocationIdentity: string;
    readonly attachmentIdentity: string;
    readonly status: string;
    readonly response?: string;
    readonly changeObservation?: string;
  }[];
}

const execFileAsync = promisify(execFile);
let root: string | undefined;
let state: AuthoritativeState | undefined;

afterEach(async () => {
  await state?.close();
  state = undefined;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

it('opens the frozen 0.1.0 State with its Review, Messages, Responses and session history intact', async () => {
  const manifest = JSON.parse(await readFile(path.join(GOLDEN_FORMAT_2, 'manifest.json'), 'utf8')) as GoldenManifest;
  const frozen = path.join(GOLDEN_FORMAT_2, manifest.currentGeneration);
  expect(
    createHash('sha256')
      .update(await readFile(frozen))
      .digest('hex'),
  ).toBe(manifest.generationSha256);

  root = await mkdtemp(path.join(tmpdir(), 'buildframe-state-format-2-'));
  const privateStateDirectory = path.join(root, 'state');
  const stateRoot = path.join(privateStateDirectory, 'workspaces', manifest.workspaceIdentity, 'authoritative-state');
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await copyFile(path.join(GOLDEN_FORMAT_2, 'CURRENT'), path.join(stateRoot, 'CURRENT'));
  await copyFile(frozen, path.join(stateRoot, manifest.currentGeneration));
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  await execFileAsync('git', ['-C', checkout, 'init', '-q']);

  state = await openAuthoritativeState({ privateStateDirectory, workspaceIdentity: manifest.workspaceIdentity });
  expect(await state.status()).toEqual({
    access: 'read-write',
    storeFormatVersion: 2,
    stateVersion: manifest.stateVersion,
    recovery: { status: 'available', quarantinedRecordCount: 0, affectedWorkflowCount: 0 },
  });
  const { workspace } = openRuntimeWorkspace(manifest.workspaceIdentity, checkout, state);

  const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  expect(home.stateVersion).toBe(manifest.stateVersion);
  expect(JSON.stringify(home)).toContain(manifest.reviewIdentity);

  const messages = await workspace.read({
    kind: 'review.messages',
    reviewIdentity: manifest.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  if (messages.status !== 'available') throw new Error(`Messages unavailable: ${JSON.stringify(messages)}`);
  expect(messages.messages.items.map(item => item.reviewMessageIdentity)).toEqual(
    manifest.messages.map(message => message.reviewMessageIdentity),
  );
  for (const [index, expected] of manifest.messages.entries()) {
    const item = messages.messages.items[index]!;
    if (expected.response === undefined) {
      expect(item.response).toBeUndefined();
    } else {
      expect(Buffer.from(item.response!.body.bytesBase64, 'base64').toString('utf8')).toBe(expected.response);
    }
    if (expected.changeObservation !== undefined) {
      expect(item.changeObservation).toMatchObject({ outcome: expected.changeObservation });
    }
  }

  const interaction = await workspace.read({
    kind: 'harness.review-interaction',
    reviewIdentity: manifest.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  expect(interaction.invocations).toEqual(
    expect.arrayContaining(
      manifest.messages.map(message =>
        expect.objectContaining({
          invocationIdentity: message.invocationIdentity,
          attachmentIdentity: message.attachmentIdentity,
          status: message.status,
        }),
      ),
    ),
  );

  // Opening reads the copy; the checked-in bytes never change.
  expect(
    createHash('sha256')
      .update(await readFile(frozen))
      .digest('hex'),
  ).toBe(manifest.generationSha256);
});
