import { planStateSchema, type PlanState } from '../schema/plan.schema'

/**
 * Whole-plan JSON export/import with field-level validation errors (E6,
 * docs/retirement-react-rewrite-plan.md §6) — a deliberate deviation from
 * the legacy tool's per-section CSV format. CSV suits a schema of flat
 * scalar sections; PlanState has three separately-shaped arrays (income,
 * spending.items, spending.oneOffs), and flattening those into CSV rows
 * would need real column-mapping complexity for no reader-facing benefit
 * here. JSON preserves the full nested structure losslessly, and since
 * Zod is already the schema's source of truth, reusing it on import gives
 * the same per-field error reporting CSV parsing would have needed to be
 * hand-built for.
 */

export interface ImportIssue {
  path: string
  message: string
}

export type ImportResult = { success: true; plan: PlanState } | { success: false; issues: ImportIssue[] }

export function exportPlanJson(plan: PlanState): string {
  return JSON.stringify(plan, null, 2)
}

export function importPlanJson(raw: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, issues: [{ path: '(file)', message: 'Not valid JSON.' }] }
  }
  const result = planStateSchema.safeParse(parsed)
  if (result.success) return { success: true, plan: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.') || '(root)', message: issue.message })),
  }
}
