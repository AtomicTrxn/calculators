# Cloud Tracker Implementation Plan

## Goal

Keep the group expense tracker fully useful as a local, self-contained page while adding an optional cloud mode: a tracker gets a durable **tracker ID**, anyone with the link can **modify** it, and the cloud keeps a **rolling window of the last 5 revisions** so storage stays flat and inside the Cloudflare free tier.

Local mode remains the default. Cloud data is created only when a user explicitly promotes a tracker for live sharing.

## Locked Decisions

These were open in the first draft and are now settled:

| Decision | Choice |
| --- | --- |
| Access model | **One link, everyone edits.** A single secret token grants read + write. |
| Sync model | **Explicit Save button** with optimistic concurrency and a conflict prompt. No polling, no auto-push. |
| Retention | **Rolling 5 revisions per tracker**, pruned at save time. |
| Tracker IDs | **UUIDv4 (GUID)**, server-generated, unguessable. |
| Deletion | **Soft delete, recoverable.** Undelete in v1 is a documented DB command, no UI. |
| Inactivity expiry | **12 months** with no save, with an in-page warning before it happens. |
| Hosting | **GitHub Pages stays**; Worker on a `workers.dev` subdomain with a CORS allowlist. |

The most consequential change from the first draft: retention is a **count-based cap enforced on every write**, not a 30-day cron sweep. A tracker can never hold more than 5 revisions even for a moment, so storage is bounded by tracker count alone and the cron job becomes a secondary safety net rather than the mechanism.

## Product Model

### Local Snapshot Mode (unchanged)

- The tracker runs entirely in the browser; autosave continues to use `localStorage` under `groupExpenseTracker.v1`.
- `Copy snapshot link` creates a frozen URL containing encoded tracker data:

```text
group-expense-tracker.html#data=...
```

- No Cloudflare record is created. Best for personal backup, one-off sharing, or static handoff.

### Cloud Tracker Mode (new)

- The user clicks `Share live cloud tracker`.
- The page asks once for a **saved-by name** (who you are, shown in revision history) and an optional **tracker name**.
- The page creates a Cloudflare-backed tracker, saves the current data as revision 1, copies the cloud link, and switches into cloud-connected mode.
- The cloud link carries tracker identity plus the single access token:

```text
group-expense-tracker.html#cloud=<trackerId>.<token>
```

Everyone who holds that link can load, edit, and save. There is no separate viewer role — deliberately, because the sharing pattern is "paste the link in the trip group chat", and a two-tier permission model adds surface without matching how the tool is used.

## User Experience

### Local UI

```text
Storage: Local only
[Copy snapshot link] [Share live cloud tracker]
```

### Cloud UI

```text
Storage: Cloud tracker trk_7fa3… · revision 14 saved Jul 10, 10:42 AM by Tom
[Save cloud revision] [History] [Copy cloud link] [Work locally] [Delete cloud tracker]
```

After local edits:

```text
Storage: Cloud tracker · unsaved changes
```

When someone else saved first:

```text
Storage: Cloud tracker · newer revision exists (15 by Dana)
[Load latest] [Save as new revision anyway]
```

### Expiry Warning

When a tracker is within **30 days** of its 12-month inactivity expiry, the status panel shows a dismissible notice:

```text
⚠ This shared tracker expires in 24 days (Aug 19, 2027) unless someone saves.
  Saving anything — even an unchanged tracker — resets the clock for another year.
```

Two details that make this actually work rather than just look reassuring:

- The copy states the remedy, not just the deadline. "Expires soon" with no instruction leaves users guessing.
- Dedupe must not defeat the remedy. A user who opens an expiring tracker and hits Save without editing produces an identical payload hash, which the dedupe path answers with the existing revision. That must still bump the tracker's `updated_at`, or the one action the warning tells people to take would do nothing. The dedupe branch therefore performs a pointer-row touch even when it creates no revision.

The warning is derived from `expires_at` returned by the API — the page never computes the expiry date from its own clock, which would drift and could show a wrong date to someone in another timezone.

