#!/usr/bin/env node
// The installed `buildframe-claude-helper` command from @buildframe/cli. The BuildFrame
// Claude plugin runs it with no arguments to start one helper; the helper's
// detached daemon is this same file with `daemon`.
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runClaudeDirectHelperDaemon, runClaudeDirectHelperLauncher } from './helperEntry.js';

if (process.argv[2] === 'daemon') {
  try {
    await runClaudeDirectHelperDaemon();
  } catch {
    process.exit(1);
  }
} else {
  await runClaudeDirectHelperLauncher(fileURLToPath(import.meta.url), ['daemon']);
}
