import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createApp, pageOrigin, samplePayload } from './harness.mjs';

describe('tracker creation', () => {
  it('creates a tracker with a UUID id and a first revision', async () => {
    const app = await createApp();
    const created = await app.createTracker({ title: 'Lake trip' });

    assert.match(
      created.trackerId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.match(created.token, /^tok_/);
    assert.equal(created.revisionNumber, 1);
    assert.equal(created.title, 'Lake trip');
    assert.equal(app.countRevisions(created.trackerId), 1);
  });

  it('never stores the plaintext token', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const row = app.trackerRow(created.trackerId);
    assert.notEqual(row.token_hash, created.token);
    assert.ok(!row.token_hash.includes(created.token));
  });

  it('rejects an empty tracker', async () => {
    const app = await createApp();
    await app.fetchJson('/trackers', {
      method: 'POST',
      status: 400,
      body: { payload: samplePayload({ e: [] }), savedBy: 'Tom' },
    });
  });

  it('rejects an oversized payload with 413', async () => {
    const app = await createApp();
    const huge = samplePayload({
      e: Array.from({ length: 4000 }, (_, i) => [`Expense ${i}`.padEnd(60, 'x'), 10, '2026-07-01', '2026-07-02', 'Tom']),
    });
    await app.fetchJson('/trackers', {
      method: 'POST',
      status: 413,
      body: { payload: huge, savedBy: 'Tom' },
    });
  });
});

describe('authentication', () => {
  it('returns the same 401 for a bad token and an unknown tracker', async () => {
    const app = await createApp();
    const created = await app.createTracker();

    const badToken = await app.fetchRaw(`/trackers/${created.trackerId}/latest`, {
      token: 'tok_wrong',
    });
    const unknownTracker = await app.fetchRaw(
      '/trackers/11111111-2222-4333-8444-555555555555/latest',
      { token: created.token },
    );

    assert.equal(badToken.status, 401);
    assert.equal(unknownTracker.status, 401);

    const [a, b] = await Promise.all([badToken.json(), unknownTracker.json()]);
    // Identical bodies: the id space must not become an existence oracle.
    assert.equal(a.error.code, b.error.code);
    assert.equal(a.error.message, b.error.message);
  });

  it('requires a token', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const response = await app.fetchRaw(`/trackers/${created.trackerId}/latest`);
    assert.equal(response.status, 401);
  });
});

describe('loading', () => {
  it('returns the current payload and expiry metadata', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const latest = await app.fetchJson(`/trackers/${created.trackerId}/latest`, {
      token: created.token,
    });

    assert.deepEqual(latest.payload, samplePayload());
    assert.equal(latest.revisionNumber, 1);
    assert.equal(latest.savedBy, 'Tom');
    assert.equal(latest.revisionWindow, 5);
    assert.equal(latest.expiresAt, latest.updatedAt + 365 * 86400);
  });
});

