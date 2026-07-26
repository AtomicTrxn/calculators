// Request validation.
//
// The payload shape mirrors `compactState()` in group-expense-tracker.html:
//   { v: 1, m: "group" | "person", e: [[name, cost, start, end, paidBy], ...],
//                                   g: [[name, people, arrive, depart], ...] }
//
// Validating here means the cloud can never hand back something the page
// cannot load — a tracker that 200s but renders as an error is worse than a
// save that was refused up front.

import { ApiError } from "./http.ts";
import { MAX_SAVED_BY_LENGTH, MAX_TITLE_LENGTH } from "./constants.ts";

export function requireString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_field", `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError(400, "invalid_field", `${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(
      400,
      "invalid_field",
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }
  return trimmed;
}

export function optionalTitle(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_field", "title must be a string.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ApiError(
      400,
      "invalid_field",
      `title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

export function requireSavedBy(value: unknown): string {
  return requireString(value, "savedBy", MAX_SAVED_BY_LENGTH);
}

export function requireRevisionNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ApiError(
      400,
      "invalid_field",
      `${field} must be a non-negative integer.`,
    );
  }
  return value;
}

/**
 * Validate a tracker payload and return it re-serialized.
 *
 * Re-serializing from the parsed value (rather than storing the raw request
 * text) is deliberate: it strips any extra keys a client tacked on, and makes
 * the stored JSON canonical so the dedupe hash is stable across clients that
 * order keys differently.
 */
export function validatePayload(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_payload", "payload must be an object.");
  }
  const payload = value as Record<string, unknown>;

  if (payload.v !== 1) {
    throw new ApiError(400, "invalid_payload", "Unsupported payload version.");
  }
  const method = payload.m === "person" ? "person" : "group";

  const expenses = payload.e;
  const groups = payload.g;
  if (!Array.isArray(expenses) || !Array.isArray(groups)) {
    throw new ApiError(400, "invalid_payload", "payload.e and payload.g must be arrays.");
  }
  // Matches validState() on the page, which treats an empty tracker as not
  // worth loading. Refusing it here stops an empty cloud tracker from being
  // created and then failing to open.
  if (expenses.length === 0 || groups.length === 0) {
    throw new ApiError(
      400,
      "invalid_payload",
      "A tracker needs at least one expense and one group.",
    );
  }

  const cleanExpenses = expenses.map((row) => {
    if (!Array.isArray(row)) {
      throw new ApiError(400, "invalid_payload", "Each expense must be an array.");
    }
    const [name, cost, start, end, paidBy] = row as unknown[];
    return [
      asText(name),
      Number.isFinite(Number(cost)) ? Number(cost) : 0,
      asText(start),
      asText(end),
      asText(paidBy),
    ];
  });

  const cleanGroups = groups.map((row) => {
    if (!Array.isArray(row)) {
      throw new ApiError(400, "invalid_payload", "Each group must be an array.");
    }
    const [name, people, arrive, depart] = row as unknown[];
    const count = Number(people);
    return [
      asText(name),
      Number.isInteger(count) && count > 0 ? count : 1,
      asText(arrive),
      asText(depart),
    ];
  });

  return JSON.stringify({ v: 1, m: method, e: cleanExpenses, g: cleanGroups });
}

// Free-text fields survive into every viewer's page, so they are length-capped
// here and HTML-escaped at render time by the page's existing esc() helper.
function asText(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return text.length > 200 ? text.slice(0, 200) : text;
}
