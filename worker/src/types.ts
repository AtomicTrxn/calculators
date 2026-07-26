// Shared types. Env mirrors the bindings in wrangler.toml.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  APP_ENV: string;
  ALLOWED_ORIGINS: string;
  DEV_ORIGINS: string;
  RL_CREATE?: RateLimiter;
  RL_WRITE?: RateLimiter;
}

export interface TrackerRow {
  id: string;
  title: string | null;
  token_hash: string;
  current_revision_id: string | null;
  current_revision_number: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface RevisionRow {
  id: string;
  tracker_id: string;
  revision_number: number;
  saved_at: number;
  saved_by: string;
  payload_json: string;
  payload_hash: string;
}
