import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'node:net';

import { BOOTSTRAP_TIMEOUT_MS } from './protocol.js';

/**
 * The challenge–response that opens every connection to a runtime on Windows,
 * before the first frame.
 *
 * Named pipes have no owner-private mode, and their names are machine-global:
 * any local user can create a pipe name first, or connect to one. So the
 * runtime publishes a fresh random secret in the user's private runtime
 * directory, and each side proves it knows that secret:
 *
 *   runtime → client   GREETING, runtime nonce (32 bytes)
 *   client  → runtime  client nonce (32), HMAC(secret, client, nonces)
 *   runtime → client   HMAC(secret, runtime, nonces)
 *
 * The runtime answers only a client that proved the secret, and the client
 * sends its first frame only to a runtime that proved it. Neither proof
 * reveals the secret. The exchange is lock-step, so neither side receives
 * bytes it has not asked for; anything extra fails the handshake.
 */

export const RUNTIME_SECRET_BYTES = 32;
const GREETING = Buffer.from('BuildFrame runtime 1\n', 'latin1');
const NONCE_BYTES = 32;
const PROOF_BYTES = 32;
const LARGEST_MESSAGE = Math.max(GREETING.byteLength + NONCE_BYTES, NONCE_BYTES + PROOF_BYTES);

export type RuntimeHandshakeOutcome = 'authenticated' | 'connection-failed' | 'insecure-runtime' | 'timeout';

function proof(secret: Uint8Array, side: 'client' | 'runtime', runtimeNonce: Buffer, clientNonce: Buffer): Buffer {
  return createHmac('sha256', secret)
    .update(`buildframe ${side} proof\n`)
    .update(runtimeNonce)
    .update(clientNonce)
    .digest();
}

function proves(received: Buffer, expected: Buffer): boolean {
  return received.byteLength === expected.byteLength && timingSafeEqual(received, expected);
}

class HandshakeFailure extends Error {
  readonly outcome: Exclude<RuntimeHandshakeOutcome, 'authenticated'>;

  constructor(outcome: Exclude<RuntimeHandshakeOutcome, 'authenticated'>) {
    super(outcome);
    this.outcome = outcome;
  }
}

/** Reads exact-length handshake messages, bounded in size and time. */
class HandshakeReader {
  readonly #socket: Socket;
  readonly #timer: NodeJS.Timeout;
  #buffered: Buffer = Buffer.alloc(0);
  /** `closed` fails with the outcome the pending read names: what a hang-up means depends on the step. */
  #ended: HandshakeFailure | 'closed' | undefined;
  #waiting:
    | {
        readonly bytes: number;
        readonly closed: HandshakeFailure['outcome'];
        readonly resolve: (bytes: Buffer) => void;
        readonly reject: (error: HandshakeFailure) => void;
      }
    | undefined;

  constructor(socket: Socket, timeoutMilliseconds: number) {
    this.#socket = socket;
    socket.on('data', this.#onData);
    socket.on('close', this.#onClose);
    // Stays attached after release: the framing that follows attaches its own.
    socket.on('error', this.#onClose);
    this.#timer = setTimeout(() => this.#end(new HandshakeFailure('timeout')), timeoutMilliseconds);
    this.#timer.unref();
  }

  read(bytes: number, closed: HandshakeFailure['outcome']): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.#waiting = { bytes, closed, resolve, reject };
      this.#settle();
    });
  }

  /** Stops reading and leaves the socket paused for the framing; false if bytes arrived unasked. */
  release(): boolean {
    clearTimeout(this.#timer);
    this.#socket.off('data', this.#onData);
    this.#socket.off('close', this.#onClose);
    this.#socket.pause();
    return this.#buffered.byteLength === 0;
  }

  readonly #onData = (chunk: Buffer): void => {
    this.#buffered = Buffer.concat([this.#buffered, chunk]);
    if (this.#buffered.byteLength > LARGEST_MESSAGE) this.#end(new HandshakeFailure('insecure-runtime'));
    this.#settle();
  };

  readonly #onClose = (): void => this.#end('closed');

  #end(failure: HandshakeFailure | 'closed'): void {
    this.#ended ??= failure;
    this.#settle();
  }

