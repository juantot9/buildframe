import { createHash, randomBytes } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';

/** A JSON-RPC error answer from Codex: the request was refused, not lost. */
export class CodexRpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** The connection closed before an answer came: the request's outcome is unknown. */
export class CodexConnectionLost extends Error {}

export interface CodexNotification {
  readonly method: string;
  readonly params?: unknown;
}

export interface CodexInitializeResult {
  readonly userAgent: string;
  readonly codexHome: string;
}

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE_TEXT = 0x1;
const OPCODE_CONTINUATION = 0x0;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

function frame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4);
  const length = payload.length;
  let header: Buffer;
  if (length < 126) header = Buffer.from([0x80 | opcode, 0x80 | length]);
  else if (length < 65_536) header = Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 255]);
  else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  const masked = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) masked[index] = payload[index]! ^ mask[index % 4]!;
  return Buffer.concat([header, mask, masked]);
}

/**
 * A client of Codex's shared app-server: JSON-RPC in WebSocket text frames
 * over the server's Unix socket (RFC 6455, client side, no extensions). It
 * never answers the server's own requests (approvals belong to the TUI).
 */
export class CodexAppServerClient {
  readonly #socket: Socket;
  readonly #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  readonly #notificationListeners = new Set<(notification: CodexNotification) => void>();
  readonly #closeListeners = new Set<() => void>();
  #buffer: Buffer = Buffer.alloc(0);
  readonly #fragments: Buffer[] = [];
  #nextId = 1;
  #closed = false;

  private constructor(socket: Socket, rest: Buffer) {
    this.#socket = socket;
    this.#buffer = rest;
    socket.on('data', (chunk: Buffer | string) => this.#read(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.on('close', () => this.#close());
    socket.on('error', () => this.#close());
    this.#read(Buffer.alloc(0));
  }

  /** Connects, upgrades to WebSocket, and runs Codex's `initialize` handshake. */
  static async connect(
    socketPath: string,
    clientName: string,
    clientVersion: string,
  ): Promise<{ readonly client: CodexAppServerClient; readonly initialized: CodexInitializeResult }> {
    const { socket, rest } = await new Promise<{ socket: Socket; rest: Buffer }>((resolve, reject) => {
      const socket = createConnection(socketPath);
      const key = randomBytes(16).toString('base64');
      const accept = createHash('sha1')
        .update(key + WEBSOCKET_GUID)
        .digest('base64');
      let received = Buffer.alloc(0);
      const onData = (chunk: Buffer): void => {
        received = Buffer.concat([received, chunk]);
        const end = received.indexOf('\r\n\r\n');
        if (end < 0) return;
        socket.off('data', onData);
        socket.off('error', reject);
        const head = received.subarray(0, end).toString('latin1');
        if (!/^HTTP\/1\.1 101/u.test(head) || !head.toLowerCase().includes(accept.toLowerCase())) {
          socket.destroy();
          reject(new CodexConnectionLost('Codex refused the WebSocket upgrade'));
          return;
        }
        resolve({ socket, rest: received.subarray(end + 4) });
      };
      socket.once('error', reject);
      socket.on('data', onData);
      socket.once('connect', () =>
        socket.write(
          `GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        ),
      );
    });
    const client = new CodexAppServerClient(socket, rest);
    const initialized = (await client.request('initialize', {
      clientInfo: { name: clientName, title: 'BuildFrame', version: clientVersion },
      // The start-if-idle queue is experimental in Codex 0.170.
      capabilities: { experimentalApi: true },
    })) as CodexInitializeResult;
    client.#send({ jsonrpc: '2.0', method: 'initialized' });
    return { client, initialized };
  }

  get closed(): boolean {
    return this.#closed;
  }

  /** Resolves with the result; rejects with `CodexRpcError` (refused) or `CodexConnectionLost` (unknown). */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.#closed) throw new CodexConnectionLost('Codex connection is closed');
    const id = this.#nextId++;
    return await new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  onNotification(listener: (notification: CodexNotification) => void): () => void {
    this.#notificationListeners.add(listener);
    return () => this.#notificationListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#socket.write(frame(OPCODE_CLOSE, Buffer.alloc(0)));
    } catch {
      // Closing anyway.
    }
    this.#socket.end();
    this.#close();
  }

  #send(message: object): void {
    this.#socket.write(frame(OPCODE_TEXT, Buffer.from(JSON.stringify(message), 'utf8')));
  }

  #read(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const buffer = this.#buffer;
      if (buffer.length < 2) return;
      const final = (buffer[0]! & 0x80) !== 0;
      const opcode = buffer[0]! & 0x0f;
      let length = buffer[1]! & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (buffer.length < offset + length) return;
      const payload = buffer.subarray(offset, offset + length);
      this.#buffer = buffer.subarray(offset + length);
      if (opcode === OPCODE_PING) this.#socket.write(frame(OPCODE_PONG, payload));
      else if (opcode === OPCODE_CLOSE) this.close();
      else if (opcode === OPCODE_TEXT || opcode === OPCODE_CONTINUATION) {
        this.#fragments.push(Buffer.from(payload));
        if (final) {
          const text = Buffer.concat(this.#fragments).toString('utf8');
          this.#fragments.length = 0;
          this.#dispatch(text);
        }
      }
    }
  }

  #dispatch(text: string): void {
    let message: { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: unknown };
    try {
      message = JSON.parse(text) as typeof message;
    } catch {
      return;
    }
    if (typeof message.method === 'string') {
      // A server request (an approval) carries an id: it is the TUI's to answer.
      if (message.id !== undefined) return;
      for (const listener of this.#notificationListeners) listener({ method: message.method, params: message.params });
      return;
    }
    if (typeof message.id !== 'number') return;
    const waiting = this.#pending.get(message.id);
    if (waiting === undefined) return;
    this.#pending.delete(message.id);
    const error = message.error as { code?: unknown; message?: unknown } | undefined;
    if (error !== undefined) {
      waiting.reject(new CodexRpcError(typeof error.code === 'number' ? error.code : 0, String(error.message ?? '')));
    } else {
      waiting.resolve(message.result);
    }
  }

  #close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiting of this.#pending.values()) waiting.reject(new CodexConnectionLost('Codex connection closed'));
    this.#pending.clear();
    for (const listener of this.#closeListeners) listener();
  }
}
