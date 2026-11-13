import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capturedText,
  completeManifest,
  createCheckout,
  git,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { ReviewComparisonSelection } from '@buildframe/workspace/workspace-evidence';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

describe('exact file-scoped Workspace Evidence', () => {
  const scope = (repositoryPath: string, inclusion: 'ordinary' | 'include-ignored' = 'ordinary') => ({
    kind: 'exact-paths' as const,
    entries: [
      {
        pathBytesBase64: Buffer.from(repositoryPath).toString('base64'),
        inclusion,
      },
    ],
  });

  it('keeps dynamic comparisons current across unrelated ref movement and stale across selected movement', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'selected.txt'), 'selected basis\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside basis\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'scope basis');
    await git(checkout, 'branch', 'scope-basis');

    await writeFile(path.join(checkout, 'selected.txt'), 'selected compared\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside compared\n');
    await git(checkout, 'commit', '-qam', 'scope compared');
    await git(checkout, 'branch', 'scope-compared');

    const opened = await openWorkspace(checkout);
    const selection: ReviewComparisonSelection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'commit',
        reference: 'refs/heads/scope-basis',
      },
      compared: {
        kind: 'local-ref',
        objectKind: 'commit',
        reference: 'refs/heads/scope-compared',
      },
      scope: scope('selected.txt'),
    };
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection,
    });
    expect(captured).toMatchObject({
      status: 'captured',
      selection: { scope: scope('selected.txt') },
      basis: { scopeFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u) },
      comparedState: {
        scopeFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      manifest: { totalFiles: 1 },
    });
    if (captured.status !== 'captured') return;
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(1);
    expect(files[0]?.scopeMembership).toEqual([
      {
        selectionPath: {
          bytesBase64: Buffer.from('selected.txt').toString('base64'),
          display: 'selected.txt',
        },
        selectionKind: 'file',
        inclusion: 'ordinary',
        matchedSides: ['old', 'new'],
      },
    ]);

    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    await writeFile(path.join(checkout, 'outside.txt'), 'outside moved only\n');
    await git(checkout, 'commit', '-qam', 'outside ref movement');
    await git(checkout, 'branch', '-f', 'scope-compared', 'HEAD');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    await writeFile(path.join(checkout, 'selected.txt'), 'selected moved\n');
    await git(checkout, 'commit', '-qam', 'selected ref movement');
    await git(checkout, 'branch', '-f', 'scope-compared', 'HEAD');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('keeps both sides of a rename that crosses the selected boundary', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const renameBody = Array.from({ length: 20 }, (_, index) => `crossing rename line ${index}\n`).join('');
    await writeFile(path.join(checkout, 'inside.txt'), renameBody);
    await git(checkout, 'add', 'inside.txt');
    await git(checkout, 'commit', '-qm', 'rename basis');
    await git(checkout, 'mv', 'inside.txt', 'outside.txt');
    await writeFile(path.join(checkout, 'outside.txt'), `${renameBody}edited after move\n`);
    await git(checkout, 'commit', '-qam', 'rename compared');

    const { workspace } = await openWorkspace(checkout);
    const captured = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'last-commit', scope: scope('inside.txt') },
    });
    expect(captured).toMatchObject({
      status: 'captured',
      manifest: { totalFiles: 1 },
    });
    if (captured.status !== 'captured') return;
    const files = await completeManifest(workspace, captured.evidenceIdentity);
    expect(files[0]).toMatchObject({
      status: 'renamed',
      oldSide: { path: { display: 'inside.txt' } },
      newSide: { path: { display: 'outside.txt' } },
      scopeMembership: [
        {
          selectionKind: 'file',
          inclusion: 'ordinary',
          matchedSides: ['old'],
        },
      ],
    });

    const selectedByNewSide = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'last-commit', scope: scope('outside.txt') },
    });
    expect(selectedByNewSide).toMatchObject({
      status: 'captured',
      manifest: { totalFiles: 1 },
    });
    if (selectedByNewSide.status !== 'captured') return;
    expect((await completeManifest(workspace, selectedByNewSide.evidenceIdentity))[0]).toMatchObject({
      status: 'renamed',
      oldSide: { path: { display: 'inside.txt' } },
      newSide: { path: { display: 'outside.txt' } },
      scopeMembership: [{ matchedSides: ['new'] }],
    });
  });

  it('includes ignored working files only through explicit scope provenance', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, '.gitignore'), 'ignored.txt\n*.log\n');
    await git(checkout, 'commit', '-qam', 'ignore rules');
    const basis = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'ignored.txt'), 'selected ignored\n');
    await writeFile(path.join(checkout, 'outside.log'), 'outside ignored\n');

    const opened = await openWorkspace(checkout);
    const ordinary = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-working-state',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basis },
        scope: scope('ignored.txt'),
      },
    });
    expect(ordinary).toMatchObject({
      status: 'unavailable',
      reason: 'scope-path-not-found',
    });

    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-working-state',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basis },
        scope: scope('ignored.txt', 'include-ignored'),
      },
    });
    expect(captured).toMatchObject({
      status: 'captured',
      comparedState: { explicitlyScopedIgnoredUntracked: 'included' },
      manifest: { totalFiles: 1 },
    });
    if (captured.status !== 'captured') return;
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    expect(files[0]).toMatchObject({
      status: 'added',
      scopeMembership: [
        {
          selectionKind: 'file',
          inclusion: 'explicit-ignored',
          matchedSides: ['new'],
        },
      ],
    });
    expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'new')).toBe(
      'selected ignored\n',
    );

    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    await writeFile(path.join(checkout, 'outside.log'), 'outside changed\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
    await writeFile(path.join(checkout, 'ignored.txt'), 'selected changed\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await rm(path.join(checkout, 'ignored.txt'));
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('applies one exact directory scope to every historical and paired comparison form', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await mkdir(path.join(checkout, 'selected'));
    await writeFile(path.join(checkout, 'selected', 'file.txt'), 'basis\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside basis\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'all forms basis');
    const basis = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await git(checkout, 'branch', 'all-forms-basis');
    await writeFile(path.join(checkout, 'selected', 'file.txt'), 'compared\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside compared\n');
    await git(checkout, 'commit', '-qam', 'all forms compared');
    const compared = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const comparedTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();

    const opened = await openWorkspace(checkout);
    const selectedScope = scope('selected');
    const historical: readonly ReviewComparisonSelection[] = [
      { kind: 'last-commit', scope: selectedScope },
      { kind: 'head-ancestry', commitCount: 1, scope: selectedScope },
      { kind: 'commit', revision: compared, scope: selectedScope },
      { kind: 'commit-to-head', revision: basis, scope: selectedScope },
      {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basis },
        compared: {
          kind: 'object',
          objectKind: 'tree',
          objectIdentity: comparedTree,
        },
        scope: selectedScope,
      },
      {
        kind: 'local-ref-merge-base',
        selectedReference: 'refs/heads/all-forms-basis',
        comparedCommitIdentity: compared,
        scope: selectedScope,
      },
    ];
    for (const selection of historical) {
      const captured = await opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection,
      });
      expect(captured).toMatchObject({
        status: 'captured',
        manifest: { totalFiles: 1 },
      });
      if (captured.status !== 'captured') continue;
      const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
      expect(files).toHaveLength(1);
      expect(files[0]?.scopeMembership).toMatchObject([
        {
          selectionKind: 'directory',
          inclusion: 'ordinary',
          matchedSides: ['old', 'new'],
        },
      ]);
      expect(
        files.every(file => (file.oldSide?.path.display ?? file.newSide?.path.display ?? '').startsWith('selected/')),
      ).toBe(true);
    }

    await git(checkout, 'branch', 'all-forms-compared');
    await writeFile(path.join(checkout, 'selected', 'file.txt'), 'staged\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside staged\n');
    await git(checkout, 'add', '.');
    await writeFile(path.join(checkout, 'selected', 'file.txt'), 'working\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside working\n');
    const paired: readonly ReviewComparisonSelection[] = [
      {
        kind: 'revision-to-index',
        basis: {
          kind: 'object',
          objectKind: 'commit',
          objectIdentity: compared,
        },
        scope: selectedScope,
      },
      {
        kind: 'revision-to-working-state',
        basis: {
          kind: 'object',
          objectKind: 'commit',
          objectIdentity: compared,
        },
        scope: selectedScope,
      },
      {
        kind: 'revision-to-working-state',
        basis: {
          kind: 'local-ref',
          objectKind: 'commit',
          reference: 'refs/heads/all-forms-compared',
        },
        scope: selectedScope,
      },
      { kind: 'index-to-working-tree', scope: selectedScope },
    ];
    for (const selection of paired) {
      const captured = await opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection,
      });
      expect(captured).toMatchObject({
        status: 'captured',
        manifest: { totalFiles: 1 },
      });
      if (captured.status !== 'captured') continue;
      const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
      expect(files).toHaveLength(1);
      expect(files[0]?.scopeMembership?.[0]).toMatchObject({
        selectionKind: 'directory',
        inclusion: 'ordinary',
        matchedSides: ['old', 'new'],
      });
    }
  }, 30_000);

  it('ignores concurrent out-of-scope mutation but retries selected mutation', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'selected.txt'), 'basis selected\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'basis outside\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'concurrent scope basis');
    const basis = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'selected.txt'), 'selected working\n');
    await writeFile(path.join(checkout, 'outside.txt'), 'outside working\n');
    const opened = await openWorkspace(checkout);
    const selection: ReviewComparisonSelection = {
      kind: 'revision-to-working-state',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: basis },
      scope: scope('selected.txt'),
    };
    let outsideRevision = 0;
    const unrelated = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      afterContentCapture: async () => {
        outsideRevision += 1;
        await writeFile(path.join(checkout, 'outside.txt'), `outside race ${outsideRevision}\n`);
      },
    });
    await expect(
      unrelated.read({
        kind: 'workspace.review-comparison.capture',
        selection,
      }),
    ).resolves.toMatchObject({
      status: 'captured',
      captureAttempts: 1,
    });

    let selectedRevision = 0;
    const relevant = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      limits: { maxCaptureAttempts: 2 },
      afterContentCapture: async () => {
        selectedRevision += 1;
        await writeFile(path.join(checkout, 'selected.txt'), `selected race ${selectedRevision}\n`);
      },
    });
    await expect(
      relevant.read({
        kind: 'workspace.review-comparison.capture',
        selection,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      verification: { reason: 'unstable-workspace' },
    });
  });

  it('rejects malformed and unresolved exact scope shapes without narrowing them', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const entry = (repositoryPath: string) => ({
      pathBytesBase64: Buffer.from(repositoryPath).toString('base64'),
      inclusion: 'ordinary' as const,
    });
    await expect(
      evidence.inspectReviewComparison({
        kind: 'last-commit',
        scope: { kind: 'exact-paths', entries: [entry('same'), entry('same')] },
      }),
    ).rejects.toThrow('Duplicate exact Review file scope path');
    await expect(
      evidence.inspectReviewComparison({
        kind: 'last-commit',
        scope: { kind: 'exact-paths', entries: [entry('Case'), entry('case')] },
      }),
    ).rejects.toThrow('Case-colliding exact Review file scope path');
    await expect(
      evidence.inspectReviewComparison({
        kind: 'last-commit',
        scope: { kind: 'exact-paths', entries: [entry('../outside')] },
      }),
    ).rejects.toThrow('Invalid exact Review file scope path');
    await expect(
      evidence.inspectReviewComparison({
        kind: 'last-commit',
        scope: {
          kind: 'exact-paths',
          entries: Array.from({ length: 65 }, (_, index) => entry(`file-${index}`)),
        },
      }),
    ).rejects.toThrow('Invalid exact Review file scope');
    await expect(
      evidence.inspectReviewComparison({
        kind: 'last-commit',
        scope: scope('missing.txt'),
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'scope-path-not-found',
    });
  });
});
