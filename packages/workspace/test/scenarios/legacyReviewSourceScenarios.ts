import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect } from 'vitest';

import {
  captureLegacyReviewSource,
  type LegacyReviewSourceCaptured,
  type LegacyReviewSourceKind,
  type LegacyReviewSourceRecognition,
} from '../../src/legacyReviewSource.js';

const roots = new Set<string>();

export async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-legacy-source-v1-'));
  roots.add(root);
  return root;
}

export async function installSource(bytes: Uint8Array): Promise<{ readonly root: string; readonly file: string }> {
  const root = await temporaryRoot();
  const directory = path.join(root, 'owned');
  const file = path.join(directory, 'source.json');
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  const modified = new Date('2026-09-02T07:00:00.000Z');
  await fs.utimes(file, modified, modified);
  return { root, file };
}

export async function capture(
  sourceKind: LegacyReviewSourceKind,
  root: string,
  testControl: Parameters<typeof captureLegacyReviewSource>[1] = {},
) {
  return await captureLegacyReviewSource(
    {
      sourceKind,
      trustedRoot: root,
      relativePath: ['owned', 'source.json'],
    },
    testControl,
  );
}

export async function stableMetadata(file: string): Promise<{
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}> {
  const information = await fs.stat(file, { bigint: true });
  return {
    device: information.dev,
    inode: information.ino,
    mode: information.mode,
    size: information.size,
    mtimeNs: information.mtimeNs,
    ctimeNs: information.ctimeNs,
  };
}

export type RecognizedCapture = LegacyReviewSourceCaptured & {
  readonly recognition: Extract<LegacyReviewSourceRecognition, { readonly status: 'recognized' }>;
};

export function recognized(result: Awaited<ReturnType<typeof captureLegacyReviewSource>>): RecognizedCapture {
  expect(result.status).toBe('captured');
  if (result.status !== 'captured') throw new Error('Source was not captured');
  expect(result.recognition.status).toBe('recognized');
  if (result.recognition.status !== 'recognized') {
    throw new Error('Source was not recognized');
  }
  return result as RecognizedCapture;
}

export function recognitionEntryCount(
  recognition: Extract<LegacyReviewSourceRecognition, { readonly status: 'recognized' }>,
): number {
  return 'annotations' in recognition.value ? recognition.value.annotations.length : recognition.value.batches.length;
}

export async function captureRecognition(
  sourceKind: LegacyReviewSourceKind,
  value: Uint8Array | string,
): Promise<LegacyReviewSourceRecognition> {
  const installed = await installSource(typeof value === 'string' ? Buffer.from(value) : value);
  const result = await capture(sourceKind, installed.root);
  expect(result.status).toBe('captured');
  if (result.status !== 'captured') throw new Error('Source was not captured');
  return result.recognition;
}

/** Removes every root `temporaryRoot` made: run it after each test. */
export async function removeTemporaryRoots(): Promise<void> {
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
}