The history panel lists at most 5 entries and says so plainly, e.g. *"Showing the last 5 saves. Older revisions are removed automatically."* Users should never be surprised that revision 9 is gone.

## Key Behavior Rules

- Never auto-save to cloud. Cloud writes happen only on an explicit `Save cloud revision`.
- Edits continue to autosave **locally** as draft protection, under a per-tracker key `groupExpenseTracker.draft.<trackerId>`, separate from the local-only key so multiple cloud trackers and the local tracker never clobber each other.
- `Save cloud revision` creates one revision stamped with `saved_at` and `saved_by`, then prunes.
- Saves use optimistic concurrency: the client sends the revision number it loaded from; a stale parent is rejected with `409`. The rejected user's work survives in the local draft; the UI offers `Load latest` or an explicit force-save.
- `Work locally` disconnects this browser from the cloud but keeps the visible data and does **not** delete the cloud tracker.
- `Delete cloud tracker` requires confirmation and affects everyone with the link.
- Opening `#data=` keeps existing snapshot behavior.
- Opening `#cloud=` loads the latest revision. If a local draft exists for that tracker and differs from the loaded payload, prompt to restore or discard — never silently drop a draft.
- Opening a deleted or expired tracker shows a friendly message (the API returns `410 Gone`).

## Cloudflare Architecture

Cloudflare Workers + D1.

- GitHub Pages continues hosting the static HTML.
- The page calls the Worker API with `fetch()`; the Worker returns CORS headers for an explicit origin allowlist.
- D1 stores trackers and the rolling revision history.
- A daily Cron Trigger handles inactivity expiry and tombstone cleanup only.

### Deployment Targets

| Thing | Value |
| --- | --- |
| Worker URL | `https://expense-tracker-api.tomhess.workers.dev` |
| Worker name | `expense-tracker-api` (this is what determines the subdomain above) |
| D1 database | `expense_trackers_local` / `expense_trackers_prod` |
| Static site | `https://atomictrxn.github.io/calculators/` (repo `AtomicTrxn/calculators`, no custom domain) |
| Cron | `0 3 * * *` daily |

CORS allowlist:

```text
https://atomictrxn.github.io    production
http://localhost:8788           local dev server
null                            file:// origin, dev only, off in production
```

Three things about this that are easy to get wrong:

- The browser sends **only the origin**, never the path — so the allowlist entry is `https://atomictrxn.github.io`, not the `/calculators/` URL. There is no way to scope this to one repo: any GitHub Pages site under that account can call the API. That is acceptable because the token is the real credential and CORS is not an authorization mechanism, but do not mistake the allowlist for access control.
- Opening the HTML straight off disk sends `Origin: null`. Allow it behind a dev-only flag, never in the deployed Worker — `null` is also what sandboxed iframes send.
- Echo back a **matched** origin, never `*` and never the raw request origin unvalidated. Set `Access-Control-Max-Age` so preflights don't double the request count against the 100k/day budget.

Why D1 rather than the alternatives:

- **KV** is out: 1,000 writes/day on the free plan is far too tight for a shared editor, and eventual consistency would break the concurrency check outright.
- **Durable Objects** would give serialized writes for free and a clean path to real-time sync, and the SQLite backend now has a free-plan allowance. But with an explicit save button, D1 plus a compare-and-swap is sufficient and simpler to operate. Revisit DO only if real-time sync becomes a requirement.

## Identity And Security

Server-generated random values:

```text
trackerId   UUIDv4 via crypto.randomUUID()   unguessable lookup id
token       tok_<256-bit random>             secret; grants read and write
```

Tracker IDs are **GUIDs** — `crypto.randomUUID()` is available in the Workers runtime and gives 122 bits of randomness, so IDs cannot be enumerated or discovered by guessing. Stored as `TEXT PRIMARY KEY` in its canonical hyphenated form.

Two consequences worth being explicit about:

