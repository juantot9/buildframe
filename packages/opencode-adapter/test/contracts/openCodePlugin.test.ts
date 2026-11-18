import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  BuildFrameStatusEvent,
  OpenCodeCommandInvocation,
  OpenCodePromptHookEvent,
  OpenCodeServerContext,
  OpenCodeServerEvent,
} from '../../src/openCodeHost.js';
import { setUpBuildFrame, type BuildFrameServerDependencies } from '../../src/plugin.js';

/** An OpenCode server context that records what the plugin registers and says. */
class FakeOpenCode {
  readonly told: BuildFrameStatusEvent[] = [];
  readonly prompts: { sessionID: string; id: string; text: string; delivery: string }[] = [];
  command: ((invocation: OpenCodeCommandInvocation) => Promise<void>) | undefined;
  promptHook: ((event: OpenCodePromptHookEvent) => void) | undefined;

  constructor(readonly version = '2.3.2') {}

  get ctx(): OpenCodeServerContext {
    return {
      app: { version: this.version },
      session: {
        get: async () => ({ location: { directory: '/repository' } }),
        prompt: async input => {
          this.prompts.push({ ...input });
          return { payload: { text: input.text } };
        },
        interrupt: async () => ({ interrupted: true }),
        hook: async (_name, callback) => {
          this.promptHook = callback;
        },
      },
      command: {
        transform: async callback => {
          callback({ add: definition => (this.command = definition.execute) });
        },
      },
      event: {
        // No session events in these tests; the stream stays open until unload.
        subscribe: ({ signal }) => ({
          async *[Symbol.asyncIterator](): AsyncGenerator<OpenCodeServerEvent> {
            await new Promise(resolve => signal.addEventListener('abort', resolve));
          },
        }),
      },
      rpc: {
        register: async () => ({ events: { emit: (_name, data) => this.told.push(data) } }),
      },
    };
  }

  async run(sessionID: string, text = ''): Promise<void> {
    await this.command!({ sessionID, prompt: { text } });
  }

  hold(sessionID: string, messageID = 'msg_typed'): string {
    const event: OpenCodePromptHookEvent = { sessionID, messageID, delivery: 'steer' };
    this.promptHook!(event);
    return event.delivery;
  }
}

const ready: NonNullable<BuildFrameServerDependencies['bootstrap']> = async () =>
  ({
    status: 'ready',
    workspace: {
      read: async () => ({
        workspaceIdentity: 'wsp_00000000-0000-4000-8000-000000000295',
        canonicalCheckout: '/repository',
      }),
    },
  }) as never;

describe('the OpenCode plugin', () => {
  let runtimeDirectory: string;
  const originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
  const cleanups: (() => Promise<void>)[] = [];

  beforeEach(async () => {
    // No BuildFrame is open here: connecting waits for one.
    runtimeDirectory = await mkdtemp(path.join(tmpdir(), 'bf-opencode-'));
    process.env.XDG_RUNTIME_DIR = runtimeDirectory;
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    if (originalRuntimeDirectory === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  async function plugin(opencode = new FakeOpenCode(), bootstrap = ready) {
    cleanups.push(await setUpBuildFrame(opencode.ctx, { bootstrap }));
    return opencode;
  }

  it('refuses an unsupported OpenCode with the supported range', async () => {
    const opencode = await plugin(new FakeOpenCode('2.2.0'));
    await expect(opencode.run('ses_one')).rejects.toThrow(
      'BuildFrame supports OpenCode >=2.3.2 <3.0.0; this is OpenCode 2.2.0.',
    );
    expect(opencode.promptHook).toBeUndefined();
  });

  it('refuses a folder that isn’t a git repository', async () => {
    const opencode = await plugin(new FakeOpenCode(), async () => ({ status: 'rejected' }) as never);
    await expect(opencode.run('ses_one')).rejects.toThrow('isn’t inside a git repository');
  });

  it('connects, says it waits for BuildFrame, answers status, and disconnects', async () => {
    const opencode = await plugin();
    await opencode.run('ses_one');
    expect(opencode.told.at(-1)).toEqual({
      sessionID: 'ses_one',
      message: 'BuildFrame isn’t open for /repository yet. This session connects as soon as it opens.',
      variant: 'warning',
    });
    await opencode.run('ses_one', 'status');
    expect(opencode.told.at(-1)?.message).toBe('BuildFrame is connected to this session.');
    await opencode.run('ses_two', 'status');
    expect(opencode.told.at(-1)?.message).toBe('BuildFrame is not connected to this session.');
    await opencode.run('ses_one', 'disconnect');
    expect(opencode.told.at(-1)?.message).toBe('BuildFrame disconnected from this session.');
    await expect(opencode.run('ses_one', 'disconnect')).rejects.toThrow('BuildFrame is not connected to this session.');
    await expect(opencode.run('ses_one', 'sideways')).rejects.toThrow('Usage: /buildframe');
  });

  it('holds typed prompts only in the connected session, and only while BuildFrame’s turn runs', async () => {
    const opencode = await plugin();
    expect(opencode.hold('ses_one')).toBe('steer');
    await opencode.run('ses_one');
    // Connected, but no BuildFrame turn: typing goes straight through.
    expect(opencode.hold('ses_one')).toBe('steer');
    expect(opencode.hold('ses_two')).toBe('steer');
  });
});
