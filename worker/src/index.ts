// Expense tracker cloud API — request routing and the nightly cleanup job.
//
// Handlers live in trackers.ts; shared plumbing in http/util/validation;
// retention/limits in constants.ts.

import {
  ApiError,
  clientIp,
  corsHeaders,
  enforceRateLimit,
  json,
  problem,
  resolveOrigin,
} from "./http.ts";
import { runCleanup } from "./retention.ts";
import {
  ConflictError,
  createTracker,
  deleteTracker,
  getLatest,
  getRevision,
  listRevisions,
  renameTracker,
  requireTracker,
  saveRevision,
} from "./trackers.ts";
import type { Env } from "./types.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);

    if (request.method === "OPTIONS") {
      // A disallowed origin gets a 403 with no CORS headers, so the browser
      // blocks the real request rather than letting it through unlabelled.
      return new Response(null, {
        status: origin ? 204 : 403,
        headers: corsHeaders(origin),
      });
    }

    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    try {
      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname}`;

      if (route === "POST /trackers") {
        await enforceRateLimit(env.RL_CREATE, clientIp(request));
        return json(await createTracker(request, env), requestId, origin, 201);
      }

      // Every remaining route is scoped to one tracker and requires the token.
      const match = url.pathname.match(/^\/trackers\/([^/]+)(\/.*)?$/);
      if (!match) {
        return problem("not_found", "Route not found.", 404, requestId, origin);
      }

      const trackerId = match[1];
      const rest = match[2] ?? "";
      const tracker = await requireTracker(request, env, trackerId);

      if (request.method === "GET" && rest === "/latest") {
        return json(await getLatest(env, tracker), requestId, origin);
      }
      if (request.method === "GET" && rest === "/revisions") {
        return json(await listRevisions(env, tracker), requestId, origin);
      }
      if (request.method === "POST" && rest === "/revisions") {
        await enforceRateLimit(env.RL_WRITE, tracker.id);
        return json(await saveRevision(request, env, tracker), requestId, origin, 201);
      }

      const revisionMatch = rest.match(/^\/revisions\/([^/]+)$/);
      if (request.method === "GET" && revisionMatch) {
        return json(await getRevision(env, tracker, revisionMatch[1]), requestId, origin);
      }

      if (request.method === "PATCH" && rest === "") {
        return json(await renameTracker(request, env, tracker), requestId, origin);
      }
      if (request.method === "DELETE" && rest === "") {
        return json(await deleteTracker(env, tracker), requestId, origin);
      }

      return problem("not_found", "Route not found.", 404, requestId, origin);
    } catch (error) {
      // Conflicts carry the current revision metadata so the page's prompt can
      // name who saved and when.
      if (error instanceof ConflictError) {
        return problem(error.code, error.message, error.status, requestId, origin, {
          current: error.current,
        });
      }
      if (error instanceof ApiError) {
        return problem(error.code, error.message, error.status, requestId, origin);
      }
      // Never log tokens or full cloud links — only ids, which are safe.
      console.error(JSON.stringify({ requestId, error: String(error) }));
      return problem("internal_error", "Something went wrong.", 500, requestId, origin);
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const report = await runCleanup(env);
    console.log(JSON.stringify({ job: "cleanup", ...report }));
  },
};
