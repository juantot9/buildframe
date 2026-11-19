import { describe, expect, it } from 'vitest';

import { signalForChild } from '../../src/consoleSignals.js';

describe('the re-exec parent', () => {
  it('passes Ctrl+C and termination on to its child on macOS and Linux', () => {
    expect(signalForChild('SIGINT', 'darwin')).toBe('SIGINT');
    expect(signalForChild('SIGTERM', 'linux')).toBe('SIGTERM');
  });

  it('never kills its child on Windows, where Ctrl+C reaches the child itself', () => {
    expect(signalForChild('SIGINT', 'win32')).toBeUndefined();
    expect(signalForChild('SIGTERM', 'win32')).toBeUndefined();
  });
});
