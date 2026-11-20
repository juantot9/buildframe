/**
 * The agent versions each connector accepts, and the ones verified live. The
 * connectors declare the same facts in their own packages; a contract test
 * keeps the two in step, and release assembly generates the support manifest
 * from here.
 */
export interface HostSupport {
  /** Lowest accepted version, inclusive. */
  readonly minimum: readonly [number, number, number];
  /** First version no longer accepted. */
  readonly exclusiveMaximum: readonly [number, number, number];
  readonly range: string;
  readonly verified: readonly string[];
}

export const PI_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  minimum: [0, 80, 6],
  exclusiveMaximum: [2, 0, 0],
  range: '>=0.80.6 <2.0.0',
  verified: Object.freeze(['0.80.6', '0.80.7', '0.80.10', '0.81.0', '0.81.1', '0.82.1', '0.84.1', '0.85.1', '1.3.0']),
});

export const CLAUDE_CODE_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  minimum: [2, 1, 310],
  exclusiveMaximum: [3, 0, 0],
  range: '>=2.1.310 <3.0.0',
  verified: Object.freeze(['2.1.310', '2.1.311', '2.1.317', '2.1.322']),
});

export const OPENCODE_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  minimum: [2, 3, 2],
  exclusiveMaximum: [3, 0, 0],
  range: '>=2.3.2 <3.0.0',
  verified: Object.freeze(['2.3.2']),
});

export const CODEX_SUPPORT: HostSupport = Object.freeze<HostSupport>({
  minimum: [0, 170, 0],
  exclusiveMaximum: [1, 0, 0],
  range: '>=0.170.0 <1.0.0',
  verified: Object.freeze(['0.170.0', '0.171.0']),
});
