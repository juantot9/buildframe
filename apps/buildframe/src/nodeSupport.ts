/** The Node versions BuildFrame declares, and the one it is tested on. */
export const MINIMUM_NODE_VERSION = [26, 4, 0] as const;
export const DECLARED_EXCLUSIVE_MAXIMUM_NODE_VERSION = [27, 0, 0] as const;
export const DECLARED_NODE_RANGE = '>=26.4.0 <27.0.0';
export const PINNED_TESTED_NODE_VERSION = '26.5.1';

export type NodeVersion = readonly [number, number, number];
export type NodeSupport =
  | { readonly status: 'supported' }
  | { readonly status: 'refused'; readonly message: string }
  | { readonly status: 'warning'; readonly message: string };

export function parseVersion(value: string): NodeVersion | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(value);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: NodeVersion, right: NodeVersion): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function nodeSupport(value: string): NodeSupport {
  const version = parseVersion(value) ?? [0, 0, 0];
  if (compareVersions(version, MINIMUM_NODE_VERSION) < 0) {
    return {
      status: 'refused',
      message:
        `BuildFrame requires Node >=26.4.0; found v${value}. ` +
        `Use the pinned tested version, Node ${PINNED_TESTED_NODE_VERSION}.\n`,
    };
  }
  if (compareVersions(version, DECLARED_EXCLUSIVE_MAXIMUM_NODE_VERSION) >= 0) {
    return {
      status: 'warning',
      message:
        `Warning: Node v${value} is outside BuildFrame's declared ` +
        `${DECLARED_NODE_RANGE} source range; the pinned tested version is ` +
        `Node ${PINNED_TESTED_NODE_VERSION}. Continuing because v${value} is not known bad.\n`,
    };
  }
  return { status: 'supported' };
}
