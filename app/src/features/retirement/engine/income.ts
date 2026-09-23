import type { PlanState } from '../schema/plan.schema'
import { ssFactor } from './socialSecurity'
import { FRA } from './constants'

/** Annual-equivalent amount for an income line — mirrors itemAnnual() in engine/spending.ts for the same reason: the source of truth is whatever unit the user actually entered (a monthly SSA figure, say), not a pre-summed annual one. */
export function incomeAnnual(inc: PlanState['income'][number]): number {
  return inc.amount * (inc.frequency === 'monthly' ? 12 : 1)
}

export function incomeForYear(S: PlanState, age: number, t: number): number {
  const infl = S.assumptions.inflation
  let total = 0
  for (const inc of S.income) {
    let startAge = inc.startAge
    let amt = incomeAnnual(inc)
    if (inc.type === 'socialSecurity') {
      startAge = S.strategy.ssClaimAge
      amt = amt * ssFactor(startAge, FRA)
    }
    if (age >= startAge && amt > 0) {
      total += inc.cola ? amt * Math.pow(1 + infl, t) : amt
    }
  }
  return total
}
