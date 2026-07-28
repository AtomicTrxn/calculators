// Scheduled housekeeping.
//
// The rolling 5-revision window is enforced on every write, so this job never
// handles routine retention. It exists only as a safety net:
//
//   1. inactivity expiry   — soft-delete trackers untouched for 12 months
//   2. tombstone purge     — destroy soft-deleted trackers past the 90-day
//                            recovery window (the only irreversible step)
//   3. orphan sweep        — revisions above their tracker's pointer
//
// Free-plan scheduled invocations get 10ms of CPU. D1 query latency is I/O and
// does not count against that, but every statement is still indexed and
// LIMITed so a backlog is worked through across runs instead of in one.

import {
  CLEANUP_BATCH_LIMIT,
  DAY_SECONDS,
  INACTIVITY_EXPIRY_DAYS,
  TOMBSTONE_GRACE_DAYS,
} from "./constants.ts";
import type { Env } from "./types.ts";
import { addDaysSeconds, nowSeconds } from "./util.ts";

// The index signature keeps this assignable to JsonValue, since the report is
// serialized both into ops_meta and out of /health/retention.
export interface CleanupReport {
  [key: string]: number;
  expired: number;
  revisionsPurged: number;
  trackersPurged: number;
  orphansRemoved: number;
}

/**
 * Heartbeat for the nightly job.
 *
 * A cron that stops firing has no visible symptom: nothing errors, and the
 * only consequence is tombstones quietly accumulating. Recording the last
 * successful run makes that failure detectable from outside.
 */
export const CLEANUP_HEARTBEAT_KEY = "last_cleanup_at";
export const CLEANUP_LAST_REPORT_KEY = "last_cleanup_report";

export async function recordCleanupHeartbeat(
  env: Env,
  report: CleanupReport,
  at: number = nowSeconds(),
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `insert into ops_meta (key, value) values (?, ?)
       on conflict(key) do update set value = excluded.value`,
    ).bind(CLEANUP_HEARTBEAT_KEY, String(at)),
    env.DB.prepare(
      `insert into ops_meta (key, value) values (?, ?)
       on conflict(key) do update set value = excluded.value`,
    ).bind(CLEANUP_LAST_REPORT_KEY, JSON.stringify(report)),
  ]);
}

export async function cleanupHealth(env: Env, at: number = nowSeconds()) {
  const rows = await env.DB.prepare(
    "select key, value from ops_meta where key in (?, ?)",
  )
    .bind(CLEANUP_HEARTBEAT_KEY, CLEANUP_LAST_REPORT_KEY)
    .all<{ key: string; value: string }>();

  const map = new Map((rows.results ?? []).map((r) => [r.key, r.value]));
  const raw = map.get(CLEANUP_HEARTBEAT_KEY);
  const lastCleanupAt = raw == null ? null : Number(raw);

  let lastReport: CleanupReport | null = null;
  try {
    const encoded = map.get(CLEANUP_LAST_REPORT_KEY);
    if (encoded) lastReport = JSON.parse(encoded) as CleanupReport;
  } catch {
    // A corrupt report must not take the health check down; the timestamp is
    // the part a monitor actually alerts on.
  }

  return {
    lastCleanupAt,
    ageSeconds: lastCleanupAt == null ? null : at - lastCleanupAt,
    // The job runs daily; two missed runs is unambiguous rather than a blip.
    stale: lastCleanupAt == null || at - lastCleanupAt > 2 * DAY_SECONDS,
    lastReport,
  };
}

export async function runCleanup(env: Env, at: number = nowSeconds()): Promise<CleanupReport> {
  const inactiveBefore = addDaysSeconds(at, -INACTIVITY_EXPIRY_DAYS);
  const purgeBefore = addDaysSeconds(at, -TOMBSTONE_GRACE_DAYS);

  // 1. Expiry is a soft delete, so an expired tracker still gets the full
  //    90-day recovery window. Expiry is never a one-way door.
  const expired = await env.DB.prepare(
    `update trackers set deleted_at = ?
      where id in (
        select id from trackers
         where deleted_at is null and updated_at < ?
         limit ?
      )`,
  )
    .bind(at, inactiveBefore, CLEANUP_BATCH_LIMIT)
    .run();

  // 2. Revisions go before their trackers. D1 does not enforce foreign keys,
  //    so this ordering is the only thing preventing orphaned revision rows.
  const revisionsPurged = await env.DB.prepare(
    `delete from revisions
      where tracker_id in (
        select id from trackers
         where deleted_at is not null and deleted_at < ?
         limit ?
      )`,
  )
    .bind(purgeBefore, CLEANUP_BATCH_LIMIT)
    .run();

  const trackersPurged = await env.DB.prepare(
    `delete from trackers
      where id in (
        select id from trackers
         where deleted_at is not null and deleted_at < ?
         limit ?
      )
        and id not in (select distinct tracker_id from revisions)`,
  )
    .bind(purgeBefore, CLEANUP_BATCH_LIMIT)
    .run();

  // 3. The save path makes orphans structurally impossible (its guard lives in
  //    the SQL and a losing save writes nothing), so this should always find
  //    zero. It stays as a backstop, and the one-day age filter guarantees it
  //    can never touch a revision belonging to an in-flight save.
  const orphansRemoved = await env.DB.prepare(
    `delete from revisions
      where rowid in (
        select r.rowid
          from revisions r
          join trackers t on t.id = r.tracker_id
         where r.revision_number > t.current_revision_number
           and r.saved_at < ?
         limit ?
      )`,
  )
    .bind(addDaysSeconds(at, -1), CLEANUP_BATCH_LIMIT)
    .run();

  return {
    expired: expired.meta?.changes ?? 0,
    revisionsPurged: revisionsPurged.meta?.changes ?? 0,
    trackersPurged: trackersPurged.meta?.changes ?? 0,
    orphansRemoved: orphansRemoved.meta?.changes ?? 0,
  };
}
