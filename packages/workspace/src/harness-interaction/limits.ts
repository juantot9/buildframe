export const IDENTITY_MAX_BYTES = 512;

export const EVIDENCE_IDENTITY_MAX_BYTES = 400;

export const LABEL_MAX_BYTES = 512;

export const LIMITATION_MAX_BYTES: number = 4 * 1024;

export const MAX_CAPABILITIES = 32;

export const MAX_LIMITATIONS = 32;

export const MIN_NO_START_TIMEOUT_MS = 1_000;

export const MAX_NO_START_TIMEOUT_MS: number = 10 * 60 * 1_000;

export const MAX_ATTACHMENTS = 64;

export const MAX_HANDOFFS = 512;

export const MAX_INVOCATIONS = 512;

export const MAX_PREPARATIONS = 512;

export const MAX_ARMED_OCCURRENCES = 16;

/** Exact claim-to-submit evidence window; expiry is unresolved, never rejection. */
export const USER_PULL_START_OBSERVATION_WINDOW_MS = 30_000;

export const MAX_EVIDENCE_PER_INVOCATION = 1_024;

export const MAX_INTERRUPTION_INTENTS = 128;

export const MAX_PROJECTED_INTERACTIONS = 64;

export const MAX_PROJECTED_EVIDENCE_IDENTITIES = 16;

export const MAX_REVIEW_QUESTION_BYTES: number = 64 * 1024;

/** Frozen Claude bridge transport bound for one rendered User Pull payload. */
export const MAX_USER_PULL_PAYLOAD_BYTES: number = 64 * 1024;

/** Body plus one 256 KiB saved-source line remains below both reviewed transport bounds. */
export const MAX_REVIEW_MESSAGE_BYTES: number = 256 * 1024;

export const MAX_MESSAGE_TEMPLATE_BYTES: number = 8 * 1024;

export const MESSAGE_TEMPLATE_PLACEHOLDER: RegExp = /\{\{([a-z-]+)\}\}/gu;

export const MAX_REVIEW_MESSAGE_PATH_BYTES: number = 4 * 1024;

export const MAX_REVIEW_RESPONSE_BYTES: number = 16 * 1024;

export const MAX_REVIEW_QUESTIONS = 1_024;

export const MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS = 16;

/** Prepared facts are an internal latency cache; misses retain the complete fail-closed preparation path. */
export const MAX_PREPARED_REVIEW_MESSAGE_INSPECTIONS = 32;

export const MAX_REVIEW_BATCHES = 128;

/** Canonical checkout locators, matching the bridge's own path bound. */
export const MAX_CANONICAL_PATH_BYTES: number = 4 * 1024;

export const MAX_ANCHOR_LINE_BYTES: number = 256 * 1024;

export const SHA256_PATTERN: RegExp = /^[0-9a-f]{64}$/u;

export const ATTACHMENT_PATTERN: RegExp = /^att_[0-9a-f]{64}$/u;

export const REVIEW_PATTERN: RegExp = /^rev_[0-9a-f]{64}$/u;

export const BATCH_PATTERN: RegExp = /^rbt_[0-9a-f]{64}$/u;

export const INVOCATION_PATTERN: RegExp = /^hin_[0-9a-f]{64}$/u;

export const PREPARATION_PATTERN: RegExp = /^hpp_[0-9a-f]{64}$/u;

export const ARM_OCCURRENCE_PATTERN: RegExp = /^hpa_[0-9a-f]{64}$/u;

export const HANDOFF_PATTERN: RegExp = /^hho_[0-9a-f]{64}$/u;

export const RECEIPT_PATTERN: RegExp = /^hcr_[0-9a-f]{64}$/u;

export const ACKNOWLEDGEMENT_REQUIREMENT_PATTERN: RegExp = /^hgr_[0-9a-f]{64}$/u;

export const ACKNOWLEDGEMENT_PATTERN: RegExp = /^hsa_[0-9a-f]{64}$/u;

export const SNAPSHOT_PATTERN: RegExp = /^hcs_[0-9a-f]{64}$/u;

export const COMPATIBILITY_PATTERN: RegExp = /^hcp_[0-9a-f]{64}$/u;

export const INTERRUPTION_PATTERN: RegExp = /^hir_[0-9a-f]{64}$/u;

export const QUESTION_PATTERN: RegExp = /^qst_[0-9a-f]{64}$/u;

export const REVIEW_BASIS_PATTERN: RegExp = /^rbs_[0-9a-f]{64}$/u;

export const REVIEW_MESSAGE_PATTERN: RegExp = /^rmg_[0-9a-f]{64}$/u;

export const RESPONSE_PATTERN: RegExp = /^rrp_[0-9a-f]{64}$/u;

export const FILE_PATTERN: RegExp = /^fil_[0-9a-f]{64}$/u;

export const DIFF_ROW_PATTERN: RegExp = /^row_[0-9a-f]{64}$/u;
