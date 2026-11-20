// The environments Git runs under: inherited GIT_* controls stripped, and,
// for parsing one config file as data, no operator files either.

export function strippedGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('GIT_')) environment[name] = value;
  }
  environment.LC_ALL = 'C';
  environment.LANG = 'C';
  return environment;
}

export function configurationInputEnvironment(): NodeJS.ProcessEnv {
  // `git config --file --no-includes` is intentionally run with no repository
  // variables and no operator files. It parses one snapshotted local source as
  // data; it cannot resolve checkout includes or enter repository setup.
  const environment = strippedGitEnvironment();
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return environment;
}