- The token remains the actual credential. An unguessable ID is defense in depth, not a second secret — do not let it become a reason to relax token checks anywhere.
- Because IDs are now unguessable, the API should keep returning an identical `401` for both "bad token" and "no such tracker". A distinguishable `404` would turn the ID space into an oracle and give back the enumeration resistance the GUID just bought.

The ID is still safe to display in the UI and to write to logs; the token is not.

Rules:

- Store only the **token hash** in D1. Plain SHA-256 is sufficient — the token is a high-entropy random value, so a slow KDF buys nothing.
- Compare hashes in constant time.
- The page sends `Authorization: Bearer <token>` over HTTPS.
- URL fragments are not sent to servers, so the token never lands in Worker logs or `Referer` headers. It does appear in browser history and anywhere the link is pasted — state this plainly in the user-facing help text, since it is the whole security model.
- The page persists the cloud session (including the token) in `localStorage`. Acceptable here, but it means shared computers retain access, and any XSS on the page leaks the token. That is one more reason every server-provided string must be escaped on render (see Abuse Controls).

## D1 Schema

Timestamps are integer unix epoch seconds, always generated by the Worker, never trusted from the client.

`current_revision_number` on `trackers` is the single source of truth for both the concurrency check and the revision counter. There is deliberately no `is_current` flag on `revisions` — a duplicate flag can drift from the pointer, and drift would let pruning delete live data.

```sql
create table trackers (
  id text primary key,            -- UUIDv4, canonical hyphenated form
  title text,
  token_hash text not null,
  current_revision_id text,
  current_revision_number integer not null default 0,
  created_at integer not null,
  updated_at integer not null,
  deleted_at integer
);

create table revisions (
  id text primary key,
  tracker_id text not null,
  revision_number integer not null,
  saved_at integer not null,
  saved_by text not null,
  payload_json text not null,
  payload_hash text not null
);

create unique index revisions_tracker_number_idx
  on revisions(tracker_id, revision_number);

create index trackers_updated_idx on trackers(updated_at);
create index trackers_deleted_idx on trackers(deleted_at);
```

Notes:

- `revision_number` is a per-tracker monotonic counter that is **never reused**, even after pruning. A long-lived tracker legitimately holds revisions 41–45. Users see stable, meaningful numbers.
- The unique index on `(tracker_id, revision_number)` is not just for lookup — it is the primary race guard on concurrent saves (see below).
- `payload_hash` supports dedupe: a save whose payload matches the current revision returns the current revision instead of burning a slot in the 5-revision window. This matters much more with a 5-slot cap than it did with time-based retention — without it, three accidental double-clicks would evict real history.
- D1 does not enforce foreign keys by default; do not rely on declared references. Deletion order is the only protection against orphans.
- `trackers_updated_idx` and `trackers_deleted_idx` keep the nightly sweep from full-scanning the table, which is what keeps the cron inside its 10 ms CPU budget.

## The Rolling 5-Revision Window

This is the core of the design, so it is specified precisely.

**Invariant:** for any live tracker, `count(revisions where tracker_id = T)` ≤ 5, and the set is always the 5 highest revision numbers, one of which is the current revision.

**Enforced at write time**, inside the save path. No background job is required to hold the invariant.

**As implemented**, the entire save is a single `db.batch()` — which D1 executes as one transaction — and every statement derives its effect from committed database state rather than from client input. Given a request with `parent_revision_number = P`:

1. **Insert**, guarded by a subquery on the tracker row:

   ```sql
   insert into revisions (id, tracker_id, revision_number, saved_at, saved_by, payload_json, payload_hash)
   select ?, ?, current_revision_number + 1, ?, ?, ?, ?
     from trackers
    where id = ? and current_revision_number = ? and deleted_at is null
   ```

   A stale `P` matches no row, so this inserts nothing. `meta.changes == 0` **is** the conflict signal, and it means nothing was written at all.

