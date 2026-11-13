import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  captureLegacyReviewSource,
  LEGACY_REVIEW_SOURCE_CAPTURE_ATTEMPTS,
  MAX_LEGACY_REVIEW_SOURCE_BYTES,
  MAX_LEGACY_REVIEW_SOURCE_ENTRIES,
  type LegacyReviewSourceCaptured,
  type LegacyReviewSourceKind,
  type LegacyReviewSourceRecognition,
} from '../../src/legacyReviewSource.js';

const GOLDEN_DIRECTORY = fileURLToPath(new URL('../fixtures/legacy-review-v1/', import.meta.url));
const GOLDENS = [
  {
    file: 'queue-array-v1.json',
    sourceKind: 'queue',
    format: 'queue-array-v1',
    digest: 'b44c0bc57f8428981efc7fa3c630198ca2a9ec334ee092825de3bdcc233fc754',
    entries: 1,
  },
  {
    file: 'queue-v1.json',
    sourceKind: 'queue',
    format: 'queue-v1',
    digest: 'bb53d76d594af91dcba336d0df61eb01ba70f417ab5ee76a82372e3b0f887bca',
    entries: 2,
  },
  {
    file: 'queue-v2.json',
    sourceKind: 'queue',
    format: 'queue-v2',
    digest: 'a1392d00bb1d72ed6a038f0b66120223d72f7991a03400339815ff4c300d0eb1',
    entries: 2,
  },
  {
    file: 'receipts-v1.json',
    sourceKind: 'receipts',
    format: 'receipts-v1',
    digest: '42df009c5eada89921701082b28ec15ac4ec36ad3b276552798e6492db9af944',
    entries: 2,
  },
] as const;

const roots = new Set<string>();

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-legacy-source-v1-'));
  roots.add(root);
  return root;
}