describe('saving', () => {
  it('advances the revision number', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const saved = await app.save(created, {
      payload: samplePayload({ m: 'person' }),
    });
    assert.equal(saved.revisionNumber, 2);
    assert.equal(saved.deduped, false);
  });

  it('rejects a stale parent with 409 and names the current revision', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.save(created, { payload: samplePayload({ m: 'person' }), savedBy: 'Dana' });

    // Second saver still thinks revision 1 is current.
    const response = await app.fetchRaw(`/trackers/${created.trackerId}/revisions`, {
      method: 'POST',
      token: created.token,
      body: {
        payload: samplePayload({ e: [['Boat', 50, '2026-07-02', '2026-07-03', 'Sam']] }),
        savedBy: 'Sam',
        parentRevisionNumber: 1,
      },
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'revision_conflict');
    assert.equal(body.error.current.revisionNumber, 2);
    assert.equal(body.error.current.savedBy, 'Dana');
  });

  it('writes nothing at all when a save conflicts', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.save(created, { payload: samplePayload({ m: 'person' }) });

    const before = app.countRevisions(created.trackerId);
    await app.fetchRaw(`/trackers/${created.trackerId}/revisions`, {
      method: 'POST',
      token: created.token,
      body: {
        payload: samplePayload({ e: [['Boat', 50, '2026-07-02', '2026-07-03', 'Sam']] }),
        savedBy: 'Sam',
        parentRevisionNumber: 1,
      },
    });

    // No orphan row survives a lost race, so cleanup has nothing to repair.
    assert.equal(app.countRevisions(created.trackerId), before);
    assert.equal(app.trackerRow(created.trackerId).current_revision_number, 2);
  });

  it('lets a forced save land on top of the current revision', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.save(created, { payload: samplePayload({ m: 'person' }) });

    const forced = await app.save(created, {
      payload: samplePayload({ e: [['Boat', 50, '2026-07-02', '2026-07-03', 'Sam']] }),
      savedBy: 'Sam',
      parentRevisionNumber: 1, // stale, but force wins
      force: true,
    });
    assert.equal(forced.revisionNumber, 3);
  });

  it('cannot be tricked into a wide prune by a forged parent', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.save(created, { payload: samplePayload({ m: 'person' }) });

    // A parent far in the future would make a client-derived prune threshold
    // delete every retained revision.
    await app.fetchRaw(`/trackers/${created.trackerId}/revisions`, {
      method: 'POST',
      token: created.token,
      body: {
        payload: samplePayload({ e: [['Boat', 50, '2026-07-02', '2026-07-03', 'Sam']] }),
        savedBy: 'Sam',
        parentRevisionNumber: 99999,
      },
    });

    assert.equal(app.countRevisions(created.trackerId), 2);
  });

  it('deduplicates an identical save without consuming a window slot', async () => {
    const app = await createApp();
    const created = await app.createTracker();

    const first = await app.save(created, { payload: samplePayload() });
    assert.equal(first.deduped, true);
    assert.equal(first.revisionNumber, 1);
    assert.equal(app.countRevisions(created.trackerId), 1);
  });

  it('bumps updated_at on a deduped save so the expiry remedy works', async () => {
    const app = await createApp();
    const created = await app.createTracker();

    app.ageTracker(created.trackerId, 350);
    const aged = app.trackerRow(created.trackerId).updated_at;

    const result = await app.save(created, { payload: samplePayload() });
    assert.equal(result.deduped, true);
    // The warning tells users saving resets the clock; that must hold even
    // when the payload did not change.
    assert.ok(app.trackerRow(created.trackerId).updated_at > aged);
    assert.ok(result.expiresAt > aged + 365 * 86400);
  });
});

describe('the rolling 5-revision window', () => {
  async function saveTimes(app, tracker, count) {
    let parent = tracker.revisionNumber;
    for (let i = 0; i < count; i++) {
      const result = await app.save(tracker, {
        payload: samplePayload({ e: [[`Expense ${i}`, i + 1, '2026-07-01', '2026-07-02', 'Tom']] }),
        parentRevisionNumber: parent,
      });
      parent = result.revisionNumber;
    }
    return parent;
  }

  it('never keeps more than 5 revisions', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await saveTimes(app, created, 12);
    assert.equal(app.countRevisions(created.trackerId), 5);
  });

  it('prunes the oldest and keeps the newest five', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await saveTimes(app, created, 7); // revisions 1..8

    assert.deepEqual(app.revisionNumbers(created.trackerId), [4, 5, 6, 7, 8]);
  });

  it('never reuses a revision number after pruning', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const last = await saveTimes(app, created, 9);

    assert.equal(last, 10);
    const numbers = app.revisionNumbers(created.trackerId);
    assert.equal(Math.max(...numbers), 10);
    assert.equal(new Set(numbers).size, numbers.length);
  });

  it('always retains the current revision', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await saveTimes(app, created, 20);

    const row = app.trackerRow(created.trackerId);
    const current = app
      .revisionNumbers(created.trackerId)
      .includes(row.current_revision_number);
    assert.ok(current);

    // And it is still loadable end to end.
    const latest = await app.fetchJson(`/trackers/${created.trackerId}/latest`, {
      token: created.token,
    });
    assert.equal(latest.revisionNumber, row.current_revision_number);
  });

  it('reports only the retained window in history', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await saveTimes(app, created, 8);

    const history = await app.fetchJson(`/trackers/${created.trackerId}/revisions`, {
      token: created.token,
    });
    assert.equal(history.revisions.length, 5);
    assert.equal(history.revisionWindow, 5);
    assert.equal(history.revisions.filter((r) => r.isCurrent).length, 1);
  });

  it('explains that a pruned revision is gone', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const firstRevision = await app.fetchJson(`/trackers/${created.trackerId}/revisions`, {
      token: created.token,
    });
    const oldest = firstRevision.revisions[0].revisionId;

    await saveTimes(app, created, 8);

    const response = await app.fetchRaw(
      `/trackers/${created.trackerId}/revisions/${oldest}`,
      { token: created.token },
    );
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.match(body.error.message, /last 5 saves/);
  });
});