2. **Advance the pointer** under the same guard:

   ```sql
   update trackers
      set current_revision_id = ?,
          current_revision_number = current_revision_number + 1,
          updated_at = ?
    where id = ? and current_revision_number = ? and deleted_at is null
   ```

3. **Prune**, with the threshold read back from the tracker row rather than computed from the request:

   ```sql
   delete from revisions
    where tracker_id = ?
      and revision_number <= (select current_revision_number from trackers where id = ?) - 5
   ```

Three properties fall out of this, and each replaces something the earlier draft had to work around:

- **No orphan rows are possible.** A losing save writes nothing, so there is no compensating delete to issue and nothing for the nightly sweep to repair. The orphan sweep stays as a backstop but should always find zero.
- **Revision numbers are server-derived.** The client's `parent_revision_number` is only ever a guard value in a `WHERE` clause; it never becomes data.
- **A forged parent cannot widen the prune.** This is the important one. If the delete threshold were computed as `P + 1 - 5`, a client sending `parent_revision_number: 99999` would produce a threshold high enough to delete every retained revision. Reading `current_revision_number` back from the committed tracker row makes that impossible — there is a test for exactly this.

Because pruning runs on every save and numbers are monotonic, **at most one row is deleted per save**, against an exact indexed range.

The window size lives in one constant in the Worker (`REVISION_WINDOW = 5`) referenced by both the prune statement and the history endpoint, so the cap and what the UI claims can never disagree.

## Free Tier Budget

Free plan ceilings: Workers 100,000 requests/day; D1 5,000,000 row reads/day, 100,000 row writes/day, 5 GB storage.

**Storage.** A realistic tracker payload — the existing `compactState()` output for ~20 expenses and ~8 groups — is roughly 2–4 KB of JSON. Five revisions plus row overhead is on the order of 20 KB per tracker. 5 GB therefore holds well over 200,000 trackers, and with the 12-month expiry the population is bounded rather than monotonically growing. **Storage is not a real constraint** and never becomes one; the 5-revision cap is what guarantees per-tracker cost stays constant no matter how long a group keeps editing.

**Row writes** are the tightest D1 dimension. Per save: 1 insert + 1 tracker update + at most 1 prune delete = **3 row writes**, so ~33,000 saves/day fit the 100,000/day allowance.

**Row reads** are negligible: loading a tracker is 2 primary-key reads (tracker row, then revision by id); the history endpoint reads at most 5 indexed rows.

**Requests** are the actual binding limit — 100,000/day across creates, loads, saves, history, and preflights. To keep that budget honest:

- Cache CORS preflights with `Access-Control-Max-Age` so an `OPTIONS` request doesn't shadow every real call.
- Do not poll. The explicit-save model already avoids background traffic; the conflict check happens as part of the save itself, not as a separate probe.

At these ratios the free tier supports thousands of active trackers. The plan should be re-evaluated only if daily requests approach ~80,000.

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

Every route on a tombstoned or expired tracker returns `410 Gone`. Every route except `POST /trackers` requires `Authorization: Bearer <token>`; a bad token returns `401` and is indistinguishable from a missing tracker to avoid confirming which IDs exist.

### `POST /trackers`

Creates the tracker ID and token, stores the token hash, writes revision 1, sets `current_revision_number = 1`. Returns tracker identity and link data. The "one cloud tracker per page" rule is client-side only — the server neither can nor does enforce it.

### `GET /trackers/:id/latest`

Returns the current revision payload plus metadata including `revision_number`, `saved_at`, `saved_by`, and **`expires_at`** (computed server-side as `updated_at` + 12 months). The client stores `revision_number` as the parent for its next save, and drives the expiry warning off `expires_at` rather than any locally computed date.

### `POST /trackers/:id/revisions`

Body: `{ parent_revision_number, saved_by, payload, force? }`.

