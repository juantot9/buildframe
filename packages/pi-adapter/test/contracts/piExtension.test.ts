import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { RuntimeCodeIdentity, RuntimeGeneration } from '@buildframe/local-runtime';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '@buildframe/local-runtime/launcher';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { createPiAdapterExtension } from '../../src/extension.js';

const execFileAsync = promisify(execFile);

interface FakeContext {
  readonly ui: {
    readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
    readonly setStatus: (key: string, text: string | undefined) => void;
  };
  readonly mode: 'tui';
  readonly hasUI: boolean;
  readonly cwd: string;
  readonly sessionManager: {
    readonly getSessionId: () => string;
    readonly getBranch: () => readonly unknown[];
  };
  readonly isIdle: () => boolean;
  readonly abort: () => void;
}

interface RegisteredCommand {
  readonly description?: string | undefined;
  readonly handler: (args: string, ctx: FakeContext) => Promise<void> | void;
}

interface FakePi {
  readonly api: Parameters<typeof createPiAdapterExtension>[0];
  readonly events: Map<string, ((...arguments_: unknown[]) => unknown)[]>;
  readonly commands: Map<string, RegisteredCommand>;
}

function fakePi(): FakePi {
  const events = new Map<string, ((...arguments_: unknown[]) => unknown)[]>();
  const commands = new Map<string, RegisteredCommand>();
  const api = {
    on: (event: string, handler: (...arguments_: unknown[]) => unknown): void => {
      const handlers = events.get(event) ?? [];
      handlers.push(handler);
      events.set(event, handlers);
    },
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools: () => {},
    sendUserMessage: () => {},
    appendEntry: () => {},
    registerCommand: (name: string, options: RegisteredCommand): void => {
      commands.set(name, options);
    },
  } as unknown as Parameters<typeof createPiAdapterExtension>[0];
  return { api, events, commands };
}

function fakeContext(cwd: string = process.cwd()): {
  readonly ctx: FakeContext;
  readonly notifications: { message: string; type?: 'info' | 'warning' | 'error' | undefined }[];
  readonly statuses: (string | undefined)[];
} {
  const notifications: { message: string; type?: 'info' | 'warning' | 'error' | undefined }[] = [];
  const statuses: (string | undefined)[] = [];
  const ctx: FakeContext = {
    ui: {
      notify: (message, type) => {
        notifications.push({ message, ...(type === undefined ? {} : { type }) });
      },
      setStatus: (_key, text) => {
        statuses.push(text);
      },
    },
    mode: 'tui',
    hasUI: true,
    cwd,
    sessionManager: { getSessionId: () => 'extension-session-fixture', getBranch: () => [] },
    isIdle: () => true,
    abort: () => {},
  };
  return { ctx, notifications, statuses };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { force: true, recursive: true })),
  );
});

async function compatibleHostEntrypoint(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-pi-extension-'));
  temporaryDirectories.push(directory);
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.85.1' }),
  );
  const entrypoint = path.join(directory, 'cli.js');
  await fs.writeFile(entrypoint, '');
  return entrypoint;
}

describe('BuildFrame Pi extension', () => {
  it('attaches only through the explicit /buildframe command', async () => {
    const { api, events, commands } = fakePi();
    createPiAdapterExtension(api, await compatibleHostEntrypoint());
    expect(commands.has('buildframe')).toBe(true);
    expect(events.has('session_start')).toBe(true);
    expect(events.has('session_shutdown')).toBe(true);

    const started = fakeContext();
    for (const handler of events.get('session_start') ?? []) await handler({ type: 'session_start' }, started.ctx);
    expect(started.statuses).toEqual([undefined]);
    expect(started.notifications).toEqual([]);

    const command = commands.get('buildframe');
    if (command === undefined) throw new Error('buildframe command missing');
    expect(command.description).toBe('Connect this session to BuildFrame');

    const status = fakeContext();
    await command.handler('status', status.ctx);
    expect(status.notifications).toEqual([{ message: 'BuildFrame is not connected to this session.', type: 'info' }]);

    const usage = fakeContext();
    await command.handler('later', usage.ctx);
    expect(usage.notifications).toEqual([
      {
        message:
          'Usage: /buildframe (workspace write), /buildframe readonly, /buildframe write, /buildframe status, or /buildframe disconnect',
        type: 'warning',
      },
    ]);

    const detach = fakeContext();
    await command.handler('disconnect', detach.ctx);
    expect(detach.notifications).toEqual([{ message: 'BuildFrame is not connected to this session.', type: 'info' }]);
    // It also dismisses a light left by a session another one took.
    expect(detach.statuses).toEqual([undefined]);

    const shutdown = fakeContext();
    for (const handler of events.get('session_shutdown') ?? []) {
      await handler({ type: 'session_shutdown' }, shutdown.ctx);
    }
    expect(shutdown.statuses.at(-1)).toBeUndefined();
  });

  it('explains an unsupported host instead of attaching', async () => {
    const { api, commands } = fakePi();
    createPiAdapterExtension(api, undefined);
    const command = commands.get('buildframe');
    if (command === undefined) throw new Error('buildframe command missing');
    const ctx = fakeContext();
    await command.handler('', ctx.ctx);
    expect(ctx.notifications).toEqual([{ message: 'BuildFrame: Pi host version unavailable', type: 'error' }]);
  });
});

