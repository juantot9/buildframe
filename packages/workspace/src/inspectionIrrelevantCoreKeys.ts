/**
 * Checkout-local `core.*` keys that cannot change what an inspection reports.
 * They are dropped with every other non-structural key, so admitting them only
 * stops BuildFrame refusing common repositories: husky writes `core.hooksPath`,
 * and many people set an editor or pager per repository. Keys that change how
 * files are read, ignored or converted stay refused.
 */
export const INSPECTION_IRRELEVANT_CORE_KEYS: ReadonlySet<string> = new Set([
  'core.hookspath',
  'core.editor',
  'core.pager',
  'core.askpass',
  'core.sshcommand',
  'core.gitproxy',
  'core.whitespace',
  'core.commentchar',
  'core.commentstring',
  'core.abbrev',
  'core.notesref',
  'core.warnambiguousrefs',
  'core.sharedrepository',
  'core.createobject',
  'core.compression',
  'core.loosecompression',
  'core.bigfilethreshold',
  'core.deltabasecachelimit',
  'core.packedgitlimit',
  'core.packedgitwindowsize',
  'core.preloadindex',
  'core.untrackedcache',
  'core.multipackindex',
  'core.commitgraph',
  'core.fsync',
  'core.fsyncmethod',
  'core.fsyncobjectfiles',
]);