- Stale parent → `409 Conflict` with current revision metadata attached, so the UI can name who saved and when.
- `payload_hash` matching the current revision → return the current revision unchanged (dedupe; protects a window slot). This branch still updates the tracker's `updated_at`, so an unchanged save resets the inactivity clock — see the expiry warning above.
- `force: true` → re-read the current revision number and save on top of it, skipping the parent check. Used only after the user confirms in the conflict prompt.
- Otherwise: insert, CAS, prune, as specified above.

### `GET /trackers/:id/revisions`

Returns metadata for the ≤5 retained revisions (no payloads), plus the window size so the UI can explain the cap without hardcoding it.

### `GET /trackers/:id/revisions/:revisionId`

Returns one retained revision's full payload, for previewing or restoring an older save. Restoring is a normal new save of that payload, not an in-place rollback — so restoring costs a window slot like any other save.

### `PATCH /trackers/:id`

Updates `title` only. Does not create a revision and does not touch `current_revision_number`.

### `DELETE /trackers/:id`

**Soft delete only.** Sets `deleted_at`; nothing is physically removed. All routes return `410 Gone` immediately and deterministically. Revisions are left completely untouched — the delete writes exactly one row.

That last point is what makes recovery trivial: because soft delete never prunes, reorders, or renumbers revisions, and never clears `token_hash`, an undeleted tracker comes back with its full 5-revision window intact **and its original share links still working**. Everyone who had the link keeps access without needing a new one.

The confirmation dialog should say the tracker can be restored by the operator, not imply the data is gone forever.

## Abuse Controls

`POST /trackers` is necessarily unauthenticated, so the Worker enforces:

- **Payload cap 128 KB** per revision, rejected with `413`. Generous for this data model (~30× a realistic payload) while keeping worst-case per-tracker storage near 640 KB.
- **Field caps**, server-side: `title` 120 chars, `saved_by` 60 chars.
- **Escaping**: `title` and `saved_by` are attacker-controlled and rendered on every viewer's page. Render them through the existing `esc()` helper — a shared cloud link must never become a stored-XSS vector.
- **Payload validation**: run the incoming payload through the same shape check as `validState()` before storing, so the cloud never serves data the page cannot load.
- **Rate limits** on tracker creation and revision saves, via the Workers rate-limiting binding (`[[unsafe.bindings]]`, `type = "ratelimit"`), keyed by IP for creates and by tracker ID for saves.

**Dropped during implementation: the per-tracker daily save cap.** It was specified as "cap revisions per tracker per day (e.g. 200)", but that is not implementable by counting revisions — the rolling window caps retained rows at 5, so such a count can never reach 200 and the check would be dead code that always passes. Enforcing it honestly would need a separate counter column and a write on every save, which costs more free-tier row-writes than the abuse it prevents. The `RL_WRITE` rate limiter (keyed by tracker id) covers the runaway-client case instead.

## Undelete Runbook (v1: DB command, no UI)

Undelete is a supported operation in v1, performed directly against D1 with `wrangler`. There is no API route and no UI — deliberately, because an unauthenticated-by-link undelete endpoint would let anyone who ever held a link resurrect a tracker the group intended to retire.

**Recovery window.** A tracker is recoverable until the nightly job hard-deletes it. Because soft delete is now a user-facing safety net rather than an operator convenience, the grace period is **90 days** rather than 30. Storage is not a constraint here (a tombstoned tracker is ~20 KB), so a longer window costs essentially nothing and covers a group that deletes a trip tracker and wants it back a season later.

Find the tracker — by ID if the user has their link, otherwise by title and date:

```bash
wrangler d1 execute expense-trackers --remote --command "select id, title, current_revision_number, datetime(updated_at,'unixepoch') as last_saved, datetime(deleted_at,'unixepoch') as deleted from trackers where deleted_at is not null order by deleted_at desc limit 20"
```

Confirm the revision history survived before restoring:

```bash
wrangler d1 execute expense-trackers --remote --command "select revision_number, saved_by, datetime(saved_at,'unixepoch') as saved from revisions where tracker_id = 'PASTE-UUID-HERE' order by revision_number desc"
```

Restore it:

