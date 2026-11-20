import { WORKSPACE_INTERFACE_VERSION } from '@buildframe/workspace';
import { LOCAL_RUNTIME_PROTOCOL_VERSION } from '@buildframe/local-runtime';
import { HARNESS_ADAPTER_PROTOCOL_VERSION } from '@buildframe/local-runtime/harness-adapter';

import { DECLARED_NODE_RANGE, PINNED_TESTED_NODE_VERSION } from './nodeSupport.js';
import { CLAUDE_CODE_SUPPORT, CODEX_SUPPORT, OPENCODE_SUPPORT, PI_SUPPORT } from './supportFacts.js';

export interface ReleaseCoordinates {
  readonly application: string;
  readonly pi: string;
  readonly opencode: string;
  readonly claudeCode: { readonly marketplace: string; readonly plugin: string; readonly repository: string };
}

/** Where each released piece is published. */
export const RELEASE_COORDINATES: ReleaseCoordinates = Object.freeze({
  application: '@buildframe/cli',
  pi: '@buildframe/pi',
  opencode: '@buildframe/opencode',
  claudeCode: Object.freeze({
    marketplace: 'buildframe',
    plugin: 'buildframe',
    repository: 'github.com/juantot9/buildframe',
  }),
});

/**
 * The machine-readable claims one release makes: where it is published, what
 * it runs on, and which agent versions it accepts. Docs, doctor and release
 * checks read these same facts; `support/manifest.json` is this, generated.
 */
export function supportManifest(productVersion: string): unknown {
  return {
    schemaVersion: 2,
    productVersion,
    releaseCoordinates: RELEASE_COORDINATES,
    node: { range: DECLARED_NODE_RANGE, tested: PINNED_TESTED_NODE_VERSION },
    packageManagers: ['npm', 'pnpm'],
    environments: ['macOS', 'Linux', 'Windows'],
    hosts: {
      pi: { range: PI_SUPPORT.range, verified: PI_SUPPORT.verified },
      claudeCode: { range: CLAUDE_CODE_SUPPORT.range, verified: CLAUDE_CODE_SUPPORT.verified },
      opencode: { range: OPENCODE_SUPPORT.range, verified: OPENCODE_SUPPORT.verified },
      codex: { range: CODEX_SUPPORT.range, verified: CODEX_SUPPORT.verified },
    },
    protocols: {
      workspaceInterface: WORKSPACE_INTERFACE_VERSION,
      localRuntime: LOCAL_RUNTIME_PROTOCOL_VERSION,
      adapter: HARNESS_ADAPTER_PROTOCOL_VERSION,
    },
    knownLimitations: [
      'One agent session is connected per repository; the newest /buildframe wins.',
      'Messages go to the agent exactly as written; BuildFrame never scans them for secrets.',
      'BuildFrame trusts programs running as the same user on the same machine.',
      'Windows is x64 only; WSL1 is refused and WSL2 is not claimed.',
      'On Windows, a save can roll back to the one before it after a power loss; it is never half-written.',
    ],
  };
}
