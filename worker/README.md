# Expense Tracker Cloud API

Cloudflare Worker + D1 backing the optional cloud mode of the group expense
tracker. Design and rationale live in [`../docs/cloud-tracker-plan.md`](../docs/cloud-tracker-plan.md).

Production URL: `https://expense-tracker-api.tomhess.workers.dev`

## Checks

```sh
npm test
```

```sh
npm run typecheck
```

The suite runs the real Worker against a `node:sqlite`-backed D1 shim, so it
needs no `wrangler`, no `workerd`, and no Cloudflare account. `npm test` alone
needs no `npm install` either — only `typecheck` does.

## Local development

```sh
npm install
```

```sh
npm run d1:migrate:local
```

```sh
npm run dev
```

## Deployed

Live at `https://expense-tracker-api.tomhess.workers.dev`, backed by the
`expense_trackers_prod` D1 database, with the cleanup cron on `17 3 * * *`.

Redeploy after changing `src/`:

```sh
npm run deploy
```

Apply a new migration to production before deploying code that needs it:

```sh
npm run d1:migrate:prod
```

Both require `npx wrangler login` in an interactive terminal first.

## API

All routes except `POST /trackers` require `Authorization: Bearer <token>` and
are scoped to one tracker.

| Route | Purpose |
| --- | --- |
| `POST /trackers` | Create a tracker; returns the id and the only copy of the token |
| `GET /trackers/:id/latest` | Current payload plus `expiresAt` |
| `GET /trackers/:id/revisions` | Metadata for the retained window (≤5) |
| `GET /trackers/:id/revisions/:revisionId` | One retained revision's payload |
| `POST /trackers/:id/revisions` | Save; `409` on a stale parent, `force: true` to override |
| `PATCH /trackers/:id` | Rename; creates no revision |
| `DELETE /trackers/:id` | Soft delete; recoverable for 90 days |
| `GET /health/retention` | Cleanup liveness; public, no token |

An unknown tracker and a bad token both return the same `401`, so UUID tracker
ids cannot be used as an existence oracle.

## Operations

### Undelete

Soft delete writes only `deleted_at` — revisions and `token_hash` are left
alone, so a restored tracker returns with its full window and its original
share links still working. There is no undelete API or UI by design: a
link-authenticated endpoint would let anyone who ever held a link resurrect a
tracker the group retired.

Find the tracker:

```sh
npx wrangler d1 execute expense_trackers_prod --env production --remote --command "select id, title, current_revision_number, datetime(updated_at,'unixepoch') as last_saved, datetime(deleted_at,'unixepoch') as deleted from trackers where deleted_at is not null order by deleted_at desc limit 20"
```

Restore it:

```sh
npx wrangler d1 execute expense_trackers_prod --env production --remote --command "update trackers set deleted_at = null, updated_at = unixepoch() where id = 'PASTE-UUID-HERE' and deleted_at is not null"
```

Setting `updated_at` restarts the 12-month inactivity clock — without it, a
tracker that was already stale when deleted would expire again within weeks.
The `deleted_at is not null` guard makes the command idempotent and stops a
mistyped id from touching a live tracker.

### Retention

Enforced on write: every save prunes to the newest 5 revisions in the same
transaction. The nightly cron (`17 3 * * *`) is only a safety net — inactivity
expiry, tombstone hard-delete past 90 days, and an orphan sweep that should
always find zero.

### Monitoring

Poll `GET /health/retention` and alert when `stale` is true. The heartbeat is
written only after a successful cron sweep, so it detects when the job has
stopped firing.

```sh
curl -s https://expense-tracker-api.tomhess.workers.dev/health/retention
```

### Rate limits

`RL_CREATE` is 10 requests per 60 seconds per client IP on tracker creation;
`RL_WRITE` is 30 per 60 seconds per tracker id on revision saves. Declared as
`[[ratelimits]]` at the top level of `wrangler.toml`. Enforcement is
approximate rather than an exact cutoff — slow sequential traffic can exceed
the nominal limit while a concentrated burst is throttled, blunting automated
abuse rather than metering honest users.
