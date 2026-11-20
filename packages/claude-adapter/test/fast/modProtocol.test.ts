import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseClaudeModAttachRequest } from '../../src/direct/modProtocol.js';

const request = (cwd: string): unknown => ({ protocolVersion: 1, sessionId: 'session-1', cwd, hostVersion: '2.1.322' });

describe('a Claude attach request', () => {
  it('takes the session directory as an absolute path on this platform', () => {
    const absolute = path.resolve('repository');
    expect(parseClaudeModAttachRequest(request(absolute))).toMatchObject({ cwd: absolute });
    if (process.platform === 'win32') {
      expect(parseClaudeModAttachRequest(request('C:\\Users\\dev\\repository'))).toBeDefined();
      expect(parseClaudeModAttachRequest(request('C:/Users/dev/repository'))).toBeDefined();
    } else {
      expect(parseClaudeModAttachRequest(request('/home/dev/repository'))).toBeDefined();
    }
  });

  it('refuses a relative session directory', () => {
    expect(parseClaudeModAttachRequest(request('repository'))).toBeUndefined();
    expect(parseClaudeModAttachRequest(request(''))).toBeUndefined();
  });
});
