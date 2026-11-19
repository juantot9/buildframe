import { once } from 'node:events';
import type { Socket } from 'node:net';

import type { WorkspaceIdentity } from '@buildframe/workspace';

import { connectRuntimeEndpoint } from '../../src/endpointConnection.js';
import { runtimeLocationForWorkspace } from '../../src/runtimeLocation.js';

export class RawPeer {
  readonly socket: Socket;
  readonly #frames: unknown[] = [];
  readonly #waiters: Array<{
    readonly resolve: (frame: unknown) => void;
    readonly reject: (error: Error) => void;
  }> = [];
  #buffer = Buffer.alloc(0);
  #closed = false;

  constructor(socket: Socket) {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => this.#accept(chunk));
    socket.once('close', () => this.#close());
    socket.once('error', () => this.#close());
  }

  send(frame: object): void {
    this.socket.write(`${JSON.stringify(frame)}\n`);
  }

  next<T>(): Promise<T> {
    const queued = this.#frames.shift();
    if (queued !== undefined) return Promise.resolve(queued as T);
    if (this.#closed) return Promise.reject(new Error('raw peer closed'));
    return new Promise<T>((resolve, reject) => {
      this.#waiters.push({
        resolve: frame => resolve(frame as T),
        reject,
      });
    });
  }

  async closed(): Promise<void> {
    if (this.#closed) return;
    await once(this.socket, 'close');
  }

  #accept(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    while (true) {
      const newline = this.#buffer.indexOf(0x0a);
      if (newline < 0) return;
      const frame = JSON.parse(this.#buffer.subarray(0, newline).toString('utf8')) as unknown;
      this.#buffer = this.#buffer.subarray(newline + 1);
      const waiter = this.#waiters.shift();
      if (waiter === undefined) this.#frames.push(frame);
      else waiter.resolve(frame);
    }
  }

  #close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.reject(new Error('raw peer closed'));
    }
  }
}

/** A raw frame peer, connected the way the client is (on Windows, after the handshake). */
export async function connectRawPeer(workspaceIdentity: WorkspaceIdentity): Promise<RawPeer> {
  const socket = await connectRuntimeEndpoint(runtimeLocationForWorkspace(workspaceIdentity), undefined);
  return new RawPeer(socket.resume());
}
