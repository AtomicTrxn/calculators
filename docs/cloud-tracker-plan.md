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

## Key Behavior Rules

- Do not auto-save every edit to cloud.
- Edits continue to autosave locally as draft protection.
- `Save cloud revision` creates one new cloud revision with `saved_at` and `saved_by`.
- `Work locally` disconnects the current browser/page from cloud but keeps the visible data.
- `Work locally` does not delete the cloud tracker.
- `Delete cloud tracker` requires confirmation and affects everyone using that cloud link.
- Opening `#data=` keeps the existing local snapshot behavior.
- Opening `#cloud=` loads the latest cloud revision by default.

## Cloudflare Architecture

Use Cloudflare Workers plus D1.

- GitHub Pages can continue hosting the static HTML.
- The tracker calls the Worker API with `fetch()`.
- D1 stores trackers and revision history.
- A Worker Cron Trigger performs cleanup.

## Identity And Security

Use server-generated random IDs and tokens:

```text
trackerId   public-ish lookup id
viewToken   permits reading latest/revisions
editToken   permits saving/deleting
```

The tracker ID is not secret. Tokens are secret.

Store only token hashes in D1.

Suggested token sizes:

```text
trackerId: trk_<128-bit random>
viewToken: view_<192-bit random>
editToken: edit_<256-bit random>
```

The page reads tokens from the URL hash and sends them to the Worker over HTTPS in an `Authorization` header. URL hashes are not sent automatically with HTTP requests.

## D1 Schema

```sql
create table trackers (
  id text primary key,
  title text,
  view_token_hash text not null,
  edit_token_hash text not null,
  current_revision_id text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table revisions (
  id text primary key,
  tracker_id text not null references trackers(id),
  saved_at text not null,
  saved_by text not null,
  payload_json text not null,
  payload_hash text not null,
  is_current integer not null default 0
);

create index revisions_tracker_saved_at_idx
  on revisions(tracker_id, saved_at desc);

create index revisions_cleanup_idx
  on revisions(is_current, saved_at);
```

## Worker API

```text
POST   /trackers
GET    /trackers/:id/latest
GET    /trackers/:id/revisions
GET    /trackers/:id/revisions/:revisionId
POST   /trackers/:id/revisions
DELETE /trackers/:id
```

### `POST /trackers`

- Requires no existing cloud tracker.
- Creates tracker ID, view token, edit token.
- Stores token hashes.
- Saves first revision.
- Returns tracker identity and link data to the page.

### `GET /trackers/:id/latest`

- Requires view token.
- Returns the current revision payload and metadata.

### `POST /trackers/:id/revisions`

- Requires edit token.
- Saves a new revision.
- Marks previous revision as non-current.
- Updates tracker `current_revision_id` and `updated_at`.

### `GET /trackers/:id/revisions`

- Requires view token.
- Returns revision metadata, not necessarily full payloads.

### `DELETE /trackers/:id`

- Requires edit token.
- Tombstones the tracker with `deleted_at`.
- May immediately hide it from reads.

## Automated Cleanup

Add a daily Cloudflare Cron Trigger.

Cleanup policy:

- Delete non-current revisions older than 30 days.
- Always keep the current revision indefinitely unless the tracker is deleted.
- Hard-delete tombstoned trackers after a grace period.
- Hard-delete all revisions for hard-deleted trackers.

Example cleanup logic:

```sql
delete from revisions
where is_current = 0
  and saved_at < datetime('now', '-30 days');

delete from revisions
where tracker_id in (
  select id from trackers
  where deleted_at is not null
    and deleted_at < datetime('now', '-30 days')
);

delete from trackers
where deleted_at is not null
  and deleted_at < datetime('now', '-30 days');
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
  latestSavedAt,
  latestSavedBy,
  hasUnsavedCloudChanges
}
```

Persist cloud session locally only after the user creates or opens a cloud tracker.

## Implementation Phases

### Phase 1: Repo And Backend Scaffold

- Add Worker folder.
- Add D1 schema/migration.
- Add `wrangler.jsonc`.
- Implement token generation and hashing.
- Implement core API routes.
- Add scheduled cleanup handler.

### Phase 2: Tracker Integration

- Add cloud session parser for `#cloud=`.
- Add cloud status panel.
- Add `Share live cloud tracker`.
- Add `Save cloud revision`.
- Add `Copy cloud link`.
- Add `Work locally`.
- Add `Delete cloud tracker`.
- Keep existing snapshot-link behavior.

### Phase 3: Tests

- Worker tests:
  - create tracker
  - load latest
  - save revision
  - reject invalid tokens
  - list revisions
  - delete tracker
  - cleanup old non-current revisions
- Tracker tests:
  - snapshot link still works
  - cloud link parsing works
  - local-to-cloud promotion
  - work-locally disconnect
  - cloud unsaved-change state
- Existing checks:
  - `node scripts/check-links.js`
  - inline script syntax check

## Open Decisions

- Exact Cloudflare Worker URL and CORS origin list.
- Whether cloud tracker titles are required or optional.
- Whether view-only users can see revision history or only latest.
- Grace period for deleted trackers.
- Whether old inactive one-revision trackers should eventually expire.
