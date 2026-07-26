// Tracker and revision handlers.

import {
  EXPIRY_WARNING_DAYS,
  INACTIVITY_EXPIRY_DAYS,
  REVISION_WINDOW,
} from "./constants.ts";
import { ApiError, readBody } from "./http.ts";
import type { Env, JsonValue, RevisionRow, TrackerRow } from "./types.ts";
import {
  addDaysSeconds,
  newRevisionId,
  newToken,
  newTrackerId,
  nowSeconds,
  sha256,
  timingSafeEqualString,
} from "./util.ts";
import {
  optionalTitle,
  requireRevisionNumber,
  requireSavedBy,
  validatePayload,
} from "./validation.ts";

/**
 * Look up a tracker and verify the bearer token.
 *
 * An unknown tracker and a bad token return the identical 401. Tracker ids are
 * UUIDs precisely so they cannot be enumerated; a distinguishable 404 would
 * turn the id space into an existence oracle and give that back.
 */
export async function requireTracker(
  request: Request,
  env: Env,
  trackerId: string,
): Promise<TrackerRow> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw unauthorized();

  const tracker = await env.DB.prepare("select * from trackers where id = ?")
    .bind(trackerId)
    .first<TrackerRow>();
  if (!tracker) throw unauthorized();

  const presented = await sha256(token);
  if (!timingSafeEqualString(presented, tracker.token_hash)) throw unauthorized();

  // Order matters: the token is verified before the tombstone is revealed, so
  // 410 never leaks that a tracker existed to someone without the link.
  if (tracker.deleted_at !== null) {
    throw new ApiError(410, "tracker_deleted", "This shared tracker was deleted.");
  }
  return tracker;
}

function unauthorized(): ApiError {
  return new ApiError(401, "unauthorized", "This tracker link is not valid.");
}

function expiresAt(tracker: TrackerRow): number {
  return addDaysSeconds(tracker.updated_at, INACTIVITY_EXPIRY_DAYS);
}

function trackerMeta(tracker: TrackerRow): Record<string, JsonValue> {
  return {
    trackerId: tracker.id,
    title: tracker.title,
    revisionNumber: tracker.current_revision_number,
    updatedAt: tracker.updated_at,
    // Server-computed so the page never derives the deadline from its own
    // clock, which would drift and show a wrong date across timezones.
    expiresAt: expiresAt(tracker),
    expiryWarningDays: EXPIRY_WARNING_DAYS,
    revisionWindow: REVISION_WINDOW,
  };
}

function revisionMeta(revision: RevisionRow): Record<string, JsonValue> {
  return {
    revisionId: revision.id,
    revisionNumber: revision.revision_number,
    savedAt: revision.saved_at,
    savedBy: revision.saved_by,
  };
}

/** POST /trackers — create a tracker and its first revision. */
export async function createTracker(request: Request, env: Env) {
  const body = await readBody(request);
  const payloadJson = validatePayload(body.payload);
  const savedBy = requireSavedBy(body.savedBy);
  const title = optionalTitle(body.title);

  const at = nowSeconds();
  const trackerId = newTrackerId();
  const revisionId = newRevisionId();
  const token = newToken();
  const tokenHash = await sha256(token);
  const payloadHash = await sha256(payloadJson);

  await env.DB.batch([
    env.DB.prepare(
      `insert into trackers
         (id, title, token_hash, current_revision_id, current_revision_number,
          created_at, updated_at, deleted_at)
       values (?, ?, ?, ?, 1, ?, ?, null)`,
    ).bind(trackerId, title, tokenHash, revisionId, at, at),
    env.DB.prepare(
      `insert into revisions
         (id, tracker_id, revision_number, saved_at, saved_by, payload_json, payload_hash)
       values (?, ?, 1, ?, ?, ?, ?)`,
    ).bind(revisionId, trackerId, at, savedBy, payloadJson, payloadHash),
  ]);

  return {
    trackerId,
    // The only time the plaintext token is ever returned. It is not
    // recoverable afterwards — only its hash is stored.
    token,
    title,
    revisionNumber: 1,
    savedAt: at,
    savedBy,
    expiresAt: addDaysSeconds(at, INACTIVITY_EXPIRY_DAYS),
    expiryWarningDays: EXPIRY_WARNING_DAYS,
    revisionWindow: REVISION_WINDOW,
  };
}

