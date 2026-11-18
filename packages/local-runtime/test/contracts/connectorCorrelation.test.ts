import { describe, expect, it } from 'vitest';

import type { ConnectorHostFact } from '../../src/connector/contracts.js';
import { createConnectorSession } from '../../src/connector/session.js';
import {
  ManualScheduler,
  messageDirective,
  NO_START_MS,
  RecordingSink,
  ScriptedHost,
  sessionOptions,
  settle,
} from './connectorFixtures.js';

const unusedConnect = async () => {
  throw new Error('These tests drive the session without a runtime');
};

function open(configure: (host: ScriptedHost) => void = () => undefined) {
  const host = new ScriptedHost();
  configure(host);
  const scheduler = new ManualScheduler();
  const session = createConnectorSession(sessionOptions(host, scheduler), unusedConnect);
  const sink = new RecordingSink();
  const connection = session.connect(sink);
  const directive = messageDirective(session.attachment.attachmentIdentity);
  return { host, scheduler, session, sink, connection, directive };
}

async function run(facts: readonly ConnectorHostFact[]): Promise<string[]> {
  const { session, sink, connection, directive } = open();
  await expect(connection.perform(directive)).resolves.toEqual({ status: 'accepted-for-observation' });
  for (const fact of facts) await session.observe(fact);
  return sink.turnEvidence();
}

const OWN_START: ConnectorHostFact = { type: 'turn-started', own: true, turnId: 't1' };
const START = 'harness.invocation.start-observed';
const LOST = 'harness.invocation.correlation-lost:correlation-lost';
const TERMINAL_LOST = 'harness.invocation.correlation-lost:terminal-evidence-lost';

describe('connector kit correlation rule', () => {
  it('attributes an outcome only to an own turn that nothing else entered', async () => {
    const answered = await run([
      OWN_START,
      { type: 'turn-ended', outcome: 'ended-normally', turnId: 't1', answer: 'Done.' },
    ]);
    expect(answered).toEqual([START, 'harness.invocation.terminal-observed']);

    expect(await run([{ type: 'input', joins: 'next-turn' }, OWN_START])).toEqual([LOST]);
    expect(await run([{ type: 'turn-started', own: false }])).toEqual([LOST]);
    expect(await run([OWN_START, { type: 'input', joins: 'this-turn' }])).toEqual([START, LOST]);
    expect(await run([OWN_START, OWN_START])).toEqual([START, LOST]);
    expect(
      await run([
        OWN_START,
        { type: 'input', joins: 'next-turn' },
        { type: 'turn-ended', outcome: 'failed', turnId: 't1' },
      ]),
    ).toEqual([START, 'harness.invocation.terminal-observed:harness-failed']);
    expect(await run([OWN_START, { type: 'turn-ended', outcome: 'ended-normally', turnId: 'other' }])).toEqual([
      START,
      TERMINAL_LOST,
    ]);
    expect(await run([OWN_START, { type: 'turn-ended', outcome: 'unknown' }])).toEqual([START, TERMINAL_LOST]);
    expect(await run([{ type: 'turn-ended', outcome: 'ended-normally' }])).toEqual([LOST]);
    expect(await run([{ type: 'own-input-dropped' }])).toEqual(['harness.invocation.rejected:harness-rejected']);
  });

  it('keeps a Response only within the contract bound', async () => {
    const { session, sink, connection, directive } = open();
    await connection.perform(directive);
    await session.observe(OWN_START);
    await session.observe({ type: 'turn-ended', outcome: 'ended-normally', answer: 'x'.repeat(65) });
    const terminal = sink.accepted.find(item => item.kind === 'harness.invocation.terminal-observed');
    expect(terminal).toBeDefined();
    expect(terminal).not.toHaveProperty('result');
  });

  it('sends the exact text once and refuses a second Send while one is in flight', async () => {
    const { host, connection, directive, session } = open();
    await connection.perform(directive);
    expect(host.submitted).toEqual(['Explain review.ts:17 as written.\r\n  café']);
    await expect(
      connection.perform(messageDirective(session.attachment.attachmentIdentity, '6')),
    ).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'harness-rejected',
    });
    expect(host.submitted).toHaveLength(1);
  });

  it('proves a rejection on no start only when the host says it is idle', async () => {
    const idle = open(host => (host.isIdle = () => true));
    await idle.connection.perform(idle.directive);
    idle.scheduler.fire(NO_START_MS);
    await settle();
    expect(idle.sink.turnEvidence()).toEqual(['harness.invocation.rejected:harness-rejected']);

    const unknown = open();
    await unknown.connection.perform(unknown.directive);
    unknown.scheduler.fire(NO_START_MS);
    await settle();
    expect(unknown.sink.turnEvidence()).toEqual([LOST]);
    expect(unknown.host.released).toEqual(['lost']);
  });

  it('settles a pending submit from its answer, or withdraws it and proves nothing was sent', async () => {
    const taken = open(host => (host.receipt = 'pending'));
    const observation = taken.connection.perform(taken.directive);
    await taken.session.observe({ type: 'own-input-taken' });
    await expect(observation).resolves.toEqual({ status: 'accepted-for-observation' });

    const withdrawn = open(host => (host.receipt = 'pending'));
    const refused = withdrawn.connection.perform(withdrawn.directive);
    withdrawn.scheduler.fire(10_000);
    await expect(refused).resolves.toMatchObject({ status: 'proven-not-dispatched', reason: 'host-unavailable' });
  });

  it('loses the turn when the runtime or the session goes away, and never sends it again', async () => {
    const { session, sink, connection, directive, host } = open();
    await connection.perform(directive);
    await session.runtimeDisconnected('generation-1');
    await session.runtimeConnected('generation-2');
    expect(sink.turnEvidence()).toEqual(['harness.invocation.correlation-lost:attachment-lost']);
    expect(host.submitted).toHaveLength(1);

    await session.observe({ type: 'session-ending' });
    await expect(
      connection.perform(messageDirective(session.attachment.attachmentIdentity, '6')),
    ).resolves.toMatchObject({
      reason: 'host-unavailable',
    });
  });

  it('keeps sessions in one process apart', () => {
    const scheduler = new ManualScheduler();
    const first = createConnectorSession(sessionOptions(new ScriptedHost(), scheduler, 'epoch-a'), unusedConnect);
    const second = createConnectorSession(sessionOptions(new ScriptedHost(), scheduler, 'epoch-b'), unusedConnect);
    expect(first.attachment.attachmentIdentity).not.toBe(second.attachment.attachmentIdentity);
  });
});
