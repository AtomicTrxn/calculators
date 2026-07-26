/**
 * Retention and limit constants.
 *
 * These live in one place so the SQL, the API responses, and any user-facing
 * copy can never disagree about the window size or the expiry deadlines.
 */

/** Maximum revisions retained per tracker. Enforced on every write. */
export const REVISION_WINDOW = 5;

/** A tracker with no save for this long is soft-deleted by the nightly job. */
export const INACTIVITY_EXPIRY_DAYS = 365;

/**
 * How long a soft-deleted tracker stays recoverable before the nightly job
 * destroys it. This is the deadline the undelete runbook races.
 */
export const TOMBSTONE_GRACE_DAYS = 90;

/** The page warns the user once a tracker is within this many days of expiry. */
export const EXPIRY_WARNING_DAYS = 30;

/** Max revision payload, in bytes. ~30x a realistic tracker. */
export const MAX_PAYLOAD_BYTES = 128 * 1024;

export const MAX_TITLE_LENGTH = 120;
export const MAX_SAVED_BY_LENGTH = 60;

// A per-tracker daily save cap was specified in the plan but is not
// implementable by counting revisions: the rolling window caps retained rows
// at REVISION_WINDOW, so such a count can never reach a meaningful threshold.
// Enforcing it properly would need a separate counter column. The RL_WRITE
// rate limiter (keyed by tracker id) covers the runaway-client case instead.

/** Rows touched per statement in the nightly sweep, to bound each run. */
export const CLEANUP_BATCH_LIMIT = 500;

/** Preflight cache duration, to keep OPTIONS off the 100k requests/day budget. */
export const CORS_MAX_AGE_SECONDS = 86400;

export const DAY_SECONDS = 86400;