```bash
wrangler d1 execute expense-trackers --remote --command "update trackers set deleted_at = null, updated_at = unixepoch() where id = 'PASTE-UUID-HERE' and deleted_at is not null"
```

Setting `updated_at` in the same statement matters: it restarts the 12-month inactivity clock. Without it, restoring a tracker that was already 11 months stale would hand the user a tracker that silently expires weeks later.

The `and deleted_at is not null` guard makes the command idempotent and prevents a mistyped ID from touching a live tracker.

Verify by loading the original share link — it should work unchanged.

## Nightly Cleanup (secondary)

A daily Cron Trigger. Free-plan cron invocations get 10 ms **CPU** time — D1 query latency is I/O and does not count against it, but each statement must still be bounded, so every sweep uses an indexed predicate and a `LIMIT`, and the job is safe to run repeatedly across days to work through a backlog.

The rolling window is already enforced on write, so this job never handles routine retention. It exists for:

1. **Inactivity expiry** — trackers with no save in 12 months are soft-deleted (which starts their 90-day recovery window, so expiry is recoverable too, not a one-way door).
2. **Tombstone hard-delete** — trackers soft-deleted more than 90 days ago. This is the only step that destroys data irreversibly, and it is the deadline the undelete runbook is racing.
3. **Orphan sweep** — revisions numbered above their tracker's current pointer (the lost-race leftovers), and revisions whose tracker no longer exists.

Revisions are always deleted before their tracker, since foreign keys are not enforced and ordering is the only protection against orphans.

```sql
-- 1. mark long-inactive trackers as deleted
update trackers
   set deleted_at = unixepoch()
 where deleted_at is null
   and updated_at < unixepoch('now', '-12 months')
 limit 500;

-- 2. revisions of trackers past the 90-day recovery window
delete from revisions
 where tracker_id in (
   select id from trackers
    where deleted_at is not null
      and deleted_at < unixepoch('now', '-90 days')
   limit 500
 );

-- 3. the trackers themselves
delete from trackers
 where deleted_at is not null
   and deleted_at < unixepoch('now', '-90 days');

-- 4. orphaned revisions from lost save races
delete from revisions
 where rowid in (
   select r.rowid from revisions r
     join trackers t on t.id = r.tracker_id
    where r.revision_number > t.current_revision_number
      and r.saved_at < unixepoch('now', '-1 day')
   limit 500
 );
```

The one-day age filter in the orphan sweep is important: it must never delete a revision that an in-flight save has inserted but not yet pointed at.

Retention windows (`REVISION_WINDOW`, inactivity months, tombstone grace days) live as named constants in one module, referenced by both the SQL and any user-facing copy.

## Tracker Page State

Add a `cloudSession` object:

```js
{
  trackerId,
  token,
  title,
  savedBy,
  currentRevisionNumber,   // sent as parent_revision_number on save
  latestSavedAt,
  latestSavedBy,
  hasUnsavedCloudChanges
}
```

- Persist only after the user creates or opens a cloud tracker.
- Cloud drafts autosave under `groupExpenseTracker.draft.<trackerId>`; the local-only tracker keeps its existing `groupExpenseTracker.v1` key.
- `markUserChanged()` extends to set `hasUnsavedCloudChanges` and refresh the status line, reusing the existing change-tracking hook rather than adding a parallel one.

## Implementation Phases

### Phase 1: Backend — **done, not deployed**

- `worker/` with `wrangler.toml` and the D1 migration.
- UUIDv4 tracker IDs, token generation, SHA-256 hashing, constant-time verification.
- All API routes, including the single-batch save path, dedupe, `409` handling, size and field caps, payload shape validation, CORS allowlist, and `410` for tombstones.
- Scheduled cleanup handler.
- Retention constants in a single module (`src/constants.ts`).
- 33 tests passing; `tsc --noEmit` clean.

Not yet done: `wrangler login`, creating `expense_trackers_prod`, filling in its `database_id`, and deploying. See `worker/README.md`.

