-- Operational key/value state.
--
-- Exists for the cleanup heartbeat. A cron that silently stops has no visible
-- symptom -- tombstones simply accumulate and nothing errors -- so the job
-- records when it last completed and /health/retention exposes it for an
-- external check to alert on.

create table if not exists ops_meta (
  key text primary key,
  value text not null
);