describe('BuildFrame Pi extension against a live runtime', () => {
  const originalStateHome = process.env.XDG_STATE_HOME;
  const originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
  let owner: WorkspaceRuntimeOwner | undefined;
  let server: LocalRuntimeServer | undefined;

  afterEach(async () => {
    await server?.dispose();
    server = undefined;
    await owner?.dispose();
    owner = undefined;
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    if (originalRuntimeDirectory === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
  });

  it('loses the connection when the attached Pi session ends', async () => {
    // Keep this root short: macOS os.tmpdir() can push the runtime socket past its 100-byte bound.
    const root = await fs.realpath(await fs.mkdtemp('/tmp/buildframe-pi-shutdown-'));
    temporaryDirectories.push(root);
    const checkout = path.join(root, 'checkout');
    await fs.mkdir(checkout);
    await fs.mkdir(path.join(root, 'state'));
    await fs.mkdir(path.join(root, 'runtime'), { mode: 0o700 });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    process.env.XDG_RUNTIME_DIR = path.join(root, 'runtime');
    await execFileAsync('git', ['-C', checkout, 'init', '-q']);

    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error(`Workspace runtime was rejected: ${opened.diagnostic.code}`);
    owner = opened.owner;
    server = await startLocalRuntimeServer({
      workspace: owner.workspace,
      harnessAdapters: owner.harnessAdapters,
      runtimeGeneration: `rtg_${randomUUID()}` as RuntimeGeneration,
      runtimeCodeIdentity: `rtc_${'1'.repeat(64)}` as RuntimeCodeIdentity,
    });
    const workspace = owner.workspace;
    const connectedSessions = async (): Promise<boolean[]> =>
      (await workspace.read({ kind: 'harness.connection' })).harnesses.map(harness => harness.connected);

    const { api, events, commands } = fakePi();
    createPiAdapterExtension(api, await compatibleHostEntrypoint());
    const command = commands.get('buildframe');
    if (command === undefined) throw new Error('buildframe command missing');
    const attached = fakeContext(checkout);
    // A theme that names its colours, so the light's tones are visible.
    Object.assign(attached.ctx.ui, { theme: { fg: (color: string, text: string) => `<${color}>${text}</${color}>` } });
    await command.handler('', attached.ctx);
    expect(attached.notifications).toEqual([
      { message: 'BuildFrame connected to this session (workspace write).', type: 'info' },
    ]);
    expect(attached.statuses.at(-1)).toBe('<success>●</success><dim> BuildFrame</dim>');
    expect(await connectedSessions()).toEqual([true]);

    const shutdown = fakeContext(checkout);
    for (const handler of events.get('session_shutdown') ?? []) {
      await handler({ type: 'session_shutdown' }, shutdown.ctx);
    }

    let sessions = await connectedSessions();
    for (let attempt = 0; attempt < 100 && sessions[0] !== false; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
      sessions = await connectedSessions();
    }
    expect(sessions).toEqual([false]);
    expect((await workspace.read({ kind: 'harness.connection' })).harnesses[0]?.availability).toEqual({
      status: 'blocked',
      reason: 'disconnected',
    });
  });
});
