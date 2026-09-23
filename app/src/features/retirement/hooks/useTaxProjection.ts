import { useMemo } from 'react'

import { projectDeterministic, type YearRow } from '../engine/projection'
import type { PlanState } from '../schema/plan.schema'

export interface TaxYear {
  age: number
  spending: number
  taxes: number
  /** Taxes as a share of that year's withdrawal + guaranteed income. */
  effectiveRate: number
}

export interface TaxProjection {
  rows: YearRow[]
  byYear: TaxYear[]
  lifetimeTaxes: number
  averageRetirementEffectiveRate: number
}

/**
 * Deterministic single-path projection, viewed through a tax lens. Reuses
 * the same engine call as the plain projection table (Phase 2) — this
 * hook doesn't duplicate simulation logic, it re-derives a tax-focused
 * shape from the same result, which is why it's cheap enough to run on
 * every render without a worker (projectDeterministic is one path, not
 * one thousand).
 */
export function useTaxProjection(plan: PlanState): TaxProjection {
  return useMemo(() => {
    const { rows } = projectDeterministic(plan)
    const retiredRows = rows.filter((r) => r.isRetired)
    const byYear: TaxYear[] = retiredRows.map((r) => ({
      age: r.age,
      spending: r.spending,
      taxes: r.taxes,
      effectiveRate: r.income + r.withdrawal > 0 ? r.taxes / (r.income + r.withdrawal) : 0,
    }))
    const lifetimeTaxes = retiredRows.reduce((sum, r) => sum + r.taxes, 0)
    const totalWithdrawn = retiredRows.reduce((sum, r) => sum + r.withdrawal + r.income, 0)
    return {
      rows,
      byYear,
      lifetimeTaxes,
      averageRetirementEffectiveRate: totalWithdrawn > 0 ? lifetimeTaxes / totalWithdrawn : 0,
    }
  }, [plan])
}
