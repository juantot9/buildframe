import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ReviewContextSelectionChanged } from '@buildframe/workspace/reviewing';

import { encodeBytesBase64 } from '../../src/bytesBase64.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import type { Workspace } from '../../src/index.js';

const execFileAsync = promisify(execFile);

export interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
  readonly basis: string;
  readonly compared: string;
}

export async function git(directory: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
  return result.stdout.trim();
}

export function encoded(value: string): string {
  return encodeBytesBase64(Buffer.from(value, 'utf8'));
}

export async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-context-revalidate-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(path.join(checkout, 'ctx'), { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, 'review.txt'), 'before\n');
  await writeFile(path.join(checkout, 'ctx', 'direct.txt'), 'abcdefghij\n');
  await writeFile(path.join(checkout, 'ctx', 'excluded.txt'), 'excluded-value\n');
  await writeFile(path.join(checkout, 'ctx', 'other.txt'), '0123456789\n');
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'basis');
  const basis = await git(checkout, 'rev-parse', 'HEAD');
  await writeFile(path.join(checkout, 'review.txt'), 'after\n');
  await git(checkout, 'commit', '-qam', 'compared');
  const compared = await git(checkout, 'rev-parse', 'HEAD');
  return { root, checkout, state, basis, compared };
}

export function requireSelection(result: Awaited<ReturnType<Workspace['execute']>>): ReviewContextSelectionChanged {
  if (result.kind !== 'review.context-selection.changed') {
    throw new Error(`Selection did not change: ${JSON.stringify(result)}`);
  }
  return result;
}
