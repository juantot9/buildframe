import { readFile } from 'node:fs/promises';

import { bootstrapWorkspace, WORKSPACE_INTERFACE_VERSION, type Workspace } from '@buildframe/workspace';
import { LOCAL_RUNTIME_PROTOCOL_VERSION } from '@buildframe/local-runtime';
import { HARNESS_ADAPTER_PROTOCOL_VERSION } from '@buildframe/local-runtime/harness-adapter';
import { inspectWorkspaceRuntime, type InspectWorkspaceRuntimeResult } from '@buildframe/local-runtime/launcher';

import {
  compareVersions,
  DECLARED_NODE_RANGE,
  nodeSupport,
  parseVersion,
  PINNED_TESTED_NODE_VERSION,
} from './nodeSupport.js';
import type { HostCommand } from './hostVersion.js';
import { startupFailureSentence } from './reviewingReasons.js';
import {
  CLAUDE_CODE_SUPPORT,
  CODEX_SUPPORT,
  connectInstruction,
  OPENCODE_SUPPORT,
  PI_SUPPORT,
  type HostSupport,
} from './supportFacts.js';

export type DoctorStatus = 'ok' | 'note' | 'warning' | 'error';

/** One finding: what was checked, how it stands, and the shortest next step when it needs one. */
export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly summary: string;
  readonly next?: string;
  readonly facts?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export interface DoctorReport {
  readonly schema: 'buildframe.doctor/1';
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

/** What doctor may touch: injected so tests can stand in for the machine. */
export interface DoctorEnvironment {
  readonly nodeVersion: string;
  readonly startPath: string;
  readonly runtimeEntrypoint: URL;
  /** The first line a host prints for `--version`, or undefined when it is not installed or does not answer. */
  readonly hostVersion: (command: HostCommand) => Promise<string | undefined>;
  readonly inspectRuntime?: typeof inspectWorkspaceRuntime;
}

export { hostVersionFromPath, type HostCommand } from './hostVersion.js';

export async function productVersion(): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      readonly version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function nodeCheck(nodeVersion: string): DoctorCheck {
  const support = nodeSupport(nodeVersion);
  const facts = { version: nodeVersion, range: DECLARED_NODE_RANGE, tested: PINNED_TESTED_NODE_VERSION };
  if (support.status === 'refused') {
    return {
      id: 'node',
      status: 'error',
      summary: `Node ${nodeVersion} is too old for BuildFrame (needs ${DECLARED_NODE_RANGE}).`,
      next: `Install Node ${PINNED_TESTED_NODE_VERSION}.`,
      facts,
    };
  }
  if (support.status === 'warning') {
    return {
      id: 'node',
      status: 'warning',
      summary: `Node ${nodeVersion} is newer than BuildFrame has been tested on (${DECLARED_NODE_RANGE}).`,
      next: `If something misbehaves, use Node ${PINNED_TESTED_NODE_VERSION}.`,
      facts,
    };
  }
  return { id: 'node', status: 'ok', summary: `Node ${nodeVersion}`, facts };
}

/** Where a host version stands: verified live, accepted but untested, or refused. */
export function hostCheck(
  id: 'pi' | 'claude-code' | 'opencode' | 'codex',
  label: string,
  line: string | undefined,
  support: HostSupport,
): DoctorCheck {
  const command = id === 'claude-code' ? 'claude' : id;
  if (line === undefined) {
    return {
      id,
      status: 'note',
      summary: `${label} isn’t installed, or \`${command} --version\` didn’t answer.`,
      facts: { range: support.range },
    };
  }
  const version = parseVersion(line);
  if (version === undefined) {
    return {
      id,
      status: 'warning',
      summary: `${label} reported a version BuildFrame can’t read: ${line}`,
      facts: { reported: line, range: support.range },
    };
  }
  const text = version.join('.');
  const prerelease = /\d+\.\d+\.\d+-/u.test(line);
  const facts = { version: text, range: support.range, verified: support.verified };
  if (
    prerelease ||
    compareVersions(version, support.minimum) < 0 ||
    compareVersions(version, support.exclusiveMaximum) >= 0
  ) {
    return {
      id,
      status: 'error',
      summary: `${label} ${text} isn’t supported (supported: stable ${support.range}).`,
      next: `Install a stable ${label} in ${support.range}.`,
      facts,
    };
  }
  if (support.verified.includes(text)) {
    return { id, status: 'ok', summary: `${label} ${text} (verified)`, facts };
  }
  const newest = support.verified.at(-1);
  return {
    id,
    status: 'warning',
    summary: `${label} ${text} is accepted but untested${newest === undefined ? '' : `; the newest verified is ${newest}`}.`,
    next: 'It should work; report anything that doesn’t.',
    facts,
  };
}

/** Reads saved data through the running runtime only, naming the part that fails. */
async function savedDataChecks(workspace: Workspace): Promise<DoctorCheck[]> {
  const unreadable = (part: string): DoctorCheck => ({
    id: 'saved-data',
    status: 'error',
    summary: `BuildFrame can’t read part of what it saved for this repository: ${part}.`,
    next: 'Your files are untouched. Report it with this output.',
    facts: { part },
  });
  let home: Awaited<ReturnType<Workspace['read']>>;
  try {
    home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 1 });
  } catch {
    return [unreadable('Home')];
  }
  if (home.kind !== 'workspace.home') return [unreadable('Home')];
  const reviewIdentity = home.header.currentReviewIdentity;
  if (reviewIdentity !== undefined) {
    try {
      await workspace.read({ kind: 'review.messages', reviewIdentity, offset: 0, limit: 1 });
    } catch {
      return [unreadable('the current Review’s Messages')];
    }
    try {
      await workspace.read({ kind: 'harness.review-interaction', reviewIdentity, offset: 0, limit: 1 });
    } catch {
      return [unreadable('what the current Review sent to agents')];
    }
  }
  let connected: string[];
  try {
    const connection = await workspace.read({ kind: 'harness.connection' });
    connected = connection.harnesses.filter(item => item.connected).map(item => item.harnessLabel);
  } catch {
    return [unreadable('agent connections')];
  }
  return [
    { id: 'saved-data', status: 'ok', summary: 'Saved data reads' },
    connected.length === 0
      ? {
          id: 'agent',
          status: 'note',
          summary: 'No agent is connected.',
          next: `Run ${connectInstruction()} in this repository.`,
        }
      : {
          id: 'agent',
          status: 'ok',
          summary: `Connected: ${connected.join(', ')}`,
          facts: { connected },
        },
  ];
}

