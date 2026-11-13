import { request as httpRequest } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { ClaudeHelperServer } from '../../src/direct/helperServer.js';
import type { ClaudeModFact } from '../../src/direct/modProtocol.js';

const TOKEN = 'a'.repeat(64);

describe('Claude Direct helper server', () => {
  const servers = new Set<ClaudeHelperServer>();
  const ports = new Map<ClaudeHelperServer, number>();

  /** A raw request, so a test can choose headers fetch would refuse to send. */
  async function raw(
    server: ClaudeHelperServer,
    options: {
      readonly method?: string;
      readonly path?: string;
      readonly headers?: Record<string, string>;
      readonly body?: string;
    },
  ): Promise<number> {
    const port = ports.get(server);
    if (port === undefined) throw new Error('Helper is not listening');
    return await new Promise((resolve, reject) => {
      const outgoing = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: options.method ?? 'POST',
          path: options.path ?? '/next',
          headers: options.headers ?? {},
        },
        incoming => {
          incoming.resume();
          resolve(incoming.statusCode ?? 0);
        },
      );
      // The helper may close a connection it refuses before reading all of it.
      outgoing.on('error', error =>
        (error as NodeJS.ErrnoException).code === 'ECONNRESET' || error.message === 'socket hang up'
          ? resolve(0)
          : reject(error),
      );
      outgoing.end(options.body ?? '{}');
    });
  }

  afterEach(async () => {
    for (const server of servers) await server.close();
    servers.clear();
    ports.clear();
  });

  async function start(options: { readonly pollHoldMs?: number; readonly livenessMs?: number } = {}): Promise<{
    readonly server: ClaudeHelperServer;
    readonly facts: ClaudeModFact[];
    readonly lost: { count: number };
    readonly post: (path: string, body: unknown, token?: string) => Promise<Response>;
  }> {
    const facts: ClaudeModFact[] = [];
    const lost = { count: 0 };
    const server = new ClaudeHelperServer({
      token: TOKEN,
      onFacts: async batch => {
        facts.push(...batch);
      },
      onModLost: () => {
        lost.count += 1;
      },
      ...options,
    });
    servers.add(server);
    const port = await server.listen();
    ports.set(server, port);
    const post = async (path: string, body: unknown, token = TOKEN): Promise<Response> =>
      await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    return { server, facts, lost, post };
  }

  it('answers only the bearer of the launch token', async () => {
    const { post, server } = await start();
    server.deliver({ type: 'status', label: 'secret-free label' });
    const refused = await post('/next', {}, 'b'.repeat(64));
    expect(refused.status).toBe(404);
    const unauthorized = await post('/facts', { facts: [{ type: 'foreign-prompt' }] }, '');
    expect(unauthorized.status).toBe(404);
  });

  it('refuses every caller without the exact launch token, and they change nothing', async () => {
    const { post, server, facts, lost } = await start({ pollHoldMs: 30 });
    server.deliver({ type: 'submit', dispatchId: 'cdd_kept', text: 'only the Mod may take this' });
    const bearer = `Bearer ${TOKEN}`;
    const host = `127.0.0.1:${ports.get(server)}`;
    const refusals: number[] = [
      // Another local caller, with no credentials or the wrong kind.
      await raw(server, { headers: { host } }),
      await raw(server, { headers: { host, authorization: TOKEN } }),
      await raw(server, { headers: { host, authorization: `Basic ${TOKEN}` } }),
      // Near misses of the secret.
      await raw(server, { headers: { host, authorization: `Bearer ${TOKEN.slice(0, -1)}` } }),
      await raw(server, { headers: { host, authorization: `Bearer ${TOKEN}a` } }),
      await raw(server, { headers: { host, authorization: `bearer ${TOKEN}` } }),
      // The right secret through a different Host, as a web page would send it via DNS rebinding.
      await raw(server, { headers: { host: `localhost:${ports.get(server)}`, authorization: bearer } }),
      await raw(server, { headers: { host: 'attacker.example', authorization: bearer } }),
      // The right secret, but not a request the Mod ever makes.
      await raw(server, { method: 'GET', headers: { host, authorization: bearer } }),
      await raw(server, { method: 'PUT', path: '/facts', headers: { host, authorization: bearer } }),
      await raw(server, { path: '/submit', headers: { host, authorization: bearer } }),
      // Forged facts without the secret.
      await raw(server, {
        path: '/facts',
        headers: { host },
        body: JSON.stringify({
          facts: [{ type: 'turn-complete', turnId: 'turn-1', reason: 'answer', answer: 'forged' }],
        }),
      }),
      await raw(server, { path: '/detach', headers: { host } }),
    ];
    // Each is refused (404) or its connection is closed (0); none is answered.
    expect(refusals.filter(status => status !== 404 && status !== 0)).toEqual([]);
    // Too large to be a Mod's request, even with the secret: refused, or the connection is closed.
    expect([0, 400]).toContain(
      await raw(server, {
        path: '/facts',
        headers: { host, authorization: bearer },
        body: JSON.stringify({ facts: [], padding: 'x'.repeat(256 * 1024) }),
      }),
    );
    // Nothing a refused caller sent was applied, and the queued submit is still the Mod's.
    expect(facts).toEqual([]);
    expect(lost.count).toBe(0);
    const taken = await post('/next', {});
    expect(await taken.json()).toEqual({
      commands: [{ type: 'submit', dispatchId: 'cdd_kept', text: 'only the Mod may take this' }],
    });
  });

  it('hands queued commands to the held poll and supports withdrawing an untaken submit', async () => {
    const { post, server } = await start({ pollHoldMs: 5_000 });
    expect(server.deliver({ type: 'submit', dispatchId: 'cdd_1', text: 'first' })).toBe(true);
    expect(server.withdraw('cdd_1')).toBe(true);
    expect(server.withdraw('cdd_1')).toBe(false);

    const held = post('/next', {});
    await new Promise(resolve => setTimeout(resolve, 20));
    server.deliver({ type: 'submit', dispatchId: 'cdd_2', text: 'second\r\n  exact' });
    const response = await held;
    expect(await response.json()).toEqual({
      commands: [{ type: 'submit', dispatchId: 'cdd_2', text: 'second\r\n  exact' }],
    });
    // Once taken, a submit can no longer be proven undelivered.
    expect(server.withdraw('cdd_2')).toBe(false);
  });

  it('answers an empty poll after the hold window', async () => {
    const { post } = await start({ pollHoldMs: 30 });
    const response = await post('/next', {});
    expect(await response.json()).toEqual({ commands: [] });
  });

  it('applies valid fact batches in order and rejects a batch with any invalid fact', async () => {
    const { post, facts } = await start();
    const first = post('/facts', { facts: [{ type: 'foreign-prompt' }] });
    const second = post('/facts', {
      facts: [{ type: 'turn-start', turnId: 'turn-1', matchesPending: false }],
    });
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(facts.map(fact => fact.type)).toEqual(['foreign-prompt', 'turn-start']);

    const invalid = await post('/facts', {
      facts: [{ type: 'foreign-prompt' }, { type: 'turn-start', turnId: 'turn-2', matchesPending: 'yes' }],
    });
    expect(invalid.status).toBe(400);
    const withText = await post('/facts', { facts: [{ type: 'foreign-prompt', text: 'leaked prompt' }] });
    expect(withText.status).toBe(400);
    const oversizedAnswer = await post('/facts', {
      facts: [{ type: 'turn-complete', turnId: 'turn-1', reason: 'answer', answer: 'x'.repeat(16 * 1024 + 1) }],
    });
    expect(oversizedAnswer.status).toBe(400);
    expect(facts).toHaveLength(2);

    const answered = await post('/facts', {
      facts: [{ type: 'turn-complete', turnId: 'turn-1', reason: 'answer', answer: '"\n'.repeat(5 * 1024) }],
    });
    expect(answered.status).toBe(200);
    expect(facts.at(-1)).toEqual({
      type: 'turn-complete',
      turnId: 'turn-1',
      reason: 'answer',
      answer: '"\n'.repeat(5 * 1024),
    });
  });

  it('treats a Mod that stops polling as gone and refuses later deliveries', async () => {
    const { server, lost } = await start({ livenessMs: 40 });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(lost.count).toBe(1);
    expect(server.deliver({ type: 'status', label: 'late' })).toBe(false);
  });

  it('detaches on request', async () => {
    const { post, server, lost } = await start();
    expect((await post('/detach', {})).status).toBe(200);
    expect(lost.count).toBe(1);
    expect(server.deliver({ type: 'status', label: 'late' })).toBe(false);
    expect((await post('/next', {})).status).toBe(410);
  });
});
