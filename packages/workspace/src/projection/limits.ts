import { REVIEW_MANIFEST_WINDOW_FILES } from '../reviewing/index.js';

export const WORKSPACE_PROJECTION_VERSION: 1 = 1;

export const MAX_HOME_REVIEWS = 64;

export const MAX_QUESTION_ITEMS = 8;

export const MAX_REVIEW_BASIS_ITEMS = 64;

export const MAX_REVIEW_MESSAGE_ITEMS = 64;

export const MAX_REVIEW_VERSION_ITEMS = 64;

export const MAX_QUESTION_BODY_WINDOW_BYTES: number = 16 * 1024;

export const MAX_QUESTION_BODY_PREVIEW_BYTES: number = 4 * 1024;

export const MAX_REVIEW_MESSAGE_BODY_WINDOW_BYTES: number = 16 * 1024;

export const MAX_REVIEW_MESSAGE_BODY_PREVIEW_BYTES: number = 4 * 1024;

export const MAX_DIFF_ROW_BYTES: number = 8 * 1024;

export const MAX_REVIEW_SEARCH_RESULTS = 64;

export const MAX_REVIEW_SEARCH_QUERY_BYTES = 256;

export const MAX_REVIEW_SEARCH_SNIPPET_BYTES = 1_024;

export const MAX_REVIEW_CONTEXT_CANDIDATES: number = REVIEW_MANIFEST_WINDOW_FILES;

export const MAX_SNAPSHOT_EVIDENCE_IDENTITIES = 4;

export const MAX_LIVE_CAPTURES = 2;

export const LIVE_INVALIDATION_DEBOUNCE_MS = 40;

export const LIVE_FALLBACK_VERIFICATION_MS = 2_000;

/** The same check while nobody is looking; the file watcher still reports changes at once. */
export const LIVE_BACKGROUND_FALLBACK_VERIFICATION_MS = 10_000;

/** The search index reads each side of a file in windows this big, as many per read as fit the State's 1 MiB bound. */
export const SEARCH_CONTENT_WINDOW_BYTES: number = 256 * 1024;

export const SEARCH_CONTENT_WINDOWS_PER_READ = 4;

export const MAX_REVIEWS = 256;

export const MAX_REVIEW_DRAFTS = 1_024;

export const MAX_REVIEW_BATCHES = 128;

export const REVIEW_ID_PATTERN: RegExp = /^rev_[0-9a-f]{64}$/u;

export const REVIEW_SNAPSHOT_ID_PATTERN: RegExp = /^rsn_[0-9a-f]{64}$/u;

export const FILE_ID_PATTERN: RegExp = /^fil_[0-9a-f]{64}$/u;

export const QUESTION_ITEM_ID_PATTERN: RegExp = /^(?:qdr|qst)_[0-9a-f]{64}$/u;

export const REVIEW_BASIS_ID_PATTERN: RegExp = /^rbs_[0-9a-f]{64}$/u;

export const REVIEW_MESSAGE_ID_PATTERN: RegExp = /^rmg_[0-9a-f]{64}$/u;

export const LIVE_CHANGES_ID_PATTERN: RegExp = /^lch_[0-9a-f]{64}$/u;

/**
 * The most files one Review manifest, live manifest or live file list read
 * returns. Stored manifests stay in 64-file records; a read spans as many as it
 * needs, so a client can hold a repository's whole file list at once.
 */
export const MAX_FILE_LIST_READ_FILES = 10_000;

/**
 * The most bytes one file-list read's entries take when encoded: half the
 * local runtime's 1 MiB message cap, leaving room for the rest of the view.
 * A read that reaches it stops early and says where the next one starts.
 */
export const MAX_FILE_LIST_READ_BYTES: number = 512 * 1024;
