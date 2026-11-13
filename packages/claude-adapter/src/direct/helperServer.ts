import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ClaudeModChannel } from './claudeDirectAdapter.js';
import { parseClaudeModFact, type ClaudeModCommand, type ClaudeModFact } from './modProtocol.js';

/** Below the Mod's 30-second `$.http.fetch` limit, so a held poll always answers. */
export const CLAUDE_HELPER_POLL_HOLD_MS = 20_000;
/** A Mod that has not polled for this long is gone: reloaded, ended, or killed. */
export const CLAUDE_HELPER_LIVENESS_MS = 45_000;

/** Room for a 16 KiB answer at JSON's worst-case escaping beside a full batch of facts. */
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_FACTS_PER_REQUEST = 64;

export interface ClaudeHelperServerOptions {
  /** The bearer secret handed only to the Mod that launched this helper. */
  readonly token: string;
  readonly onFacts: (facts: readonly ClaudeModFact[]) => Promise<void>;
  /** The Mod stopped polling or detached; called at most once. */
  readonly onModLost: () => void;
  readonly pollHoldMs?: number;
  readonly livenessMs?: number;
}

interface HeldPoll {
  readonly response: ServerResponse;
  readonly timer: NodeJS.Timeout;
}

function authorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(token, 'utf8');
  return presented.byteLength === expected.byteLength && timingSafeEqual(presented, expected);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    length += buffer.byteLength;
    if (length > MAX_REQUEST_BYTES) throw new RangeError('request too large');
    chunks.push(buffer);
  }
  return length === 0 ? {} : (JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
}

function reply(response: ServerResponse, status: number, body: unknown = {}): void {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(text);
}

/**
 * The helper's only ingress: loopback HTTP for the one Mod holding the token.
 * It never accepts a prompt body; commands flow out, content-free facts in.
 */
export class ClaudeHelperServer implements ClaudeModChannel {
  readonly #options: ClaudeHelperServerOptions;
  readonly #pollHoldMs: number;
  readonly #livenessMs: number;
  readonly #server: Server;
  readonly #queue: ClaudeModCommand[] = [];
  #held: HeldPoll | undefined;
  #lastPollAt = Date.now();
  #liveness: NodeJS.Timeout | undefined;
  #factChain: Promise<void> = Promise.resolve();
  #lost = false;
  #port = 0;

  constructor(options: ClaudeHelperServerOptions) {
    this.#options = options;
    this.#pollHoldMs = options.pollHoldMs ?? CLAUDE_HELPER_POLL_HOLD_MS;
    this.#livenessMs = options.livenessMs ?? CLAUDE_HELPER_LIVENESS_MS;
    this.#server = createServer((request, response) => {
      void this.#handle(request, response).catch(() => {
        if (!response.headersSent) reply(response, 400);
      });
    });
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(0, '127.0.0.1', () => {
        this.#server.off('error', reject);
        resolve();
      });
    });
    this.#port = (this.#server.address() as AddressInfo).port;
    this.#lastPollAt = Date.now();
    this.#liveness = setInterval(() => this.#checkLiveness(), Math.min(this.#livenessMs, 5_000));
    this.#liveness.unref();
    return this.#port;
  }

  deliver(command: ClaudeModCommand): boolean {
    if (this.#lost) return false;
    this.#queue.push(command);
    this.#release();
    return true;
  }

  withdraw(dispatchId: string): boolean {
    const index = this.#queue.findIndex(command => command.type === 'submit' && command.dispatchId === dispatchId);
    if (index < 0) return false;
    this.#queue.splice(index, 1);
    return true;
  }

  async close(): Promise<void> {
    this.#lost = true;
    if (this.#liveness !== undefined) clearInterval(this.#liveness);
    const held = this.#held;
    this.#held = undefined;
    if (held !== undefined) {
      clearTimeout(held.timer);
      reply(held.response, 200, { commands: this.#queue.splice(0) });
    }
    await new Promise<void>(resolve => this.#server.close(() => resolve()));
    this.#server.closeAllConnections();
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (
      request.method !== 'POST' ||
      request.headers.host !== `127.0.0.1:${this.#port}` ||
      !authorized(request, this.#options.token)
    ) {
      request.resume();
      reply(response, 404);
      return;
    }
    const body = await readBody(request);
    if (request.url === '/next') {
      this.#poll(response);
      return;
    }
    if (request.url === '/facts') {
      const facts = this.#parseFacts(body);
      if (facts === undefined) {
        reply(response, 400);
        return;
      }
      // Facts are ordered native history: apply each batch after the previous one.
      const applied = this.#factChain.then(async () => await this.#options.onFacts(facts));
      this.#factChain = applied.catch(() => undefined);
      await applied;
      reply(response, 200);
      return;
    }
    if (request.url === '/detach') {
      reply(response, 200);
      this.#loseMod();
      return;
    }
    reply(response, 404);
  }

  #parseFacts(body: unknown): ClaudeModFact[] | undefined {
    if (typeof body !== 'object' || body === null || !('facts' in body) || !Array.isArray(body.facts)) {
      return undefined;
    }
    if (body.facts.length > MAX_FACTS_PER_REQUEST) return undefined;
    const facts: ClaudeModFact[] = [];
    for (const value of body.facts) {
      const fact = parseClaudeModFact(value);
      if (fact === undefined) return undefined;
      facts.push(fact);
    }
    return facts;
  }

  #poll(response: ServerResponse): void {
    this.#lastPollAt = Date.now();
    if (this.#lost) {
      reply(response, 410);
      return;
    }
    // One Mod, one poll: a newer poll supersedes a held one.
    const previous = this.#held;
    if (previous !== undefined) {
      clearTimeout(previous.timer);
      reply(previous.response, 200, { commands: [] });
    }
    const timer = setTimeout(() => {
      if (this.#held?.response !== response) return;
      this.#held = undefined;
      this.#lastPollAt = Date.now();
      reply(response, 200, { commands: [] });
    }, this.#pollHoldMs);
    timer.unref();
    this.#held = { response, timer };
    this.#release();
  }

  #release(): void {
    const held = this.#held;
    if (held === undefined || this.#queue.length === 0) return;
    this.#held = undefined;
    clearTimeout(held.timer);
    reply(held.response, 200, { commands: this.#queue.splice(0) });
  }

  #checkLiveness(): void {
    if (this.#held !== undefined) return;
    if (Date.now() - this.#lastPollAt > this.#livenessMs) this.#loseMod();
  }

  #loseMod(): void {
    if (this.#lost) return;
    this.#lost = true;
    this.#options.onModLost();
  }
}
