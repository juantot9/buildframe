import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import type { Workspace } from '@buildframe/workspace';

import { parseDeveloperArguments } from '../../src/developerArguments.js';
import { formatDoctorReport, hostCheck, runDoctor, type DoctorEnvironment } from '../../src/doctor.js';
import { CLAUDE_CODE_SUPPORT, CODEX_SUPPORT, OPENCODE_SUPPORT, PI_SUPPORT } from '../../src/supportFacts.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-doctor-'));
  roots.push(root);
  await execFileAsync('git', ['init', '-q', root]);
  await writeFile(path.join(root, 'file.txt'), 'content\n');
  return root;
}

function environment(startPath: string, overrides: Partial<DoctorEnvironment> = {}): DoctorEnvironment {
  return {
    nodeVersion: '26.5.1',
    startPath,
    runtimeEntrypoint: new URL('../../dist/runtimeProcess.js', import.meta.url),
    hostVersion: async command =>
      ({ pi: '1.3.0', claude: '2.1.322 (Claude Code)', opencode: 'opencode v2.3.2', codex: 'codex-cli 0.171.0' })[
        command
      ],
    inspectRuntime: async () => ({ status: 'not-running' }),
    ...overrides,
  };
}

/** A runtime Workspace whose reads answer, except the ones named to fail. */
function runtimeWorkspace(failing: readonly string[] = [], connected: readonly string[] = []): Workspace {
  return {
    execute: async () => {
      throw new Error('doctor must not execute commands');
    },
    read: (async (request: { readonly kind: string }) => {
      if (failing.includes(request.kind))
        throw Object.assign(new Error('rejected'), { code: 'workspace-call-rejected' });
      if (request.kind === 'workspace.home') {
        return { kind: 'workspace.home', header: { currentReviewIdentity: `rev_${'1'.repeat(64)}` } };
      }
      if (request.kind === 'harness.connection') {
        return {
          kind: 'harness.connection',
          harnesses: connected.map(harnessLabel => ({ harnessLabel, connected: true })),
        };
      }
      return { kind: request.kind };
    }) as unknown as Workspace['read'],
    subscribe: () => () => {},
    setAttention: () => {},
  };
}

describe('buildframe doctor', () => {
  it('rates each host version: verified, accepted but untested, refused, or absent', () => {
    expect(hostCheck('pi', 'Pi', '1.3.0', PI_SUPPORT)).toMatchObject({ status: 'ok', summary: 'Pi 1.3.0 (verified)' });
    expect(hostCheck('claude-code', 'Claude Code', '2.1.400 (Claude Code)', CLAUDE_CODE_SUPPORT)).toMatchObject({
      status: 'warning',
      summary: 'Claude Code 2.1.400 is accepted but untested; the newest verified is 2.1.322.',
    });
    expect(hostCheck('claude-code', 'Claude Code', '3.0.0', CLAUDE_CODE_SUPPORT)).toMatchObject({ status: 'error' });
    expect(hostCheck('claude-code', 'Claude Code', '2.1.309', CLAUDE_CODE_SUPPORT)).toMatchObject({ status: 'error' });
    // OpenCode prints its name and a `v` before the version.
    expect(hostCheck('opencode', 'OpenCode', 'opencode v2.3.2', OPENCODE_SUPPORT)).toMatchObject({
      status: 'ok',
      summary: 'OpenCode 2.3.2 (verified)',
    });
    expect(hostCheck('opencode', 'OpenCode', 'opencode v1.19.6', OPENCODE_SUPPORT)).toMatchObject({ status: 'error' });
    expect(hostCheck('codex', 'Codex', 'codex-cli 0.170.0', CODEX_SUPPORT)).toMatchObject({
      status: 'ok',
      summary: 'Codex 0.170.0 (verified)',
    });
    expect(hostCheck('codex', 'Codex', 'codex-cli 0.169.0', CODEX_SUPPORT)).toMatchObject({ status: 'error' });
    expect(hostCheck('pi', 'Pi', '0.80.5', PI_SUPPORT)).toMatchObject({ status: 'error' });
    expect(hostCheck('pi', 'Pi', '1.4.0-beta.1', PI_SUPPORT)).toMatchObject({ status: 'error' });
    expect(hostCheck('pi', 'Pi', undefined, PI_SUPPORT)).toMatchObject({ status: 'note' });
    expect(hostCheck('pi', 'Pi', 'nonsense', PI_SUPPORT)).toMatchObject({ status: 'warning' });
  });

  it('says a folder outside a repository is the problem, and still checks the hosts', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'buildframe-doctor-outside-'));
    roots.push(outside);
    const report = await runDoctor(environment(outside));
    expect(report.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'repository')).toMatchObject({ status: 'error' });
    expect(report.checks.map(check => check.id)).toEqual([
      'node',
      'buildframe',
      'repository',
      'pi',
      'claude-code',
      'opencode',
      'codex',
    ]);
  });

  it('checks no saved data while BuildFrame is not running, and is not an error', async () => {
    const report = await runDoctor(environment(await repository()));
    expect(report.ok).toBe(true);
    expect(report.checks.find(check => check.id === 'runtime')).toMatchObject({ status: 'note' });
    expect(report.checks.some(check => check.id === 'saved-data')).toBe(false);
  });

  it('flags a runtime from another install, which keeps this one from opening', async () => {
    const report = await runDoctor(
      environment(await repository(), { inspectRuntime: async () => ({ status: 'other-build' }) }),
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'runtime')).toMatchObject({
      status: 'error',
      summary: 'A different version of BuildFrame is still running for this repository, so this one can’t open.',
    });
  });

  it('names the part of saved data that cannot be read, and closes its connection', async () => {
    let closed = 0;
    const report = await runDoctor(
      environment(await repository(), {
        inspectRuntime: async () => ({
          status: 'running',
          workspace: runtimeWorkspace(['harness.review-interaction']),
          close: () => {
            closed += 1;
          },
        }),
      }),
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'saved-data')).toMatchObject({
      status: 'error',
      summary:
        'BuildFrame can’t read part of what it saved for this repository: what the current Review sent to agents.',
    });
    expect(closed).toBe(1);
  });

  it('reports readable data and the connected agent', async () => {
    const report = await runDoctor(
      environment(await repository(), {
        inspectRuntime: async () => ({ status: 'running', workspace: runtimeWorkspace([], ['Pi']), close: () => {} }),
      }),
    );
    expect(report.ok).toBe(true);
    expect(report.checks.find(check => check.id === 'agent')).toMatchObject({ status: 'ok', summary: 'Connected: Pi' });
    const text = formatDoctorReport(report, true);
    expect(text).toContain('+ Connected: Pi');
    expect(text).toContain('No problems found.');
    expect(text).not.toMatch(/[✓✗•’]/u);
  });

  it('parses doctor and --json, and refuses --json without doctor', () => {
    expect(parseDeveloperArguments(['doctor', '--json', '/repo'], '/cwd')).toMatchObject({
      command: 'doctor',
      json: true,
      startPath: '/repo',
    });
    expect(parseDeveloperArguments(['/repo'], '/cwd')).toMatchObject({ command: 'review', startPath: '/repo' });
    // A folder that happens to be called doctor is still a folder after the command.
    expect(parseDeveloperArguments(['doctor', 'doctor'], '/cwd')).toMatchObject({
      command: 'doctor',
      startPath: 'doctor',
    });
    expect(() => parseDeveloperArguments(['--json'], '/cwd')).toThrow('--json works only with doctor and endpoint');
    expect(parseDeveloperArguments(['endpoint', '--json'], '/cwd')).toMatchObject({
      command: 'endpoint',
      json: true,
      startPath: '/cwd',
    });
    expect(parseDeveloperArguments(['--version'], '/cwd')).toMatchObject({ version: true });
    expect(parseDeveloperArguments(['-v'], '/cwd')).toMatchObject({ version: true });
  });
});