  #settle(): void {
    const waiting = this.#waiting;
    if (waiting === undefined) return;
    if (this.#ended === undefined && this.#buffered.byteLength >= waiting.bytes) {
      this.#waiting = undefined;
      const bytes = this.#buffered.subarray(0, waiting.bytes);
      this.#buffered = this.#buffered.subarray(waiting.bytes);
      waiting.resolve(bytes);
    } else if (this.#ended !== undefined) {
      this.#waiting = undefined;
      waiting.reject(this.#ended === 'closed' ? new HandshakeFailure(waiting.closed) : this.#ended);
    }
  }
}

function fail(outcome: HandshakeFailure['outcome']): never {
  throw new HandshakeFailure(outcome);
}

/**
 * Runtime side. Waits for `secret` (the runtime's published secret, or
 * undefined when publishing failed), greets, checks the client's proof and
 * answers it. Resolves true with the socket paused for framing; otherwise the
 * socket is destroyed.
 */
export async function answerRuntimeHandshake(
  socket: Socket,
  secret: Promise<Uint8Array | undefined>,
  timeoutMilliseconds: number = BOOTSTRAP_TIMEOUT_MS,
): Promise<boolean> {
  const reader = new HandshakeReader(socket, timeoutMilliseconds);
  try {
    const published = (await secret) ?? fail('insecure-runtime');
    const runtimeNonce = randomBytes(NONCE_BYTES);
    socket.write(Buffer.concat([GREETING, runtimeNonce]));
    const reply = await reader.read(NONCE_BYTES + PROOF_BYTES, 'connection-failed');
    const clientNonce = reply.subarray(0, NONCE_BYTES);
    if (!proves(reply.subarray(NONCE_BYTES), proof(published, 'client', runtimeNonce, clientNonce))) {
      fail('insecure-runtime');
    }
    socket.write(proof(published, 'runtime', runtimeNonce, clientNonce));
    if (!reader.release()) fail('insecure-runtime');
    return true;
  } catch {
    reader.release();
    socket.destroy();
    return false;
  }
}

/**
 * Client side. Reads the runtime's greeting, then the secret (read only now,
 * so it is the one the greeting runtime published), proves it, and checks the
 * runtime's proof. On `authenticated` the socket is paused for framing;
 * otherwise it is destroyed.
 */
export async function openRuntimeHandshake(
  socket: Socket,
  readSecret: () => Promise<Uint8Array>,
  timeoutMilliseconds: number = BOOTSTRAP_TIMEOUT_MS,
): Promise<RuntimeHandshakeOutcome> {
  const reader = new HandshakeReader(socket, timeoutMilliseconds);
  try {
    const greeting = await reader.read(GREETING.byteLength + NONCE_BYTES, 'connection-failed');
    if (!greeting.subarray(0, GREETING.byteLength).equals(GREETING)) fail('insecure-runtime');
    const runtimeNonce = greeting.subarray(GREETING.byteLength);
    const secret = await readSecret().catch(() => fail('insecure-runtime'));
    if (secret.byteLength !== RUNTIME_SECRET_BYTES) fail('insecure-runtime');
    const clientNonce = randomBytes(NONCE_BYTES);
    socket.write(Buffer.concat([clientNonce, proof(secret, 'client', runtimeNonce, clientNonce)]));
    const answer = await reader.read(PROOF_BYTES, 'insecure-runtime');
    if (!proves(answer, proof(secret, 'runtime', runtimeNonce, clientNonce))) fail('insecure-runtime');
    if (!reader.release()) fail('insecure-runtime');
    return 'authenticated';
  } catch (error) {
    reader.release();
    socket.destroy();
    return error instanceof HandshakeFailure ? error.outcome : 'insecure-runtime';
  }
}
