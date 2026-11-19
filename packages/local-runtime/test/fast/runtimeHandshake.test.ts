import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createConnection, createServer, type AddressInfo, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { RUNTIME_SECRET_BYTES, answerRuntimeHandshake, openRuntimeHandshake } from '../../src/runtimeHandshake.js';

// The handshake is plain bytes on a stream, so loopback TCP stands in for a
// Windows pipe and these cases run on every platform.

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(async server => await new Promise<void>(resolve => server.close(() => resolve()))),
  );
  servers.clear();
});

/** A listening peer whose every connection runs `onSocket`; returns a connect function. */
async function peer(onSocket: (socket: Socket) => void): Promise<() => Promise<Socket>> {
  const server = createServer(onSocket);
  servers.add(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return async () => {
    const socket = createConnection(port, '127.0.0.1');
    await once(socket, 'connect');
    return socket;
  };
}

/** Everything a socket receives until it closes. */
function received(socket: Socket): Promise<Buffer> {
  const chunks: Buffer[] = [];
  socket.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise(resolve => socket.once('close', () => resolve(Buffer.concat(chunks))));
}

const secret = (): Buffer => randomBytes(RUNTIME_SECRET_BYTES);

describe('the runtime handshake', () => {
  it('lets a client and a runtime that share the secret exchange frames afterwards', async () => {
    const shared = secret();
    const runtimeFrames: string[] = [];
    const connect = await peer(socket => {
      void answerRuntimeHandshake(socket, Promise.resolve(shared)).then(authenticated => {
        if (!authenticated) return;
        socket.on('data', (chunk: Buffer) => {
          runtimeFrames.push(chunk.toString('utf8'));
          socket.write('accepted\n');
        });
        socket.resume();
      });
    });

    const client = await connect();
    await expect(openRuntimeHandshake(client, async () => shared)).resolves.toBe('authenticated');
    const reply = new Promise<string>(resolve => client.once('data', (chunk: Buffer) => resolve(chunk.toString())));
    client.resume();
    client.write('bootstrap\n');

    await expect(reply).resolves.toBe('accepted\n');
    expect(runtimeFrames).toEqual(['bootstrap\n']);
    client.destroy();
  });

  it('refuses a runtime that does not know the secret, before sending it anything but the proof', async () => {
    let impostorReceived: Promise<Buffer> | undefined;
    const connect = await peer(socket => {
      impostorReceived = received(socket);
      void answerRuntimeHandshake(socket, Promise.resolve(secret()));
    });

    const client = await connect();
    await expect(openRuntimeHandshake(client, async () => secret())).resolves.toBe('insecure-runtime');
    expect(client.destroyed).toBe(true);
    // The client nonce and its proof: 64 bytes, no frame.
    expect((await impostorReceived)?.byteLength).toBe(64);
  });

  it('never hands a client that does not know the secret to the runtime', async () => {
    const outcomes: boolean[] = [];
    const connect = await peer(socket => {
      void answerRuntimeHandshake(socket, Promise.resolve(secret())).then(authenticated =>
        outcomes.push(authenticated),
      );
    });

    const client = await connect();
    const clientReceived = received(client);
    await expect(openRuntimeHandshake(client, async () => secret())).resolves.toBe('insecure-runtime');

    await expect.poll(() => outcomes).toEqual([false]);
    // Only the runtime's greeting reached the foreign client.
    expect((await clientReceived).toString('latin1')).toMatch(/^BuildFrame runtime 1\n/u);
  });

  it('refuses a client that sends bytes nobody asked for, or nothing at all', async () => {
    const outcomes: boolean[] = [];
    const connect = await peer(socket => {
      void answerRuntimeHandshake(socket, Promise.resolve(secret()), 200).then(authenticated =>
        outcomes.push(authenticated),
      );
    });

    const flooding = await connect();
    flooding.on('error', () => undefined);
    flooding.write(Buffer.alloc(4096, 0x61));
    const silent = await connect();

    await expect.poll(() => outcomes.length).toBe(2);
    expect(outcomes).toEqual([false, false]);
    flooding.destroy();
    silent.destroy();
  });

  it('does not greet until the runtime has published its secret, and closes if publishing failed', async () => {
    let publish!: (published: Buffer | undefined) => void;
    const published = new Promise<Buffer | undefined>(resolve => {
      publish = resolve;
    });
    const connect = await peer(socket => {
      void answerRuntimeHandshake(socket, published);
    });

    const client = await connect();
    let greeted = false;
    client.once('data', () => {
      greeted = true;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(greeted).toBe(false);

    const closed = once(client, 'close');
    publish(undefined);
    await closed;
    expect(greeted).toBe(false);
  });

  it('calls a peer that hangs up before greeting a failed connection, not an insecure runtime', async () => {
    const connect = await peer(socket => socket.destroy());

    const client = await connect();
    await expect(openRuntimeHandshake(client, async () => secret())).resolves.toBe('connection-failed');
  });

  it('refuses a runtime whose greeting is not BuildFrame', async () => {
    const connect = await peer(socket => socket.write(Buffer.alloc(53, 0x61)));

    const client = await connect();
    await expect(openRuntimeHandshake(client, async () => secret())).resolves.toBe('insecure-runtime');
  });
});
