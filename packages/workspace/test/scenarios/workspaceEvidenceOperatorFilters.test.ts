import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capture,
  completeManifest,
  createCheckout,
  fileAt,
  git,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { Workspace } from '../../src/index.js';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

/** A path as a Git config value: unescaped backslashes in a Windows path are invalid there. */
const configPath = (file: string): string => file.replaceAll(path.sep, '/');

describe('Workspace Evidence and operator-configured Git filters', () => {
  it('runs an operator-owned global clean filter selected by tracked attributes', async () => {
    const { root, checkout } = await createCheckout();
    const home = path.join(root, 'operator-home');
    const xdg = path.join(root, 'operator-xdg');
    await mkdir(home);
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const marker = path.join(root, 'operator-filter.marker');
    const filter = path.join(root, 'operator-filter.sh');
    await writeFile(filter, `#!/bin/sh\ncat\nprintf executed >> ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "operator"]\n\tclean = ${configPath(filter)}\n`);
    await writeFile(path.join(checkout, '.gitattributes'), '*.txt filter=operator\n');
    await writeFile(path.join(checkout, 'filtered.txt'), 'content\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'operator filter basis');
    await rm(marker, { force: true });
    const later = new Date(Date.now() + 2_000);
    await utimes(path.join(checkout, 'filtered.txt'), later, later);

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    expect(await readFile(marker, 'utf8')).toContain('executed');
  });

  it('ignores checkout-local info attributes that select an operator command', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    const home = path.join(root, 'operator-home');
    const xdg = path.join(root, 'operator-xdg');
    await mkdir(home);
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const marker = path.join(root, 'info-filter.marker');
    const filter = path.join(root, 'info-filter.sh');
    await writeFile(filter, `#!/bin/sh\ncat\nprintf executed >> ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "info"]\n\tclean = ${configPath(filter)}\n`);
    await mkdir(path.join(checkout, '.git', 'info'), { recursive: true });
    await writeFile(path.join(checkout, '.git', 'info', 'attributes'), '*.txt filter=info\n');
    await writeFile(path.join(checkout, 'info-selected.txt'), 'content\n');

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('captures raw working bytes but leaves arbitrary filtered identity unverified', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    const home = path.join(root, 'filter-home');
    await mkdir(home);
    process.env.HOME = home;
    const filter = path.join(root, 'operator-filter.sh');
    await writeFile(filter, '#!/bin/sh\ncat\n', { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "operator"]\n\tclean = ${configPath(filter)}\n`);
    await writeFile(path.join(checkout, '.gitattributes'), '*.txt filter=operator\n');
    await writeFile(path.join(checkout, 'filtered.txt'), 'basis\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'filtered basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'filtered.txt'), 'working\n');

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-working-state',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('unverified');
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    expect(fileAt(files, 'filtered.txt').newSide).toMatchObject({
      contentAvailability: 'captured',
      workingEvidenceLimitation: 'unsupported-content-filter',
    });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('unverified');
  });
});
