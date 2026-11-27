import { connectInstruction, supportedHostNames } from './supportFacts.js';

export interface DeveloperArguments {
  /** `doctor` checks this machine and repository; `endpoint` prints where an integration connects. */
  readonly command: 'review' | 'doctor' | 'endpoint';
  readonly startPath: string;
  readonly json: boolean;
  readonly noColor: boolean;
  readonly ascii: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export function developerUsage(): string {
  return [
    'BuildFrame: review what your coding agent changed, and send it Messages.',
    '',
    'Usage: buildframe [--no-color] [--ascii] [repository]',
    '       buildframe doctor [--json] [--ascii] [repository]',
    '       buildframe endpoint [--json] [repository]',
    '       buildframe --version',
    '',
    'bframe is a shorter name for the same command.',
    '',
    ...wrapped(
      `Opens the repository you are in, or the one given. Connect an agent by running ${connectInstruction()}, in the same repository.`,
    ),
    '',
    ...wrapped(
      `doctor checks Node, this repository, BuildFrame’s background process, its saved data, and the installed ${supportedHostNames()}. It changes nothing.`,
    ),
    '',
    ...wrapped(
      'endpoint prints the socket another harness or tool connects to, to receive Messages from BuildFrame (experimental).',
    ),
  ].join('\n');
}

/** Words on lines of at most 78 characters. */
function wrapped(text: string): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= 78) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export function parseDeveloperArguments(arguments_: readonly string[], defaultStartPath: string): DeveloperArguments {
  let command: DeveloperArguments['command'] = 'review';
  let commandSeen = false;
  let startPath: string | undefined;
  let json = false;
  let noColor = false;
  let ascii = false;
  let help = false;
  let version = false;
  let optionsEnded = false;
  for (const argument of arguments_) {
    if (!optionsEnded && argument === '--') {
      optionsEnded = true;
    } else if (argument.length === 0) {
      continue;
    } else if (!optionsEnded && (argument === '--help' || argument === '-h')) {
      help = true;
    } else if (!optionsEnded && (argument === '--version' || argument === '-v')) {
      version = true;
    } else if (!optionsEnded && argument === '--no-color') {
      noColor = true;
    } else if (!optionsEnded && argument === '--ascii') {
      ascii = true;
    } else if (!optionsEnded && argument === '--json') {
      json = true;
    } else if (
      !optionsEnded &&
      !commandSeen &&
      startPath === undefined &&
      (argument === 'doctor' || argument === 'endpoint')
    ) {
      command = argument;
      commandSeen = true;
    } else if (!optionsEnded && argument.startsWith('-')) {
      throw new TypeError(`Unknown option ${argument}`);
    } else if (startPath === undefined) {
      startPath = argument;
    } else {
      throw new TypeError('Only one workspace path may be provided');
    }
  }
  if (json && command === 'review') throw new TypeError('--json works only with doctor and endpoint');
  return {
    command,
    startPath: startPath ?? defaultStartPath,
    json,
    noColor,
    ascii,
    help,
    version,
  };
}
