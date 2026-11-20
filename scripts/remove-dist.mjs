// Removes the `dist` directory of the package pnpm runs this from: the
// packages' `clean` script, in place of `rm -rf dist`, which Windows lacks.
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true, maxRetries: 5 });
