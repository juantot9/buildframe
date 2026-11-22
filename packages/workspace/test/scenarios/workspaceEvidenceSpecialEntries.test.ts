import { rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { describe, expect } from 'vitest';

import {
  capture,
  completeManifest,
  createCheckout,
  execFileAsync,
  fileAt,
  git,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { Workspace } from '../../src/index.js';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';
import { itOnPosix } from '../platformCases.js';

installWorkspaceEvidenceHygiene();

// Each case needs a FIFO or a Unix socket file, which Windows checkouts cannot hold.
describe('special entries in Workspace Evidence', () => {
  itOnPosix('records a FIFO as a type change without content, and goes stale when it is regular again', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const pipePath = path.join(checkout, 'special.pipe');
    await writeFile(pipePath, 'regular before\n');
    await git(checkout, 'add', 'special.pipe');
    await git(checkout, 'commit', '-qm', 'fifo basis');
    await rm(pipePath);
    await execFileAsync('/usr/bin/mkfifo', [pipePath]);

    const opened = await openWorkspace(checkout);
    const captured = await capture(opened.workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    const special = fileAt(files, 'special.pipe');
    expect(special).toMatchObject({
      status: 'type-changed',
      newSide: {
        kind: 'special',
        gitMode: '000000',
        byteLength: null,
        contentAvailability: 'unavailable',
        specialEntry: { kind: 'fifo', content: 'not-applicable' },
      },
    });
    expect(special.newSide?.contentIdentity).toBeUndefined();

    const verify = async () =>
      await opened.workspace.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: captured.evidenceIdentity,
      });
    await expect(verify()).resolves.toMatchObject({ verification: { state: 'current' } });
    await rm(pipePath);
    await writeFile(pipePath, 'regular again\n');
    await expect(verify()).resolves.toMatchObject({ verification: { state: 'stale' } });
  });

  itOnPosix('records a working socket kind without inventing content', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const socketPath = path.join(checkout, 'service.socket');
    await writeFile(socketPath, 'tracked placeholder\n');
    await git(checkout, 'add', 'service.socket');
    await git(checkout, 'commit', '-qm', 'socket basis');
    await rm(socketPath);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      const opened = await openWorkspace(checkout);
      const evidence = new WorkspaceEvidence({
        workspaceIdentity: opened.workspaceIdentity,
        canonicalCheckout: opened.canonicalCheckout,
      });
      const captured = await evidence.read({
        kind: 'workspace.current-changes.capture',
      });
      expect(captured.status).toBe('captured');
      if (captured.status !== 'captured') return;
      const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
      expect(fileAt(files, 'service.socket').newSide).toMatchObject({
        kind: 'special',
        byteLength: null,
        contentAvailability: 'unavailable',
        contentLimitation: 'unsupported-file-kind',
        specialEntry: { kind: 'socket', content: 'not-applicable' },
      });
      await expect(
        evidence.read({
          kind: 'workspace.current-changes.verify',
          evidenceIdentity: captured.evidenceIdentity,
        }),
      ).resolves.toMatchObject({ verification: { state: 'current' } });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error === undefined ? resolve() : reject(error)));
      });
    }
  });
});
