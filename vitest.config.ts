import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 90s per test: the cross-process scenarios need the longer bound on CI's
    // 2-core runner, and the same bound keeps one verification mode everywhere.
    testTimeout: 90_000,
    fileParallelism: false,
    // The default forks pool intermittently dies at startup with
    // ERR_IPC_CHANNEL_CLOSED on Node 26; the threads pool has no process IPC.
    pool: 'threads',
    include: [
      'apps/buildframe/test/**/*.test.ts',
      'packages/claude-adapter/test/**/*.test.ts',
      'packages/local-runtime/test/**/*.test.ts',
      'packages/pi-adapter/test/**/*.test.ts',
      'packages/workspace/test/**/*.test.ts',
    ],
    passWithNoTests: false,
  },
});
