import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createGitExecutableResolver,
  GitExecutableResolutionError,
  GitInspectionError,
  runGitProcess,
  type GitExecutableResolver,
  type GitProcessOptions,
} from '../../src/gitProcess.js';

const roots = new Set<string>();

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-git-process-'));
  roots.add(root);
  return root;
}

function nodeProcess(checkout: string, source: string, overrides: Partial<GitProcessOptions> = {}): GitProcessOptions {
  return {
    executable: process.execPath,
    checkout,
    arguments: ['-e', source],
    environment: { ...process.env },
    maxStdoutBytes: 1024 * 1024,
    timeoutMilliseconds: 2_000,
    ...overrides,
  };
}

async function capturedResolutionFailure(
  resolveExecutable: GitExecutableResolver,
): Promise<GitExecutableResolutionError> {
  let failure: unknown;
  try {
    await resolveExecutable();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(GitExecutableResolutionError);
  if (!(failure instanceof GitExecutableResolutionError)) {
    throw new Error('Expected GitExecutableResolutionError');
  }
  return failure;
}

async function capturedFailure(options: GitProcessOptions): Promise<GitInspectionError> {
  let failure: unknown;
  try {
    await runGitProcess(options);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(GitInspectionError);
  if (!(failure instanceof GitInspectionError)) {
    throw new Error('Expected GitInspectionError');
  }
  return failure;
}

function processExists(processIdentity: number): boolean {
  try {
    process.kill(processIdentity, 0);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

afterEach(async () => {
  await Promise.all([...roots].map(async root => await rm(root, { recursive: true })));
  roots.clear();
});

// These cases depend on POSIX execute bits and file symlinks, which Windows
// does not have (every mode reads `666`; symlinks need Developer Mode). The
// Windows rule has its own cases below, which run on every platform.
describe.skipIf(process.platform === 'win32')('Workspace Git executable resolver', () => {
  it('selects one canonical absolute executable without invoking it', async () => {
    const root = await temporaryRoot();
    const bin = path.join(root, 'bin');
    const executable = path.join(root, 'git-target');
    const invocationMarker = path.join(root, 'invoked');
    await mkdir(bin);
    await writeFile(executable, `#!/bin/sh\nprintf invoked > ${JSON.stringify(invocationMarker)}\n`, { mode: 0o700 });
    await symlink(executable, path.join(bin, 'git'));

    const resolveExecutable = createGitExecutableResolver(() => bin);
    const expected = await realpath(executable);
    await expect(resolveExecutable()).resolves.toBe(expected);
    await expect(resolveExecutable()).resolves.toBe(expected);
    expect(path.isAbsolute(expected)).toBe(true);
    await expect(readFile(invocationMarker)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reports missing, non-file, and non-executable candidates distinctly', async () => {
    const root = await temporaryRoot();
    const missingBin = path.join(root, 'missing-bin');
    await mkdir(missingBin);
    expect((await capturedResolutionFailure(createGitExecutableResolver(() => missingBin))).reason).toBe('git-missing');

    const nonFileBin = path.join(root, 'non-file-bin');
    await mkdir(path.join(nonFileBin, 'git'), { recursive: true });
    expect((await capturedResolutionFailure(createGitExecutableResolver(() => nonFileBin))).reason).toBe(
      'git-not-file',
    );

    const nonExecutableBin = path.join(root, 'non-executable-bin');
    await mkdir(nonExecutableBin);
    await writeFile(path.join(nonExecutableBin, 'git'), '#!/bin/sh\n', {
      mode: 0o600,
    });
    expect((await capturedResolutionFailure(createGitExecutableResolver(() => nonExecutableBin))).reason).toBe(
      'git-not-executable',
    );
  });

  it('fails explicitly when the search resolution changes after selection', async () => {
    const root = await temporaryRoot();
    const firstBin = path.join(root, 'first-bin');
    const secondBin = path.join(root, 'second-bin');
    await Promise.all([mkdir(firstBin), mkdir(secondBin)]);
    await Promise.all([
      writeFile(path.join(firstBin, 'git'), '#!/bin/sh\n', { mode: 0o700 }),
      writeFile(path.join(secondBin, 'git'), '#!/bin/sh\n', { mode: 0o700 }),
    ]);

    let searchPath = firstBin;
    const resolveExecutable = createGitExecutableResolver(() => searchPath);
    await expect(resolveExecutable()).resolves.toBe(await realpath(path.join(firstBin, 'git')));
    searchPath = secondBin;
    expect((await capturedResolutionFailure(resolveExecutable)).reason).toBe('git-resolution-changed');
  });
});

describe('Workspace Git executable resolver on Windows', () => {
  // Written executable so the POSIX access check passes when these cases run
  // on macOS and Linux; Windows ignores the mode.
  const executableMode = 0o700;

  it('selects git.exe through a linked directory, canonically, and never a bare git', async () => {
    const root = await temporaryRoot();
    const realBin = path.join(root, 'real-bin');
    const linkedBin = path.join(root, 'linked-bin');
    await mkdir(realBin);
    await writeFile(path.join(realBin, 'git'), '', { mode: executableMode });
    await writeFile(path.join(realBin, 'git.exe'), '', { mode: executableMode });
    // A junction needs no privilege on Windows; elsewhere the type is ignored.
    await symlink(realBin, linkedBin, 'junction');

    const resolveExecutable = createGitExecutableResolver(() => linkedBin, 'win32');
    const expected = await realpath(path.join(realBin, 'git.exe'));
    await expect(resolveExecutable()).resolves.toBe(expected);
    await expect(resolveExecutable()).resolves.toBe(expected);
  });

  it('never selects git.cmd or git.bat, which would run through cmd.exe', async () => {
    const root = await temporaryRoot();
    const bin = path.join(root, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'git.cmd'), '@echo off\r\n', { mode: executableMode });
    await writeFile(path.join(bin, 'git.bat'), '@echo off\r\n', { mode: executableMode });
    await writeFile(path.join(bin, 'git'), '', { mode: executableMode });
    expect((await capturedResolutionFailure(createGitExecutableResolver(() => bin, 'win32'))).reason).toBe(
      'git-missing',
    );
  });

  it('reports a directory named git.exe as not a file', async () => {
    const root = await temporaryRoot();
    const bin = path.join(root, 'bin');
    await mkdir(path.join(bin, 'git.exe'), { recursive: true });
    expect((await capturedResolutionFailure(createGitExecutableResolver(() => bin, 'win32'))).reason).toBe(
      'git-not-file',
    );
  });

  it('fails explicitly when the search resolution changes after selection', async () => {
    const root = await temporaryRoot();
    const firstBin = path.join(root, 'first-bin');
    const secondBin = path.join(root, 'second-bin');
    await Promise.all([mkdir(firstBin), mkdir(secondBin)]);
    await Promise.all([
      writeFile(path.join(firstBin, 'git.exe'), '', { mode: executableMode }),
      writeFile(path.join(secondBin, 'git.exe'), '', { mode: executableMode }),
    ]);

    let searchPath = firstBin;
    const resolveExecutable = createGitExecutableResolver(() => searchPath, 'win32');
    await expect(resolveExecutable()).resolves.toBe(await realpath(path.join(firstBin, 'git.exe')));
    searchPath = secondBin;
    expect((await capturedResolutionFailure(resolveExecutable)).reason).toBe('git-resolution-changed');
  });

  it.runIf(process.platform === 'win32')('finds the installed Git for Windows without execute bits', async () => {
    const executable = await createGitExecutableResolver()();
    expect(path.basename(executable).toLowerCase()).toBe('git.exe');
    expect(path.isAbsolute(executable)).toBe(true);
  });
});

describe('Workspace Git process runner', () => {
  it('preserves normal and explicitly allowed exit results', async () => {
    const root = await temporaryRoot();
    await expect(runGitProcess(nodeProcess(root, "process.stdout.write('ready')"))).resolves.toEqual({
      stdout: Buffer.from('ready'),
      exitCode: 0,
    });

    await expect(
      runGitProcess(
        nodeProcess(root, "process.stdout.write('absent'); process.exitCode = 1", {
          allowedExitCodes: [0, 1],
        }),
      ),
    ).resolves.toEqual({ stdout: Buffer.from('absent'), exitCode: 1 });
  });

  it('reports spawn failure without leaving the deadline live', async () => {
    const root = await temporaryRoot();
    const failure = await capturedFailure({
      executable: path.join(root, 'missing-git'),
      checkout: root,
      arguments: [],
      environment: { ...process.env },
      maxStdoutBytes: 1024,
      timeoutMilliseconds: 10_000,
    });
    expect(failure.reason).toBe('git-unavailable');
    expect(failure.stderr).toHaveLength(0);
  });

  it('keeps output-limit precedence when kill and close race', async () => {
    const root = await temporaryRoot();
    const failure = await capturedFailure(
      nodeProcess(root, 'process.stdout.write(Buffer.alloc(4096, 0x78))', {
        maxStdoutBytes: 1024,
      }),
    );
    expect(failure.reason).toBe('git-output-limit');
  });

  it('retains the exact bounded stderr prefix on failed inspection', async () => {
    const root = await temporaryRoot();
    const first = Buffer.alloc(60 * 1024, 0x61);
    const second = Buffer.alloc(10 * 1024, 0x62);
    const failure = await capturedFailure(
      nodeProcess(
        root,
        [
          `process.stderr.write(Buffer.alloc(${first.byteLength}, 0x61))`,
          `process.stderr.end(Buffer.alloc(${second.byteLength}, 0x62))`,
          'process.exitCode = 17',
        ].join(';'),
      ),
    );
    expect(failure.reason).toBe('git-inspection-failed');
    expect(failure.stderr).toEqual(Buffer.concat([first, second.subarray(0, 4 * 1024)]));
    expect(failure.stderr).not.toContain(0);
  });

  it('kills a hung process before reporting a distinct timeout', async () => {
    const root = await temporaryRoot();
    const processIdentityFile = path.join(root, 'child.pid');
    const failure = await capturedFailure(
      nodeProcess(
        root,
        [
          `require('node:fs').writeFileSync(${JSON.stringify(processIdentityFile)}, String(process.pid))`,
          'setInterval(() => undefined, 1_000)',
        ].join(';'),
        { timeoutMilliseconds: 250 },
      ),
    );
    expect(failure.reason).toBe('git-timeout');
    const processIdentity = Number.parseInt(await readFile(processIdentityFile, 'utf8'), 10);
    expect(Number.isSafeInteger(processIdentity)).toBe(true);
    expect(processExists(processIdentity)).toBe(false);
  });
});
