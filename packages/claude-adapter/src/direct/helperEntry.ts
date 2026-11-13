import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';

import { bootstrapWorkspace } from '@buildframe/workspace';
import {
  connectHarnessAdapterRuntime,
  type HarnessAdapterRuntimeConnected,
  type HarnessAdapterRuntimeDiagnostic,
} from '@buildframe/local-runtime/harness-adapter';

import { isReviewedClaudeDirectHostVersion } from './capability.js';
import { ClaudeDirectAdapter } from './claudeDirectAdapter.js';
import { ClaudeHelperServer } from './helperServer.js';
import { parseClaudeModAttachRequest, type ClaudeModAttachOutcome } from './modProtocol.js';

const RECONNECT_MINIMUM_MS = 250;
const RECONNECT_MAXIMUM_MS = 5_000;
/** The launcher answers the Mod's one-shot `$.process.run` well inside its timeout. */
const FIRST_OUTCOME_TIMEOUT_MS = 12_000;
const MAX_ATTACH_REQUEST_BYTES = 16 * 1024;

function wait(delayMilliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, delayMilliseconds);
    timer.unref();
    const onAbort = (): void => finish();
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function retryable(diagnostic: HarnessAdapterRuntimeDiagnostic): boolean {
  return (
    diagnostic.code === 'runtime-unavailable' &&
    (diagnostic.reason === 'not-running' ||
      diagnostic.reason === 'connection-failed' ||
      diagnostic.reason === 'timeout')
  );
}

