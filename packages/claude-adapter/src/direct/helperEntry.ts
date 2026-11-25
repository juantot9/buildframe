import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';

import { bootstrapWorkspace } from '@buildframe/workspace';
import {
  connectorIndicator,
  connectorIndicatorText,
  type ConnectorStatus,
} from '@buildframe/local-runtime/harness-adapter';

import { isReviewedClaudeDirectHostVersion } from './capability.js';
import { ClaudeDirectAdapter } from './claudeDirectAdapter.js';
import { ClaudeHelperServer } from './helperServer.js';
import { parseClaudeModAttachRequest, type ClaudeModAttachOutcome, type ClaudeModIndicator } from './modProtocol.js';

/** The launcher answers the Mod's one-shot `$.process.run` well inside its timeout. */
const FIRST_OUTCOME_TIMEOUT_MS = 12_000;
const MAX_ATTACH_REQUEST_BYTES = 16 * 1024;

/** The light beside Claude's prompt and the problem under it; Claude Code has no read-only connection. */
function modIndicator(status: ConnectorStatus): ClaudeModIndicator {
  const indicator = connectorIndicator(status, { readOnly: false, command: '/buildframe' });
  if (indicator === undefined) return {};
  return {
    light: connectorIndicatorText(indicator, { problem: false }),
    tone: indicator.tone,
    ...(indicator.problem === undefined ? {} : { problem: indicator.problem }),
  };
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
      await adapter.detach().catch(() => undefined);
      await adapter.session.close();
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

  // The first outcome answers the launcher; later ones reach the Mod.
  // `label` is what a Mod from before the light shows; a newer one draws the indicator.
  await adapter.session.attach((status: ConnectorStatus) => {
    const indicator = modIndicator(status);
    switch (status.kind) {
      case 'connected':
        if (status.first) report({ status: 'connected', port, token, label: 'connected', ...indicator });
        else server.deliver({ type: 'status', label: 'connected', ...indicator });
        return;
      case 'retrying': {
        const label = status.label === undefined ? 'runtime disconnected; retrying' : `${status.label}; retrying`;
        if (status.first) report({ status: 'retrying', port, token, label, ...indicator });
        else server.deliver({ type: 'status', label, ...indicator });
        return;
      }
      case 'refused':
        if (status.first) report({ status: 'refused', label: status.label, ...indicator });
        else server.deliver({ type: 'detach', label: status.label, ...indicator });
        void shutdown();
        return;
      case 'replaced':
        server.deliver({ type: 'detach', label: 'another session connected to this repository', ...indicator });
        void shutdown();
        return;
      case 'cancelled':
        return;
    }
  });
}