function runtimeChecks(inspected: InspectWorkspaceRuntimeResult): DoctorCheck {
  switch (inspected.status) {
    case 'running':
      return { id: 'runtime', status: 'ok', summary: 'BuildFrame is running for this repository.' };
    case 'not-running':
      return {
        id: 'runtime',
        status: 'note',
        summary: 'BuildFrame isn’t running for this repository, so saved data and agents weren’t checked.',
        next: 'Open BuildFrame here, then run doctor again.',
      };
    case 'other-build':
      return {
        id: 'runtime',
        status: 'error',
        summary: 'A different version of BuildFrame is still running for this repository, so this one can’t open.',
        next: 'Quit every BuildFrame open here and run /buildframe disconnect in connected agents; its background process then exits.',
      };
    case 'unavailable':
      return {
        id: 'runtime',
        status: 'error',
        summary: `BuildFrame’s background process for this repository didn’t answer. ${startupFailureSentence(inspected.diagnostic)}`,
        facts: { code: inspected.diagnostic.code },
      };
  }
}

/** Read-only diagnosis: it starts, stops, writes, and sends nothing. */
export async function runDoctor(environment: DoctorEnvironment): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [nodeCheck(environment.nodeVersion)];
  checks.push({
    id: 'buildframe',
    status: 'ok',
    summary: `BuildFrame ${await productVersion()}`,
    facts: {
      workspaceInterface: WORKSPACE_INTERFACE_VERSION,
      runtimeProtocol: LOCAL_RUNTIME_PROTOCOL_VERSION,
      adapterProtocol: HARNESS_ADAPTER_PROTOCOL_VERSION,
    },
  });

  const bootstrapped = await bootstrapWorkspace({ startPath: environment.startPath });
  if (bootstrapped.status === 'rejected') {
    checks.push({
      id: 'repository',
      status: 'error',
      summary: startupFailureSentence(bootstrapped.diagnostic),
      facts: { path: environment.startPath, code: bootstrapped.diagnostic.code },
    });
  } else {
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    checks.push({
      id: 'repository',
      status: 'ok',
      summary: `Repository ${identity.canonicalCheckout}`,
      facts: { path: identity.canonicalCheckout },
    });
    const inspected = await (environment.inspectRuntime ?? inspectWorkspaceRuntime)({
      workspaceIdentity: identity.workspaceIdentity,
      runtimeEntrypoint: environment.runtimeEntrypoint,
    });
    checks.push(runtimeChecks(inspected));
    if (inspected.status === 'running') {
      try {
        checks.push(...(await savedDataChecks(inspected.workspace)));
      } finally {
        inspected.close();
      }
    }
  }

  const [pi, claude, opencode, codex] = await Promise.all([
    environment.hostVersion('pi'),
    environment.hostVersion('claude'),
    environment.hostVersion('opencode'),
    environment.hostVersion('codex'),
  ]);
  checks.push(
    hostCheck('pi', 'Pi', pi, PI_SUPPORT),
    hostCheck('claude-code', 'Claude Code', claude, CLAUDE_CODE_SUPPORT),
    hostCheck('opencode', 'OpenCode', opencode, OPENCODE_SUPPORT),
    hostCheck('codex', 'Codex', codex, CODEX_SUPPORT),
  );
  return { schema: 'buildframe.doctor/1', ok: checks.every(check => check.status !== 'error'), checks };
}

const GLYPHS: Record<DoctorStatus, { readonly unicode: string; readonly ascii: string }> = {
  ok: { unicode: '✓', ascii: '+' },
  note: { unicode: '•', ascii: '-' },
  warning: { unicode: '!', ascii: '!' },
  error: { unicode: '✗', ascii: 'x' },
};

/** The report as plain lines: one per check, and its next step indented beneath. */
export function formatDoctorReport(report: DoctorReport, ascii: boolean): string {
  const lines = ['BuildFrame doctor', ''];
  for (const check of report.checks) {
    const glyph = ascii ? GLYPHS[check.status].ascii : GLYPHS[check.status].unicode;
    lines.push(`${glyph} ${check.summary}`);
    if (check.next !== undefined) lines.push(`  ${check.next}`);
  }
  lines.push('', report.ok ? 'No problems found.' : 'Problems found: see the ✗ lines above.');
  return `${ascii ? lines.join('\n').replaceAll('✗', 'x').replaceAll('’', "'") : lines.join('\n')}\n`;
}
