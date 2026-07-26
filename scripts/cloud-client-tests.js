#!/usr/bin/env node
/*
 * Automated tests for the cloud tracker client.
 *
 * Zero-dependency, matching the repo's plain-node convention (see
 * scripts/retirement-tests.js). Cloud client calls are promise-based (fetch
 * mocking, API round-trips), so unlike retirement-tests.js the test() runner
 * here awaits each test body and collects both sync and async failures the
 * same way.
 *
 * Run with:  node scripts/cloud-client-tests.js
 * Exits non-zero if any assertion fails.
 */
const path = require('path');
const CC = require(path.join(__dirname, '..', 'cloud-client.js'));

let passed = 0;
const failures = [];
const pending = [];

function test(name, fn) {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => { passed++; })
      .catch((e) => { failures.push(`${name}: ${e && e.message ? e.message : e}`); })
  );
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ---- fakes ------------------------------------------------------------

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

function makeThrowingStorage() {
  return {
    getItem: () => { throw new Error('storage unavailable'); },
    setItem: () => { throw new Error('storage unavailable'); },
    removeItem: () => { throw new Error('storage unavailable'); }
  };
}

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async () => JSON.stringify(body)
  };
}

// ---- #cloud= hash codec ----------------------------------------------

test('buildCloudHash/parseCloudHash round-trip', () => {
  const hash = CC.buildCloudHash('abc-123', 'tok_XyZ-9_ab');
  assert(hash === 'cloud=abc-123.tok_XyZ-9_ab', 'hash format: ' + hash);
  const parsed = CC.parseCloudHash('#' + hash);
  assert(parsed.trackerId === 'abc-123', 'trackerId round-trips');
  assert(parsed.token === 'tok_XyZ-9_ab', 'token round-trips');
});

test('parseCloudHash tolerates a missing leading #', () => {
  const hash = CC.buildCloudHash('abc-123', 'tok_xyz');
  const parsed = CC.parseCloudHash(hash);
  assert(parsed && parsed.trackerId === 'abc-123' && parsed.token === 'tok_xyz', 'parses without #');
});

test('parseCloudHash tolerates other params sharing the hash', () => {
  const parsed = CC.parseCloudHash('#foo=bar&cloud=abc-123.tok_xyz&baz=1');
  assert(parsed && parsed.trackerId === 'abc-123' && parsed.token === 'tok_xyz', 'parses amid other params');
});

test('parseCloudHash rejects #data= snapshot links', () => {
  assert(CC.parseCloudHash('#data=u.abc123') === null, 'data link rejected');
  assert(CC.parseCloudHash('#data=z.abc123&other=1') === null, 'data link with extra params rejected');
});

test('parseCloudHash rejects malformed input', () => {
  assert(CC.parseCloudHash('#cloud=') === null, 'empty value');
  assert(CC.parseCloudHash('#cloud=noDotHere') === null, 'no dot');
  assert(CC.parseCloudHash('#cloud=.tok_xyz') === null, 'missing tracker id');
  assert(CC.parseCloudHash('#cloud=abc-123.') === null, 'missing token');
  assert(CC.parseCloudHash('') === null, 'empty string');
  assert(CC.parseCloudHash(null) === null, 'null input');
  assert(CC.parseCloudHash(undefined) === null, 'undefined input');
  assert(CC.parseCloudHash('#foo=bar') === null, 'unrelated param only');
});

// ---- session storage ----------------------------------------------------

test('session save/load/clear round-trips', () => {
  const storage = makeFakeStorage();
  assert(CC.loadSession(storage) === null, 'no session initially');
  const session = {
    trackerId: 't1', token: 'tok_x', title: 'Trip', savedBy: 'Tom',
    currentRevisionNumber: 1, latestSavedAt: 100, latestSavedBy: 'Tom',
    hasUnsavedCloudChanges: false
  };
  CC.saveSession(storage, session);
  const loaded = CC.loadSession(storage);
  assert(loaded.trackerId === 't1', 'trackerId round-trips');
  assert(loaded.token === 'tok_x', 'token round-trips');
  assert(loaded.hasUnsavedCloudChanges === false, 'boolean round-trips');
  CC.clearSession(storage);
  assert(CC.loadSession(storage) === null, 'cleared');
});

test('loadSession returns null for garbage JSON', () => {
  const storage = makeFakeStorage();
  storage.setItem(CC.SESSION_KEY, 'not json{{{');
  assert(CC.loadSession(storage) === null, 'garbage JSON yields null, not a throw');
});

