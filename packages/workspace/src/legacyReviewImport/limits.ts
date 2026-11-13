export const LEGACY_REVIEW_IMPORT_FORMAT_VERSION = 1;

export const MAX_LEGACY_REVIEW_SOURCE_PATH_BYTES: number = 16 * 1024;

export const MAX_COMMAND_IDENTITY_BYTES = 512;

export const MAX_LEGACY_RECEIPT_HISTORY_BATCHES = 24;

export const MAX_LEGACY_RECEIPT_BATCH_ANNOTATIONS = 8;

export const MAX_MOVED_RECEIPT_SEARCH_ENTRIES = 4_096;

export const MAX_MOVED_RECEIPT_SOURCES = 32;

export const MAX_MOVED_RECEIPT_WORKSPACE_PATHS = 32;

export const MAX_FORMER_CANONICAL_CHECKOUT_BYTES: number = 16 * 1024;

export const MAX_LEGACY_QUEUE_CANDIDATES = 32;

export const MAX_LEGACY_CANDIDATE_TEXT_PAGE_BYTES: number = 32 * 1024;

export const MAX_LEGACY_CANDIDATE_EXCERPT_PAGE_BYTES: number = 16 * 1024;

export const LEGACY_CANDIDATE_TEXT_PREVIEW_BYTES = 1_024;

export const LEGACY_CANDIDATE_EXCERPT_PREVIEW_BYTES = 512;

export const LEGACY_ID_WINDOW_BYTES = 128;

export const LEGACY_PATH_WINDOW_BYTES = 1_024;

export const LEGACY_LABEL_WINDOW_BYTES = 256;

export const LEGACY_ERROR_WINDOW_BYTES = 512;

export const LEGACY_TEXT_WINDOW_BYTES = 8_192;

export const LEGACY_EXCERPT_WINDOW_BYTES = 4_096;

export const WORKSPACE_IDENTITY_PATTERN: RegExp =
  /^wsp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const SOURCE_IDENTITY_PATTERN: RegExp = /^lgs_[0-9a-f]{64}$/u;

export const SOURCE_OCCURRENCE_IDENTITY_PATTERN: RegExp = /^lso_[0-9a-f]{64}$/u;

export const SOURCE_DECISION_IDENTITY_PATTERN: RegExp = /^lsd_[0-9a-f]{64}$/u;

export const QUEUE_CANDIDATE_IDENTITY_PATTERN: RegExp = /^lgc_[0-9a-f]{64}$/u;

export const CANDIDATE_DECISION_IDENTITY_PATTERN: RegExp = /^lcd_[0-9a-f]{64}$/u;

export const CANDIDATE_PROMOTION_IDENTITY_PATTERN: RegExp = /^lcp_[0-9a-f]{64}$/u;

export const MOVED_SOURCE_ASSOCIATION_IDENTITY_PATTERN: RegExp = /^lma_[0-9a-f]{64}$/u;

export const REVIEW_IDENTITY_PATTERN: RegExp = /^rev_[0-9a-f]{64}$/u;

export const REVIEW_SNAPSHOT_IDENTITY_PATTERN: RegExp = /^rsn_[0-9a-f]{64}$/u;

export const REVIEW_DRAFT_IDENTITY_PATTERN: RegExp = /^qdr_[0-9a-f]{64}$/u;

export const DIGEST_PATTERN: RegExp = /^[0-9a-f]{64}$/u;

export const LEGACY_CHECKOUT_HASH_PATTERN: RegExp = /^[0-9a-f]{64}$/u;

export const UNSIGNED_DECIMAL_PATTERN: RegExp = /^(?:0|[1-9][0-9]*)$/u;

export const SIGNED_DECIMAL_PATTERN: RegExp = /^-?(?:0|[1-9][0-9]*)$/u;

export const MAX_DECIMAL_BYTES = 128;
