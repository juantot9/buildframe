// Detached helper process for one attached Claude conversation.
import process from 'node:process';

import { runClaudeDirectHelperDaemon } from '../../dist/direct/helperEntry.js';

try {
  await runClaudeDirectHelperDaemon();
} catch {
  process.exit(1);
}
