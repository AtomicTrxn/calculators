# Cloud Tracker Implementation Plan

## Goal

Keep the group expense tracker fully useful as a local, self-contained page while adding an optional cloud mode for live shared trackers.

Local mode remains the default. Cloud data is created only when a user explicitly promotes a tracker for live sharing.

## Product Model

### Local Snapshot Mode

- The tracker runs entirely in the browser.
- Local autosave continues to use `localStorage`.
- `Copy snapshot link` creates a frozen URL containing encoded tracker data:

```text
group-expense-tracker.html#data=...
```

- No Cloudflare record is created.
- Best for personal backup, one-off sharing, or static handoff.

### Cloud Tracker Mode

- The user clicks `Share live cloud tracker`.
- If needed, the page asks once for:
  - saved-by name
  - optional tracker name
- The page creates a Cloudflare-backed tracker, saves the current data as revision 1, copies a cloud link, and switches into cloud-connected mode.
- The cloud link contains only tracker identity/access tokens:

```text
group-expense-tracker.html#cloud=<trackerId>.<viewToken>
```

- Owner/edit links may also include an edit token:

```text
group-expense-tracker.html#cloud=<trackerId>.<viewToken>.<editToken>
```

## User Experience

### Local UI

```text
Storage: Local only
[Copy snapshot link] [Share live cloud tracker]
```

### Cloud UI

```text
Storage: Cloud tracker · latest saved Jul 10, 10:42 AM by Tom
[Save cloud revision] [Copy cloud link] [Work locally] [Delete cloud tracker]
```

If the user edits after loading/saving from cloud:

```text
Storage: Cloud tracker · unsaved changes
```

If a save is rejected because someone else saved first (see concurrency rules):

```text
Storage: Cloud tracker · newer revision exists
[Load latest] [Save as new revision anyway]
```

## Key Behavior Rules

- Do not auto-save every edit to cloud.
- Edits continue to autosave locally as draft protection.
  - Cloud drafts are stored under a per-tracker key (`draft:<trackerId>`), separate from the local-only autosave key, so multiple cloud trackers and the local tracker never overwrite each other's drafts.
- `Save cloud revision` creates one new cloud revision with `saved_at` and `saved_by`.
- Saves use optimistic concurrency: the page sends the revision id it loaded from, and the Worker rejects the save with `409 Conflict` if a newer revision exists. The rejected user's work is preserved by the local draft; the UI offers `Load latest` or an explicit force-save.
- `Work locally` disconnects the current browser/page from cloud but keeps the visible data.
- `Work locally` does not delete the cloud tracker.
- `Delete cloud tracker` requires confirmation and affects everyone using that cloud link.
- Opening `#data=` keeps the existing local snapshot behavior.
- Opening `#cloud=` loads the latest cloud revision by default.
  - If a local draft exists for that trackerId and differs from the loaded cloud payload, prompt the user to restore the draft or discard it. Never silently discard a draft.
- Opening a deleted tracker shows a friendly "this tracker was deleted" message (the API returns `410 Gone`).

## Cloudflare Architecture

Use Cloudflare Workers plus D1.

- GitHub Pages can continue hosting the static HTML.
- The tracker calls the Worker API with `fetch()`.
- D1 stores trackers and revision history.
- A Worker Cron Trigger performs cleanup.

Decision note: a Durable Object per tracker was considered (serialized writes for free, and a clean path to live WebSocket updates later). For v1 the explicit save-button model plus optimistic concurrency makes D1 sufficient and simpler. Revisit Durable Objects if real-time sync becomes a requirement.

## Identity And Security

Use server-generated random IDs and tokens:

```text
trackerId   public-ish lookup id
viewToken   permits reading latest/revisions
editToken   permits saving/deleting, and implies view access
```

The tracker ID is not secret. Tokens are secret.

Suggested token sizes:

```text
trackerId: trk_<128-bit random>
viewToken: view_<192-bit random>
editToken: edit_<256-bit random>
```

Token handling rules:

