import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capturedText,
  completeManifest,
  createCheckout,
  git,
  gitWithInput,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { ReviewComparisonSelection } from '@buildframe/workspace/workspace-evidence';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

describe('Change Set scale evidence', () => {
  it('discovers 250,000 tracked paths without eager content and admits the scoped 1,000-file, 50-MiB floor', async () => {
    const { checkout } = await createCheckout({ commit: true });
    // Sanitized generated content: two shared payload buffers whose
    // 1,000 path instances total exactly 50 MiB, one real placeholder
    // blob for the basis side, and one deliberately missing blob oid for
    // the 249,000 stable paths so any eager content materialization
    // during enumeration fails closed.
    const larger = Buffer.alloc(52_429, 0x79);
    const smaller = Buffer.alloc(52_428, 0x78);
    const writeBlob = async (bytes: Buffer): Promise<string> =>
      (await gitWithInput(checkout, ['hash-object', '-w', '--stdin'], bytes)).toString('ascii').trim();
    const payloadLargeOid = await writeBlob(larger);
    const payloadSmallOid = await writeBlob(smaller);
    const missingOid = createHash('sha1').update('blob 8\x00missing\n').digest('hex');
    const treeEntry = (name: string, oid: string, mode = '100644'): Buffer =>
      Buffer.concat([Buffer.from(`${mode} ${name}\0`, 'ascii'), Buffer.from(oid, 'hex')]);
    const writeTree = async (body: Buffer): Promise<string> =>
      (await gitWithInput(checkout, ['hash-object', '-w', '-t', 'tree', '--stdin'], body)).toString('ascii').trim();
    const stableBody = Buffer.concat(
      Array.from({ length: 249_000 }, (_, index) => treeEntry(`file-${String(index).padStart(6, '0')}`, missingOid)),
    );
    const stableTree = await writeTree(stableBody);
    const bulkTreeFor = (oidFor: (index: number) => string): Promise<string> =>
      writeTree(
        Buffer.concat(
          Array.from({ length: 1_000 }, (_, index) =>
            treeEntry(`file-${String(index).padStart(4, '0')}`, oidFor(index)),
          ),
        ),
      );
    // Every basis side is missing on purpose: unchanged stable paths
    // must never be read, and the 1,000 old sides degrade per side while
    // the compared sides still admit the exact 50-MiB floor.
    const basisBulkTree = await bulkTreeFor(() => missingOid);
    const comparedBulkTree = await bulkTreeFor(index => (index < 800 ? payloadLargeOid : payloadSmallOid));
    const rootTreeFor = (bulkTree: string): Promise<string> =>
      writeTree(Buffer.concat([treeEntry('bulk', bulkTree, '40000'), treeEntry('stable', stableTree, '40000')]));
    const basisTree = await rootTreeFor(basisBulkTree);
    const comparedTree = await rootTreeFor(comparedBulkTree);
    const basisCommit = (await git(checkout, 'commit-tree', basisTree, '-m', 'scale basis')).trim();
    const comparedCommit = (
      await git(checkout, 'commit-tree', comparedTree, '-p', basisCommit, '-m', 'scale compared')
    ).trim();
    await rm(path.join(checkout, '.git', 'index'), { force: true });

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const scopeFingerprintOf = (
      endpoint:
        | import('@buildframe/workspace/workspace-evidence').ReviewComparisonBasis
        | import('@buildframe/workspace/workspace-evidence').ReviewComparedState,
    ): string | undefined => (endpoint as { readonly scopeFingerprint?: string }).scopeFingerprint;
    const selection: ReviewComparisonSelection = {
      kind: 'revision-pair',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      compared: {
        kind: 'object',
        objectKind: 'commit',
        objectIdentity: comparedCommit,
      },
    };
    const preview = await evidence.inspectReviewComparison(selection);
    expect(preview).toMatchObject({ status: 'available', totalFiles: 1_000 });
    expect(JSON.stringify(preview).length).toBeLessThan(10_000);

    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection,
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('current');
    expect(captured.manifest.totalFiles).toBe(1_000);
    expect(captured.capturedContentBytes).toBe(50 * 1024 * 1024);
    expect(JSON.stringify(captured).length).toBeLessThan(10_000);
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(1_000);
    expect(
      files.every(
        file =>
          file.oldSide?.contentAvailability === 'unavailable' &&
          file.oldSide?.objectAvailability === 'missing' &&
          file.newSide?.contentAvailability === 'captured' &&
          file.newSide.classification === 'text',
      ),
    ).toBe(true);
    const firstBytes = await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'new');
    expect(firstBytes.length).toBe(52_429);

    const scopedSelection: ReviewComparisonSelection = {
      ...selection,
      scope: {
        kind: 'exact-paths',
        entries: [
          {
            pathBytesBase64: Buffer.from('bulk').toString('base64'),
            inclusion: 'ordinary',
          },
        ],
      },
    };
    const scopedPreview = await evidence.inspectReviewComparison(scopedSelection);
    expect(scopedPreview).toMatchObject({
      status: 'available',
      totalFiles: 1_000,
    });
    const scoped = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: scopedSelection,
    });
    expect(scoped.status).toBe('captured');
    if (scoped.status !== 'captured') return;
    expect(scoped.verification.state).toBe('current');
    expect(scoped.manifest.totalFiles).toBe(1_000);
    expect(scoped.capturedContentBytes).toBe(50 * 1024 * 1024);
    expect(scopeFingerprintOf(scoped.basis)).toMatch(/^[0-9a-f]{64}$/u);
    expect(scopeFingerprintOf(scoped.comparedState)).toMatch(/^[0-9a-f]{64}$/u);
    await expect(evidence.verifyReviewComparison(scoped)).resolves.toBe('current');
    const repeated = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: scopedSelection,
    });
    if (repeated.status !== 'captured') return;
    expect(scopeFingerprintOf(repeated.basis)).toBe(scopeFingerprintOf(scoped.basis));
    expect(scopeFingerprintOf(repeated.comparedState)).toBe(scopeFingerprintOf(scoped.comparedState));
  }, 240_000);
});
