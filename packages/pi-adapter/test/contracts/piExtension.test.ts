import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPiAdapterExtension } from '../../src/extension.js';

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

function fakeContext(): {
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
    cwd: process.cwd(),
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
    expect(started.statuses.at(-1)).toBe('BuildFrame: /buildframe to attach this session');
    expect(started.notifications).toEqual([]);

    const command = commands.get('buildframe');
    if (command === undefined) throw new Error('buildframe command missing');
    expect(command.description).toContain('Attach');

    const status = fakeContext();
    await command.handler('status', status.ctx);
    expect(status.notifications).toEqual([{ message: 'BuildFrame is not attached to this session.', type: 'info' }]);

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
    expect(detach.notifications).toEqual([{ message: 'BuildFrame is not attached to this session.', type: 'info' }]);

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
