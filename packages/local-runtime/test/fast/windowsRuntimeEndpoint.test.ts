import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connectRuntimeEndpoint, endpointConnectionFailure } from '../../src/endpointConnection.js';
import {
  listenPrivateEndpoint,
  preparePrivateRuntimeDirectory,
  removeOwnedEndpoint,
  secureBoundEndpoint,
  validatePrivateRuntimeEndpoint,
  type RuntimeLocation,
} from '../../src/runtimeLocation.js';
import { windowsRuntimeLocation } from '../../src/windowsRuntimeEndpoint.js';

describe('the Windows runtime location', () => {
  const environment = { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' };

  it('is a named pipe beside a secret file in the private runtime directory', () => {
    const location = windowsRuntimeLocation('0'.repeat(32), environment);
    expect(location.directory).toBe('C:\\Users\\dev\\AppData\\Local\\BuildFrame\\runtime');
    expect(location.endpoint).toMatch(/^\\\\\.\\pipe\\buildframe-[0-9a-f]{32}$/u);
    expect(location.secret).toBe(`C:\\Users\\dev\\AppData\\Local\\BuildFrame\\runtime\\w-${'0'.repeat(32)}.key`);
  });

  it('gives each runtime directory and each Workspace its own pipe', () => {
    const pipe = (digest: string, env: NodeJS.ProcessEnv): string => windowsRuntimeLocation(digest, env).endpoint;
    const other = { LOCALAPPDATA: 'C:\\Users\\other\\AppData\\Local' };
    expect(pipe('0'.repeat(32), environment)).not.toBe(pipe('0'.repeat(32), other));
    expect(pipe('0'.repeat(32), environment)).not.toBe(pipe('1'.repeat(32), environment));
    expect(pipe('0'.repeat(32), environment)).toBe(
      pipe('0'.repeat(32), { LOCALAPPDATA: 'c:\\users\\DEV\\AppData\\Local' }),
    );
  });

  it('follows an absolute XDG_RUNTIME_DIR, and has none without a profile', () => {
    expect(windowsRuntimeLocation('0'.repeat(32), { ...environment, XDG_RUNTIME_DIR: 'D:\\run' }).directory).toBe(
      'D:\\run\\buildframe',
    );
    expect(() => windowsRuntimeLocation('0'.repeat(32), {})).toThrow(
      expect.objectContaining({ code: 'runtime-directory-insecure' }),
    );
  });
});

describe.runIf(process.platform === 'win32')('the Windows runtime endpoint', () => {
  let scratch: string;
  let location: RuntimeLocation;
  const servers = new Set<Server>();

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'buildframe-pipe-'));
    location = windowsRuntimeLocation(Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32), {
      ...process.env,
      XDG_RUNTIME_DIR: scratch,
    });
    await preparePrivateRuntimeDirectory(location);
  });

  afterEach(async () => {
    await Promise.all(
      [...servers].map(async server => await new Promise<void>(resolve => server.close(() => resolve()))),
    );
    servers.clear();
    await rm(scratch, { recursive: true, force: true });
  });

  /** A runtime whose authenticated connections answer every line with `ok`. */
  async function runtime(): Promise<{ readonly server: Server; readonly handled: Socket[] }> {
    const handled: Socket[] = [];
    const server = createServer(socket => {
      handled.push(socket);
      socket.on('data', () => socket.write('ok\n'));
      socket.resume();
    });
    servers.add(server);
    await listenPrivateEndpoint(server, location);
    return { server, handled };
  }

  it('is missing until a runtime publishes, then serves only clients that prove the secret', async () => {
    await expect(validatePrivateRuntimeEndpoint(location)).rejects.toMatchObject({ code: 'runtime-endpoint-missing' });
    const { handled } = await runtime();
    await secureBoundEndpoint(location);
    await validatePrivateRuntimeEndpoint(location);

    const client = await connectRuntimeEndpoint(location, undefined);
    const reply = once(client, 'data');
    client.resume();
    client.write('bootstrap\n');
    expect(String((await reply)[0])).toBe('ok\n');
    expect(handled).toHaveLength(1);
    client.destroy();

    // A foreign client that skips the handshake reaches no handler.
    const foreign = createConnection(location.endpoint);
    foreign.on('error', () => undefined);
    // Read, or a pipe client never notices the runtime closing it.
    foreign.resume();
    await once(foreign, 'connect');
    foreign.write(
      `${JSON.stringify({ type: 'bootstrap', protocolVersion: 1, workspaceInterfaceVersion: 1, role: 'tui' })}\n`,
    );
    await once(foreign, 'close');
    expect(handled).toHaveLength(1);
  });

  it('refuses a second runtime for the same Workspace without replacing the first one’s secret', async () => {
    await runtime();
    const secret = await readFile(location.secret as string);

    const second = createServer();
    await expect(listenPrivateEndpoint(second, location)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(await readFile(location.secret as string)).toEqual(secret);
    const client = await connectRuntimeEndpoint(location, undefined);
    client.destroy();
  });

  it('is refused by a client when the runtime does not know the published secret', async () => {
    // A squatter on the pipe name cannot read the secret file.
    const squatter = createServer(socket => {
      socket.on('error', () => undefined);
      socket.write(Buffer.concat([Buffer.from('BuildFrame runtime 1\n', 'latin1'), Buffer.alloc(32)]));
      socket.once('data', () => socket.write(Buffer.alloc(32)));
    });
    servers.add(squatter);
    squatter.listen(location.endpoint);
    await once(squatter, 'listening');
    const decoy = { ...location, endpoint: `${location.endpoint}-decoy` };
    const real = createServer();
    servers.add(real);
    await listenPrivateEndpoint(real, decoy);

    const failure = await connectRuntimeEndpoint(location, undefined).catch((error: unknown) => error);
    expect(endpointConnectionFailure(failure)).toBe('insecure-runtime');
  });

  it('removes its secret on shutdown only while it is still the one it published', async () => {
    const { server } = await runtime();
    const owned = await secureBoundEndpoint(location);
    await new Promise<void>(resolve => server.close(() => resolve()));
    servers.delete(server);
    // The next runtime publishes before this one finishes shutting down.
    await runtime();
    const next = await readFile(location.secret as string);

    await removeOwnedEndpoint(location, owned);

    expect(await readFile(location.secret as string)).toEqual(next);
    const client = await connectRuntimeEndpoint(location, undefined);
    client.destroy();
  });
});
