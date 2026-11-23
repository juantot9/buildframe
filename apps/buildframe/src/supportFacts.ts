/**
 * The agent versions each connector accepts, and the ones verified live. The
 * connectors declare the same facts in their own packages; a contract test
 * keeps the two in step, and release assembly generates the support manifest
 * from here.
 */
export interface HostSupport {
  /** The agent's name, as its connector reports it. */
  readonly name: string;
  /** What the user types in a session of the agent to connect it. */
  readonly connect: '/buildframe' | '!buildframe';
  /** Lowest accepted version, inclusive. */
  readonly minimum: readonly [number, number, number];
  /** First version no longer accepted. */
  readonly exclusiveMaximum: readonly [number, number, number];
  readonly range: string;
  readonly verified: readonly string[];
}

export const PI_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  name: 'Pi',
  connect: '/buildframe',
  minimum: [0, 80, 6],
  exclusiveMaximum: [2, 0, 0],
  range: '>=0.80.6 <2.0.0',
  verified: Object.freeze(['0.80.6', '0.80.7', '0.80.10', '0.81.0', '0.81.1', '0.82.1', '0.84.1', '0.85.1', '1.3.0']),
});

export const CLAUDE_CODE_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  name: 'Claude Code',
  connect: '/buildframe',
  minimum: [2, 1, 310],
  exclusiveMaximum: [3, 0, 0],
  range: '>=2.1.310 <3.0.0',
  verified: Object.freeze(['2.1.310', '2.1.311', '2.1.317', '2.1.322']),
});

export const OPENCODE_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  name: 'OpenCode',
  connect: '/buildframe',
  minimum: [2, 3, 2],
  exclusiveMaximum: [3, 0, 0],
  range: '>=2.3.2 <3.0.0',
  verified: Object.freeze(['2.3.2']),
});

export const CODEX_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  name: 'Codex',
  connect: '!buildframe',
  minimum: [0, 170, 0],
  exclusiveMaximum: [1, 0, 0],
  range: '>=0.170.0 <1.0.0',
  verified: Object.freeze(['0.170.0', '0.171.0']),
});

/** Every agent BuildFrame connects to, in the order it names them. */
export const SUPPORTED_HOSTS: readonly HostSupport[] = Object.freeze([
  PI_SUPPORT,
  CLAUDE_CODE_SUPPORT,
  OPENCODE_SUPPORT,
  CODEX_SUPPORT,
]);

function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** How to connect any agent: "/buildframe in a Pi, Claude Code or OpenCode session, or !buildframe in a Codex session". */
export function connectInstruction(): string {
  const byCommand = new Map<string, string[]>();
  for (const host of SUPPORTED_HOSTS) byCommand.set(host.connect, [...(byCommand.get(host.connect) ?? []), host.name]);
  return [...byCommand].map(([command, names]) => `${command} in a ${listed(names)} session`).join(', or ');
}

/** What to type in this agent to connect it; the general instruction when the agent isn't known. */
export function connectCommandIn(agent: string): string {
  const host = SUPPORTED_HOSTS.find(candidate => candidate.name === agent);
  return host === undefined ? connectInstruction() : `${host.connect} in ${host.name}`;
}

/** The agents' names in one phrase: "Pi, Claude Code, OpenCode and Codex". */
export function supportedHostNames(): string {
  const names = SUPPORTED_HOSTS.map(host => host.name);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