describe('agent support facts', () => {
  it('match what each connector declares in its own package', async () => {
    const pi = JSON.parse(
      await readFile(new URL('../../../../packages/pi-adapter/package.json', import.meta.url), 'utf8'),
    ) as {
      readonly buildframe: { readonly supportedPiVersions: readonly string[]; readonly verifiedPiVersions: string[] };
    };
    const claude = JSON.parse(
      await readFile(new URL('../../../../packages/claude-adapter/package.json', import.meta.url), 'utf8'),
    ) as {
      readonly buildframe: {
        readonly supportedClaudeDirectHostVersions: readonly string[];
        readonly reviewedClaudeDirectHostVersions: readonly string[];
      };
    };
    expect([PI_SUPPORT.range]).toEqual(pi.buildframe.supportedPiVersions);
    expect(PI_SUPPORT.verified).toEqual(pi.buildframe.verifiedPiVersions);
    expect([CLAUDE_CODE_SUPPORT.range]).toEqual(claude.buildframe.supportedClaudeDirectHostVersions);
    expect(CLAUDE_CODE_SUPPORT.verified).toEqual(claude.buildframe.reviewedClaudeDirectHostVersions);
    const opencode = JSON.parse(
      await readFile(new URL('../../../../packages/opencode-adapter/package.json', import.meta.url), 'utf8'),
    ) as {
      readonly buildframe: {
        readonly supportedOpenCodeVersions: readonly string[];
        readonly verifiedOpenCodeVersions: readonly string[];
      };
    };
    expect([OPENCODE_SUPPORT.range]).toEqual(opencode.buildframe.supportedOpenCodeVersions);
    expect(OPENCODE_SUPPORT.verified).toEqual(opencode.buildframe.verifiedOpenCodeVersions);
    const codex = JSON.parse(
      await readFile(new URL('../../../../packages/codex-adapter/package.json', import.meta.url), 'utf8'),
    ) as {
      readonly buildframe: {
        readonly supportedCodexVersions: readonly string[];
        readonly verifiedCodexVersions: readonly string[];
      };
    };
    expect([CODEX_SUPPORT.range]).toEqual(codex.buildframe.supportedCodexVersions);
    expect(CODEX_SUPPORT.verified).toEqual(codex.buildframe.verifiedCodexVersions);
  });
});
