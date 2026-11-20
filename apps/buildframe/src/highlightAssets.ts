import { createRequire } from 'node:module';
import type { FiletypeParserOptions } from '@opentui/core';

const require = createRequire(import.meta.url);

/** Deliberately closed; renderer inference never grants parser capability. */
const EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascriptreact',
  md: 'markdown',
  markdown: 'markdown',
  zig: 'zig',
  py: 'python',
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  java: 'java',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  html: 'html',
  htm: 'html',
  css: 'css',
});

export function reviewingFiletype(displayPath: string): string | undefined {
  const extension = /\.([^.\/]+)$/u.exec(displayPath)?.[1]?.toLowerCase();
  return extension === undefined ? undefined : EXTENSIONS[extension];
}

export const REVIEWING_FILETYPES: readonly string[] = Object.freeze([...new Set(Object.values(EXTENSIONS))]);

/** Package assets only. No native grammar binding is imported or executed. */
export function reviewingParserAssets(): FiletypeParserOptions[] {
  const query = (language: string, name = 'highlights'): string =>
    require.resolve(`tree-sitter-${language}/queries/${name}.scm`);
  const languages = ['python', 'go', 'rust', 'c', 'cpp', 'java', 'json', 'bash', 'html', 'css'];
  return [
    ...languages.map((filetype): FiletypeParserOptions => ({
      filetype,
      // Matching query + WASM releases, not modern queries against older collection grammars.
      wasm: require.resolve(`tree-sitter-${filetype}/tree-sitter-${filetype}.wasm`),
      queries: {
        highlights: filetype === 'cpp' ? [query('c'), query('cpp')] : [query(filetype)],
        ...(filetype === 'html' ? { injections: [query('html', 'injections')] } : {}),
      },
    })),
    {
      filetype: 'toml',
      wasm: require.resolve('@tree-sitter-grammars/tree-sitter-toml/tree-sitter-toml.wasm'),
      queries: { highlights: [require.resolve('@tree-sitter-grammars/tree-sitter-toml/queries/highlights.scm')] },
    },
    {
      filetype: 'yaml',
      wasm: require.resolve('@tree-sitter-grammars/tree-sitter-yaml/tree-sitter-yaml.wasm'),
      queries: { highlights: [require.resolve('@tree-sitter-grammars/tree-sitter-yaml/queries/highlights.scm')] },
    },
  ];
}
