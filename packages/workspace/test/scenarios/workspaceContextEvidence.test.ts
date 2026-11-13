import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { bootstrapWorkspace, type Workspace } from '../../src/index.js';
import type {
  ContextSourceCandidate,
  ContextItemVerdict,
  ContextSourceCaptureItem,
  ContextSourceManifestView,
  ContextSelectionVerifyView,
  ContextSourceSelection,
} from '../../src/contextEvidence.js';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

const execFileAsync = promisify(execFile);
const roots = new Set<string>();
const originalStateHome = process.env.XDG_STATE_HOME;

async function git(checkout: string, ...arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync(await resolveGitExecutable(), arguments_, {
    cwd: checkout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      LANG: 'C',
      LC_ALL: 'C',
    },
  });
  return stdout;
}

async function gitWithInput(checkout: string, arguments_: readonly string[], input: Buffer): Promise<void> {
  const executable = await resolveGitExecutable();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: checkout,
      env: {
        ...process.env,
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr));
    });
    child.stdin.end(input);
  });
}

async function createCheckout(): Promise<{ readonly root: string; readonly checkout: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-context-'));
  roots.add(root);
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  process.env.XDG_STATE_HOME = state;
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Context Test');
  await git(checkout, 'config', 'user.email', 'context@example.invalid');
  await writeFile(path.join(checkout, '.gitignore'), 'ignored.txt\nignored-dir/\n');
  await git(checkout, 'add', '.gitignore');
  await git(checkout, 'commit', '-qm', 'initial');
  return { root, checkout };
}

async function openWorkspace(checkout: string): Promise<Workspace> {
  const opened = await bootstrapWorkspace({ startPath: checkout });
  if (opened.status !== 'ready') {
    throw new Error(`Workspace rejected: ${JSON.stringify(opened.diagnostic)}`);
  }
  return opened.workspace;
}

afterEach(async () => {
  await Promise.all([...roots].map(root => rm(root, { recursive: true, force: true })));
  roots.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
});

async function manifest(
  workspace: Workspace,
  selections: readonly (ContextSourceSelection & { readonly classification?: 'generated' | 'binary' })[],
  offset = 0,
  limit = 64,
): Promise<ContextSourceManifestView> {
  return await workspace.read({ kind: 'workspace.context.manifest', selections, offset, limit });
}

async function allCandidates(
  workspace: Workspace,
  selections: readonly (ContextSourceSelection & { readonly classification?: 'generated' | 'binary' })[],
): Promise<readonly ContextSourceCandidate[]> {
  const collected: ContextSourceCandidate[] = [];
  let offset = 0;
  while (true) {
    const view = await manifest(workspace, selections, offset);
    collected.push(...view.candidates);
    if (view.nextOffset === null) return collected;
    offset = view.nextOffset;
  }
}

function candidateAt(candidates: readonly ContextSourceCandidate[], relative: string): ContextSourceCandidate {
  const found = candidates.find(
    candidate =>
      candidate.pathBytesBase64 !== undefined &&
      Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8') === relative,
  );
  if (found === undefined) throw new Error(`Missing context candidate: ${relative}`);
  return found;
}

function pathsOf(candidates: readonly ContextSourceCandidate[]): readonly string[] {
  return candidates.map(candidate =>
    candidate.pathBytesBase64 === undefined
      ? (candidate.absolutePath ?? '')
      : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8'),
  );
}

