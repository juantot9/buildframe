import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixture,
  git,
  installWorkspaceProjectionHygiene,
  manifest,
  open,
  started,
} from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

const LINES = ['one', 'two', 'three', 'four', 'five'];
const crlf = (lines: readonly string[]): string => lines.map(line => `${line}\r\n`).join('');
const lf = (lines: readonly string[]): string => lines.map(line => `${line}\n`).join('');
const edited = LINES.map(line => (line === 'three' ? 'THREE' : line));

/**
 * Commits `basis` as lines.txt with the repository's line-ending settings,
 * writes `working` over it, and returns the changed lines a Review's Diff
 * shows, without their line endings.
 */
async function reviewedLines(options: {
  readonly autoCrlf: 'true' | 'false';
  readonly attributes?: string;
  readonly basis: string;
  readonly working: string;
  /** core.autocrlf once the basis is committed, when it differs. */
  readonly autoCrlfAfterCommit?: 'true' | 'false';
}): Promise<{ readonly removed: readonly string[]; readonly added: readonly string[] }> {
  const { checkout } = await fixture();
  await git(checkout, 'commit', '-qam', 'fixture changes');
  await git(checkout, 'config', 'core.autocrlf', options.autoCrlf);
  if (options.attributes !== undefined) {
    await writeFile(path.join(checkout, '.gitattributes'), options.attributes);
  }
  await writeFile(path.join(checkout, 'lines.txt'), options.basis);
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'line-ending basis');
  if (options.autoCrlfAfterCommit !== undefined) {
    await git(checkout, 'config', 'core.autocrlf', options.autoCrlfAfterCommit);
  }
  await writeFile(path.join(checkout, 'lines.txt'), options.working);

  const owner = await open(checkout);
  const review = started(
    await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'line-endings-review',
      expectedStateVersion: 0,
    }),
  );
  const view = manifest(
    await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    }),
  );
  const file = view.manifest.files.find(entry => entry.displayPath === 'lines.txt');
  if (file === undefined) throw new Error('lines.txt is not in the Review');
  const diff = await owner.workspace.read({
    kind: 'review.diff',
    reviewIdentity: review.reviewIdentity,
    fileIdentity: file.fileIdentity,
    offset: 0,
    limit: 64,
  });
  if (diff.kind !== 'review.diff' || diff.status !== 'available') throw new Error('lines.txt Diff unavailable');
  const text = (kind: string): readonly string[] =>
    diff.window.rows
      .filter(row => row.kind === kind)
      .map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8').replace(/\r$/u, ''));
  return { removed: text('deletion'), added: text('addition') };
}

describe('Reviewing Diffs compare line endings the way Git does', () => {
  it('shows one changed line for a one-line edit in an eol=crlf file', async () => {
    await expect(
      reviewedLines({
        autoCrlf: 'false',
        attributes: 'lines.txt text eol=crlf\n',
        basis: crlf(LINES),
        working: crlf(edited),
      }),
    ).resolves.toEqual({ removed: ['three'], added: ['THREE'] });
  });

  it('shows one changed line for a one-line edit when core.autocrlf is true', async () => {
    await expect(reviewedLines({ autoCrlf: 'true', basis: lf(LINES), working: crlf(edited) })).resolves.toEqual({
      removed: ['three'],
      added: ['THREE'],
    });
  });

  it('still shows every line changed when an unconverted file goes from LF to CRLF', async () => {
    await expect(reviewedLines({ autoCrlf: 'false', basis: lf(LINES), working: crlf(LINES) })).resolves.toEqual({
      removed: LINES,
      added: LINES,
    });
  });

  it('keeps the CRs of a file committed with CRLF, as Git does under core.autocrlf', async () => {
    await expect(
      reviewedLines({ autoCrlf: 'false', autoCrlfAfterCommit: 'true', basis: crlf(LINES), working: crlf(edited) }),
    ).resolves.toEqual({ removed: ['three'], added: ['THREE'] });
  });
});