describe('rename', () => {
  it('renames without creating a revision', async () => {
    const app = await createApp();
    const created = await app.createTracker({ title: 'Trip' });
    const renamed = await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'PATCH',
      token: created.token,
      body: { title: 'Lake trip 2026' },
    });

    assert.equal(renamed.title, 'Lake trip 2026');
    assert.equal(renamed.revisionNumber, 1);
    assert.equal(app.countRevisions(created.trackerId), 1);
  });
});

describe('soft delete and undelete', () => {
  it('returns 410 after deletion', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    const deleted = await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });
    assert.equal(deleted.recoverable, true);

    const response = await app.fetchRaw(`/trackers/${created.trackerId}/latest`, {
      token: created.token,
    });
    assert.equal(response.status, 410);
  });

  it('keeps every revision and the token hash intact', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    let parent = created.revisionNumber;
    for (let i = 0; i < 3; i++) {
      const result = await app.save(created, {
        payload: samplePayload({ e: [[`E${i}`, i + 1, '2026-07-01', '2026-07-02', 'Tom']] }),
        parentRevisionNumber: parent,
      });
      parent = result.revisionNumber;
    }
    const before = app.countRevisions(created.trackerId);
    const hashBefore = app.trackerRow(created.trackerId).token_hash;

    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });

    assert.equal(app.countRevisions(created.trackerId), before);
    assert.equal(app.trackerRow(created.trackerId).token_hash, hashBefore);
  });

  it('comes back fully with the original link after the undelete command', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.save(created, { payload: samplePayload({ m: 'person' }) });
    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });

    // The exact statement from the undelete runbook in the plan.
    app.db
      .prepare(
        'update trackers set deleted_at = null, updated_at = unixepoch() where id = ? and deleted_at is not null',
      )
      .run(created.trackerId);

    const latest = await app.fetchJson(`/trackers/${created.trackerId}/latest`, {
      token: created.token,
    });
    assert.equal(latest.revisionNumber, 2);
    assert.deepEqual(latest.payload, samplePayload({ m: 'person' }));
  });

  it('restarts the inactivity clock on undelete', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    app.ageTracker(created.trackerId, 360);
    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });

    app.db
      .prepare(
        'update trackers set deleted_at = null, updated_at = unixepoch() where id = ? and deleted_at is not null',
      )
      .run(created.trackerId);

    const latest = await app.fetchJson(`/trackers/${created.trackerId}/latest`, {
      token: created.token,
    });
    // Without the updated_at bump, a restored tracker would expire days later.
    const daysLeft = (latest.expiresAt - Math.floor(Date.now() / 1000)) / 86400;
    assert.ok(daysLeft > 360, `expected a fresh year, got ${daysLeft} days`);
  });
});

