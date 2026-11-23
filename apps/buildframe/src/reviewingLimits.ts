/** How much Reviewing reads at a time, and how often it retries a read that raced a change. */

export const HOME_WINDOW_SIZE = 64;
export const MANIFEST_WINDOW_SIZE = 10_000;
export const DIFF_WINDOW_SIZE = 64;
/** Rows of one file kept loaded around the view, like an editor buffer; farther windows fall away. */
export const DIFF_KEEP_ROWS: number = DIFF_WINDOW_SIZE * 16;
export const QUESTION_WINDOW_SIZE = 8;
export const VERSION_WINDOW_SIZE = 64;
export const SEARCH_RESULT_WINDOW_SIZE = 64;
/** The Workspace's whole per-Review bound, so every Message of a Review finds its Handoff. */
export const HARNESS_INTERACTION_WINDOW_SIZE = 128;
export const QUESTION_BODY_WINDOW_BYTES: number = 16 * 1024;
export const MESSAGE_BODY_WINDOW_BYTES: number = 16 * 1024;
export const MESSAGE_BODY_LIMIT_BYTES: number = 256 * 1024;
export const REVIEW_BASIS_WINDOW_SIZE = 64;
export const REVIEW_MESSAGE_WINDOW_SIZE = 32;
export const LIVE_FILE_WINDOW_SIZE = 10_000;
export const MAX_PROJECTION_ATTEMPTS = 5;
