#!/usr/bin/env node
// The Mod runs this through `$.process.run`. From a BuildFrame checkout it starts
// the helper built beside the plugin; installed from the marketplace it runs the
// helper that @buildframe/cli installs (`buildframe-claude-helper`), with this
// Node and no shell, so it starts the same way on Windows (findHelper.js).
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { findInstalledHelper } from './findHelper.js';

const refuse = () => {
  process.stdout.write(
    `${JSON.stringify({ status: 'refused', label: 'BuildFrame isn’t installed; run npm i -g @buildframe/cli' })}\n`,
  );
  process.exitCode = 1;
};

let built;
try {
  built = await import('../../dist/direct/helperEntry.js');
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

if (built !== undefined) {
  await built.runClaudeDirectHelperLauncher(fileURLToPath(new URL('./daemon.js', import.meta.url)));
} else {
  const entry = await findInstalledHelper();
  if (entry === undefined) {
    refuse();
  } else {
    const child = spawn(process.execPath, [entry], { stdio: 'inherit' });
    child.once('error', refuse);
    child.once('exit', code => {
      process.exitCode = code ?? 1;
    });
  }
}