- Store only token hashes in D1. Plain SHA-256 is sufficient because tokens are high-entropy random values (no slow KDF needed).
- Compare hashes in constant time (e.g., `crypto.subtle.timingSafeEqual` or a manual constant-time loop).
- The page sends the token as `Authorization: Bearer <token>` over HTTPS. Send the edit token when present, otherwise the view token; the Worker accepts either token for read routes.
- URL hashes are not sent automatically with HTTP requests, so tokens never appear in server logs or referrers. They do appear in browser history and anywhere the link is shared — acceptable for this threat model, but worth stating in user-facing help.
- The page persists the cloud session (including the edit token) in `localStorage`. This is fine for the threat model but means shared computers retain access, and any XSS on the page exposes tokens — one more reason all user-supplied text must be escaped (see Abuse Controls).

## D1 Schema

Timestamps are stored as integer unix epoch seconds, always generated by the Worker (never trusted from the client). This keeps SQL comparisons exact and avoids text-format mismatches.

`current_revision_id` on `trackers` is the single source of truth for the current revision. There is deliberately no `is_current` flag on `revisions` — a duplicate flag can drift from the pointer, and drift would let cleanup delete live data.

```sql
create table trackers (
  id text primary key,
  title text,
  view_token_hash text not null,
  edit_token_hash text not null,
  current_revision_id text,
  created_at integer not null,
  updated_at integer not null,
  deleted_at integer
);

create table revisions (
  id text primary key,
  tracker_id text not null references trackers(id),
  revision_number integer not null,
  saved_at integer not null,
  saved_by text not null,
  payload_json text not null,
  payload_hash text not null
);

create unique index revisions_tracker_number_idx
  on revisions(tracker_id, revision_number);

create index revisions_cleanup_idx
  on revisions(saved_at);
```

Notes:

- `revision_number` is a per-tracker monotonic counter (1, 2, 3, …). Ordering and the concurrency check use it, not timestamps.
- `payload_hash` exists for deduplication: if a save's payload hash matches the current revision's, the Worker returns the current revision instead of creating an identical one.
- SQLite/D1 does not enforce foreign keys by default; do not rely on the `references` clause for integrity. Cleanup must delete revisions before trackers (as the cleanup SQL below does).
- Writes that touch both tables (save revision + update pointer) must go through `db.batch()` so they apply atomically.

## Worker API

```text
POST   /trackers
GET    /trackers/:id/latest
GET    /trackers/:id/revisions
GET    /trackers/:id/revisions/:revisionId
POST   /trackers/:id/revisions
PATCH  /trackers/:id
DELETE /trackers/:id
```

All routes on a tombstoned tracker return `410 Gone`.

### `POST /trackers`

- Creates tracker ID, view token, edit token.
- Stores token hashes.
- Saves first revision.
- Returns tracker identity and link data to the page.
- The "one cloud tracker per page" rule is client-side only (the button is hidden in cloud mode); the server cannot and does not enforce it.

### `GET /trackers/:id/latest`

- Requires view token (or edit token).
- Returns the current revision payload and metadata, including `revision_number`.

### `POST /trackers/:id/revisions`

- Requires edit token.
- Request includes `parent_revision_number`: the revision the client loaded from.
- If `parent_revision_number` does not match the current revision, returns `409 Conflict` with the current revision's metadata. The client may retry with `force: true` after user confirmation.
- If `payload_hash` matches the current revision, returns the current revision unchanged (dedupe).
- Otherwise saves a new revision and updates tracker `current_revision_id` and `updated_at` in one `db.batch()`.

### `GET /trackers/:id/revisions`

- Requires view token (or edit token).
- Returns revision metadata, not necessarily full payloads.

### `PATCH /trackers/:id`

- Requires edit token.
- Updates `title` (the only mutable tracker field for now).

### `DELETE /trackers/:id`

- Requires edit token.
- Tombstones the tracker with `deleted_at`.
- Reads return `410 Gone` immediately and deterministically.
- No undelete in v1; the grace period before hard deletion exists for operator recovery only.

## Abuse Controls

`POST /trackers` is necessarily unauthenticated, so the Worker enforces limits:

