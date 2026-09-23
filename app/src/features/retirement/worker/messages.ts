import type { PlanState } from '../schema/plan.schema'
import type { MonteCarloResult } from '../engine/monteCarlo'
import type { LegacyAgeResult } from '../engine/legacySolver'

/**
 * Typed message contract between the main thread and the Monte Carlo
 * worker. Defined once and imported by both sides (see
 * docs/retirement-react-rewrite-plan.md §3.2) so the two can't drift out
 * of sync the way untyped postMessage payloads can.
 */

export interface RunRequest {
  type: 'run'
  requestId: number
  plan: PlanState
  iterations: number
  seed: number
}

/**
 * Scans retirement ages for the legacy-goal solver (engine/legacySolver.ts)
 * — a separate request type, not a `run` variant, because it returns a
 * different shape (ages, not a MonteCarloResult) and is dispatched from its
 * own hook/worker instance so it can't be confused with the reactive
 * per-edit `run` request.
 */
export interface SolveLegacyAgeRequest {
  type: 'solveLegacyAge'
  requestId: number
  plan: PlanState
  targetBequest: number
  iterations: number
}

export interface CancelRequest {
  type: 'cancel'
  requestId: number
}

export type WorkerRequest = RunRequest | SolveLegacyAgeRequest | CancelRequest

export interface ProgressResponse {
  type: 'progress'
  requestId: number
  done: number
  total: number
}

export interface ResultResponse {
  type: 'result'
  requestId: number
  result: MonteCarloResult
}

export interface LegacyAgeResponse {
  type: 'legacyAgeResult'
  requestId: number
  ages: LegacyAgeResult
}

export interface ErrorResponse {
  type: 'error'
  requestId: number
  message: string
}

export type WorkerResponse = ProgressResponse | ResultResponse | LegacyAgeResponse | ErrorResponse
