import { createHash } from 'node:crypto';
import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capture,
  capturedText,
  completeManifest,
  createCheckout,
  execFileAsync,
  fileAt,
  git,
  gitWithInput,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { Workspace } from '../../src/index.js';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

describe('per-side degraded Workspace Evidence', () => {
  it('preserves raw path bytes and case-distinct occurrences through capture and verification', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'blob-source'), 'raw path content\n');
    const blob = (await git(checkout, 'hash-object', '-w', 'blob-source')).trim();
    await rm(path.join(checkout, 'blob-source'));
    const paths = [
      Buffer.from('Case.txt'),
      Buffer.from('case.txt'),
      Buffer.from([0x72, 0x61, 0x77, 0x2d, 0xff, 0x2e, 0x74, 0x78, 0x74]),
    ];
    await gitWithInput(
      checkout,
      ['update-index', '-z', '--index-info'],
      Buffer.concat(paths.flatMap(rawPath => [Buffer.from(`100644 ${blob}\t`, 'ascii'), rawPath, Buffer.from([0])])),
    );
    const tree = (await git(checkout, 'write-tree')).trim();
    const comparedCommit = (await git(checkout, 'commit-tree', tree, '-p', basisCommit, '-m', 'raw paths')).trim();

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
        compared: {
          kind: 'object',
          objectKind: 'commit',
          objectIdentity: comparedCommit,
        },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(3);
    expect(files.map(file => Buffer.from(file.newSide?.path.bytesBase64 ?? '', 'base64').toString('hex'))).toEqual(
      paths.map(item => item.toString('hex')).sort(),
    );
    expect(files.map(file => file.newSide?.path.display)).toEqual([
      'Case.txt',
      'case.txt',
      '<path-bytes:7261772dff2e747874>',
    ]);
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');

    const rawPath = paths[2]!;
    const scoped = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
        compared: {
          kind: 'object',
          objectKind: 'commit',
          objectIdentity: comparedCommit,
        },
        scope: {
          kind: 'exact-paths',
          entries: [
            {
              pathBytesBase64: rawPath.toString('base64'),
              inclusion: 'ordinary',
            },
          ],
        },
      },
    });
    expect(scoped).toMatchObject({
      status: 'captured',
      manifest: { totalFiles: 1 },
    });
    if (scoped.status !== 'captured') return;
    const scopedFiles = await completeManifest(evidence as unknown as Workspace, scoped.evidenceIdentity);
    expect(scopedFiles[0]?.newSide?.path.bytesBase64).toBe(rawPath.toString('base64'));
    expect(scopedFiles[0]?.scopeMembership?.[0]).toMatchObject({
      selectionPath: { bytesBase64: rawPath.toString('base64') },
      selectionKind: 'file',
    });
  });

  it('captures raw symlink targets, special-entry facts, generated evidence, and binary bytes independently', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, '.gitattributes'), '*.generated linguist-generated\n');
    await mkdir(path.join(root, 'outside-a'));
    await mkdir(path.join(root, 'outside-b'));
    await symlink('../outside-a', path.join(checkout, 'link'));
    await writeFile(path.join(checkout, 'special.pipe'), 'regular before\n');
    await writeFile(path.join(checkout, 'code.generated'), 'before\n');
    await writeFile(path.join(checkout, 'binary.bin'), Buffer.from([1, 0, 2]));
    await writeFile(path.join(checkout, 'unrenderable.txt'), Buffer.from([0xc3, 0x28]));
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'degradation basis');

    await rm(path.join(checkout, 'link'));
    await symlink('../outside-b', path.join(checkout, 'link'));
    await rm(path.join(checkout, 'special.pipe'));
    await execFileAsync('/usr/bin/mkfifo', [path.join(checkout, 'special.pipe')]);
    await writeFile(path.join(checkout, 'code.generated'), 'after\n');
    await writeFile(path.join(checkout, 'binary.bin'), Buffer.from([3, 0, 4]));
    await writeFile(path.join(checkout, 'unrenderable.txt'), Buffer.from([0xe2, 0x28]));

    const opened = await openWorkspace(checkout);
    const captured = await capture(opened.workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('current');
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);

    const link = fileAt(files, 'link');
    expect(link.newSide).toMatchObject({
      kind: 'symlink',
      gitMode: '120000',
      symlinkTarget: {
        byteLength: Buffer.byteLength('../outside-b'),
        bytesBase64: Buffer.from('../outside-b').toString('base64'),
      },
    });
    expect(await capturedText(opened.workspace, captured.evidenceIdentity, link, 'new')).toBe('../outside-b');

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
    expect(fileAt(files, 'code.generated').newSide?.generated).toEqual({
      classification: 'generated',
      source: 'git-attribute',
      attribute: 'linguist-generated',
    });
    expect(fileAt(files, 'binary.bin').newSide?.classification).toBe('binary');
    expect(fileAt(files, 'unrenderable.txt').newSide?.classification).toBe('unrenderable');

    await writeFile(path.join(root, 'outside-b', 'irrelevant'), 'target mutation\n');
    await expect(
      opened.workspace.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: captured.evidenceIdentity,
      }),
    ).resolves.toMatchObject({ verification: { state: 'current' } });
    await rm(path.join(checkout, 'special.pipe'));
    await writeFile(path.join(checkout, 'special.pipe'), 'regular again\n');
    await expect(
      opened.workspace.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: captured.evidenceIdentity,
      }),
    ).resolves.toMatchObject({ verification: { state: 'stale' } });
  });

  it('records a working socket kind without inventing content', async () => {
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

  it('records skip-worktree absence as intentional rather than deletion', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await mkdir(path.join(checkout, 'sparse'));
    await mkdir(path.join(checkout, 'visible'));
    await writeFile(path.join(checkout, 'sparse', 'tracked.txt'), 'basis\n');
    await writeFile(path.join(checkout, 'visible', 'kept.txt'), 'visible\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'sparse basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await git(checkout, 'sparse-checkout', 'init', '--cone');
    await git(checkout, 'sparse-checkout', 'set', 'visible');
    const stagedOid = (await gitWithInput(checkout, ['hash-object', '-w', '--stdin'], Buffer.from('staged\n')))
      .toString('ascii')
      .trim();
    await git(checkout, 'update-index', '--cacheinfo', `100644,${stagedOid},sparse/tracked.txt`);
    await git(checkout, 'update-index', '--skip-worktree', 'sparse/tracked.txt');

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
    expect(captured.verification.state).toBe('current');
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    const sparse = fileAt(files, 'sparse/tracked.txt');
    expect(sparse.status).not.toBe('deleted');
    expect(sparse.staging).toEqual({ index: 'modified', workingTree: 'unchanged' });
    expect(sparse.newSide).toMatchObject({
      kind: 'regular',
      objectIdentity: { value: stagedOid },
      sparseAbsence: {
        indexFlag: 'skip-worktree',
        workingTree: 'intentionally-absent',
      },
    });
    expect(await capturedText(evidence as unknown as Workspace, captured.evidenceIdentity, sparse, 'new')).toBe(
      'staged\n',
    );
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');

    await git(checkout, 'sparse-checkout', 'disable');
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('captures Gitlink identities and bounded nested checkout indicators without recursion', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    const nestedSource = path.join(root, 'nested-source');
    await mkdir(nestedSource);
    await git(nestedSource, 'init', '-q');
    await git(nestedSource, 'config', 'user.name', 'Nested Test');
    await git(nestedSource, 'config', 'user.email', 'nested@example.invalid');
    await writeFile(path.join(nestedSource, 'nested.txt'), 'one\n');
    await git(nestedSource, 'add', '.');
    await git(nestedSource, 'commit', '-qm', 'nested one');
    const nestedOne = (await git(nestedSource, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(nestedSource, 'nested.txt'), 'two\n');
    await git(nestedSource, 'commit', '-qam', 'nested two');
    const nestedTwo = (await git(nestedSource, 'rev-parse', 'HEAD')).trim();

    await git(checkout, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', nestedSource, 'nested');
    await git(checkout, '-C', 'nested', 'checkout', '-q', nestedOne);
    await git(checkout, 'add', '.gitmodules', 'nested');
    await git(checkout, 'commit', '-qm', 'parent basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await git(checkout, '-C', 'nested', 'checkout', '-q', nestedTwo);
    await writeFile(path.join(checkout, 'nested', 'nested.txt'), 'dirty\n');
    await writeFile(path.join(checkout, 'nested', 'untracked.txt'), 'untracked\n');

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
    expect(captured.verification.state).toBe('current');
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    const nested = fileAt(files, 'nested');
    expect(nested).toMatchObject({
      status: 'modified',
      oldSide: {
        kind: 'gitlink',
        objectIdentity: { value: nestedOne },
        gitlink: { objectIdentity: { value: nestedOne } },
      },
      newSide: {
        kind: 'gitlink',
        objectIdentity: { value: nestedOne },
        gitlink: {
          objectIdentity: { value: nestedOne },
          checkout: {
            availability: 'available',
            checkedOutCommit: { value: nestedTwo },
            dirty: true,
            untracked: true,
          },
        },
      },
    });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');

    await rm(path.join(checkout, 'nested'), { recursive: true, force: true });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('unverified');
    const indexOnly = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-index',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(indexOnly).toMatchObject({
      status: 'captured',
      verification: { state: 'current' },
      manifest: { totalFiles: 0 },
    });
  });

  it('keeps complete siblings when one blob is missing and fails closed only for missing structure', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'missing.txt'), 'before missing\n');
    await writeFile(path.join(checkout, 'sibling.txt'), 'before sibling\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'partial basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'missing.txt'), 'after missing\n');
    await writeFile(path.join(checkout, 'sibling.txt'), 'after sibling\n');
    await git(checkout, 'commit', '-qam', 'partial compared');
    const comparedCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const missingBlob = (await git(checkout, 'rev-parse', 'HEAD:missing.txt')).trim();
    const missingPath = path.join(checkout, '.git', 'objects', missingBlob.slice(0, 2), missingBlob.slice(2));
    const hiddenMissingPath = `${missingPath}.hidden`;
    await rename(missingPath, hiddenMissingPath);

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const selection = {
      kind: 'revision-pair',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      compared: {
        kind: 'object',
        objectKind: 'commit',
        objectIdentity: comparedCommit,
      },
    } as const;
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection,
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(2);
    expect(fileAt(files, 'missing.txt').newSide).toMatchObject({
      objectIdentity: { value: missingBlob },
      objectAvailability: 'missing',
      contentAvailability: 'unavailable',
      contentLimitation: 'missing-object',
    });
    expect(
      await capturedText(
        evidence as unknown as Workspace,
        captured.evidenceIdentity,
        fileAt(files, 'sibling.txt'),
        'new',
      ),
    ).toBe('after sibling\n');
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');

    await writeFile(path.join(checkout, 'missing.txt'), 'working successor\n');
    const current = await evidence.read({
      kind: 'workspace.current-changes.capture',
    });
    expect(current.status).toBe('captured');
    if (current.status !== 'captured') return;
    const currentFiles = await completeManifest(evidence as unknown as Workspace, current.evidenceIdentity);
    expect(fileAt(currentFiles, 'missing.txt')).toMatchObject({
      oldSide: {
        objectIdentity: { value: missingBlob },
        objectAvailability: 'missing',
      },
      newSide: { contentAvailability: 'captured' },
    });
    await expect(
      evidence.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: current.evidenceIdentity,
      }),
    ).resolves.toMatchObject({ verification: { state: 'current' } });

    await rename(hiddenMissingPath, missingPath);
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('unverified');
    await expect(
      evidence.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: current.evidenceIdentity,
      }),
    ).resolves.toMatchObject({ verification: { state: 'unverified' } });
    const tree = (await git(checkout, 'rev-parse', `${comparedCommit}^{tree}`)).trim();
    const treePath = path.join(checkout, '.git', 'objects', tree.slice(0, 2), tree.slice(2));
    const hiddenTreePath = `${treePath}.hidden`;
    await rename(treePath, hiddenTreePath);
    try {
      await expect(
        evidence.read({
          kind: 'workspace.review-comparison.capture',
          selection,
        }),
      ).resolves.toMatchObject({ status: 'unavailable' });
    } finally {
      await rename(hiddenTreePath, treePath);
    }
  });

  it('keeps Git LFS pointer bytes and local payload capture distinct without hydration', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const payload = Buffer.from([0, 1, 2, 3, 4, 5]);
    const payloadIdentity = createHash('sha256').update(payload).digest('hex');
    const pointer = Buffer.from(
      `version https://git-lfs.github.com/spec/v1\n` +
        `oid sha256:${payloadIdentity}\n` +
        `size ${payload.byteLength}\n`,
    );
    await writeFile(path.join(checkout, 'large.bin'), pointer);
    await git(checkout, 'add', 'large.bin');
    await git(checkout, 'commit', '-qm', 'pointer compared');
    const comparedCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const localPayloadPath = path.join(
      checkout,
      '.git',
      'lfs',
      'objects',
      payloadIdentity.slice(0, 2),
      payloadIdentity.slice(2, 4),
      payloadIdentity,
    );
    await mkdir(path.dirname(localPayloadPath), { recursive: true });
    await writeFile(localPayloadPath, payload);

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
        compared: {
          kind: 'object',
          objectKind: 'commit',
          objectIdentity: comparedCommit,
        },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    const large = fileAt(files, 'large.bin');
    expect(large.newSide?.largeFilePointer).toMatchObject({
      kind: 'git-lfs-pointer-v1',
      pointer: {
        byteLength: pointer.byteLength,
        bytesBase64: pointer.toString('base64'),
      },
      declaredPayload: {
        objectIdentity: { algorithm: 'sha256', value: payloadIdentity },
        byteLength: payload.byteLength,
      },
      sideRepresentation: 'pointer',
      localPayload: {
        availability: 'available',
        contentAvailability: 'captured',
        contentIdentity: { value: payloadIdentity },
      },
    });
    expect(await capturedText(evidence as unknown as Workspace, captured.evidenceIdentity, large, 'new')).toBe(
      pointer.toString(),
    );
    const payloadView = await evidence.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: large.fileIdentity,
      side: 'new',
      representation: 'large-file-payload',
      offset: 0,
      length: 64,
    });
    expect(payloadView).toMatchObject({
      status: 'available',
      representation: 'large-file-payload',
      bytesBase64: payload.toString('base64'),
      contentIdentity: { value: payloadIdentity },
    });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');
    await rm(localPayloadPath);
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('unverified');
  });

  it('recognizes a locally materialized LFS payload without invoking hydration', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const payload = Buffer.from([9, 0, 8, 7, 6]);
    const payloadIdentity = createHash('sha256').update(payload).digest('hex');
    const pointer = Buffer.from(
      `version https://git-lfs.github.com/spec/v1\n` + `oid sha256:${payloadIdentity}\nsize ${payload.byteLength}\n`,
    );
    await writeFile(path.join(checkout, 'materialized.bin'), pointer);
    await git(checkout, 'add', 'materialized.bin');
    await git(checkout, 'commit', '-qm', 'materialized pointer basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'materialized.bin'), payload);

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
    expect(captured.verification.state).toBe('current');
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    const materialized = fileAt(files, 'materialized.bin');
    expect(materialized.newSide?.largeFilePointer).toMatchObject({
      sideRepresentation: 'payload',
      pointer: { bytesBase64: pointer.toString('base64') },
      declaredPayload: { objectIdentity: { value: payloadIdentity } },
      localPayload: {
        availability: 'available',
        contentAvailability: 'captured',
      },
    });
    const payloadView = await evidence.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: materialized.fileIdentity,
      side: 'new',
      representation: 'large-file-payload',
      offset: 0,
      length: 64,
    });
    expect(payloadView).toMatchObject({
      status: 'available',
      bytesBase64: payload.toString('base64'),
    });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');
    await writeFile(path.join(checkout, 'materialized.bin'), Buffer.from([9, 0, 8, 7, 5]));
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('captures raw working bytes but leaves arbitrary filtered identity unverified', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    const home = path.join(root, 'filter-home');
    await mkdir(home);
    process.env.HOME = home;
    const filter = path.join(root, 'operator-filter.sh');
    await writeFile(filter, '#!/bin/sh\ncat\n', { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "operator"]\n\tclean = ${filter}\n`);
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
