import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { LOCAL_RUNTIME_PROTOCOL_VERSION, type RuntimeCodeIdentity } from './contracts.js';

const CODE_IDENTITY_SCHEMA = 'neoflow.local-runtime-code/1';
const MAX_WITNESS_ATTEMPTS = 3;

interface CodeWitness {
  readonly path: string;
  readonly metadata: string;
  readonly bytes: Buffer;
}

function sameFileIncarnation(before: BigIntStats, after: BigIntStats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  );
}

async function readStableWitness(url: URL): Promise<CodeWitness> {
  if (url.protocol !== 'file:') throw new TypeError('Runtime code witnesses must be local files');
  const requestedPath = fileURLToPath(url);

  for (let attempt = 0; attempt < MAX_WITNESS_ATTEMPTS; attempt += 1) {
    const resolvedPath = await realpath(requestedPath);
    const before = await stat(resolvedPath, { bigint: true });
    if (!before.isFile()) throw new TypeError('Runtime code witness must be a regular file');
    const bytes = await readFile(resolvedPath);
    const after = await stat(resolvedPath, { bigint: true });
    if (sameFileIncarnation(before, after) && BigInt(bytes.byteLength) === after.size) {
      return {
        path: resolvedPath,
        metadata: [after.dev, after.ino, after.mode, after.size, after.mtimeNs, after.ctimeNs].join(':'),
        bytes,
      };
    }
  }

  throw new Error('Runtime code witness changed while it was identified');
}

function addLengthPrefixed(hash: ReturnType<typeof createHash>, value: string | Buffer): void {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  hash.update(`${bytes.byteLength}:`, 'utf8');
  hash.update(bytes);
}

/**
 * Identifies the loaded Local Runtime build and its application-owned process
 * entrypoint. File-incarnation metadata deliberately changes across a clean
 * rebuild even when a thin entrypoint emits byte-identical JavaScript.
 */
export async function runtimeCodeIdentityForEntrypoint(runtimeEntrypoint: URL): Promise<RuntimeCodeIdentity> {
  const witnesses = await Promise.all([
    readStableWitness(runtimeEntrypoint),
    readStableWitness(new URL(import.meta.url)),
  ]);
  const unique = new Map(witnesses.map(witness => [witness.path, witness]));
  const hash = createHash('sha256');
  addLengthPrefixed(hash, CODE_IDENTITY_SCHEMA);
  addLengthPrefixed(hash, String(LOCAL_RUNTIME_PROTOCOL_VERSION));
  for (const witness of [...unique.values()].sort((left, right) => left.path.localeCompare(right.path))) {
    addLengthPrefixed(hash, witness.path);
    addLengthPrefixed(hash, witness.metadata);
    addLengthPrefixed(hash, witness.bytes);
  }
  return `rtc_${hash.digest('hex')}` as RuntimeCodeIdentity;
}