describe('bounded Context Locator expansion over explicit selections', () => {
  it('expands complete directory membership over tracked, untracked, ignored, and special content', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'tracked.txt'), 'tracked\n');
    await writeFile(path.join(checkout, 'ignored-as-tracked.txt'), 'tracked despite ignore\n');
    await git(checkout, 'add', 'tracked.txt', 'ignored-as-tracked.txt');
    await git(checkout, 'commit', '-qm', 'tracked content');
    await writeFile(path.join(checkout, '.gitignore'), 'ignored.txt\nignored-as-tracked.txt\nignored-dir/\n');
    await writeFile(path.join(checkout, 'untracked.txt'), 'untracked\n');
    await writeFile(path.join(checkout, 'ignored.txt'), 'ignored untracked\n');
    await mkdir(path.join(checkout, 'nested', 'deep'), { recursive: true });
    await writeFile(path.join(checkout, 'nested', 'tracked-deep.txt'), 'deep tracked\n');
    await writeFile(path.join(checkout, 'nested', 'deep', 'untracked-deep.txt'), 'deep untracked\n');
    await git(checkout, 'add', 'nested/tracked-deep.txt');
    await git(checkout, 'commit', '-qm', 'nested tracked');
    await mkdir(path.join(checkout, 'ignored-dir'), { recursive: true });
    await writeFile(path.join(checkout, 'ignored-dir', 'inside.txt'), 'ignored inside\n');
    await symlink('tracked.txt', path.join(checkout, 'link.txt'));
    await symlink('nested', path.join(checkout, 'dir-link'));
    await symlink(path.join(checkout, '..', 'outside-target.txt'), path.join(checkout, 'escape-link'));
    await execFileAsync('mkfifo', [path.join(checkout, 'special.pipe')]);
    const workspace = await openWorkspace(checkout);

    const view = await manifest(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }]);
    expect(view.kind).toBe('workspace.context.manifest');
    expect(view.status).toBe('complete');
    expect(view.limits.formatVersion).toBe(1);

    const candidates = await allCandidates(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }]);
    const paths = pathsOf(candidates);
    expect(paths).toContain('.gitignore');
    // Ignored untracked content is excluded by default; tracked content stays eligible.
    expect(paths).toContain('ignored-as-tracked.txt');
    expect(paths).not.toContain('ignored.txt');
    expect(paths).not.toContain('ignored-dir/inside.txt');
    expect(paths).toContain('tracked.txt');
    expect(paths).toContain('untracked.txt');
    expect(paths).toContain('nested/tracked-deep.txt');
    expect(paths).toContain('nested/deep/untracked-deep.txt');
    // Symlinks are candidates and were never dereferenced or followed.
    expect(paths).toContain('link.txt');
    expect(paths).toContain('dir-link');
    expect(paths).toContain('escape-link');
    expect(paths).not.toContain('outside-target.txt');
    expect(paths).toContain('special.pipe');
    const tracked = candidateAt(candidates, 'tracked.txt');
    expect(tracked.eligibility).toBe('tracked');
    expect(tracked.gitMode).toBe('100644');
    expect(tracked.contentIdentity).toMatch(/^[0-9a-f]{40}$/);
    expect(tracked.availability).toBe('available');
    expect(tracked.size).toBe(8);
    expect(tracked.sensitive).toBe(false);
    const untracked = candidateAt(candidates, 'untracked.txt');
    expect(untracked.eligibility).toBe('untracked');
    expect(untracked.contentIdentity).toBeUndefined();
    expect(untracked.size).toBe(10);
    const trackedIgnored = candidateAt(candidates, 'ignored-as-tracked.txt');
    expect(trackedIgnored.eligibility).toBe('tracked');
    expect(trackedIgnored.sensitive).toBe(false);
    const link = candidateAt(candidates, 'link.txt');
    expect(link.sourceKind).toBe('symlink');
    expect(link.availability).toBe('available');
    expect(link.size).toBe(Buffer.byteLength('tracked.txt'));
    const dirLink = candidateAt(candidates, 'dir-link');
    expect(dirLink.sourceKind).toBe('symlink');
    expect(paths.filter(candidate => candidate.startsWith('nested/')).length).toBe(2);
    const special = candidateAt(candidates, 'special.pipe');
    expect(special.sourceKind).toBe('special');
    expect(special.availability).toBe('unavailable');
    expect(special.absenceReason).toBe('special-entry');
    // Stable lossless byte order within one expansion.
    expect([...paths]).toEqual(
      paths.slice().sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))),
    );
  });

  it('keeps additions, deletions, and windows exact across re-inspection', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'kept.txt'), 'kept\n');
    await git(checkout, 'add', 'kept.txt');
    await git(checkout, 'commit', '-qm', 'kept');
    const workspace = await openWorkspace(checkout);
    const selections = [{ kind: 'workspace-directory', pathBytesBase64: '' }] as const;
    const before = await allCandidates(workspace, selections);
    expect(pathsOf(before)).toEqual(['.gitignore', 'kept.txt']);

    await writeFile(path.join(checkout, 'added.txt'), 'added\n');
    const afterAddition = await allCandidates(workspace, selections);
    expect(pathsOf(afterAddition)).toEqual(['.gitignore', 'added.txt', 'kept.txt']);

    await rm(path.join(checkout, 'added.txt'));
    const afterRemoval = await allCandidates(workspace, selections);
    expect(pathsOf(afterRemoval)).toEqual(['.gitignore', 'kept.txt']);

    const firstPage = await manifest(workspace, selections, 0, 1);
    expect(firstPage.candidates).toHaveLength(1);
    expect(firstPage.nextOffset).toBe(1);
    expect(firstPage.totalCandidates).toBe(2);
    const beyond = await manifest(workspace, selections, 2, 1);
    expect(beyond.candidates).toEqual([]);
    expect(beyond.nextOffset).toBeNull();
  });

  it('admits explicit ignored and outside-checkout selections as bounded sensitive sources', async () => {
    const { root, checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'ignored.txt'), 'secret-ish\n');
    await mkdir(path.join(checkout, 'ignored-dir'), { recursive: true });
    await writeFile(path.join(checkout, 'ignored-dir', 'inside.txt'), 'inside ignored\n');
    await writeFile(path.join(checkout, 'kept-tracked.txt'), 'tracked\n');
    await git(checkout, 'add', 'kept-tracked.txt');
    await git(checkout, 'commit', '-qm', 'tracked');
    const outsideFile = path.join(root, 'outside.txt');
    await writeFile(outsideFile, 'outside\n');
    const outsideDir = path.join(root, 'outside-dir');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, 'a.txt'), 'a\n');
    await writeFile(path.join(outsideDir, 'b.txt'), 'b\n');
    await symlink('.git', path.join(outsideDir, 'repo-link'));
    const workspace = await openWorkspace(checkout);

    const ignored = await allCandidates(workspace, [
      { kind: 'workspace-ignored', pathBytesBase64: Buffer.from('ignored-dir').toString('base64') },
    ]);
    const ignoredPaths = pathsOf(ignored);
    expect(ignoredPaths).toEqual(['ignored-dir/inside.txt']);
    expect(ignored[0]?.sensitive).toBe(true);
    expect(ignored[0]?.eligibility).toBe('ignored-explicit');

    const singleIgnored = await allCandidates(workspace, [
      { kind: 'workspace-file', pathBytesBase64: Buffer.from('ignored.txt').toString('base64') },
    ]);
    expect(singleIgnored[0]?.eligibility).toBe('ignored-explicit');
    expect(singleIgnored[0]?.sensitive).toBe(true);

    const outside = await allCandidates(workspace, [
      { kind: 'outside-checkout', form: 'file', absolutePath: outsideFile },
      { kind: 'outside-checkout', form: 'directory', absolutePath: outsideDir },
    ]);
    const outsidePaths = pathsOf(outside);
    expect(outsidePaths).toEqual([
      path.join(outsideDir, 'a.txt'),
      path.join(outsideDir, 'b.txt'),
      path.join(outsideDir, 'repo-link'),
      outsideFile,
    ]);
    expect(outside.every(candidate => candidate.sensitive)).toBe(true);
    expect(outside.every(candidate => candidate.eligibility === 'outside-checkout')).toBe(true);
    expect(outside.every(candidate => candidate.contentIdentity === undefined)).toBe(true);
    const nestedLink = outside.find(candidate => candidate.absolutePath?.endsWith('repo-link'));
    expect(nestedLink?.sourceKind).toBe('symlink');
  });

  it('records gitlink, skip-worktree, unmerged, and missing facts without leaving the checkout', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'base.txt'), 'base\n');
    await git(checkout, 'add', 'base.txt');
    await git(checkout, 'commit', '-qm', 'base');
    const nestedOid = '0123456789012345678901234567890123456789';
    await mkdir(path.join(checkout, 'sub'), { recursive: true });
    await git(checkout, 'update-index', '--add', '--cacheinfo', `160000,${nestedOid},sub`);
    const sparseOid = (await git(checkout, 'hash-object', '-w', 'base.txt')).trim();
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${sparseOid},sparse.txt`);
    await git(checkout, 'update-index', '--skip-worktree', 'sparse.txt');
    const oursOid = (await git(checkout, 'rev-parse', 'HEAD:base.txt')).trim();
    await gitWithInput(
      checkout,
      ['update-index', '-z', '--index-info'],
      Buffer.from(
        `0 0000000000000000000000000000000000000000\tconflict.txt\0` +
          `100644 ${oursOid} 2\tconflict.txt\0` +
          `100644 ${nestedOid} 3\tconflict.txt\0`,
        'utf8',
      ),
    );
    await writeFile(path.join(checkout, 'vanish.txt'), 'vanish\n');
    const vanishOid = (await git(checkout, 'hash-object', '-w', 'vanish.txt')).trim();
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${vanishOid},vanish.txt`);
    await rm(path.join(checkout, 'vanish.txt'));
    const workspace = await openWorkspace(checkout);

    const candidates = await allCandidates(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }]);
    const gitlink = candidateAt(candidates, 'sub');
    expect(gitlink.sourceKind).toBe('gitlink');
    expect(gitlink.gitMode).toBe('160000');
    expect(gitlink.contentIdentity).toBe(nestedOid);
    expect(gitlink.availability).toBe('unavailable');
    expect(gitlink.absenceReason).toBe('gitlink');
    const sparse = candidateAt(candidates, 'sparse.txt');
    expect(sparse.availability).toBe('working-missing');
    expect(sparse.absenceReason).toBe('skip-worktree');
    const conflict = candidateAt(candidates, 'conflict.txt');
    expect(conflict.availability).toBe('unavailable');
    expect(conflict.absenceReason).toBe('index-unmerged');
    const missing = candidateAt(candidates, 'vanish.txt');
    expect(missing.availability).toBe('working-missing');
    expect(missing.absenceReason).toBe('missing-working-file');
    expect(pathsOf(candidates)).not.toContain('sub/anything');
  });

  it('rejects malformed intent with closed diagnostics and honors selection classification', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'generated.txt'), 'generated\n');
    const workspace = await openWorkspace(checkout);
    await expect(
      manifest(workspace, [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('.git/config').toString('base64') }]),
    ).rejects.toThrow(TypeError);
    await expect(
      manifest(workspace, [{ kind: 'outside-checkout', form: 'file', absolutePath: 'relative/path' }]),
    ).rejects.toThrow(TypeError);
    await expect(
      manifest(workspace, [{ kind: 'workspace-nonsense', pathBytesBase64: '' }] as unknown as ContextSourceSelection[]),
    ).rejects.toThrow(TypeError);
    await expect(manifest(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }], 0, 65)).rejects.toThrow(
      TypeError,
    );
    const tooMany = Array.from({ length: 65 }, () => ({
      kind: 'workspace-file',
      pathBytesBase64: Buffer.from('a').toString('base64'),
    })) as unknown as ContextSourceSelection[];
    await expect(manifest(workspace, tooMany)).rejects.toThrow(TypeError);

    const view = await manifest(workspace, [
      {
        kind: 'workspace-file',
        pathBytesBase64: Buffer.from('generated.txt').toString('base64'),
        classification: 'generated',
      },
    ]);
    expect(view.status).toBe('complete');
    expect(view.selections[0]?.classification).toBe('generated');
    expect(view.candidates[0]?.classification).toBe('generated');
    expect(view.limits.formatVersion).toBe(1);
  });
});

