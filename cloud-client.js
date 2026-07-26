/*
 * Cloud tracker client.
 *
 * Pure, DOM-free HTTP client for the Cloudflare Worker API in worker/ (see
 * worker/src/trackers.ts, worker/src/index.ts, worker/README.md, and
 * docs/cloud-tracker-plan.md for the API and product model this wraps). No
 * dependencies, no `document`, no unguarded `window`. UMD footer exposes it
 * as `window.CloudClient` in the browser and `module.exports` in Node, so it
 * can be loaded with <script src="cloud-client.js"> or required from
 * scripts/cloud-client-tests.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudClient = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_SECONDS = 86400;

  const DEFAULT_API_BASE = 'https://expense-tracker-api.tomhess.workers.dev';
  const SESSION_KEY = 'groupExpenseTracker.cloud.session';

  function draftKey(trackerId) {
    return 'groupExpenseTracker.draft.' + trackerId;
  }

  // ---- #cloud= hash codec ---------------------------------------------------
  //
  // Mirrors the existing #data= snapshot-link codec (shareDataFromHash in
  // group-expense-tracker.html): parsed as URLSearchParams key=value pairs so
  // either link shape can share a hash without colliding.

  /**
   * "#cloud=<trackerId>.<token>" (leading "#" optional) -> {trackerId, token}.
   * Returns null for anything malformed, including #data= snapshot links,
   * which simply have no "cloud" key.
   */
  function parseCloudHash(hash) {
    if (typeof hash !== 'string') return null;
    let params;
    try {
      params = new URLSearchParams(hash.replace(/^#/, ''));
    } catch (e) {
      return null;
    }
    if (!params.has('cloud')) return null;
    const raw = params.get('cloud');
    if (!raw) return null;
    const dot = raw.indexOf('.');
    if (dot <= 0 || dot === raw.length - 1) return null;
    const trackerId = raw.slice(0, dot);
    const token = raw.slice(dot + 1);
    if (!trackerId || !token) return null;
    return { trackerId: trackerId, token: token };
  }

  /** {trackerId, token} -> "cloud=<trackerId>.<token>" (no leading "#"). */
  function buildCloudHash(trackerId, token) {
    return 'cloud=' + trackerId + '.' + token;
  }

  // ---- storage helpers --------------------------------------------------
  //
  // Every function here takes the storage object as its first argument (pass
  // `localStorage` in the browser) so tests can inject a fake, and every
  // function swallows storage errors, matching save()/loadStored() in
  // group-expense-tracker.html: Safari private mode throws on setItem, and a
  // storage hiccup must never break the page.

  function safeGet(storage, key) {
    try {
      if (!storage) return null;
      return storage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (!storage) return;
      storage.setItem(key, value);
    } catch (e) {
      // Swallowed on purpose: a failed autosave must not surface to the user
      // as a crash. See save() in group-expense-tracker.html.
    }
  }

  function safeRemove(storage, key) {
    try {
      if (!storage) return;
      storage.removeItem(key);
    } catch (e) {
      // Swallowed on purpose, same as safeSet.
    }
  }

  function loadJson(storage, key) {
    const raw = safeGet(storage, key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function loadSession(storage) {
    return loadJson(storage, SESSION_KEY);
  }

  function saveSession(storage, session) {
    safeSet(storage, SESSION_KEY, JSON.stringify(session));
  }

  function clearSession(storage) {
    safeRemove(storage, SESSION_KEY);
  }

  function loadDraft(storage, trackerId) {
    return loadJson(storage, draftKey(trackerId));
  }

  function saveDraft(storage, trackerId, payload) {
    safeSet(storage, draftKey(trackerId), JSON.stringify(payload));
  }

  function clearDraft(storage, trackerId) {
    safeRemove(storage, draftKey(trackerId));
  }

  // ---- errors -------------------------------------------------------------

  /**
   * Thrown by every API function on a non-2xx response, and also on a fetch
   * rejection (`code: 'network_error'`) so the UI can tell "the worker said
   * no" apart from "the worker is unreachable" — the two look identical to a
   * naive catch block, but matter a lot while the Worker is not yet deployed.
   */
  class CloudApiError extends Error {
    constructor(message, options) {
      super(message);
      options = options || {};
      this.name = 'CloudApiError';
      this.status = options.status == null ? null : options.status;
      this.code = options.code || 'unknown_error';
      // The current-revision metadata the Worker attaches to a 409
      // (ConflictError.current in worker/src/trackers.ts). Undefined on
      // every other error.
      this.current = options.current;
      if (options.cause !== undefined) this.cause = options.cause;
    }
  }

  // ---- request plumbing -----------------------------------------------------

  function joinUrl(apiBase, path) {
    return (apiBase || DEFAULT_API_BASE).replace(/\/+$/, '') + path;
  }

  async function request(options) {
    const fetchImpl = options.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined);
    if (typeof fetchImpl !== 'function') {
      throw new CloudApiError('No fetch implementation is available.', { code: 'no_fetch' });
    }

    const headers = {};
    if (options.token) headers.authorization = 'Bearer ' + options.token;
    let body;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetchImpl(joinUrl(options.apiBase, options.path), {
        method: options.method,
        headers: headers,
        body: body
      });
    } catch (err) {
      // A rejected fetch (DNS failure, offline, CORS block, the Worker not
      // being deployed yet) is not an HTTP response at all, so it gets its
      // own code rather than being forced through the HTTP-error path below.
      throw new CloudApiError('Could not reach the cloud service.', {
        code: 'network_error',
        cause: err
      });
    }

    let data = null;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      const errBody = (data && data.error) || {};
      throw new CloudApiError(errBody.message || ('Request failed with status ' + response.status), {
        status: response.status,
        code: errBody.code || 'unknown_error',
        current: errBody.current
      });
    }

    return data;
  }

  // ---- API calls ------------------------------------------------------------
  //
  // Each mirrors one route in worker/src/index.ts. Every route but
  // createTracker is scoped to a tracker and requires the bearer token.

  function createTracker(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      method: 'POST',
      path: '/trackers',
      body: {
        payload: options.payload,
        savedBy: options.savedBy,
        title: options.title
      }
    });
  }

  function fetchLatest(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'GET',
      path: '/trackers/' + encodeURIComponent(options.trackerId) + '/latest'
    });
  }

  function saveRevision(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'POST',
      path: '/trackers/' + encodeURIComponent(options.trackerId) + '/revisions',
      body: {
        payload: options.payload,
        savedBy: options.savedBy,
        parentRevisionNumber: options.parentRevisionNumber,
        force: options.force === true
      }
    });
  }

  function listRevisions(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'GET',
      path: '/trackers/' + encodeURIComponent(options.trackerId) + '/revisions'
    });
  }

  function getRevision(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'GET',
      path: '/trackers/' + encodeURIComponent(options.trackerId) +
        '/revisions/' + encodeURIComponent(options.revisionId)
    });
  }

  function renameTracker(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'PATCH',
      path: '/trackers/' + encodeURIComponent(options.trackerId),
      body: { title: options.title }
    });
  }

  function deleteTracker(options) {
    return request({
      apiBase: options.apiBase,
      fetchImpl: options.fetchImpl,
      token: options.token,
      method: 'DELETE',
      path: '/trackers/' + encodeURIComponent(options.trackerId)
    });
  }

  // ---- expiry ---------------------------------------------------------------

  /**
   * `expiresAt` is a unix-epoch-seconds deadline the Worker computes
   * server-side (see trackerMeta in worker/src/trackers.ts) so the page never
   * derives it from its own clock. `nowSeconds` is injectable for tests;
   * defaults to the real clock.
   */
  function expiryInfo(expiresAt, warningDays, nowSeconds) {
    const now = typeof nowSeconds === 'number' ? nowSeconds : Math.floor(Date.now() / 1000);
    const warning = typeof warningDays === 'number' ? warningDays : 30;
    const daysLeft = Math.ceil((expiresAt - now) / DAY_SECONDS);
    return {
      daysLeft: daysLeft,
      shouldWarn: daysLeft <= warning,
      expiresAt: expiresAt
    };
  }

  return {
    DEFAULT_API_BASE,
    SESSION_KEY,
    draftKey,

    parseCloudHash,
    buildCloudHash,

    loadSession,
    saveSession,
    clearSession,

    loadDraft,
    saveDraft,
    clearDraft,

    createTracker,
    fetchLatest,
    saveRevision,
    listRevisions,
    getRevision,
    renameTracker,
    deleteTracker,

    expiryInfo,
    CloudApiError
  };
}));