/** GET /trackers/:id/latest */
export async function getLatest(env: Env, tracker: TrackerRow) {
  const revision = await env.DB.prepare("select * from revisions where id = ?")
    .bind(tracker.current_revision_id)
    .first<RevisionRow>();
  if (!revision) {
    // Only reachable if the pointer and the rows disagree, which the save path
    // is built to make impossible. Fail loudly rather than serving nothing.
    throw new ApiError(500, "missing_revision", "The current revision is unavailable.");
  }
  return {
    ...trackerMeta(tracker),
    ...revisionMeta(revision),
    payload: JSON.parse(revision.payload_json) as JsonValue,
  };
}

/** GET /trackers/:id/revisions — metadata for the retained window. */
export async function listRevisions(env: Env, tracker: TrackerRow) {
  const { results } = await env.DB.prepare(
    `select id, revision_number, saved_at, saved_by
       from revisions
      where tracker_id = ?
      order by revision_number desc`,
  )
    .bind(tracker.id)
    .all<Pick<RevisionRow, "id" | "revision_number" | "saved_at" | "saved_by">>();

  return {
    ...trackerMeta(tracker),
    revisions: (results ?? []).map((row) => ({
      revisionId: row.id,
      revisionNumber: row.revision_number,
      savedAt: row.saved_at,
      savedBy: row.saved_by,
      isCurrent: row.revision_number === tracker.current_revision_number,
    })),
  };
}

/** GET /trackers/:id/revisions/:revisionId */
export async function getRevision(env: Env, tracker: TrackerRow, revisionId: string) {
  const revision = await env.DB.prepare(
    "select * from revisions where id = ? and tracker_id = ?",
  )
    .bind(revisionId, tracker.id)
    .first<RevisionRow>();
  if (!revision) {
    throw new ApiError(
      404,
      "revision_not_found",
      `That revision is no longer kept. Only the last ${REVISION_WINDOW} saves are retained.`,
    );
  }
  return {
    ...trackerMeta(tracker),
    ...revisionMeta(revision),
    payload: JSON.parse(revision.payload_json) as JsonValue,
  };
}

/**
 * POST /trackers/:id/revisions — save a revision.
 *
 * The whole save is one D1 batch, which is a transaction. Every statement
 * derives its effect from committed database state rather than from client
 * input, so a stale or forged `parentRevisionNumber` cannot do damage:
 *
 *   1. INSERT ... SELECT FROM trackers WHERE current_revision_number = parent
 *      Inserts zero rows if the parent is stale — that zero is the conflict
 *      signal, and it means nothing was written at all.
 *   2. UPDATE with the same guard, incrementing the pointer in place.
 *   3. DELETE using a threshold read back from the tracker row, never from the
 *      request. A client sending a wildly high parent cannot widen the delete.
 *
 * Because the guard lives in the SQL, two simultaneous saves cannot both
 * commit, and a losing save leaves no orphan row to clean up.
 */
