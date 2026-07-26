// In-memory test harness. Drives the real Worker against a node:sqlite-backed
// D1 shim, so no npm install and no workerd are needed to run the suite.
//
// Two shim behaviours are load-bearing for this Worker and are implemented
// faithfully rather than stubbed:
//
//   * batch() is a real transaction (BEGIN/COMMIT/ROLLBACK). The save path
//     relies on a failed statement rolling the whole batch back.
//   * run() reports meta.changes. The save path detects a stale parent by the
//     guarded INSERT affecting zero rows, so a shim that dropped `changes`
//     would make every concurrency test pass vacuously.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../src/index.ts';

export const apiBase = 'https://tracker.test';
export const pageOrigin = 'https://atomictrxn.github.io';

export function samplePayload(overrides = {}) {
  return {
    v: 1,
    m: 'group',
    e: [['Cabin', 1200, '2026-07-01', '2026-07-05', 'Tom']],
    g: [['Hess', 2, '2026-07-01', '2026-07-05']],
    ...overrides,
  };
}

export async function createApp(envOverrides = {}) {
  const db = new DatabaseSync(':memory:');
  const migrationsDir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }

  const env = {
    DB: new D1DatabaseShim(db),
    APP_ENV: 'test',
    ALLOWED_ORIGINS: pageOrigin,
    DEV_ORIGINS: 'false',
    ...envOverrides,
  };

  return {
    env,
    db,

    async runScheduled() {
      await worker.scheduled({ cron: '17 3 * * *' }, env, { waitUntil() {} });
    },

    /** Create a tracker and return { trackerId, token, ... }. */
    async createTracker(body = {}) {
      return this.fetchJson('/trackers', {
        method: 'POST',
        status: 201,
        body: { payload: samplePayload(), savedBy: 'Tom', ...body },
      });
    },

    async save(tracker, body = {}) {
      return this.fetchJson(`/trackers/${tracker.trackerId}/revisions`, {
        method: 'POST',
        token: tracker.token,
        status: 201,
        body: {
          payload: samplePayload(),
          savedBy: 'Tom',
          parentRevisionNumber: tracker.revisionNumber,
          ...body,
        },
      });
    },

    /** Rewrite timestamps to simulate the passage of time for retention tests. */
    ageTracker(trackerId, days) {
      const seconds = Math.floor(days * 86400);
      db.prepare('update trackers set updated_at = updated_at - ? where id = ?').run(
        seconds,
        trackerId,
      );
    },

    ageTombstone(trackerId, days) {
      const seconds = Math.floor(days * 86400);
      db.prepare('update trackers set deleted_at = deleted_at - ? where id = ?').run(
        seconds,
        trackerId,
      );
    },

    countRevisions(trackerId) {
      return db
        .prepare('select count(*) as count from revisions where tracker_id = ?')
        .get(trackerId).count;
    },

    revisionNumbers(trackerId) {
      return db
        .prepare(
          'select revision_number from revisions where tracker_id = ? order by revision_number',
        )
        .all(trackerId)
        .map((row) => row.revision_number);
    },

    trackerRow(trackerId) {
      return db.prepare('select * from trackers where id = ?').get(trackerId) ?? null;
    },

    async fetchJson(path, options = {}) {
      const response = await this.fetchRaw(path, options);
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      assert.equal(
        response.status,
        options.status ?? 200,
        `${path} -> ${response.status}: ${JSON.stringify(data, null, 2)}`,
      );
      return data;
    },

    async fetchRaw(path, options = {}) {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.set('origin', options.origin ?? pageOrigin);
      if (options.token) headers.set('authorization', `Bearer ${options.token}`);
      for (const [name, value] of Object.entries(options.headers ?? {})) {
        headers.set(name, value);
      }
      return worker.fetch(
        new Request(`${apiBase}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body == null ? undefined : JSON.stringify(options.body),
        }),
        env,
      );
    },
  };
}

class D1DatabaseShim {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new D1PreparedStatementShim(this.db, sql);
  }

  // D1 batches are SQL transactions: statements run sequentially, and if one
  // fails the whole sequence rolls back. Reproduced exactly, because the save
  // path depends on it.
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

class D1PreparedStatementShim {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    const bound = new D1PreparedStatementShim(this.db, this.sql);
    // node:sqlite rejects undefined and boolean bindings; D1 coerces them.
    bound.params = params.map((value) => {
      if (value === undefined) return null;
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });
    return bound;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
    };
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params), success: true };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
}