// ---- draft storage, per-tracker isolation --------------------------------

test('per-tracker draft keys do not clobber each other', () => {
  const storage = makeFakeStorage();
  CC.saveDraft(storage, 'tracker-a', { note: 'A' });
  CC.saveDraft(storage, 'tracker-b', { note: 'B' });
  assert(CC.loadDraft(storage, 'tracker-a').note === 'A', 'tracker-a draft intact');
  assert(CC.loadDraft(storage, 'tracker-b').note === 'B', 'tracker-b draft intact');
  CC.clearDraft(storage, 'tracker-a');
  assert(CC.loadDraft(storage, 'tracker-a') === null, 'tracker-a cleared');
  assert(CC.loadDraft(storage, 'tracker-b').note === 'B', 'tracker-b unaffected by clearing tracker-a');
});

test('draftKey namespaces by trackerId', () => {
  assert(CC.draftKey('abc') === 'groupExpenseTracker.draft.abc', 'draft key format');
  assert(CC.draftKey('abc') !== CC.draftKey('def'), 'distinct trackers get distinct keys');
});

// ---- storage functions never throw ---------------------------------------

test('storage functions swallow a throwing storage implementation', () => {
  const storage = makeThrowingStorage();
  // None of these should throw, despite every underlying call throwing.
  CC.saveSession(storage, { trackerId: 't1' });
  assert(CC.loadSession(storage) === null, 'loadSession returns null on throw');
  CC.clearSession(storage);
  CC.saveDraft(storage, 't1', { a: 1 });
  assert(CC.loadDraft(storage, 't1') === null, 'loadDraft returns null on throw');
  CC.clearDraft(storage, 't1');
});

test('storage functions no-op gracefully when storage is null', () => {
  CC.saveSession(null, { trackerId: 't1' });
  assert(CC.loadSession(null) === null, 'loadSession(null) is null');
  CC.clearSession(null);
  CC.saveDraft(null, 't1', { a: 1 });
  assert(CC.loadDraft(null, 't1') === null, 'loadDraft(null) is null');
  CC.clearDraft(null, 't1');
});

// ---- API calls: method, path, headers, body ------------------------------

test('createTracker POSTs to /trackers with no Authorization header', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(201, { trackerId: 't1', token: 'tok_new', title: 'Trip', revisionNumber: 1, savedAt: 100, savedBy: 'Tom' });
  };
  const result = await CC.createTracker({
    apiBase: 'https://api.test', fetchImpl,
    payload: { a: 1 }, savedBy: 'Tom', title: 'Trip'
  });
  assert(captured.url === 'https://api.test/trackers', 'url: ' + captured.url);
  assert(captured.opts.method === 'POST', 'method');
  assert(!('authorization' in captured.opts.headers), 'no auth header on create');
  assert(captured.opts.headers['content-type'] === 'application/json', 'content-type set');
  const body = JSON.parse(captured.opts.body);
  assert(body.payload.a === 1, 'payload forwarded');
  assert(body.savedBy === 'Tom', 'savedBy forwarded');
  assert(body.title === 'Trip', 'title forwarded');
  assert(result.trackerId === 't1' && result.token === 'tok_new', 'result parsed');
});

test('fetchLatest GETs /trackers/:id/latest with bearer token', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(200, { trackerId: 't1', revisionNumber: 3, payload: { x: 1 } });
  };
  const result = await CC.fetchLatest({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc' });
  assert(captured.url === 'https://api.test/trackers/t1/latest', 'url: ' + captured.url);
  assert(captured.opts.method === 'GET', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
  assert(result.revisionNumber === 3, 'result parsed');
});

test('saveRevision POSTs to /trackers/:id/revisions with the full body', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(201, { trackerId: 't1', revisionNumber: 4, savedAt: 200, savedBy: 'Tom', deduped: false });
  };
  await CC.saveRevision({
    apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc',
    payload: { x: 2 }, savedBy: 'Tom', parentRevisionNumber: 3, force: false
  });
  assert(captured.url === 'https://api.test/trackers/t1/revisions', 'url: ' + captured.url);
  assert(captured.opts.method === 'POST', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
  const body = JSON.parse(captured.opts.body);
  assert(body.payload.x === 2, 'payload forwarded');
  assert(body.parentRevisionNumber === 3, 'parentRevisionNumber forwarded');
  assert(body.force === false, 'force forwarded as boolean');
});

