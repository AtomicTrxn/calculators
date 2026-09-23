import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { findRetirementAgesForLegacy } from './legacySolver'

function testPlan() {
  const s = defaultPlanState()
  s.you = { currentAge: 60, retireAge: 62, endAge: 66 }
  s.accounts = { taxable: 200000, traditional: 400000, roth: 100000, cash: 50000, hsa: 0 }
  s.contributions = { taxable: 10000, traditional: 20000, roth: 6000, hsa: 0, employerMatch: 5000 }
  s.spending.baseline = 60000
  return s
}

describe('findRetirementAgesForLegacy', () => {
  it('finds the earliest age immediately when the target is trivially cleared', () => {
    const ages = findRetirementAgesForLegacy(testPlan(), 0, { iterations: 50 })
    expect(ages.p10?.age).toBe(60)
    expect(ages.p50?.age).toBe(60)
    expect(ages.p90?.age).toBe(60)
  })

  it('reports the balance the outcome needs at that retirement age, not just the age', () => {
    const ages = findRetirementAgesForLegacy(testPlan(), 0, { iterations: 50 })
    // Real (positive) starting balances mean the balance-at-retirement figure should be positive too.
    expect(ages.p10?.balanceAtRetirement).toBeGreaterThan(0)
    expect(ages.p50?.balanceAtRetirement).toBeGreaterThan(0)
    expect(ages.p90?.balanceAtRetirement).toBeGreaterThan(0)
  })

  it('reports unreachable as null when even the last possible retirement age misses the target', () => {
    const ages = findRetirementAgesForLegacy(testPlan(), 1e12, { iterations: 50 })
    expect(ages.p10).toBeNull()
    expect(ages.p50).toBeNull()
    expect(ages.p90).toBeNull()
  })

  it('never resolves a harder percentile to an earlier age than an easier one', () => {
    // p10 (pessimistic) needs at least as much saved as p50 (median), which needs
    // at least as much as p90 (optimistic) — so clearing the same dollar target
    // should never require retiring earlier at p10 than at p50, or at p50 than at p90.
    const ages = findRetirementAgesForLegacy(testPlan(), 900000, { iterations: 200 })
    if (ages.p10 !== null && ages.p50 !== null) expect(ages.p10.age).toBeGreaterThanOrEqual(ages.p50.age)
    if (ages.p50 !== null && ages.p90 !== null) expect(ages.p50.age).toBeGreaterThanOrEqual(ages.p90.age)
  })

  it('only searches ages in [currentAge, endAge)', () => {
    const plan = testPlan()
    const ages = findRetirementAgesForLegacy(plan, 0, { iterations: 20 })
    for (const outcome of [ages.p10, ages.p50, ages.p90]) {
      if (outcome !== null) {
        expect(outcome.age).toBeGreaterThanOrEqual(plan.you.currentAge)
        expect(outcome.age).toBeLessThan(plan.you.endAge)
      }
    }
  })
})
