import { describe, expect, it } from 'vitest';

import type { ConnectorStatus } from '../../src/connector/contracts.js';
import type { ConnectRuntime } from '../../src/connector/attachLoop.js';
import { createConnectorSession } from '../../src/connector/session.js';
import type { HarnessAdapterRuntimeCloseReason, HarnessAdapterRuntimeDiagnostic } from '../../src/harnessAdapter.js';
import { ManualScheduler, RecordingSink, ScriptedHost, sessionOptions, settle } from './connectorFixtures.js';

const NOT_RUNNING: HarnessAdapterRuntimeDiagnostic = { code: 'runtime-unavailable', reason: 'not-running' } as never;
const REFUSED: HarnessAdapterRuntimeDiagnostic = { code: 'runtime-role-rejected' } as never;

/** A runtime that answers each connect from a script and lets the test close each connection. */
class ScriptedRuntime {
  readonly sink = new RecordingSink();
  readonly script: (HarnessAdapterRuntimeDiagnostic | 'connect')[] = [];
  readonly closers: ((reason: HarnessAdapterRuntimeCloseReason) => void)[] = [];
  attempts = 0;

  readonly connect: ConnectRuntime = async request => {
    this.attempts += 1;
    const next = this.script.shift() ?? 'connect';
    if (next !== 'connect') return { status: 'rejected', diagnostic: next };
    request.adapter.connect(this.sink);
    let close!: (reason: HarnessAdapterRuntimeCloseReason) => void;
    const closed = new Promise<HarnessAdapterRuntimeCloseReason>(resolve => (close = resolve));
    this.closers.push(close);
    return {
      status: 'connected',
      workspaceIdentity: request.workspaceIdentity,
      runtimeGeneration: `generation-${this.attempts}` as never,
      establishment: {} as never,
      closed,
      dispose: async () => close('disposed'),
    };
  };
}

function open(runtime: ScriptedRuntime) {
  const scheduler = new ManualScheduler();
  const session = createConnectorSession(sessionOptions(new ScriptedHost(), scheduler), runtime.connect);
  const statuses: ConnectorStatus['kind'][] = [];
  const first = session.attach(status => statuses.push(status.kind));
  return { scheduler, session, statuses, first };
}

describe('connector kit destination', () => {
  it('names the repository after the checkout folder on this platform', () => {
    const label = (canonicalCheckout: string): string =>
      createConnectorSession(
        { ...sessionOptions(new ScriptedHost(), new ManualScheduler()), canonicalCheckout },
        new ScriptedRuntime().connect,
      ).attachment.destination.repositoryLabel;
    expect(label('/repositories/example')).toBe('example');
    expect(label('/repositories/example/')).toBe('example');
    // Windows reports the checkout as `C:\…`.
    if (process.platform === 'win32') expect(label('C:\\Users\\dev\\example')).toBe('example');
  });
});

describe('connector kit attach loop', () => {
  it('waits for a runtime that is not there yet, then connects', async () => {
    const runtime = new ScriptedRuntime();
    runtime.script.push(NOT_RUNNING);
    const { scheduler, statuses, first, session } = open(runtime);
    await expect(first).resolves.toMatchObject({ kind: 'retrying', first: true, label: 'runtime unavailable' });
    scheduler.fire(250);
    await settle();
    expect(statuses).toEqual(['retrying', 'connected']);
    expect(runtime.attempts).toBe(2);
    await session.close();
  });

  it('stops for good on a refusal it cannot wait out', async () => {
    const runtime = new ScriptedRuntime();
    runtime.script.push(REFUSED);
    const { first, statuses } = open(runtime);
    await expect(first).resolves.toMatchObject({ kind: 'refused', label: 'Adapter role rejected' });
    await settle();
    expect(statuses).toEqual(['refused']);
    expect(runtime.attempts).toBe(1);
  });

  it('reconnects after a plain disconnect but never after another session replaced it', async () => {
    const runtime = new ScriptedRuntime();
    const { scheduler, statuses, first } = open(runtime);
    await first;
    await settle();
    runtime.closers[0]?.('runtime-disconnected');
    await settle();
    scheduler.fire(250);
    await settle();
    expect(runtime.attempts).toBe(2);
    runtime.closers[1]?.('replaced');
    await settle();
    scheduler.fire(250);
    await settle();
    expect(statuses).toEqual(['connected', 'retrying', 'connected', 'replaced']);
    expect(runtime.attempts).toBe(2);
    const availability = runtime.sink.accepted.filter(item => item.kind === 'harness.availability.observed');
    expect(availability.at(-1)).toMatchObject({ availability: { status: 'blocked', reason: 'disconnected' } });
  });

  it('holds evidence the Workspace could not take and delivers it once on reconnect', async () => {
    const runtime = new ScriptedRuntime();
    runtime.sink.refusals.push({ status: 'refused', reason: 'state-unavailable' });
    const { first, session, scheduler } = open(runtime);
    await first;
    await settle();
    expect(runtime.sink.accepted).toHaveLength(0);
    runtime.closers[0]?.('runtime-disconnected');
    await settle();
    scheduler.fire(250);
    await settle();
    const identities = runtime.sink.accepted.map(item => item.evidenceIdentity);
    expect(new Set(identities).size).toBe(identities.length);
    expect(runtime.sink.accepted.length).toBeGreaterThan(0);
    await session.close();
  });

  it('retries an acknowledgement refused for a moved State version', async () => {
    const runtime = new ScriptedRuntime();
    runtime.sink.refusals.push(
      { status: 'refused', reason: 'state-version-changed' },
      { status: 'refused', reason: 'state-version-changed' },
    );
    const { first, session } = open(runtime);
    await first;
    await settle();
    expect(runtime.sink.accepted).toHaveLength(1);
    await session.close();
  });
});