test('saveRevision coerces a truthy force to boolean true', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(201, { trackerId: 't1', revisionNumber: 4 });
  };
  await CC.saveRevision({
    apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc',
    payload: {}, savedBy: 'Tom', parentRevisionNumber: 3, force: true
  });
  const body = JSON.parse(captured.opts.body);
  assert(body.force === true, 'force true forwarded');
});

test('listRevisions GETs /trackers/:id/revisions with bearer token', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(200, { trackerId: 't1', revisions: [] });
  };
  await CC.listRevisions({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc' });
  assert(captured.url === 'https://api.test/trackers/t1/revisions', 'url: ' + captured.url);
  assert(captured.opts.method === 'GET', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
});

test('getRevision GETs /trackers/:id/revisions/:revisionId with bearer token', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(200, { trackerId: 't1', revisionId: 'r5', payload: {} });
  };
  await CC.getRevision({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc', revisionId: 'r5' });
  assert(captured.url === 'https://api.test/trackers/t1/revisions/r5', 'url: ' + captured.url);
  assert(captured.opts.method === 'GET', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
});

test('renameTracker PATCHes /trackers/:id with the title', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(200, { trackerId: 't1', title: 'New Title' });
  };
  await CC.renameTracker({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc', title: 'New Title' });
  assert(captured.url === 'https://api.test/trackers/t1', 'url: ' + captured.url);
  assert(captured.opts.method === 'PATCH', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
  const body = JSON.parse(captured.opts.body);
  assert(body.title === 'New Title', 'title forwarded');
});

test('deleteTracker DELETEs /trackers/:id with bearer token', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return makeResponse(200, { trackerId: 't1', deletedAt: 300, recoverable: true });
  };
  await CC.deleteTracker({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok_abc' });
  assert(captured.url === 'https://api.test/trackers/t1', 'url: ' + captured.url);
  assert(captured.opts.method === 'DELETE', 'method');
  assert(captured.opts.headers.authorization === 'Bearer tok_abc', 'auth header');
});

test('trackerId and revisionId are URL-encoded into the path', async () => {
  let captured = null;
  const fetchImpl = async (url) => { captured = url; return makeResponse(200, {}); };
  await CC.getRevision({ apiBase: 'https://api.test', fetchImpl, trackerId: 'a b', token: 'tok', revisionId: 'r/1' });
  assert(captured === 'https://api.test/trackers/a%20b/revisions/r%2F1', 'encoded: ' + captured);
});

test('apiBase defaults to DEFAULT_API_BASE when omitted', async () => {
  let captured = null;
  const fetchImpl = async (url) => { captured = url; return makeResponse(200, { trackerId: 't1' }); };
  await CC.fetchLatest({ fetchImpl, trackerId: 't1', token: 'tok' });
  assert(captured === CC.DEFAULT_API_BASE + '/trackers/t1/latest', 'used default base: ' + captured);
});

// ---- error handling -------------------------------------------------------

test('non-2xx response throws CloudApiError with status and code', async () => {
  const fetchImpl = async () => makeResponse(401, { error: { code: 'unauthorized', message: 'This tracker link is not valid.' } });
  let caught = null;
  try {
    await CC.fetchLatest({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'bad-token' });
  } catch (e) {
    caught = e;
  }
  assert(caught, 'expected a throw');
  assert(caught instanceof CC.CloudApiError, 'is CloudApiError');
  assert(caught.status === 401, 'status: ' + caught.status);
  assert(caught.code === 'unauthorized', 'code: ' + caught.code);
  assert(caught.message === 'This tracker link is not valid.', 'message: ' + caught.message);
});

test('413 payload_too_large surfaces as CloudApiError', async () => {
  const fetchImpl = async () => makeResponse(413, { error: { code: 'payload_too_large', message: 'That tracker is too large to save.' } });
  let caught = null;
  try {
    await CC.saveRevision({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok', payload: {}, savedBy: 'Tom', parentRevisionNumber: 1 });
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof CC.CloudApiError, 'is CloudApiError');
  assert(caught.status === 413, 'status');
  assert(caught.code === 'payload_too_large', 'code');
});

test('a 409 response exposes .current with the current revision metadata', async () => {
  const currentMeta = {
    trackerId: 't1', title: 'Trip', revisionNumber: 5, updatedAt: 999,
    revisionId: 'r5', savedAt: 999, savedBy: 'Alex'
  };
  const fetchImpl = async () => makeResponse(409, {
    error: { code: 'revision_conflict', message: 'Someone else saved a newer revision.', current: currentMeta }
  });
  let caught = null;
  try {
    await CC.saveRevision({
      apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok',
      payload: {}, savedBy: 'Tom', parentRevisionNumber: 3
    });
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof CC.CloudApiError, 'is CloudApiError');
  assert(caught.status === 409, 'status');
  assert(caught.code === 'revision_conflict', 'code');
  assert(caught.current && caught.current.revisionNumber === 5, 'current attached');
  assert(caught.current.savedBy === 'Alex', 'current.savedBy attached');
});

test('a response with no error.current leaves .current undefined', async () => {
  const fetchImpl = async () => makeResponse(401, { error: { code: 'unauthorized', message: 'nope' } });
  let caught = null;
  try {
    await CC.fetchLatest({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'bad' });
  } catch (e) {
    caught = e;
  }
  assert(caught.current === undefined, 'no current on a plain 401');
});

test('a rejecting fetchImpl produces a network_error CloudApiError, not an unhandled rejection', async () => {
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  let caught = null;
  try {
    await CC.fetchLatest({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok' });
  } catch (e) {
    caught = e;
  }
  assert(caught, 'expected a throw');
  assert(caught instanceof CC.CloudApiError, 'is CloudApiError');
  assert(caught.code === 'network_error', 'code: ' + caught.code);
  assert(caught.status === null, 'no HTTP status on a network failure');
});

test('a non-JSON error body still yields a CloudApiError with the HTTP status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, text: async () => 'Bad Gateway' });
  let caught = null;
  try {
    await CC.fetchLatest({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok' });
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof CC.CloudApiError, 'is CloudApiError');
  assert(caught.status === 502, 'status carried through despite unparsable body');
  assert(caught.code === 'unknown_error', 'falls back to unknown_error code');
});

test('a successful response with an empty body resolves to null rather than throwing', async () => {
  const fetchImpl = async () => ({ ok: true, status: 204, text: async () => '' });
  const result = await CC.deleteTracker({ apiBase: 'https://api.test', fetchImpl, trackerId: 't1', token: 'tok' });
  assert(result === null, 'empty 2xx body resolves to null');
});

// ---- expiryInfo -----------------------------------------------------------

test('expiryInfo warns exactly at the warning threshold', () => {
  const now = 1000;
  const expiresAt = now + 30 * 86400;
  const info = CC.expiryInfo(expiresAt, 30, now);
  assert(info.daysLeft === 30, 'daysLeft: ' + info.daysLeft);
  assert(info.shouldWarn === true, 'shouldWarn true exactly at threshold');
  assert(info.expiresAt === expiresAt, 'expiresAt passed through');
});

test('expiryInfo does not warn one day beyond the threshold', () => {
  const now = 1000;
  const expiresAt = now + 31 * 86400;
  const info = CC.expiryInfo(expiresAt, 30, now);
  assert(info.daysLeft === 31, 'daysLeft: ' + info.daysLeft);
  assert(info.shouldWarn === false, 'shouldWarn false beyond threshold');
});

test('expiryInfo warns once inside the threshold', () => {
  const now = 1000;
  const expiresAt = now + 29 * 86400;
  const info = CC.expiryInfo(expiresAt, 30, now);
  assert(info.daysLeft === 29, 'daysLeft: ' + info.daysLeft);
  assert(info.shouldWarn === true, 'shouldWarn true inside threshold');
});

test('expiryInfo reports an already-expired tracker as warning', () => {
  const now = 1000;
  const expiresAt = now - 86400;
  const info = CC.expiryInfo(expiresAt, 30, now);
  assert(info.daysLeft <= 0, 'daysLeft non-positive: ' + info.daysLeft);
  assert(info.shouldWarn === true, 'expired tracker warns');
});

test('expiryInfo defaults warningDays to 30 when omitted', () => {
  const now = 1000;
  const expiresAt = now + 30 * 86400;
  const info = CC.expiryInfo(expiresAt, undefined, now);
  assert(info.shouldWarn === true, 'default threshold applied');
});

// ---- report -----------------------------------------------------------

Promise.all(pending).then(() => {
  if (failures.length) {
    console.error(`\nCloud client tests: ${passed} passed, ${failures.length} FAILED\n`);
    failures.forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
  } else {
    console.log(`\nCloud client tests: ${passed} passed\n`);
  }
});
