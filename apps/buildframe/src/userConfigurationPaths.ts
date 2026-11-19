import os from 'node:os';
import path from 'node:path';

import { userConfigurationDirectoryFor } from '@buildframe/workspace/private-directories';

export function defaultUserConfigurationPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir(),
): string {
  return path.join(userConfigurationDirectoryFor(environment, homeDirectory), 'config.json');
}

/** The user-level outgoing Message template beside the configuration file. */
export function messageTemplatePath(configurationPath: string = defaultUserConfigurationPath()): string {
  return path.join(path.dirname(configurationPath), 'message-template.md');
}