export async function saveRevision(request: Request, env: Env, tracker: TrackerRow) {
  const body = await readBody(request);
  const payloadJson = validatePayload(body.payload);
  const savedBy = requireSavedBy(body.savedBy);
  const force = body.force === true;
  const at = nowSeconds();
  const payloadHash = await sha256(payloadJson);

  // `force` means "save on top of whatever is current", so the parent comes
  // from the row we just read rather than from the client.
  const parent = force
    ? tracker.current_revision_number
    : requireRevisionNumber(body.parentRevisionNumber, "parentRevisionNumber");

  const current = await env.DB.prepare("select * from revisions where id = ?")
    .bind(tracker.current_revision_id)
    .first<RevisionRow>();

  // Dedupe. An identical save must not consume a slot in a 5-deep window —
  // three double-clicks would otherwise evict real history. It still touches
  // updated_at, because the expiry warning tells users that saving resets the
  // clock, and that has to be true even when nothing changed.
  if (current && current.payload_hash === payloadHash) {
    await env.DB.prepare("update trackers set updated_at = ? where id = ?")
      .bind(at, tracker.id)
      .run();
    return {
      ...trackerMeta({ ...tracker, updated_at: at }),
      ...revisionMeta(current),
      deduped: true,
    };
  }

  const revisionId = newRevisionId();
  const results = await env.DB.batch([
    env.DB.prepare(
      `insert into revisions
         (id, tracker_id, revision_number, saved_at, saved_by, payload_json, payload_hash)
       select ?, ?, current_revision_number + 1, ?, ?, ?, ?
         from trackers
        where id = ? and current_revision_number = ? and deleted_at is null`,
    ).bind(
      revisionId,
      tracker.id,
      at,
      savedBy,
      payloadJson,
      payloadHash,
      tracker.id,
      parent,
    ),
    env.DB.prepare(
      `update trackers
          set current_revision_id = ?,
              current_revision_number = current_revision_number + 1,
              updated_at = ?
        where id = ? and current_revision_number = ? and deleted_at is null`,
    ).bind(revisionId, at, tracker.id, parent),
    env.DB.prepare(
      `delete from revisions
        where tracker_id = ?
          and revision_number <=
              (select current_revision_number from trackers where id = ?) - ?`,
    ).bind(tracker.id, tracker.id, REVISION_WINDOW),
  ]);

  if ((results[0].meta?.changes ?? 0) === 0) {
    const latest = await env.DB.prepare("select * from trackers where id = ?")
      .bind(tracker.id)
      .first<TrackerRow>();
    const latestRevision = latest
      ? await env.DB.prepare("select * from revisions where id = ?")
          .bind(latest.current_revision_id)
          .first<RevisionRow>()
      : null;

    throw new ConflictError({
      ...(latest ? trackerMeta(latest) : {}),
      ...(latestRevision ? revisionMeta(latestRevision) : {}),
    });
  }

  const saved = { ...tracker, current_revision_number: parent + 1, updated_at: at };
  return {
    ...trackerMeta(saved),
    revisionId,
    revisionNumber: parent + 1,
    savedAt: at,
    savedBy,
    deduped: false,
  };
}

/**
 * Carries the current revision metadata so the conflict prompt can name who
 * saved and when, rather than just saying someone did.
 */
export class ConflictError extends ApiError {
  readonly current: Record<string, JsonValue>;

  constructor(current: Record<string, JsonValue>) {
    super(409, "revision_conflict", "Someone else saved a newer revision.");
    this.current = current;
  }
}

/** PATCH /trackers/:id — rename. Does not create a revision. */
export async function renameTracker(request: Request, env: Env, tracker: TrackerRow) {
  const body = await readBody(request);
  const title = optionalTitle(body.title);
  const at = nowSeconds();
  await env.DB.prepare("update trackers set title = ?, updated_at = ? where id = ?")
    .bind(title, at, tracker.id)
    .run();
  return trackerMeta({ ...tracker, title, updated_at: at });
}

/**
 * DELETE /trackers/:id — soft delete.
 *
 * Writes exactly one column. Revisions and token_hash are untouched, which is
 * what makes the undelete runbook a one-line UPDATE: a restored tracker comes
 * back with its full window and its original share links still working.
 */
export async function deleteTracker(env: Env, tracker: TrackerRow) {
  const at = nowSeconds();
  await env.DB.prepare("update trackers set deleted_at = ? where id = ?")
    .bind(at, tracker.id)
    .run();
  return { trackerId: tracker.id, deletedAt: at, recoverable: true };
}