describe('immutable exact context capture', () => {
  it('captures beside real nested repositories and keeps an ignored one ignored', async () => {
    const { checkout } = await createCheckout();
    // Real repositories, not bare `.git` directories: Git lists each as one `dir/` entry.
    for (const nested of ['ignored-dir/old-worktree', 'loose-repository']) {
      await mkdir(path.join(checkout, nested), { recursive: true });
      await git(path.join(checkout, nested), 'init', '-q');
      await writeFile(path.join(checkout, nested, 'inside.txt'), 'inside\n');
    }
    await writeFile(path.join(checkout, 'notes.txt'), 'line one\n');
    const workspace = await openWorkspace(checkout);

    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('notes.txt').toString('base64') }],
    });
    expect(captured.status).toBe('ready');
    if (captured.status !== 'ready') throw new Error('unreachable');
    expect(captured.items).toHaveLength(1);
    expect(captured.items[0]).toMatchObject({ status: 'captured', eligibility: 'untracked', sensitive: false });
    const verified = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(verified).toMatchObject({ status: 'settled', verdicts: [{ currency: 'current' }] });

    const candidates = await allCandidates(workspace, [
      {
        kind: 'workspace-file',
        pathBytesBase64: Buffer.from('ignored-dir/old-worktree/inside.txt').toString('base64'),
      },
      { kind: 'workspace-directory', pathBytesBase64: '' },
    ]);
    // A file named inside an ignored nested repository is ignored content, not ordinary untracked.
    expect(candidateAt(candidates, 'ignored-dir/old-worktree/inside.txt')).toMatchObject({
      eligibility: 'ignored-explicit',
      sensitive: true,
    });
    expect(candidateAt(candidates, 'loose-repository')).toMatchObject({ sourceKind: 'nested-repository' });
    expect(pathsOf(candidates)).not.toContain('loose-repository/inside.txt');
  });

  it('captures byte-exact content with digests, raw symlink targets, and per-item degradation', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'text.txt'), 'exact text\n');
    const binary = Buffer.from([0x00, 0xff, 0xfe, 0x07, 0x80]);
    await writeFile(path.join(checkout, 'binary.bin'), binary);
    await writeFile(path.join(checkout, 'target.txt'), 'target bytes\n');
    await symlink('target.txt', path.join(checkout, 'link.txt'));
    await writeFile(path.join(checkout, 'tracked.txt'), 'tracked\n');
    await git(checkout, 'add', 'tracked.txt');
    await git(checkout, 'commit', '-qm', 'tracked');
    await rm(path.join(checkout, 'gone.txt'), { force: true });
    const goneOid = (await git(checkout, 'hash-object', '-w', 'tracked.txt')).trim();
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${goneOid},gone.txt`);
    await git(checkout, 'update-index', '--skip-worktree', 'gone.txt');
    const nestedOid = '0123456789012345678901234567890123456789';
    await git(checkout, 'update-index', '--add', '--cacheinfo', `160000,${nestedOid},sub`);
    await execFileAsync('mkfifo', [path.join(checkout, 'special.pipe')]);
    const workspace = await openWorkspace(checkout);

    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(captured.kind).toBe('workspace.context.capture');
    expect(captured.status).toBe('ready');
    if (captured.status !== 'ready') throw new Error('unreachable');
    expect(captured.captureIdentity).toMatch(/^cctx_[0-9a-f-]{36}$/);
    const itemAt = (relative: string): ContextSourceCaptureItem => {
      const found = captured.items.find(
        item =>
          item.pathBytesBase64 !== undefined &&
          Buffer.from(item.pathBytesBase64, 'base64').toString('utf8') === relative,
      );
      if (found === undefined) throw new Error(`Missing capture item: ${relative}`);
      return found;
    };
    const text = itemAt('text.txt');
    expect(text.status).toBe('captured');
    expect(text.byteLength).toBe(11);
    expect(text.contentDigest).toBe(createHash('sha256').update('exact text\n').digest('hex'));
    const binaryItem = itemAt('binary.bin');
    expect(binaryItem.status).toBe('captured');
    expect(binaryItem.contentDigest).toBe(createHash('sha256').update(binary).digest('hex'));
    const link = itemAt('link.txt');
    expect(link.status).toBe('captured');
    expect(link.byteLength).toBe(Buffer.byteLength('target.txt'));
    expect(link.contentDigest).toBe(createHash('sha256').update('target.txt').digest('hex'));
    const tracked = itemAt('tracked.txt');
    expect(tracked.sourceIdentity).toMatch(/^[0-9a-f]{40}$/);
    expect(itemAt('gone.txt')).toMatchObject({ status: 'unavailable', reason: 'skip-worktree' });
    expect(itemAt('sub')).toMatchObject({ status: 'unavailable', reason: 'gitlink' });
    expect(itemAt('special.pipe')).toMatchObject({ status: 'unavailable', reason: 'special-entry' });
    expect(itemAt('.gitignore').status).toBe('captured');

    const content = await workspace.read({
      kind: 'workspace.context.content',
      captureIdentity: captured.captureIdentity,
      pathBytesBase64: Buffer.from('text.txt').toString('base64'),
      offset: 6,
      length: 4,
    });
    expect(content.status).toBe('available');
    if (content.status !== 'available') throw new Error('unreachable');
    expect(content.byteLength).toBe(4);
    expect(content.totalByteLength).toBe(11);
    expect(Buffer.from(content.bytesBase64, 'base64').toString('utf8')).toBe('text');

    const range = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('text.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 6, length: 4 },
        },
      ],
    });
    expect(range.status).toBe('ready');
    if (range.status !== 'ready') throw new Error('unreachable');
    expect(range.items[0]).toMatchObject({ status: 'captured', byteLength: 4 });

    await expect(
      workspace.read({
        kind: 'workspace.context.content',
        captureIdentity: 'cctx_00000000-0000-0000-0000-000000000000',
        pathBytesBase64: Buffer.from('text.txt').toString('base64'),
        offset: 0,
        length: 1,
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'capture-not-retained' });
    await expect(
      workspace.read({
        kind: 'workspace.context.content',
        captureIdentity: captured.captureIdentity,
        pathBytesBase64: Buffer.from('absent.txt').toString('base64'),
        offset: 0,
        length: 1,
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'candidate-not-captured' });
  });

  it('degrades oversized items per item and never rewrites a retained capture', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'small.txt'), 'small\n');
    await writeFile(path.join(checkout, 'large.txt'), 'x'.repeat(64));
    const workspace = await openWorkspace(checkout);
    const direct = new WorkspaceEvidence({
      workspaceIdentity: (await workspace.read({ kind: 'workspace.identity' })).workspaceIdentity,
      canonicalCheckout: checkout,
      limits: { maxCapturedFileBytes: 32, maxCapturedContentBytes: 40 },
    });
    const first = await direct.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') throw new Error('unreachable');
    const items = new Map(
      first.items.map(item => [
        item.pathBytesBase64 === undefined ? '' : Buffer.from(item.pathBytesBase64, 'base64').toString('utf8'),
        item,
      ]),
    );
    expect(items.get('.gitignore')).toMatchObject({ status: 'captured' });
    expect(items.get('small.txt')).toMatchObject({ status: 'captured', byteLength: 6 });
    expect(items.get('large.txt')).toMatchObject({ status: 'over-limit', reason: 'file-limit', byteLength: 64 });

    const second = await direct.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') throw new Error('unreachable');
    expect(second.captureIdentity).not.toBe(first.captureIdentity);
    const third = await direct.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(third.status).toBe('ready');
    const evicted = await direct.read({
      kind: 'workspace.context.content',
      captureIdentity: first.captureIdentity,
      pathBytesBase64: Buffer.from('small.txt').toString('base64'),
      offset: 0,
      length: 6,
    });
    expect(evicted).toMatchObject({ status: 'unavailable', reason: 'capture-not-retained' });
  });

  it('retries relevant movement within bounded attempts and fails closed', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'moving.txt'), 'first\n');
    const workspace = await openWorkspace(checkout);
    const identity = (await workspace.read({ kind: 'workspace.identity' })).workspaceIdentity;
    let mutations = 0;
    const retrying = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      afterContextContent: attempt => {
        if (attempt === 1) {
          mutations += 1;
          void writeFile(path.join(checkout, 'moving.txt'), 'second\n').catch(() => undefined);
        }
      },
    });
    const moved = await retrying.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('moving.txt').toString('base64') }],
    });
    expect(mutations).toBe(1);
    expect(moved.status).toBe('ready');
    if (moved.status !== 'ready') throw new Error('unreachable');
    const movedItem = moved.items[0];
    if (movedItem?.status !== 'captured') throw new Error('expected captured movement result');
    const bytes = await retrying.read({
      kind: 'workspace.context.content',
      captureIdentity: moved.captureIdentity,
      pathBytesBase64: Buffer.from('moving.txt').toString('base64'),
      offset: 0,
      length: 7,
    });
    expect(bytes.status).toBe('available');
    if (bytes.status !== 'available') throw new Error('unreachable');
    expect(bytes.bytesBase64).toBe(Buffer.from('second\n').toString('base64'));

    let flip = false;
    const unstable = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      limits: { maxCaptureAttempts: 2 },
      afterContextContent: () => {
        flip = !flip;
        void writeFile(path.join(checkout, 'moving.txt'), flip ? 'a\n' : 'bb\n').catch(() => undefined);
      },
    });
    await expect(
      unstable.read({
        kind: 'workspace.context.capture',
        selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('moving.txt').toString('base64') }],
      }),
    ).resolves.toMatchObject({
      kind: 'workspace.context.capture',
      status: 'unavailable',
      reason: 'unstable-workspace',
    });
  });
});

describe('overlap normalization without erasing provenance', () => {
  it('unions overlapping ranges, subsumes ranges under whole captures, and keeps origins', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'wide.txt'), '0123456789');
    await writeFile(path.join(checkout, 'twin-a.txt'), 'same\n');
    await writeFile(path.join(checkout, 'twin-b.txt'), 'same\n');
    const workspace = await openWorkspace(checkout);

    const union = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 2, length: 4 },
        },
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 6, length: 4 },
        },
      ],
    });
    expect(union.status).toBe('ready');
    if (union.status !== 'ready') throw new Error('unreachable');
    expect(union.items[0]?.status).toBe('captured');
    expect(union.items[0]?.origins).toEqual([0, 1]);
    const resolution = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: union.captureIdentity,
    });
    expect(resolution.kind).toBe('workspace.context.resolution');
    expect(resolution.occurrences).toHaveLength(1);
    expect(resolution.occurrences[0]).toMatchObject({
      origins: [0, 1],
      scope: {
        kind: 'bytes',
        intervals: [{ kind: 'bytes', offset: 2, length: 8 }],
      },
      byteLength: 8,
    });
    expect(resolution.groups[0]?.origin).toBe(0);
    expect(resolution.groups[1]?.origin).toBe(1);
    expect(resolution.conflicts).toEqual([]);
    const segment = await workspace.read({
      kind: 'workspace.context.content',
      captureIdentity: union.captureIdentity,
      pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
      scope: { kind: 'bytes', offset: 6, length: 4 },
      offset: 0,
      length: 4,
    });
    expect(segment.status).toBe('available');
    if (segment.status !== 'available') throw new Error('unreachable');
    expect(Buffer.from(segment.bytesBase64, 'base64').toString('utf8')).toBe('6789');

    const disjoint = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 0, length: 2 },
        },
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 8, length: 2 },
        },
      ],
    });
    expect(disjoint.status).toBe('ready');
    if (disjoint.status !== 'ready') throw new Error('unreachable');
    const disjointResolution = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: disjoint.captureIdentity,
    });
    expect(disjointResolution.occurrences[0]).toMatchObject({
      origins: [0, 1],
      scope: {
        kind: 'bytes',
        intervals: [
          { kind: 'bytes', offset: 0, length: 2 },
          { kind: 'bytes', offset: 8, length: 2 },
        ],
      },
      byteLength: 4,
    });

    const wholePlusRange = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [
        { kind: 'workspace-file', pathBytesBase64: Buffer.from('wide.txt').toString('base64') },
        {
          kind: 'workspace-file',
          pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
          scope: { kind: 'bytes', offset: 0, length: 2 },
        },
      ],
    });
    expect(wholePlusRange.status).toBe('ready');
    if (wholePlusRange.status !== 'ready') throw new Error('unreachable');
    const wholeResolution = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: wholePlusRange.captureIdentity,
    });
    expect(wholeResolution.occurrences[0]).toMatchObject({
      origins: [0, 1],
      scope: { kind: 'whole' },
      byteLength: 10,
    });
    const wholeWindow = await workspace.read({
      kind: 'workspace.context.content',
      captureIdentity: wholePlusRange.captureIdentity,
      pathBytesBase64: Buffer.from('wide.txt').toString('base64'),
      offset: 0,
      length: 10,
    });
    expect(wholeWindow.status).toBe('available');
    if (wholeWindow.status !== 'available') throw new Error('unreachable');
    expect(Buffer.from(wholeWindow.bytesBase64, 'base64').toString('utf8')).toBe('0123456789');
  });

  it('never merges equal bytes across distinct occurrences and keeps stable ordering', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'twin-a.txt'), 'same\n');
    await writeFile(path.join(checkout, 'twin-b.txt'), 'same\n');
    await writeFile(path.join(checkout, 'zzz.txt'), 'z\n');
    const workspace = await openWorkspace(checkout);
    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [
        { kind: 'workspace-file', pathBytesBase64: Buffer.from('twin-b.txt').toString('base64') },
        { kind: 'workspace-file', pathBytesBase64: Buffer.from('twin-a.txt').toString('base64') },
        { kind: 'workspace-file', pathBytesBase64: Buffer.from('zzz.txt').toString('base64') },
      ],
    });
    expect(captured.status).toBe('ready');
    if (captured.status !== 'ready') throw new Error('unreachable');
    expect(captured.items).toHaveLength(3);
    const resolution = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: captured.captureIdentity,
    });
    expect(resolution.occurrences).toHaveLength(3);
    expect(resolution.occurrences.map(occurrence => occurrence.pathBytesBase64)).toEqual([
      Buffer.from('twin-a.txt').toString('base64'),
      Buffer.from('twin-b.txt').toString('base64'),
      Buffer.from('zzz.txt').toString('base64'),
    ]);
    expect(resolution.groups.map(group => group.origin)).toEqual([0, 1, 2]);
    expect(resolution.groups[0]).toMatchObject({
      selection: { kind: 'workspace-file', pathBytesBase64: Buffer.from('twin-b.txt').toString('base64') },
      occurrencePaths: ['twin-b.txt'],
    });
    const repeated = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: captured.captureIdentity,
    });
    expect(repeated).toEqual(resolution);
  });
});

describe('coherent context revalidation', () => {
  it('derives exact per-item currency with bounded retry and fails closed on instability', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'same-size.txt'), 'aaaa\\n');
    await writeFile(path.join(checkout, 'tracked.txt'), 'tracked\\n');
    await writeFile(path.join(checkout, 'removable.txt'), 'remove\\n');
    await writeFile(path.join(checkout, 'growable.txt'), 'small\\n');
    await git(checkout, 'add', 'tracked.txt');
    await git(checkout, 'commit', '-qm', 'tracked');
    const workspace = await openWorkspace(checkout);
    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(captured.status).toBe('ready');
    if (captured.status !== 'ready') throw new Error('unreachable');
    const verdictAt = (view: ContextSelectionVerifyView, relative: string): ContextItemVerdict => {
      const found = view.verdicts.find(
        verdict =>
          verdict.pathBytesBase64 !== undefined &&
          Buffer.from(verdict.pathBytesBase64, 'base64').toString('utf8') === relative,
      );
      if (found === undefined) throw new Error(`Missing verdict: ${relative}`);
      return found;
    };
    const settled = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(settled.status).toBe('settled');
    expect(verdictAt(settled, 'same-size.txt').currency).toBe('current');
    expect(verdictAt(settled, 'tracked.txt').currency).toBe('current');
    const repeat = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(repeat).toEqual(settled);

    // Equal-size content change is detected by digest comparison, never timestamps.
    await writeFile(path.join(checkout, 'same-size.txt'), 'bbbb\\n');
    await writeFile(path.join(checkout, 'tracked.txt'), 'edited\\n');
    const changed = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(changed.status).toBe('settled');
    expect(verdictAt(changed, 'same-size.txt')).toMatchObject({ currency: 'changed', byteLength: 6 });
    expect(verdictAt(changed, 'tracked.txt')).toMatchObject({ currency: 'changed', byteLength: 8 });

    // Missing, special, and over-limit movement each carry their exact currency.
    await rm(path.join(checkout, 'removable.txt'));
    await rm(path.join(checkout, 'growable.txt'));
    await execFileAsync('mkfifo', [path.join(checkout, 'growable.txt')]);
    const moved = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(moved.status).toBe('settled');
    expect(verdictAt(moved, 'removable.txt').currency).toBe('missing');
    expect(verdictAt(moved, 'growable.txt')).toMatchObject({ currency: 'unavailable', reason: 'special-entry' });

    const growing = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('tracked.txt').toString('base64') }],
    });
    expect(growing.status).toBe('ready');
    if (growing.status !== 'ready') throw new Error('unreachable');
    const identity = (await workspace.read({ kind: 'workspace.identity' })).workspaceIdentity;
    await writeFile(path.join(checkout, 'tracked.txt'), 'x'.repeat(17));
    const oversized = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      limits: { maxCapturedFileBytes: 16, maxVerifiedFileBytes: 32 },
    });
    const oversizedCapture = await oversized.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('tracked.txt').toString('base64') }],
    });
    expect(oversizedCapture).toMatchObject({
      kind: 'workspace.context.capture',
      status: 'ready',
      items: [{ status: 'over-limit', reason: 'file-limit', byteLength: 17 }],
    });
    const direct = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      limits: { maxCapturedFileBytes: 16, maxVerifiedFileBytes: 32 },
    });
    const baseline = await direct.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('same-size.txt').toString('base64') }],
    });
    expect(baseline.status).toBe('ready');
    await writeFile(path.join(checkout, 'same-size.txt'), 'x'.repeat(20));
    const overLimit = await direct.read({
      kind: 'workspace.context.verify',
      captureIdentity: (baseline as { status: 'ready'; captureIdentity: string }).captureIdentity,
    });
    expect(overLimit.status).toBe('settled');
    expect(overLimit.verdicts[0]).toMatchObject({ currency: 'over-limit', byteLength: 20 });

    // A single-derivation budget can never prove stability and fails closed.
    const hasty = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      limits: { maxCaptureAttempts: 1 },
    });
    const settledCapture = await hasty.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-file', pathBytesBase64: Buffer.from('tracked.txt').toString('base64') }],
    });
    expect(settledCapture.status).toBe('ready');
    await expect(
      hasty.read({
        kind: 'workspace.context.verify',
        captureIdentity: (settledCapture as { status: 'ready'; captureIdentity: string }).captureIdentity,
      }),
    ).resolves.toMatchObject({ kind: 'workspace.context.verify', status: 'unstable', reason: 'unstable-workspace' });
  });

  it('blocks on unknown scope instead of publishing partial verdicts', async () => {
    const { checkout } = await createCheckout();
    await mkdir(path.join(checkout, 'sealed'), { recursive: true });
    await writeFile(path.join(checkout, 'open.txt'), 'open\\n');
    await writeFile(path.join(checkout, 'sealed', 'hidden.txt'), 'hidden\\n');
    await chmod(path.join(checkout, 'sealed'), 0o000);
    const workspace = await openWorkspace(checkout);
    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(captured).toMatchObject({ kind: 'workspace.context.capture', status: 'unavailable' });
    await chmod(path.join(checkout, 'sealed'), 0o755);
    const recovered = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(recovered.status).toBe('ready');
    if (recovered.status !== 'ready') throw new Error('unreachable');
    await chmod(path.join(checkout, 'sealed'), 0o000);
    try {
      await expect(
        workspace.read({
          kind: 'workspace.context.verify',
          captureIdentity: recovered.captureIdentity,
        }),
      ).resolves.toMatchObject({
        kind: 'workspace.context.verify',
        status: 'unverifiable',
        reason: 'traversal-failed',
      });
    } finally {
      await chmod(path.join(checkout, 'sealed'), 0o755);
    }
  });
});

describe('versioned context matrix and scale limits', () => {
  it('proves every eligibility and degradation class with lossless special-path evidence', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'Alpha.txt'), 'alpha one\n');
    await git(checkout, 'add', 'Alpha.txt');
    const blobOid = (await git(checkout, 'hash-object', '-w', 'Alpha.txt')).trim();
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${blobOid},alpha.txt`);
    const rawName = Buffer.from([0x62, 0x79, 0x74, 0x65, 0xf3, 0x2e, 0x74, 0x78, 0x74]);
    await gitWithInput(
      checkout,
      ['update-index', '-z', '--index-info'],
      Buffer.concat([Buffer.from(`100644 ${blobOid} 0\t`), rawName, Buffer.from([0])]),
    );
    await writeFile(path.join(checkout, 'binary.bin'), Buffer.from([0x00, 0xff, 0x80, 0x7f]));
    await git(checkout, 'add', 'binary.bin');
    await git(checkout, 'commit', '-qm', 'special paths');
    await writeFile(path.join(checkout, 'tracked-ignored.txt'), 'tracked despite ignore\n');
    await git(checkout, 'add', 'tracked-ignored.txt');
    await git(checkout, 'commit', '-qm', 'tracked ignored');
    await writeFile(path.join(checkout, '.gitignore'), 'ignored-dir/\ntracked-ignored.txt\nignored-untracked.txt\n');
    await writeFile(path.join(checkout, 'ignored-untracked.txt'), 'ignored untracked\n');
    await mkdir(path.join(checkout, 'ignored-dir'), { recursive: true });
    await writeFile(path.join(checkout, 'ignored-dir', 'inside.txt'), 'inside\n');
    await mkdir(path.join(checkout, 'nested'), { recursive: true });
    await mkdir(path.join(checkout, 'nested', '.git'), { recursive: true });
    await symlink(path.join(checkout, '..', 'escape-target'), path.join(checkout, 'escape-link'));
    const outsideRoot = path.join(checkout, '..', 'matrix-outside');
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(path.join(outsideRoot, 'file.txt'), 'outside\n');
    await symlink(outsideRoot, path.join(checkout, '..', 'outside-link'));
    const workspace = await openWorkspace(checkout);

    const candidates = await allCandidates(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }]);
    const byRelative = new Map(
      candidates
        .filter(candidate => candidate.pathBytesBase64 !== undefined)
        .map(candidate => [Buffer.from(candidate.pathBytesBase64!, 'base64').toString('utf8'), candidate]),
    );
    // Case-distinct index paths stay distinct and lossless. A case-insensitive
    // host case-folds the colliding working file onto both names; a
    // case-sensitive host has no working file for the lower-case index entry.
    // The non-UTF-8 name cannot materialize on either host.
    const upper = byRelative.get('Alpha.txt');
    const lower = byRelative.get('alpha.txt');
    expect(upper).toBeDefined();
    expect(lower).toBeDefined();
    expect(upper!.pathBytesBase64).not.toBe(lower!.pathBytesBase64);
    expect(upper).toMatchObject({ eligibility: 'tracked', availability: 'available' });
    const lowerWorkingFileExists = await stat(path.join(checkout, 'alpha.txt')).then(
      () => true,
      () => false,
    );
    expect(lower).toMatchObject({
      eligibility: 'tracked',
      availability: lowerWorkingFileExists ? 'available' : 'working-missing',
    });
    // Non-UTF-8 raw path bytes survive from the index without host materialization.
    const rawCandidate = candidates.find(
      candidate =>
        candidate.pathBytesBase64 !== undefined && Buffer.from(candidate.pathBytesBase64!, 'base64').equals(rawName),
    );
    expect(rawCandidate).toBeDefined();
    expect(rawCandidate).toMatchObject({ eligibility: 'tracked', availability: 'working-missing' });
    // Tracked-ignored stays eligible; ignored untracked stays excluded by default.
    expect(byRelative.get('tracked-ignored.txt')).toMatchObject({ eligibility: 'tracked', sensitive: false });
    expect(byRelative.get('ignored-untracked.txt')).toBeUndefined();
    expect(byRelative.get('binary.bin')).toMatchObject({ eligibility: 'tracked', availability: 'available' });
    // A nested repository appears without recursion; an escaping symlink is never followed.
    expect(byRelative.get('nested')).toMatchObject({
      sourceKind: 'nested-repository',
      absenceReason: 'nested-repository',
    });
    expect(byRelative.get('escape-link')).toMatchObject({ sourceKind: 'symlink', availability: 'available' });
    expect(pathsOf(candidates)).not.toContain('escape-target');

    // An explicit outside-checkout selection through a symlink root stays unfollowed.
    const outside = await allCandidates(workspace, [
      { kind: 'outside-checkout', form: 'directory', absolutePath: path.join(checkout, '..', 'outside-link') },
    ]);
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatchObject({ sourceKind: 'symlink', sensitive: true, eligibility: 'outside-checkout' });

    // Re-inspection with an unreadable subtree reports explicit incompleteness.
    await mkdir(path.join(checkout, 'sealed'), { recursive: true });
    await writeFile(path.join(checkout, 'sealed', 'hidden.txt'), 'hidden\n');
    await chmod(path.join(checkout, 'sealed'), 0o000);
    try {
      const incomplete = await manifest(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }]);
      expect(incomplete).toMatchObject({ status: 'incomplete', incompleteReason: 'traversal-failed' });
      expect(incomplete.totalCandidates).toBeGreaterThan(0);
    } finally {
      await chmod(path.join(checkout, 'sealed'), 0o755);
    }
  });

  it('proves progressive complete membership and named limits at depth and breadth', async () => {
    const { checkout } = await createCheckout();
    let level = checkout;
    for (let depth = 0; depth < 40; depth += 1) {
      level = path.join(level, `d${depth}`);
    }
    await mkdir(level, { recursive: true });
    let deep = checkout;
    for (let depth = 0; depth < 40; depth += 1) {
      deep = path.join(deep, `d${depth}`);
      await writeFile(path.join(deep, `f-${depth}.txt`), `depth ${depth}\n`);
    }
    const wide = path.join(checkout, 'wide');
    await mkdir(wide, { recursive: true });
    for (let index = 0; index < 1_500; index += 1) {
      await writeFile(path.join(wide, `w-${String(index).padStart(5, '0')}.txt`), `wide ${index}\n`);
    }
    const workspace = await openWorkspace(checkout);
    const captured = await workspace.read({
      kind: 'workspace.context.capture',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
    });
    expect(captured.status).toBe('ready');
    if (captured.status !== 'ready') throw new Error('unreachable');
    expect(captured.items).toHaveLength(1_541);
    const resolution = await workspace.read({
      kind: 'workspace.context.resolution',
      captureIdentity: captured.captureIdentity,
    });
    expect(resolution.occurrences).toHaveLength(1_541);
    expect(resolution.occurrences.every(occurrence => occurrence.scope.kind === 'whole')).toBe(true);
    const windows: ContextSourceCandidate[] = [];
    let offset = 0;
    while (true) {
      const view = await manifest(workspace, [{ kind: 'workspace-directory', pathBytesBase64: '' }], offset);
      windows.push(...view.candidates);
      if (view.nextOffset === null) break;
      offset = view.nextOffset;
    }
    expect(windows).toHaveLength(1_541);
    const keys = windows.map(candidate => candidate.pathBytesBase64);
    expect(keys).toEqual(
      keys.slice().sort((left, right) => Buffer.compare(Buffer.from(left!, 'base64'), Buffer.from(right!, 'base64'))),
    );
    const verified = await workspace.read({
      kind: 'workspace.context.verify',
      captureIdentity: captured.captureIdentity,
    });
    expect(verified.status).toBe('settled');
    expect(verified.verdicts.every(verdict => verdict.currency === 'current')).toBe(true);

    const identity = (await workspace.read({ kind: 'workspace.identity' })).workspaceIdentity;
    const bounded = new WorkspaceEvidence({
      workspaceIdentity: identity,
      canonicalCheckout: checkout,
      limits: { maxContextCandidates: 10 },
    });
    const limited = await bounded.read({
      kind: 'workspace.context.manifest',
      selections: [{ kind: 'workspace-directory', pathBytesBase64: '' }],
      offset: 0,
      limit: 8,
    });
    expect(limited.status).toBe('incomplete');
    expect(limited.incompleteReason).toBe('candidate-limit');
    expect(limited.totalCandidates).toBe(10);
    expect(limited.candidates).toHaveLength(8);
    expect(limited.limits.maxContextCandidates).toBe(10);
  });
});
