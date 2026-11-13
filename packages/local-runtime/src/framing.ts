import type { Socket } from 'node:net';
import { TextDecoder } from 'node:util';

import { MAX_FRAME_BYTES, MAX_PENDING_OUTPUT_BYTES, type ProtocolErrorFrame } from './protocol.js';

export type FramedSocketCloseCode = 'disconnected' | 'malformed-frame' | 'frame-too-large' | 'backpressure';

export interface FramedSocketHandlers {
  readonly onFrame: (frame: unknown) => void;
  readonly onClose: (code: FramedSocketCloseCode) => void;
}

/** Private bounded JSONL framing shared by both local-runtime Adapters. */
export class FramedSocket {
  readonly #socket: Socket;
  readonly #handlers: FramedSocketHandlers;
  readonly #decoder = new TextDecoder('utf-8', { fatal: true });
  #frameChunks: Buffer[] = [];
  #frameBytes = 0;
  #closed = false;

  constructor(socket: Socket, handlers: FramedSocketHandlers) {
    this.#socket = socket;
    this.#handlers = handlers;

    socket.on('data', (chunk: Buffer) => this.#accept(chunk));
    socket.once('error', () => this.#finish('disconnected'));
    socket.once('close', () => this.#finish('disconnected'));
  }

  send(frame: object): boolean {
    if (this.#closed || this.#socket.destroyed) return false;

    let json: string;
    try {
      json = JSON.stringify(frame);
    } catch {
      this.destroy('malformed-frame');
      return false;
    }

    const body = Buffer.from(json, 'utf8');
    if (body.byteLength > MAX_FRAME_BYTES) {
      this.destroy('frame-too-large');
      return false;
    }

    const encoded = Buffer.concat([body, Buffer.from('\n')]);
    if (this.#socket.writableLength + encoded.byteLength > MAX_PENDING_OUTPUT_BYTES) {
      this.destroy('backpressure');
      return false;
    }

    try {
      this.#socket.write(encoded);
      return true;
    } catch {
      this.destroy('disconnected');
      return false;
    }
  }

  protocolError(code: ProtocolErrorFrame['code']): void {
    if (this.#closed) return;
    const frame: ProtocolErrorFrame = { type: 'protocol.error', code };
    this.send(frame);
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.end();
    this.#handlers.onClose(code === 'frame-too-large' ? 'frame-too-large' : 'malformed-frame');
  }

  destroy(code: FramedSocketCloseCode = 'disconnected'): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.destroy();
    this.#handlers.onClose(code);
  }

  #accept(chunk: Buffer): void {
    if (this.#closed) return;
    let offset = 0;

    while (!this.#closed) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline < 0) {
        const remainder = chunk.subarray(offset);
        const frameBytes = this.#frameBytes + remainder.byteLength;
        if (frameBytes > MAX_FRAME_BYTES) {
          this.#frameChunks = [];
          this.#frameBytes = 0;
          this.protocolError('frame-too-large');
          return;
        }
        if (remainder.byteLength > 0) {
          this.#frameChunks.push(offset === 0 ? chunk : Buffer.from(remainder));
          this.#frameBytes = frameBytes;
        }
        return;
      }

      const finalChunk = chunk.subarray(offset, newline);
      const lineBytes = this.#frameBytes + finalChunk.byteLength;
      if (lineBytes === 0) {
        this.protocolError('malformed-frame');
        return;
      }
      if (lineBytes > MAX_FRAME_BYTES) {
        this.#frameChunks = [];
        this.#frameBytes = 0;
        this.protocolError('frame-too-large');
        return;
      }

      let line: Buffer;
      if (this.#frameChunks.length === 0) {
        line = finalChunk;
      } else {
        if (finalChunk.byteLength > 0) this.#frameChunks.push(finalChunk);
        line = Buffer.concat(this.#frameChunks, lineBytes);
      }
      this.#frameChunks = [];
      this.#frameBytes = 0;

      let frame: unknown;
      try {
        frame = JSON.parse(this.#decoder.decode(line)) as unknown;
      } catch {
        this.protocolError('malformed-frame');
        return;
      }

      this.#handlers.onFrame(frame);
      offset = newline + 1;
    }
  }

  #finish(code: FramedSocketCloseCode): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#handlers.onClose(code);
  }
}
