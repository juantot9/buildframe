import { describe, expect, it } from 'vitest';

import * as harnessAdapterRuntime from '../../src/harnessAdapter.js';
import * as localRuntime from '../../src/index.js';
import * as runtimeLauncher from '../../src/launcher.js';

describe('local-runtime client Interface', () => {
  it('exposes connection bootstrap without exposing transport mechanics', () => {
    expect(Object.keys(localRuntime).sort()).toEqual([
      'LOCAL_RUNTIME_PROTOCOL_VERSION',
      'LocalRuntimeSessionError',
      'connectWorkspaceRuntime',
    ]);
    expect(Object.keys(localRuntime).some(name => /socket|frame|process|state|protocol.*frame/iu.test(name))).toBe(
      false,
    );
  });

  it('keeps the reviewed Adapter role on its own integration subpath', () => {
    expect(Object.keys(harnessAdapterRuntime).sort()).toEqual([
      'HARNESS_ADAPTER_PROTOCOL_VERSION',
      'connectHarnessAdapterRuntime',
      'connectorIndicator',
      'connectorIndicatorText',
      'exactReviewMessageText',
      'openConnectorSession',
    ]);
    expect(
      Object.keys(harnessAdapterRuntime).some(name => /socket|frame|state|evidence.*store|generic/iu.test(name)),
    ).toBe(false);
  });

  it('keeps process lifecycle on the launcher-only Interface', () => {
    expect(Object.keys(runtimeLauncher).sort()).toEqual([
      'LocalRuntimeServerError',
      'ensureWorkspaceRuntime',
      'inspectWorkspaceRuntime',
      'runWorkspaceRuntimeProcess',
      'startLocalRuntimeServer',
    ]);
    expect(
      Object.keys(runtimeLauncher).some(name => /socket|frame|sqlite|database|transaction|state/iu.test(name)),
    ).toBe(false);
  });
});
