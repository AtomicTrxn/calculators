import { normalizeState } from '../engine/normalize'
import type { PlanState } from '../schema/plan.schema'

/**
 * Own localStorage key, deliberately separate from the legacy calculators'
 * `financial-plan-state-v1` (plan-state.js) — the React app stays fully
 * standalone with no shared schema, per
 * docs/retirement-react-rewrite-plan.md §5.5.
 */
export const STORAGE_KEY = 'retirement-planner-react.v1'

export function loadStoredPlan(): PlanState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeState(JSON.parse(raw))
  } catch {
    return null // corrupted storage or private-mode restrictions — fall through to defaults
  }
}

export function saveStoredPlan(plan: PlanState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
  } catch {
    // private-mode / quota — silently skip, nothing the user can act on mid-edit
  }
}
