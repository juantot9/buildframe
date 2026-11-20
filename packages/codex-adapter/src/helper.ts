import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { bootstrapWorkspace } from '@buildframe/workspace';
import type { ConnectorStatus } from '@buildframe/local-runtime/harness-adapter';

import { CodexAppServerClient, CodexRpcError, type CodexNotification } from './appServerClient.js';
import { codexVersionFromUserAgent, CODEX_HOST_COMPATIBILITY_RANGE, isReviewedCodexHostVersion } from './capability.js';
import { CodexReviewedAdapter } from './codexAdapter.js';

/** The argument the detached helper runs with. */
export const CODEX_HELPER_ARGUMENT = '--codex-helper';
const FIRST_OUTCOME_TIMEOUT_MS = 12_000;
const RECONNECT_INTERVAL_MS = 2_000;
const RECONNECT_ATTEMPTS = 30;

interface ConnectRequest {
  readonly threadId: string;
  readonly codexHome: string;
  readonly cwd: string;
}

/** One line for the user, and whether the helper keeps running. */
interface Outcome {
  readonly line: string;
  readonly running: boolean;
}

function registryFile(threadId: string): string {
  const directory = path.join(tmpdir(), `buildframe-codex-${userInfo().uid}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return path.join(directory, `${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}.pid`);
}

function runningHelper(threadId: string): number | undefined {
  try {
    const pid = Number(readFileSync(registryFile(threadId), 'utf8'));
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

/**
 * `!buildframe` inside Codex: connect this session (or report or end the
 * connection), printing exactly one line, because Codex shows the command and
 * its output to the model on the next turn.
 */
export async function runCodexCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  helperEntry: string,
): Promise<void> {
  const threadId = env.CODEX_THREAD_ID ?? '';
  const action = (argv[0] ?? '').toLowerCase();
  const running = runningHelper(threadId);
  if (action === 'status') {
    process.stdout.write(
      running === undefined
        ? 'BuildFrame is not connected to this session.\n'
        : 'BuildFrame is connected to this session.\n',
    );
    return;
  }
  if (action === 'disconnect') {
    if (running !== undefined) process.kill(running, 'SIGTERM');
    process.stdout.write(
      running === undefined
        ? 'BuildFrame is not connected to this session.\n'
        : 'BuildFrame disconnected from this session.\n',
    );
    return;
  }
  if (action !== '') {
    process.stdout.write('Usage: !buildframe, !buildframe status, or !buildframe disconnect\n');
    process.exitCode = 2;
    return;
  }
  // Connecting again starts over, as /buildframe does in other agents.
  if (running !== undefined) process.kill(running, 'SIGTERM');
  const request: ConnectRequest = {
    threadId,
    codexHome: env.CODEX_HOME ?? path.join(homedir(), '.codex'),
    cwd: process.cwd(),
  };
  const child = spawn(process.execPath, [helperEntry, CODEX_HELPER_ARGUMENT], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const outcome = await new Promise<Outcome>(resolve => {
    const timer = setTimeout(() => {
      child.kill();
      resolve({ line: 'BuildFrame: the connection helper did not start.', running: false });
    }, FIRST_OUTCOME_TIMEOUT_MS);
    child.once('message', message => {
      clearTimeout(timer);
      resolve(message as Outcome);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      resolve({ line: 'BuildFrame: the connection helper stopped.', running: false });
    });
    child.send(request);
  });
  if (child.connected) child.disconnect();
  child.unref();
  process.stdout.write(`${outcome.line}\n`);
  if (!outcome.running) process.exitCode = 1;
}

/** Connects to Codex's shared server and checks it is a server this connector can work with. */
async function openThread(
  request: ConnectRequest,
): Promise<
  | { readonly status: 'open'; readonly client: CodexAppServerClient; readonly version: string; readonly idle: boolean }
  | { readonly status: 'refused'; readonly line: string; readonly retry: boolean }
> {
  let client: CodexAppServerClient;
  let userAgent: string;
  try {
    const opened = await CodexAppServerClient.connect(
      path.join(request.codexHome, 'app-server-control', 'app-server-control.sock'),
      'buildframe',
      '1',
    );
    client = opened.client;
    userAgent = opened.initialized.userAgent;
  } catch {
    return {
      status: 'refused',
      line: 'BuildFrame: this Codex session runs on its own private server. Start Codex without --no-daemon, --profile or -c to connect.',
      retry: true,
    };
  }
  const refuse = (line: string, retry = false) => {
    client.close();
    return { status: 'refused' as const, line, retry };
  };
  const version = codexVersionFromUserAgent(userAgent);
  if (version === undefined || !isReviewedCodexHostVersion(version)) {
    return refuse(
      `BuildFrame supports Codex ${CODEX_HOST_COMPATIBILITY_RANGE}; this server is ${version ?? 'unknown'}.`,
    );
  }
  try {
    // The live check: the experimental queue BuildFrame sends through must still answer.
    await client.request('thread/queue/list', { threadId: request.threadId });
    const read = (await client.request('thread/read', { threadId: request.threadId })) as {
      readonly thread?: { readonly status?: { readonly type?: string } };
    };
    const status = read.thread?.status?.type;
    if (status === undefined || status === 'notLoaded') {
      return refuse(
        'BuildFrame: this Codex session runs on its own private server. Start Codex without --no-daemon, --profile or -c to connect.',
        true,
      );
    }
    await client.request('thread/resume', { threadId: request.threadId, excludeTurns: true });
    return { status: 'open', client, version, idle: status === 'idle' };
  } catch (error) {
    return refuse(
      error instanceof CodexRpcError
        ? `BuildFrame can’t work with Codex ${version}: ${error.message}.`
        : 'BuildFrame lost contact with Codex while connecting.',
      !(error instanceof CodexRpcError),
    );
  }
}

function statusLine(status: ConnectorStatus, canonicalCheckout: string): Outcome {
  switch (status.kind) {
    case 'connected':
      return { line: 'BuildFrame connected to this Codex session.', running: true };
    case 'retrying':
      return {
        line: `BuildFrame isn’t open for ${canonicalCheckout} yet; this session connects as soon as it opens.`,
        running: true,
      };
    default:
      return { line: `BuildFrame: ${'label' in status ? status.label : status.text}`, running: false };
  }
}

/** The detached helper: one connected Codex thread, until disconnected, replaced or gone. */
export async function runCodexHelper(): Promise<void> {
  const request = await new Promise<ConnectRequest>(resolve =>
    process.once('message', message => resolve(message as ConnectRequest)),
  );
  const report = (outcome: Outcome): void => {
    if (!process.connected) return;
    process.send?.(outcome);
    process.disconnect?.();
  };
  const first = await openThread(request);
  if (first.status === 'refused') {
    report({ line: first.line, running: false });
    return;
  }
  const bootstrapped = await bootstrapWorkspace({ startPath: request.cwd });
  if (bootstrapped.status === 'rejected') {
    first.client.close();
    report({ line: 'BuildFrame: this folder isn’t inside a git repository BuildFrame can review.', running: false });
    return;
  }
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  let client = first.client;
  const adapter = new CodexReviewedAdapter({
    workspaceIdentity: identity.workspaceIdentity,
    canonicalCheckout: identity.canonicalCheckout,
    hostVersion: first.version,
    threadId: request.threadId,
    sessionEpoch: randomUUID(),
    server: { request: async (method, params) => await client.request(method, params) },
    idle: first.idle,
  });
  const pidFile = registryFile(request.threadId);
  writeFileSync(pidFile, String(process.pid), { mode: 0o600 });

  // Codex's notifications are applied one at a time, in order.
  let applying = Promise.resolve();
  const apply = (work: () => Promise<void>): void => {
    applying = applying.then(work).catch(() => undefined);
  };
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await applying;
    await adapter.session.close().catch(() => undefined);
    client.close();
    rmSync(pidFile, { force: true });
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop());

  const follow = (connected: CodexAppServerClient): void => {
    connected.onNotification((notification: CodexNotification) =>
      apply(async () => await adapter.observe(notification)),
    );
    connected.onClose(() => {
      if (stopping) return;
      apply(async () => await adapter.connectionLost());
      void reconnect();
    });
  };
  // Codex's shared server restarts when it updates itself; the session usually comes back.
  const reconnect = async (): Promise<void> => {
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && !stopping; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL_MS));
      const opened = await openThread(request);
      if (opened.status === 'open') {
        client = opened.client;
        follow(client);
        apply(async () => adapter.connectionRestored(opened.idle));
        return;
      }
      if (!opened.retry) break;
    }
    apply(async () => await adapter.sessionEnding());
    await stop();
  };
  follow(client);

  await adapter.session.attach(status => {
    const outcome = statusLine(status, identity.canonicalCheckout);
    if (status.first) report(outcome);
    if (!outcome.running) void stop();
  });
}
