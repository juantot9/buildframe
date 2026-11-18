import type { Workspace } from '@buildframe/workspace';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createShell, type Shell, type ShellOptions } from '../../src/shell.js';
import { defineScreen } from '../../src/shellScreen.js';
import { ShellTerminal } from '../../src/shellTerminal.js';
import { createEphemeralUserConfiguration, type UserConfigurationLoadResult } from '../../src/userConfiguration.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve };
}

let shell: Shell | undefined;
let terminal: TestRendererSetup | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await shell?.stop();
  terminal?.renderer.destroy();
  await terminal?.renderer.closed;
  shell = undefined;
  terminal = undefined;
});

async function setup(userConfiguration?: ShellOptions['userConfiguration']) {
  const subscribe = vi.fn(() => () => undefined);
  const workspace = { subscribe, setAttention: vi.fn() } as unknown as Workspace;
  const open = vi.fn(() => ({}));
  const screen = defineScreen({
    name: 'first',
    open,
    title: () => 'First',
    mode: () => 'main' as const,
    modes: { main: {} },
    keys: [],
    body: () => [],
  });
  terminal = await createTestRenderer({ width: 80, height: 12, exitOnCtrlC: false });
  shell = createShell({
    workspace,
    screens: [screen],
    first: { screen: screen.name },
    renderer: terminal.renderer,
    createClipboard: () => {
      throw new Error('no clipboard in this test');
    },
    ...(userConfiguration === undefined ? {} : { userConfiguration }),
  });
  return { shell, renderer: terminal.renderer, subscribe, open };
}

describe('shell startup and shutdown', () => {
  it('does not acquire a renderer or subscribe after stopping during settings load', async () => {
    const configuration = createEphemeralUserConfiguration();
    const settings = deferred<UserConfigurationLoadResult>();
    const load = vi.fn(() => settings.promise);
    const { shell, renderer, subscribe, open } = await setup({ ...configuration, load });
    const starting = shell.start();
    expect(load).toHaveBeenCalledOnce();

    await shell.stop();
    await shell.closed;
    settings.resolve(await configuration.load());
    await starting;
    await shell.start();

    expect(renderer.isDestroyed).toBe(false); // It was never adopted from the test.
    expect(subscribe).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  });

  it('waits for a terminal being acquired and closes it without opening a screen', async () => {
    const { shell, renderer, subscribe, open } = await setup();
    const acquiring = deferred<void>();
    const acquired = deferred<void>();
    const openTerminal = ShellTerminal.open.bind(ShellTerminal);
    vi.spyOn(ShellTerminal, 'open').mockImplementation(async options => {
      acquiring.resolve();
      await acquired.promise;
      return await openTerminal(options);
    });
    const starting = shell.start();
    await acquiring.promise;

    const closed = vi.fn();
    void shell.closed.then(closed);
    const stopping = shell.stop();
    expect(shell.stop()).toBe(stopping);
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();

    acquired.resolve();
    await Promise.all([starting, stopping, shell.closed]);
    expect(renderer.isDestroyed).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('does not resume startup after a pending terminal theme response', async () => {
    const { shell, renderer, subscribe, open } = await setup();
    const waiting = deferred<void>();
    const theme = deferred<'dark' | 'light' | null>();
    vi.spyOn(renderer, 'waitForThemeMode').mockImplementation(() => {
      waiting.resolve();
      return theme.promise;
    });
    const starting = shell.start();
    await waiting.promise;

    await shell.stop();
    await shell.closed;
    const keyListenersAfterClose = renderer.keyInput.listenerCount('keypress');
    theme.resolve('dark');
    await starting;

    expect(renderer.isDestroyed).toBe(true);
    expect(renderer.keyInput.listenerCount('keypress')).toBe(keyListenersAfterClose);
    expect(subscribe).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