function diagnosticLabel(diagnostic: HarnessAdapterRuntimeDiagnostic): string {
  if (diagnostic.code === 'runtime-unavailable') return 'runtime unavailable';
  if (diagnostic.code === 'harness-adapter-establishment-refused') return `attachment refused: ${diagnostic.reason}`;
  if (diagnostic.code === 'runtime-protocol-incompatible') return 'runtime protocol incompatible';
  if (diagnostic.code === 'workspace-interface-incompatible') return 'Workspace Interface incompatible';
  if (diagnostic.code === 'runtime-workspace-mismatch') return 'workspace mismatch';
  if (diagnostic.code === 'runtime-role-rejected') return 'Adapter role rejected';
  return 'attachment invalid';
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = chunk as Buffer;
    length += buffer.byteLength;
    if (length > MAX_ATTACH_REQUEST_BYTES) throw new RangeError('attach request too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Short-lived entry the Mod runs with `$.process.run`: starts the detached
 * daemon, relays its first attach outcome as one JSON line, and exits so the
 * Mod's one-shot call resolves. The token reaches only the launching Mod.
 */
export async function runClaudeDirectHelperLauncher(
  daemonEntry: string,
  daemonArguments: readonly string[] = [],
): Promise<void> {
  let outcome: ClaudeModAttachOutcome;
  try {
    const request = parseClaudeModAttachRequest(JSON.parse(await readStdin()) as unknown);
    if (request === undefined) throw new TypeError('invalid attach request');
    const child = spawn(process.execPath, [daemonEntry, ...daemonArguments], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    outcome = await new Promise<ClaudeModAttachOutcome>(resolve => {
      const timer = setTimeout(() => {
        child.kill();
        resolve({ status: 'refused', label: 'helper did not start' });
      }, FIRST_OUTCOME_TIMEOUT_MS);
      child.once('message', message => {
        clearTimeout(timer);
        resolve(message as ClaudeModAttachOutcome);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        resolve({ status: 'refused', label: 'helper exited' });
      });
      child.send({ ...request });
    });
    if (child.connected) child.disconnect();
    child.unref();
  } catch {
    outcome = { status: 'refused', label: 'invalid attach request' };
  }
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
}

/** The detached daemon: one Adapter occurrence for one attached Claude conversation. */
export async function runClaudeDirectHelperDaemon(): Promise<void> {
  const raw = await new Promise<unknown>(resolve => process.once('message', resolve));
  const report = (outcome: ClaudeModAttachOutcome): void => {
    if (process.connected) {
      process.send?.(outcome);
      process.disconnect?.();
    }
  };

  const request = parseClaudeModAttachRequest(raw);
  if (request === undefined) {
    report({ status: 'refused', label: 'invalid attach request' });
    return;
  }
  if (!isReviewedClaudeDirectHostVersion(request.hostVersion)) {
    report({
      status: 'refused',
      label: `Claude Code ${request.hostVersion} is not supported; BuildFrame needs Claude Code 2.1.310 or later 2.x`,
    });
    return;
  }
  const bootstrapped = await bootstrapWorkspace({ startPath: request.cwd });
  if (bootstrapped.status === 'rejected') {
    report({ status: 'refused', label: 'workspace unavailable' });
    return;
  }
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });

  const controller = new AbortController();
  let connection: HarnessAdapterRuntimeConnected | undefined;
  let adapter!: ClaudeDirectAdapter;
  let shuttingDown: Promise<void> | undefined;
  const token = randomBytes(32).toString('hex');
  const server = new ClaudeHelperServer({
    token,
    onFacts: async facts => {
      for (const fact of facts) await adapter.observe(fact);
      if (facts.some(fact => fact.type === 'session-ending')) void shutdown();
    },
    onModLost: () => void shutdown(),
  });
  const shutdown = (): Promise<void> => {
    shuttingDown ??= (async () => {
      controller.abort();
      await adapter.detach().catch(() => undefined);
      await connection?.dispose();
      await server.close();
      process.exit(0);
    })();
    return shuttingDown;
  };

  const port = await server.listen();
  adapter = new ClaudeDirectAdapter({
    workspaceIdentity: identity.workspaceIdentity,
    canonicalCheckout: identity.canonicalCheckout,
    hostVersion: request.hostVersion,
    sessionIdentity: request.sessionId,
    sessionEpoch: randomUUID(),
    channel: server,
  });

  let reported = false;
  const status = (label: string): void => {
    server.deliver({ type: 'status', label });
  };
  let delayMilliseconds = RECONNECT_MINIMUM_MS;
  while (!controller.signal.aborted) {
    const connected = await connectHarnessAdapterRuntime({
      workspaceIdentity: identity.workspaceIdentity,
      adapter,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      if (connected.status === 'connected') await connected.dispose();
      return;
    }
    if (connected.status === 'rejected') {
      const label = diagnosticLabel(connected.diagnostic);
      if (!retryable(connected.diagnostic)) {
        if (!reported) report({ status: 'refused', label });
        else server.deliver({ type: 'detach', label });
        await shutdown();
        return;
      }
      if (!reported) {
        reported = true;
        report({ status: 'retrying', port, token, label: `${label}; retrying` });
      } else {
        status(`${label}; retrying`);
      }
      await wait(delayMilliseconds, controller.signal);
      delayMilliseconds = Math.min(RECONNECT_MAXIMUM_MS, delayMilliseconds * 2);
      continue;
    }

    connection = connected;
    delayMilliseconds = RECONNECT_MINIMUM_MS;
    if (!reported) {
      reported = true;
      report({ status: 'connected', port, token, label: 'BuildFrame Review attached' });
    } else {
      status('BuildFrame Review attached');
    }
    await adapter.runtimeConnected(connected.runtimeGeneration);
    const reason = await connected.closed;
    if (connection === connected) connection = undefined;
    if (controller.signal.aborted || reason === 'disposed') return;
    if (reason === 'replaced') {
      // Another session took the connection; reconnecting would take it back.
      await adapter.runtimeDisconnected(connected.runtimeGeneration);
      server.deliver({ type: 'detach', label: 'another session connected to this repository' });
      await shutdown();
      return;
    }
    status('runtime disconnected; retrying');
    await adapter.runtimeDisconnected(connected.runtimeGeneration);
    await wait(delayMilliseconds, controller.signal);
  }
}
