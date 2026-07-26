// HTTP plumbing: CORS, responses, errors, body parsing, rate limiting.

import { CORS_MAX_AGE_SECONDS, MAX_PAYLOAD_BYTES } from "./constants.ts";
import type { Env, JsonValue, RateLimiter } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolve the CORS origin to echo back.
 *
 * Returns the matched origin or null. Never `*` and never the raw request
 * origin unvalidated — echoing an arbitrary origin is the same as `*` with
 * extra steps.
 */
export function resolveOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return origin;

  // Dev-only: file:// pages send "null", which is also what sandboxed iframes
  // send. Gated behind DEV_ORIGINS so it can never be on in production.
  if (env.DEV_ORIGINS === "true") {
    if (origin === "null") return "null";
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
    if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  }
  return null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-request-id",
    // Caches the preflight so OPTIONS does not shadow every real call against
    // the 100k requests/day free-plan budget.
    "access-control-max-age": String(CORS_MAX_AGE_SECONDS),
    vary: "origin",
  };
}

export function json(
  body: JsonValue,
  requestId: string,
  origin: string | null,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json",
      "x-request-id": requestId,
    },
  });
}

export function problem(
  code: string,
  message: string,
  status: number,
  requestId: string,
  origin: string | null,
  extra: Record<string, JsonValue> = {},
): Response {
  return json({ error: { code, message, requestId, ...extra } }, requestId, origin, status);
}

/**
 * Read a JSON object body, enforcing the size cap before parsing.
 *
 * The content-length check is the cheap path; the byte-length check after
 * reading is the real guard, since content-length is client-supplied and a
 * chunked request may omit it entirely.
 */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PAYLOAD_BYTES) {
    throw new ApiError(413, "payload_too_large", "That tracker is too large to save.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) {
    throw new ApiError(413, "payload_too_large", "That tracker is too large to save.");
  }

  try {
    const raw = JSON.parse(text) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  } catch {
    // handled below
  }
  throw new ApiError(400, "invalid_json", "Expected a JSON object.");
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

export async function enforceRateLimit(
  limiter: RateLimiter | undefined,
  key: string,
): Promise<void> {
  if (!limiter) return;
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new ApiError(429, "rate_limited", "Too many requests. Please try again shortly.");
  }
}
