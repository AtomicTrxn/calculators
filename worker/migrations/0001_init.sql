-- Cloud tracker schema.
--
-- `current_revision_number` on trackers is the single source of truth for both
-- the optimistic-concurrency check and the revision counter. There is
-- deliberately no `is_current` flag on revisions: a duplicate flag can drift
-- from the pointer, and drift would let pruning delete live data.

create table if not exists trackers (
  id text primary key,                              -- UUIDv4, canonical hyphenated form
  title text,
  token_hash text not null,                         -- SHA-256 of the share token, base64url
  current_revision_id text,
  current_revision_number integer not null default 0,
  created_at integer not null,                      -- unix epoch seconds, worker-generated
  updated_at integer not null,                      -- drives the 12-month inactivity clock
  deleted_at integer                                -- soft delete; null means live
);

create table if not exists revisions (
  id text primary key,
  tracker_id text not null,
  revision_number integer not null,                 -- per-tracker, monotonic, never reused
  saved_at integer not null,
  saved_by text not null,
  payload_json text not null,
  payload_hash text not null                        -- SHA-256 base64url, for save dedupe
);

-- Not merely a lookup index: this uniqueness constraint is the race guard that
-- makes two simultaneous saves impossible to both commit.
create unique index if not exists revisions_tracker_number_idx
  on revisions(tracker_id, revision_number);

-- Keeps the nightly sweep off a full table scan, which is what holds it inside
-- the free plan's 10ms CPU budget for scheduled invocations.
create index if not exists trackers_updated_idx on trackers(updated_at);
create index if not exists trackers_deleted_idx on trackers(deleted_at);
