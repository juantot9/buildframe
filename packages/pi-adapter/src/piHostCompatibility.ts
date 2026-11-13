import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

export const MINIMUM_PI_HOST_VERSION = '0.80.6';
export const PI_HOST_COMPATIBILITY_RANGE = '>=0.80.6 <2.0.0';
export const VERIFIED_PI_HOST_VERSIONS: readonly string[] = Object.freeze([
  '0.80.6',
  '0.80.7',
  '0.80.10',
  '0.81.0',
  '0.81.1',
  '0.82.1',
  '0.84.1',
  '0.85.1',
  '1.3.0',
]);

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const STABLE_SEMANTIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

type StableSemanticVersion = readonly [major: number, minor: number, patch: number];

export type PiHostCompatibility =
  | {
      readonly status: 'compatible';
      readonly version: string;
      readonly evidence: 'verified' | 'compatible-family';
    }
  | {
      readonly status: 'unsupported';
      readonly version?: string;
      readonly reason: 'version-unavailable' | 'malformed-version' | 'too-old' | 'major-unreviewed';
    };

function stableSemanticVersion(value: string): StableSemanticVersion | undefined {
  const match = STABLE_SEMANTIC_VERSION.exec(value);
  if (match === null) return undefined;
  const version = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return version.every(Number.isSafeInteger) ? version : undefined;
}

function compareVersions(left: StableSemanticVersion, right: StableSemanticVersion): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Pi-specific admission policy. Generic Workspace compatibility remains exact. */
export function assessPiHostVersion(version: string | undefined): PiHostCompatibility {
  if (version === undefined) {
    return { status: 'unsupported', reason: 'version-unavailable' };
  }
  const parsed = stableSemanticVersion(version);
  if (parsed === undefined) {
    return { status: 'unsupported', version, reason: 'malformed-version' };
  }
  const minimum = stableSemanticVersion(MINIMUM_PI_HOST_VERSION);
  if (minimum === undefined) throw new Error('Invalid built-in Pi compatibility floor');
  if (compareVersions(parsed, minimum) < 0) {
    return { status: 'unsupported', version, reason: 'too-old' };
  }
  if (parsed[0] >= 2) {
    return { status: 'unsupported', version, reason: 'major-unreviewed' };
  }
  return {
    status: 'compatible',
    version,
    evidence: VERIFIED_PI_HOST_VERSIONS.includes(version) ? 'verified' : 'compatible-family',
  };
}

export function isCompatiblePiHostVersion(version: string): boolean {
  return assessPiHostVersion(version).status === 'compatible';
}

/**
 * Resolve the version from the package that owns the active Pi CLI entrypoint.
 * Importing Pi's VERSION is insufficient when this source package has its own
 * development dependency on an older Pi release.
 */
export function discoverPiHostVersion(entrypoint: string | undefined): string | undefined {
  if (entrypoint === undefined || entrypoint.length === 0) return undefined;
  let resolvedEntrypoint: string;
  try {
    resolvedEntrypoint = realpathSync(entrypoint);
  } catch {
    resolvedEntrypoint = resolve(entrypoint);
  }

  let directory = dirname(resolvedEntrypoint);
  const root = parse(directory).root;
  while (true) {
    try {
      const value = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as unknown;
      if (typeof value === 'object' && value !== null && 'name' in value && value.name === PI_PACKAGE_NAME) {
        return 'version' in value && typeof value.version === 'string' ? value.version : undefined;
      }
    } catch {
      // Most entrypoint ancestors are not package roots.
    }
    if (directory === root) return undefined;
    directory = dirname(directory);
  }
}

export function piHostCompatibilityLabel(compatibility: PiHostCompatibility): string {
  if (compatibility.status === 'compatible') return `Pi ${compatibility.version}`;
  if (compatibility.reason === 'version-unavailable') return 'Pi host version unavailable';
  if (compatibility.reason === 'malformed-version') {
    return 'Pi host version is not a stable semantic version';
  }
  if (compatibility.reason === 'too-old') {
    return `Pi ${compatibility.version ?? 'unknown'} is too old; requires ${PI_HOST_COMPATIBILITY_RANGE}`;
  }
  return `Pi ${compatibility.version ?? 'unknown'} is outside ${PI_HOST_COMPATIBILITY_RANGE}`;
}