async function installSource(bytes: Uint8Array): Promise<{ readonly root: string; readonly file: string }> {
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

async function capture(
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

async function stableMetadata(file: string): Promise<{
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

type RecognizedCapture = LegacyReviewSourceCaptured & {
  readonly recognition: Extract<LegacyReviewSourceRecognition, { readonly status: 'recognized' }>;
};

function recognized(result: Awaited<ReturnType<typeof captureLegacyReviewSource>>): RecognizedCapture {
  expect(result.status).toBe('captured');
  if (result.status !== 'captured') throw new Error('Source was not captured');
  expect(result.recognition.status).toBe('recognized');
  if (result.recognition.status !== 'recognized') {
    throw new Error('Source was not recognized');
  }
  return result as RecognizedCapture;
}

function recognitionEntryCount(
  recognition: Extract<LegacyReviewSourceRecognition, { readonly status: 'recognized' }>,
): number {
  return 'annotations' in recognition.value ? recognition.value.annotations.length : recognition.value.batches.length;
}

async function captureRecognition(
  sourceKind: LegacyReviewSourceKind,
  value: Uint8Array | string,
): Promise<LegacyReviewSourceRecognition> {
  const installed = await installSource(typeof value === 'string' ? Buffer.from(value) : value);
  const result = await capture(sourceKind, installed.root);
  expect(result.status).toBe('captured');
  if (result.status !== 'captured') throw new Error('Source was not captured');
  return result.recognition;
}

afterEach(async () => {
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('bounded legacy Review source recognition', () => {
  it.each(GOLDENS)('preserves and recognizes immutable $format golden bytes', async golden => {
    const expected = await fs.readFile(path.join(GOLDEN_DIRECTORY, golden.file));
    const installed = await installSource(expected);
    const before = await stableMetadata(installed.file);
    const entriesBefore = await fs.readdir(path.dirname(installed.file));

    const result = recognized(await capture(golden.sourceKind, installed.root));

    expect(result.sourcePath).toBe(await fs.realpath(installed.file));
    expect(result.byteLength).toBe(expected.byteLength);
    expect(result.digest).toBe(golden.digest);
    expect(createHash('sha256').update(result.bytes).digest('hex')).toBe(golden.digest);
    expect(Buffer.from(result.bytes)).toEqual(expected);
    expect(result.metadata).toMatchObject({
      device: before.device.toString(),
      inode: before.inode.toString(),
      mode: Number(before.mode),
      byteLength: Number(before.size),
      modifiedNanoseconds: before.mtimeNs.toString(),
      changedNanoseconds: before.ctimeNs.toString(),
    });
    expect(result.recognition.format).toBe(golden.format);
    expect(recognitionEntryCount(result.recognition)).toBe(golden.entries);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);
    expect(Object.isFrozen(result.recognition)).toBe(true);
    expect(Object.isFrozen(result.recognition.value)).toBe(true);
    const values =
      'annotations' in result.recognition.value
        ? result.recognition.value.annotations
        : result.recognition.value.batches;
    expect(Object.isFrozen(values)).toBe(true);

    expect(await stableMetadata(installed.file)).toEqual(before);
    expect(await fs.readdir(path.dirname(installed.file))).toEqual(entriesBefore);
    expect(await fs.readFile(installed.file)).toEqual(expected);
  });

  it('retains the exact settled annotation and receipt field meanings', async () => {
    const raw = recognized(
      await capture(
        'queue',
        (await installSource(await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-array-v1.json')))).root,
      ),
    );
    if (!('annotations' in raw.recognition.value)) {
      throw new Error('Expected queue annotations');
    }
    expect(raw.recognition.value.annotations).toEqual([
      {
        id: 'legacy-array-edit',
        kind: 'edit',
        file: 'src/value.ts',
        anchor: { side: 'new', newLine: 7 },
        text: 'Use the normalized value.',
        excerpt: '+const value = normalize(input);',
      },
    ]);

    const versionOne = recognized(
      await capture(
        'queue',
        (await installSource(await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')))).root,
      ),
    );
    if (!('annotations' in versionOne.recognition.value)) {
      throw new Error('Expected version-one queue annotations');
    }
    expect(versionOne.recognition.value.annotations.map(item => item.anchor)).toEqual([
      { side: 'old', oldLine: 11 },
      { side: 'file' },
    ]);

    const versionTwo = recognized(
      await capture(
        'queue',
        (await installSource(await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')))).root,
      ),
    );
    if (!('annotations' in versionTwo.recognition.value)) {
      throw new Error('Expected version-two queue annotations');
    }
    expect(versionTwo.recognition.value.annotations.map(item => item.anchor)).toEqual([
      { side: 'new', newLine: 23 },
      { side: 'file' },
    ]);

    const receipts = recognized(
      await capture(
        'receipts',
        (await installSource(await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json')))).root,
      ),
    );
    if (!('batches' in receipts.recognition.value)) {
      throw new Error('Expected legacy receipt batches');
    }
    expect(receipts.recognition.value.batches).toMatchObject([
      {
        id: 'legacy-batch-cleared',
        workspace: '/sanitized/workspace',
        harness: {
          id: 'pi',
          name: 'Pi',
          version: '0.80.6',
          sessionId: 'sanitized-session-one',
          model: 'sanitized-model',
          workspace: '/sanitized/workspace',
        },
        harnessOutcome: 'succeeded',
        queueDisposition: 'cleared',
      },
      {
        id: 'legacy-batch-retained',
        harnessOutcome: 'failed',
        harnessError: 'sanitized failure',
        queueDisposition: 'retained',
        queueReason: 'harness_failed',
      },
    ]);
  });

  it('classifies malformed, duplicate, unsupported, and inconsistent stable bytes', async () => {
    await expect(captureRecognition('queue', Buffer.from([0xff]))).resolves.toEqual({
      status: 'unrecognized',
      reason: 'malformed-utf8',
    });
    await expect(captureRecognition('queue', '{not json}\n')).resolves.toEqual({
      status: 'unrecognized',
      reason: 'malformed-json',
    });
    await expect(
      captureRecognition(
        'queue',
        JSON.stringify({
          version: 2,
          annotations: [
            {
              id: 'same',
              kind: 'question',
              anchor: { side: 'file' },
              text: 'one',
            },
            {
              id: 'same',
              kind: 'change',
              anchor: { side: 'file' },
              text: 'two',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'duplicate-identity',
    });
    const migratedContext = await captureRecognition(
      'queue',
      JSON.stringify({
        version: 1,
        annotations: [
          {
            id: 'context',
            kind: 'change',
            line: 19,
            text: 'context',
            excerpt: ' unchanged context',
          },
        ],
      }),
    );
    expect(migratedContext).toMatchObject({
      status: 'recognized',
      value: { annotations: [{ anchor: { side: 'both', newLine: 19 } }] },
    });
    const explicitBoth = await captureRecognition(
      'queue',
      JSON.stringify({
        version: 2,
        annotations: [
          {
            id: 'both',
            kind: 'question',
            anchor: { side: 'both', oldLine: 8 },
            text: 'both-side legacy hint',
          },
        ],
      }),
    );
    expect(explicitBoth).toMatchObject({
      status: 'recognized',
      value: { annotations: [{ anchor: { side: 'both', oldLine: 8 } }] },
    });
    await expect(
      captureRecognition(
        'queue',
        JSON.stringify({
          version: 1,
          annotations: [
            {
              id: 'negative-line',
              kind: 'question',
              line: -1,
              text: 'invalid',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'invalid-structure',
    });
    await expect(
      captureRecognition(
        'queue',
        JSON.stringify({
          version: 2,
          annotations: [
            {
              id: 'wrong-side-coordinate',
              kind: 'question',
              anchor: { side: 'old', newLine: 3 },
              text: 'invalid',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'invalid-structure',
    });
    await expect(
      captureRecognition(
        'queue',
        JSON.stringify({
          version: 3,
          annotations: [],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'unsupported-newer-version',
      observedVersion: 3,
    });
    await expect(
      captureRecognition(
        'queue',
        JSON.stringify({
          version: 0,
          annotations: [],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'unsupported-version',
    });
    await expect(
      captureRecognition(
        'receipts',
        JSON.stringify({
          version: 2,
          updatedAt: '2026-09-02T00:00:00.000Z',
          batches: [],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'unsupported-newer-version',
      observedVersion: 2,
    });
    const duplicateReceipts = JSON.parse(
      await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json'), 'utf8'),
    ) as { batches: unknown[] } & Record<string, unknown>;
    duplicateReceipts.batches = [duplicateReceipts.batches[0], duplicateReceipts.batches[0]];
    await expect(captureRecognition('receipts', JSON.stringify(duplicateReceipts))).resolves.toEqual({
      status: 'unrecognized',
      reason: 'duplicate-identity',
    });
    await expect(
      captureRecognition(
        'receipts',
        JSON.stringify({
          version: 1,
          updatedAt: '2026-09-02T00:00:00.000Z',
          batches: [
            {
              id: 'inconsistent',
              workspace: '/one',
              annotations: [
                {
                  id: 'question',
                  kind: 'question',
                  anchor: { side: 'file' },
                  text: 'why',
                },
              ],
              harness: {
                id: 'pi',
                name: 'Pi',
                sessionId: 'session',
                workspace: '/two',
              },
              createdAt: '2026-09-02T00:00:00.000Z',
              updatedAt: '2026-09-02T00:00:00.000Z',
              harnessOutcome: 'pending',
              queueDisposition: 'pending',
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      status: 'unrecognized',
      reason: 'invalid-structure',
    });
  });

  it('bounds stable bytes and aggregate parsed entries before publication', async () => {
    const root = await temporaryRoot();
    await fs.mkdir(path.join(root, 'owned'));
    const oversized = await fs.open(path.join(root, 'owned', 'source.json'), 'w', 0o600);
    await oversized.truncate(MAX_LEGACY_REVIEW_SOURCE_BYTES + 1);
    await oversized.close();
    await expect(capture('queue', root)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'source-too-large',
    });

    const annotations = Array.from({ length: MAX_LEGACY_REVIEW_SOURCE_ENTRIES + 1 }, (_, index) => ({
      id: `legacy-${index}`,
      kind: 'question',
      anchor: { side: 'file' },
      text: '',
    }));
    const recognition = await captureRecognition('queue', JSON.stringify({ version: 2, annotations }));
    expect(recognition).toEqual({
      status: 'unrecognized',
      reason: 'entry-limit-exceeded',
    });
  });

  it('rejects missing, symlinked, non-regular, and invalid locators', async () => {
    const missingRoot = await temporaryRoot();
    await expect(capture('queue', missingRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'missing',
    });

    const finalLinkRoot = await temporaryRoot();
    await fs.mkdir(path.join(finalLinkRoot, 'owned'));
    await fs.writeFile(path.join(finalLinkRoot, 'target.json'), '[]\n');
    await fs.symlink(path.join(finalLinkRoot, 'target.json'), path.join(finalLinkRoot, 'owned', 'source.json'));
    await expect(capture('queue', finalLinkRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'unsafe-path',
    });

    const directoryLinkRoot = await temporaryRoot();
    await fs.mkdir(path.join(directoryLinkRoot, 'actual'));
    await fs.writeFile(path.join(directoryLinkRoot, 'actual', 'source.json'), '[]\n');
    await fs.symlink(path.join(directoryLinkRoot, 'actual'), path.join(directoryLinkRoot, 'owned'));
    await expect(capture('queue', directoryLinkRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'unsafe-path',
    });

    const nonRegularRoot = await temporaryRoot();
    await fs.mkdir(path.join(nonRegularRoot, 'owned', 'source.json'), {
      recursive: true,
    });
    await expect(capture('queue', nonRegularRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'not-regular-file',
    });

    const aliasedParent = await temporaryRoot();
    const actualRoot = path.join(aliasedParent, 'actual-root');
    const aliasedRoot = path.join(aliasedParent, 'configured-root');
    await fs.mkdir(path.join(actualRoot, 'owned'), { recursive: true });
    await fs.writeFile(path.join(actualRoot, 'owned', 'source.json'), '[]\n');
    await fs.symlink(actualRoot, aliasedRoot);
    const aliased = recognized(
      await captureLegacyReviewSource({
        sourceKind: 'queue',
        trustedRoot: aliasedRoot,
        relativePath: ['owned', 'source.json'],
      }),
    );
    expect(aliased.sourcePath).toBe(await fs.realpath(path.join(actualRoot, 'owned', 'source.json')));

    await expect(
      captureLegacyReviewSource({
        sourceKind: 'queue',
        trustedRoot: missingRoot,
        relativePath: ['owned', '..', 'source.json'],
      }),
    ).rejects.toThrow('relative path is invalid');
  });

  it('retries a replaced path and publishes only the stable successor bytes', async () => {
    const first = Buffer.from('{"version":2,"annotations":[]}\n');
    const successor = Buffer.from(
      JSON.stringify({
        version: 2,
        annotations: [
          {
            id: 'stable-successor',
            kind: 'question',
            anchor: { side: 'file' },
            text: 'successor',
          },
        ],
      }) + '\n',
    );
    const installed = await installSource(first);
    let replaced = false;
    const result = recognized(
      await capture('queue', installed.root, {
        afterBytesRead: async ({ attempt, sourcePath }) => {
          if (attempt !== 1 || replaced) return;
          replaced = true;
          await fs.rename(sourcePath, `${sourcePath}.before`);
          await fs.writeFile(sourcePath, successor, { mode: 0o640 });
        },
      }),
    );

    expect(replaced).toBe(true);
    expect(Buffer.from(result.bytes)).toEqual(successor);
    expect(result.digest).toBe(createHash('sha256').update(successor).digest('hex'));
    if (!('annotations' in result.recognition.value)) {
      throw new Error('Expected queue annotations');
    }
    expect(result.recognition.value.annotations[0]?.id).toBe('stable-successor');
  });

  it('fails closed when the source changes through every bounded attempt', async () => {
    const installed = await installSource(Buffer.from('{"version":2,"annotations":[]}\n'));
    const observedAttempts: number[] = [];
    const result = await capture('queue', installed.root, {
      afterBytesRead: async ({ attempt, sourcePath }) => {
        observedAttempts.push(attempt);
        await fs.rename(sourcePath, `${sourcePath}.${attempt}`);
        await fs.writeFile(sourcePath, `{"version":2,"annotations":[],"attempt":${attempt}}\n`, { mode: 0o640 });
      },
    });

    expect(observedAttempts).toEqual(
      Array.from({ length: LEGACY_REVIEW_SOURCE_CAPTURE_ATTEMPTS }, (_, index) => index + 1),
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'changed-during-read',
    });
  });

  it('stops a source that grows beyond the byte bound after its handle opens', async () => {
    const installed = await installSource(Buffer.from('[]\n'));
    const result = await capture('queue', installed.root, {
      afterHandleOpened: async ({ sourcePath }) => {
        await fs.truncate(sourcePath, MAX_LEGACY_REVIEW_SOURCE_BYTES + 1);
      },
    });
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'source-too-large',
    });
  });
});
