import type { GitInspectionContext } from '../gitProcess.js';
import type { EvidencePath } from './contracts.js';
import { runGit } from './inspection.js';
import { validateRelativePath } from './utils.js';
import { evidencePath } from './views.js';

/**
 * Any text in any file, the way `git grep` finds it: fixed text, ignoring case,
 * in tracked and untracked files (ignored ones and binaries skipped), or in one
 * commit's files. One file only when a path is given.
 */
export interface CodeSearchRequest {
  readonly query: string;
  /** A commit or tree object to search; the working tree when absent. */
  readonly objectIdentity?: string;
  readonly pathBytes?: Buffer;
  readonly maxMatches: number;
  /** A match's line is cut to this many bytes. */
  readonly maxLineBytes: number;
}

export interface CodeSearchMatch {
  readonly path: EvidencePath;
  /** One-based. */
  readonly line: number;
  readonly text: string;
}

export type CodeSearchResult =
  | {
      readonly status: 'available';
      readonly matches: readonly CodeSearchMatch[];
      /** Every matching line, counted even past the matches returned. */
      readonly totalMatches: number;
    }
  | { readonly status: 'unavailable'; readonly reason: 'inspection-failed' | 'unsearchable-path' };

/** Room for the returned lines, with their paths, and a little more to know there are more. */
const MATCH_OUTPUT_BYTES = 512 * 1024;
const COUNT_OUTPUT_BYTES = 4 * 1024 * 1024;
const OBJECT_IDENTITY = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export async function searchCode(context: GitInspectionContext, request: CodeSearchRequest): Promise<CodeSearchResult> {
  if (request.objectIdentity !== undefined && !OBJECT_IDENTITY.test(request.objectIdentity)) {
    throw new TypeError('Invalid object identity');
  }
  let pathspec: string[] = [];
  if (request.pathBytes !== undefined) {
    validateRelativePath(request.pathBytes);
    // Git takes paths as text here; a path that isn't UTF-8 can't be named exactly.
    const text = request.pathBytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(request.pathBytes))
      return { status: 'unavailable', reason: 'unsearchable-path' };
    pathspec = [`:(literal)${text}`];
  }
  const source = request.objectIdentity === undefined ? ['--untracked'] : [];
  const tree = request.objectIdentity === undefined ? [] : [request.objectIdentity];
  const grep = (flags: readonly string[]) => [
    'grep',
    '-I',
    '-F',
    '-i',
    '-z',
    '--no-color',
    '--full-name',
    ...flags,
    ...source,
    '-e',
    request.query,
    ...tree,
    '--',
    ...pathspec,
  ];
  // Exit code 1 is "no match".
  const [counted, listed] = await Promise.all([
    runGit(context, grep(['-c']), { maxStdoutBytes: COUNT_OUTPUT_BYTES, allowedExitCodes: [0, 1] }),
    runGit(context, grep(['-n']), {
      maxStdoutBytes: MATCH_OUTPUT_BYTES,
      allowedExitCodes: [0, 1],
      keepOutputAtLimit: true,
    }),
  ]);
  const prefix = request.objectIdentity === undefined ? 0 : request.objectIdentity.length + 1;
  let totalMatches = 0;
  for (const record of records(counted.stdout, 1)) totalMatches += Number(record[1]?.toString('latin1') ?? 0);
  const matches: CodeSearchMatch[] = [];
  for (const record of records(listed.stdout, 2)) {
    if (matches.length >= request.maxMatches) break;
    const [path, line, text] = record;
    if (path === undefined || line === undefined || text === undefined) continue;
    matches.push({
      path: evidencePath(path.subarray(prefix)),
      line: Number(line.toString('latin1')),
      text: text.subarray(0, request.maxLineBytes).toString('utf8'),
    });
  }
  return { status: 'available', matches, totalMatches: Math.max(totalMatches, matches.length) };
}

/**
 * `-z` records: the path, then `fields` NUL-separated fields, the last running
 * to the end of the line. A record cut short by the output limit is dropped.
 */
function* records(output: Buffer, fields: number): Generator<readonly Buffer[]> {
  let start = 0;
  while (start < output.byteLength) {
    const parts: Buffer[] = [];
    let at = start;
    for (let field = 0; field < fields; field += 1) {
      const nul = output.indexOf(0, at);
      if (nul < 0) return;
      parts.push(output.subarray(at, nul));
      at = nul + 1;
    }
    const end = output.indexOf(0x0a, at);
    if (end < 0) return;
    parts.push(output.subarray(at, end));
    yield parts;
    start = end + 1;
  }
}