### Phase 2: Tracker Integration — **done**

Client logic lives in `cloud-client.js` (UMD, DOM-free, matching how `retirement-engine.js` is factored) so it can be unit-tested under plain `node`; the page owns only presentation. 33 client tests in `scripts/cloud-client-tests.js`.

One behaviour was added beyond the original list, because implementation exposed the gap: **a failed reconnect must not hide an unsaved draft.** If the service is unreachable on load, falling through to `loadStored()` would display the unrelated local-only tracker while the user's unsaved cloud work sat invisible in `localStorage` — silently, which the draft rules forbid. The page now restores the draft and keeps the session so editing continues offline and `Save` works once the network returns. On a `401`/`410` the tracker is genuinely gone, so the draft is surfaced once and the session cleared. This is the default path today, since the Worker is not deployed.


- `#cloud=` parser alongside the existing `#data=` parser.
- Cloud status panel and history panel (with the "last 5 saves" note) and the expiry warning.
- `Share live cloud tracker`, `Save cloud revision`, `Copy cloud link`, `Work locally`, `Delete cloud tracker`.
- 409 conflict UI: `Load latest` / `Save anyway`.
- Per-tracker draft keys and the draft-restore prompt.
- Escape all server-provided text on render.
- Preserve existing snapshot-link behavior unchanged.

### Phase 3: Tests

Worker tests follow the convention already established in the Crosscue challenge-boards Worker: `node --test` with a `node:sqlite`-backed D1 shim, so the suite runs with no `npm install`, no `workerd`, and no Cloudflare account.

Two shim behaviours are load-bearing and are implemented faithfully rather than stubbed, because stubbing either would make the concurrency tests pass vacuously:

- `batch()` is a real transaction (`BEGIN`/`COMMIT`/`ROLLBACK`).
- `run()` reports `meta.changes`, which is how a stale-parent save is detected.

The residual gap: the shim is SQLite, not D1, and the suite drives requests sequentially, so a genuinely simultaneous double-save is never exercised. The guard is a SQL `WHERE` clause, so the stale-parent tests cover the same code path — but a `wrangler dev --local` smoke test against real workerd is worth running before the first deploy.

- create tracker; load latest; save revision; list revisions; rename; delete then read → 410
- reject stale `parent_revision_number` with 409
- **two concurrent saves with the same parent: exactly one wins, the loser gets 409, and no orphan row survives**
- dedupe identical payload does not consume a window slot
- **the 6th save prunes exactly the oldest revision and leaves 5**
- **revision numbers keep increasing after pruning (no reuse)**
- **the current revision is never pruned, even after many rapid saves**
- oversized payload → 413; invalid token → 401; malformed payload → 400
- **unknown tracker ID and bad token return identical `401` responses** (no enumeration oracle)
- **soft delete leaves every revision row intact and does not clear `token_hash`**
- **the undelete statement restores a tracker with its full window and its original token still valid**
- **an unchanged (deduped) save bumps `updated_at`**, so the expiry-warning remedy works
- `expires_at` is returned and tracks `updated_at` + 12 months
- cleanup soft-deletes 12-month-inactive trackers, and hard-deletes only tombstones past 90 days
- **cleanup does not hard-delete a tombstone inside the 90-day window**
- cleanup's orphan sweep leaves in-flight revisions alone

Tracker page tests:

- snapshot link still works; cloud link parsing works
- local → cloud promotion; work-locally disconnect
- unsaved-change state; 409 conflict flow; draft-restore prompt; 410 message
- expiry warning appears inside the 30-day window and not outside it

Existing checks, per the README:

```sh
node scripts/check-links.js
node scripts/retirement-tests.js
```

## Remaining Open Items

- Whether the history panel gets a `Restore` action in v1 or only lists metadata.
- Whether the delete confirmation should require re-typing the tracker title. Anyone with the link can delete, and while soft delete makes that recoverable, recovery costs an operator round-trip. A typed confirmation is cheap insurance.
