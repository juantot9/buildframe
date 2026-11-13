export const COMMAND_IDENTITY_MAX_BYTES = 512;

export const QUESTION_MAX_BYTES: number = 64 * 1024;

/** Leaves room for one equally bounded saved-source line inside the reviewed 1 MiB Adapter frame. */
export const REVIEW_MESSAGE_MAX_BYTES: number = 256 * 1024;

export const REVIEW_RESPONSE_MAX_BYTES: number = 16 * 1024;

export const ANCHOR_LINE_MAX_BYTES: number = 256 * 1024;

export const MAX_REVIEWS = 256;

export const MAX_DRAFTS = 1_024;

export const MAX_BATCHES = 128;

export const MAX_BATCH_QUESTIONS = 256;

export const MAX_REVIEW_CONTEXT_RULES = 64;

export const MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES: number = 512 * 1024;

export const REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES: number = 256 * 1024;

export const MAX_REVIEW_CONTEXT_SCOPE_BYTES: number = 50 * 1024 * 1024;

export const MAX_REVIEW_SNAPSHOTS: number = MAX_DRAFTS + 1;

export const MAX_REVIEW_BASES: number = MAX_REVIEW_SNAPSHOTS + 1;

export const MAX_REVIEW_MESSAGES: number = MAX_DRAFTS;

export const REVIEW_MANIFEST_WINDOW_FILES = 64;

export const REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS: 64 = 64;

export const REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES: number = 256 * 1024;

export const MAX_REVIEW_SNAPSHOT_CONTEXT_ITEMS: number = 250_000 + MAX_REVIEW_CONTEXT_RULES;

export const REVIEW_DIFF_WINDOW_ROWS = 64;

export const MAX_DIFF_ROWS_PER_FILE = 250_000;

export const MAX_LCS_CELLS = 4_000_000;

export const RECORD_ID_PATTERN: RegExp =
  /^(?:rev|cst|rps|rsn|rbs|rmg|rmo|rsf|rmw|rdw|qdr|rbt|qst|dsp|rrs|rrp|rcl|rvi|rcm|rcs|rcr|rcc|rsc|rsi|rsw|rsx|lgs|lso|lgc|lcp)_[0-9a-f]{64}$/u;

export const FILE_ID_PATTERN: RegExp = /^fil_[0-9a-f]{64}$/u;

export const DIFF_ROW_ID_PATTERN: RegExp = /^row_[0-9a-f]{64}$/u;
