// Time and crypto helpers.
//
// All timestamps are unix epoch seconds generated here, never taken from the
// client, so SQL comparisons are exact and a wrong clock on someone's laptop
// cannot skew retention.

import { DAY_SECONDS } from "./constants.ts";

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function addDaysSeconds(at: number, days: number): number {
  return at + days * DAY_SECONDS;
}

/** UUIDv4. Unguessable, so tracker ids cannot be enumerated. */
export function newTrackerId(): string {
  return crypto.randomUUID();
}

/** 256-bit share token. The only real credential in the system. */
export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `tok_${base64Url(bytes)}`;
}

export function newRevisionId(): string {
  return crypto.randomUUID();
}

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Constant-time string comparison.
 *
 * Both arguments are base64url SHA-256 digests, so they are always the same
 * length; the explicit length check keeps a malformed stored hash from turning
 * into a 500.
 *
 * `crypto.subtle.timingSafeEqual` is a Workers runtime extension and is absent
 * from Node's WebCrypto, so the XOR loop is the portable fallback that lets
 * the suite run under `node --test`. The loop accumulates over every byte and
 * never short-circuits, so it is constant-time for equal-length inputs too.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.byteLength !== right.byteLength) return false;

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(left, right);
  }

  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