describe('nightly cleanup', () => {
  it('soft-deletes trackers inactive for 12 months', async () => {
    const app = await createApp();
    const fresh = await app.createTracker();
    const stale = await app.createTracker();
    app.ageTracker(stale.trackerId, 400);

    await app.runScheduled();

    assert.equal(app.trackerRow(fresh.trackerId).deleted_at, null);
    assert.notEqual(app.trackerRow(stale.trackerId).deleted_at, null);
  });

  it('leaves an expired tracker recoverable rather than destroying it', async () => {
    const app = await createApp();
    const stale = await app.createTracker();
    app.ageTracker(stale.trackerId, 400);
    await app.runScheduled();

    // Expiry is a soft delete, so the revisions are still there to restore.
    assert.equal(app.countRevisions(stale.trackerId), 1);
  });

  it('does not hard-delete a tombstone inside the 90-day window', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });
    app.ageTombstone(created.trackerId, 89);

    await app.runScheduled();

    assert.notEqual(app.trackerRow(created.trackerId), null);
    assert.equal(app.countRevisions(created.trackerId), 1);
  });

  it('hard-deletes a tombstone past 90 days, revisions first', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });
    app.ageTombstone(created.trackerId, 91);

    await app.runScheduled();

    assert.equal(app.countRevisions(created.trackerId), 0);
    assert.equal(app.trackerRow(created.trackerId), null);
  });

  it('finds no orphans to sweep, because the save path cannot create them', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    let parent = created.revisionNumber;
    for (let i = 0; i < 8; i++) {
      const result = await app.save(created, {
        payload: samplePayload({ e: [[`E${i}`, i + 1, '2026-07-01', '2026-07-02', 'Tom']] }),
        parentRevisionNumber: parent,
      });
      parent = result.revisionNumber;
    }

    await app.runScheduled();
    assert.equal(app.countRevisions(created.trackerId), 5);
  });
});

describe('cleanup heartbeat', () => {
  it('reports stale before the job has ever run', async () => {
    const app = await createApp();
    const health = await app.fetchJson('/health/retention');
    assert.equal(health.lastCleanupAt, null);
    assert.equal(health.ageSeconds, null);
    // A worker that has never swept is exactly the condition to alert on.
    assert.equal(health.stale, true);
  });

  it('records a heartbeat and the run summary after a sweep', async () => {
    const app = await createApp();
    const created = await app.createTracker();
    await app.fetchJson(`/trackers/${created.trackerId}`, {
      method: 'DELETE',
      token: created.token,
    });
    app.ageTombstone(created.trackerId, 91);

    await app.runScheduled();

    const health = await app.fetchJson('/health/retention');
    assert.ok(Number.isFinite(health.lastCleanupAt));
    assert.equal(health.stale, false);
    assert.ok(health.ageSeconds >= 0 && health.ageSeconds < 60);
    assert.equal(health.lastReport.trackersPurged, 1);
    assert.equal(health.lastReport.revisionsPurged, 1);
  });

  it('goes stale once two daily runs have been missed', async () => {
    const app = await createApp();
    await app.runScheduled();
    assert.equal((await app.fetchJson('/health/retention')).stale, false);

    // Rewind the heartbeat past the two-day threshold.
    app.db
      .prepare("update ops_meta set value = ? where key = 'last_cleanup_at'")
      .run(String(Math.floor(Date.now() / 1000) - 3 * 86400));

    const health = await app.fetchJson('/health/retention');
    assert.equal(health.stale, true);
    assert.ok(health.ageSeconds > 2 * 86400);
  });

  it('needs no token', async () => {
    const app = await createApp();
    const res = await app.fetchRaw('/health/retention');
    assert.equal(res.status, 200);
  });

  it('survives a corrupt stored report', async () => {
    const app = await createApp();
    await app.runScheduled();
    app.db
      .prepare("update ops_meta set value = 'not json' where key = 'last_cleanup_report'")
      .run();

    const health = await app.fetchJson('/health/retention');
    // The timestamp is what a monitor alerts on; it must survive.
    assert.ok(Number.isFinite(health.lastCleanupAt));
    assert.equal(health.lastReport, null);
  });
});

describe('CORS', () => {
  it('echoes the allowed origin and caches the preflight', async () => {
    const app = await createApp();
    const response = await app.fetchRaw('/trackers', { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), pageOrigin);
    assert.ok(Number(response.headers.get('access-control-max-age')) > 0);
  });

  it('refuses an origin that is not on the allowlist', async () => {
    const app = await createApp();
    const response = await app.fetchRaw('/trackers', {
      method: 'OPTIONS',
      origin: 'https://evil.example',
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });

  it('keeps the file:// origin out of production', async () => {
    const app = await createApp({ DEV_ORIGINS: 'false' });
    const response = await app.fetchRaw('/trackers', {
      method: 'OPTIONS',
      origin: 'null',
    });
    assert.equal(response.status, 403);
  });
});
