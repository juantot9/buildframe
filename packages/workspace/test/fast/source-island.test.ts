import { describe, expect, it } from 'vitest';

import * as legacyReviewImport from '@buildframe/workspace/legacy-review-import';
import * as privateDirectories from '@buildframe/workspace/private-directories';
import * as projection from '@buildframe/workspace/projection';
import * as reviewing from '@buildframe/workspace/reviewing';
import * as workspaceEvidence from '@buildframe/workspace/workspace-evidence';

import * as harnessInteraction from '../../src/harness-interaction/index.js';
import * as workspace from '../../src/index.js';
import * as workspaceRuntime from '../../src/runtime.js';

describe('Workspace Interface', () => {
  it('exports only the versioned bootstrap, never generic record operations', () => {
    expect(Object.keys(workspace).sort()).toEqual(['WORKSPACE_INTERFACE_VERSION', 'bootstrapWorkspace']);
    expect(workspace.WORKSPACE_INTERFACE_VERSION).toBe(1);
    expect(typeof workspace.bootstrapWorkspace).toBe('function');
  });

  it('keeps writer ownership and the reviewed Adapter seam off the application root', () => {
    expect(Object.keys(workspaceRuntime)).toEqual(['openWorkspaceRuntimeOwner']);
    expect(Object.keys(harnessInteraction)).toEqual([]);
    expect(
      Object.keys(workspaceRuntime).some(name => /sqlite|database|transaction|repository|state|path/iu.test(name)),
    ).toBe(false);
  });

  it('keeps the module subpaths to type surfaces, exposing no runtime behavior', () => {
    expect(Object.keys(projection)).toEqual([]);
    expect(Object.keys(reviewing)).toEqual([]);
    expect(Object.keys(legacyReviewImport)).toEqual([]);
    expect(Object.keys(workspaceEvidence)).toEqual([]);
  });

  it('keeps the private-directories subpath to file locations and Windows privacy', () => {
    expect(Object.keys(privateDirectories).sort()).toEqual([
      'DirectoryNotPrivate',
      'WindowsSecurityFailure',
      'WindowsSecurityUnavailable',
      'accessIsPrivate',
      'protectWindowsDirectory',
      'tightenWindowsDirectory',
      'userConfigurationDirectoryFor',
      'userStateDirectoryFor',
      'windowsDirectoryPrivacy',
      'windowsRuntimeDirectoryFor',
    ]);
  });
});
