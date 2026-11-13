import { execFile } from 'node:child_process';

import { describe, expect, it } from 'vitest';

interface ExecutableResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const executableUrl = new URL('../../src/developerExecutable.ts', import.meta.url).href;

function runAsNodeVersion(version: string): Promise<ExecutableResult> {
  const source = `
Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)} });
process.argv = [process.execPath, 'developerExecutable', '--help'];
await import(${JSON.stringify(executableUrl)});
`;
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        '--conditions=development',
        '--experimental-ffi',
        '--disable-warning=ExperimentalWarning',
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        source,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_OPTIONS: '' },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        if (error?.killed === true || (error?.signal !== undefined && error.signal !== null)) {
          reject(error);
          return;
        }
        resolve({
          code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
          stdout,
          stderr,
        });
      },
    );
  });
}

function outsideRangeWarning(version: string): string {
  return (
    `Warning: Node v${version} is outside BuildFrame's declared ` +
    `>=26.4.0 <27.0.0 source range; the pinned tested version is Node 26.5.1. ` +
    `Continuing because v${version} is not known bad.\n`
  );
}

describe('developer executable Node support', () => {
  it('refuses below the FFI floor and warns without refusing above the declared range', async () => {
    const [belowFloor, floor, pinned, newestTested, ceiling, laterMinor] = await Promise.all([
      runAsNodeVersion('26.3.9'),
      runAsNodeVersion('26.4.0'),
      runAsNodeVersion('26.5.1'),
      runAsNodeVersion('26.13.1'),
      runAsNodeVersion('27.0.0'),
      runAsNodeVersion('27.1.0'),
    ]);

    expect(belowFloor).toEqual({
      code: 1,
      stdout: '',
      stderr: 'BuildFrame requires Node >=26.4.0; found v26.3.9. Use the pinned tested version, Node 26.5.1.\n',
    });
    for (const supported of [floor, pinned, newestTested]) {
      expect(supported.code).toBe(0);
      expect(supported.stdout).toContain('Usage: buildframe [--no-color]');
      expect(supported.stderr).toBe('');
    }
    for (const [version, warned] of [
      ['27.0.0', ceiling],
      ['27.1.0', laterMinor],
    ] as const) {
      expect(warned.code, version).toBe(0);
      expect(warned.stdout, version).toContain('Usage: buildframe [--no-color]');
      expect(warned.stderr, version).toBe(outsideRangeWarning(version));
    }
  });
});
