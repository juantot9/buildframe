#!/usr/bin/env node
// The Mod runs this through `$.process.run`. From a BuildFrame checkout it starts
// the helper built beside the plugin; installed from the marketplace it hands
// over to the `buildframe-claude-helper` command that @buildframe/cli provides.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

let built;
try {
  built = await import('../../dist/direct/helperEntry.js');
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

if (built !== undefined) {
  await built.runClaudeDirectHelperLauncher(fileURLToPath(new URL('./daemon.js', import.meta.url)));
} else {
  const child = spawn('buildframe-claude-helper', [], { stdio: 'inherit' });
  child.once('error', () => {
    process.stdout.write(
      `${JSON.stringify({ status: 'refused', label: 'BuildFrame isn’t installed; run npm i -g @buildframe/cli' })}\n`,
    );
    process.exitCode = 1;
  });
  child.once('exit', code => {
    process.exitCode = code ?? 1;
  });
}
