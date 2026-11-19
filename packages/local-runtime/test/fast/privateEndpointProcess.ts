import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  listenPrivateEndpoint,
  preparePrivateRuntimeDirectory,
  validatePrivateRuntimeEndpoint,
} from '../../src/runtimeLocation.js';

// Runs on a real main thread, like the runtime process: worker threads (where
// Vitest runs tests) cannot change the umask.
const scratch = await mkdtemp(path.join(os.tmpdir(), 'bf-endpoint-'));
const base = path.join(scratch, 'base');
const directory = path.join(base, 'buildframe');
const location = { directory, endpoint: path.join(directory, 'w.sock'), ownedBase: base };
const server = createServer();
try {
  await preparePrivateRuntimeDirectory(location);
  process.umask(0o022);
  await listenPrivateEndpoint(server, location);
  // No secureBoundEndpoint yet: the first thing a connector could observe.
  const mode = (await lstat(location.endpoint)).mode & 0o777;
  let validation = 'valid';
  await validatePrivateRuntimeEndpoint(location).catch((error: { code?: string }) => {
    validation = error.code ?? 'error';
  });
  process.stdout.write(JSON.stringify({ mode, validation, umaskAfter: process.umask() }));
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(scratch, { recursive: true, force: true });
}