- Max payload size: 256 KB per revision, rejected with `413` (also keeps well under D1 statement limits).
- Max lengths, enforced server-side: `title` 120 chars, `saved_by` 60 chars.
- All user-supplied text (`title`, `saved_by`) is rendered with HTML escaping on the page — a shared cloud link must never be a stored-XSS vector.
- Rate limits (Cloudflare rate-limiting rules or per-IP counters): tracker creation and revision saves.
- Cap revisions per tracker per day (e.g., 200); the payload-hash dedupe already absorbs accidental repeat saves.

## Automated Cleanup

Add a daily Cloudflare Cron Trigger.

Cleanup policy:

- Delete non-current revisions older than 30 days.
- Always keep the current revision indefinitely unless the tracker is deleted.
- Hard-delete tombstoned trackers after the grace period (default 30 days, configurable in the Worker; keep the SQL and the setting in one place).
- Hard-delete all revisions for hard-deleted trackers, before deleting the trackers themselves (FKs are not enforced, so ordering is the only protection against orphans).

Example cleanup logic ("current" is defined by the tracker pointer, never by a flag on the revision):

```sql
delete from revisions
where saved_at < unixepoch('now', '-30 days')
  and id not in (
    select current_revision_id from trackers
    where current_revision_id is not null
  );

delete from revisions
where tracker_id in (
  select id from trackers
  where deleted_at is not null
    and deleted_at < unixepoch('now', '-30 days')
);

delete from trackers
where deleted_at is not null
  and deleted_at < unixepoch('now', '-30 days');
```

## Tracker Page State

Add a `cloudSession` object:

```js
{
  trackerId,
  viewToken,
  editToken,
  title,
  savedBy,
  latestRevisionNumber,
  latestSavedAt,
  latestSavedBy,
  hasUnsavedCloudChanges
}
```

- Persist cloud session locally only after the user creates or opens a cloud tracker.
- `latestRevisionNumber` is what gets sent as `parent_revision_number` on save.
- Cloud drafts autosave under `draft:<trackerId>`; the local-only tracker keeps its existing autosave key.

## Implementation Phases

### Phase 1: Repo And Backend Scaffold

- Add Worker folder.
- Add D1 schema/migration.
- Add `wrangler.jsonc`.
- Implement token generation, hashing, and constant-time verification.
- Implement core API routes, including concurrency check, dedupe, size/length limits, and 410 handling.
- Add scheduled cleanup handler.

### Phase 2: Tracker Integration

- Add cloud session parser for `#cloud=`.
- Add cloud status panel.
- Add `Share live cloud tracker`.
- Add `Save cloud revision` with 409 conflict handling.
- Add `Copy cloud link`.
- Add `Work locally`.
- Add `Delete cloud tracker`.
- Add per-tracker draft keys and the draft-restore prompt on load.
- Escape all server-provided text when rendering.
- Keep existing snapshot-link behavior.

### Phase 3: Tests

Worker tests run under `@cloudflare/vitest-pool-workers` (real workerd + D1 binding, so batch atomicity and statement limits are exercised for real):

- create tracker
- load latest
- save revision
- reject stale `parent_revision_number` with 409
- dedupe identical payload saves
- reject oversized payloads with 413
- reject invalid tokens
- list revisions
- rename tracker
- delete tracker; subsequent reads return 410
- cleanup old non-current revisions never touches current revisions
- cleanup hard-deletes tombstoned trackers and their revisions

Tracker tests:

- snapshot link still works
- cloud link parsing works
- local-to-cloud promotion
- work-locally disconnect
- cloud unsaved-change state
- 409 conflict flow (load latest / force save)
- draft-restore prompt when local draft differs from cloud
- deleted-tracker message on 410

Existing checks:

- `node scripts/check-links.js`
- inline script syntax check

## Open Decisions

- Exact Cloudflare Worker URL and CORS origin list.
- Whether cloud tracker titles are required or optional.
- Whether view-only users can see revision history or only latest.
- Whether old inactive one-revision trackers should eventually expire.
