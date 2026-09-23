import type { PlanState } from '../schema/plan.schema'
import { baselineComponent, spendingForYear } from './spending'
import { incomeForYear } from './income'
import { rmdRequired } from './rmd'
import { withdraw, type Balances } from './tax'

export interface YearRow {
  age: number
  t: number
  isRetired: boolean
  taxable: number
  traditional: number
  roth: number
  cash: number
  hsa: number
  income: number
  spending: number
  withdrawal: number
  taxes: number
  total: number
  return: number
}

export interface SimulationResult {
  rows: YearRow[]
  depletionAge: number | null
  success: boolean
  endBalance: number
}

export type ReturnFn = (t: number, isRetired: boolean) => number

export function totalAll(bal: Balances): number {
  return bal.taxable + bal.traditional + bal.roth + bal.cash + bal.hsa
}

function growAll(bal: Balances, r: number): void {
  bal.taxable *= 1 + r
  bal.traditional *= 1 + r
  bal.roth *= 1 + r
  bal.cash *= 1 + r
  bal.hsa *= 1 + r
}

/**
 * Run a single path. `returnFn(t, isRetired)` supplies the nominal return
 * for year index t. Returns per-year rows plus summary. All figures
 * nominal. Ported line-for-line from retirement-engine.js's simulatePath
 * — see docs/retirement-react-rewrite-plan.md §4.3.
 */
export function simulatePath(S: PlanState, returnFn: ReturnFn): SimulationResult {
  const bal: Balances = {
    taxable: S.accounts.taxable,
    traditional: S.accounts.traditional,
    roth: S.accounts.roth,
    cash: S.accounts.cash,
    hsa: S.accounts.hsa,
  }
  const rows: YearRow[] = []
  let depletionAge: number | null = null
  let success = true
  let fourPctBase: number | null = null
  let guardW: number | null = null // current nominal guardrails withdrawal
  let guardInitRate: number | null = null
  let prevReturn: number | null = null // last year's realized return (for the guardrails rule)
  const tRet = Math.max(0, S.you.retireAge - S.you.currentAge)
  const infl = S.assumptions.inflation
  const cg = S.assumptions.contributionGrowth

  for (let age = S.you.currentAge, t = 0; age <= S.you.endAge; age++, t++) {
    const isRetired = age >= S.you.retireAge
    const r = returnFn(t, isRetired)
    let income = 0
    let spendingNeed = 0
    let taxesPaid = 0
    let withdrawal = 0
    const lastReturn = r

    if (!isRetired) {
      const g = Math.pow(1 + cg, t)
      bal.taxable += S.contributions.taxable * g
      bal.traditional += (S.contributions.traditional + S.contributions.employerMatch) * g
      bal.roth += S.contributions.roth * g
      bal.hsa += S.contributions.hsa * g
      growAll(bal, r)
    } else {
      if (fourPctBase === null) fourPctBase = totalAll(bal)

      const rawSpend = spendingForYear(S, age, t)
      income = incomeForYear(S, age, t)

      // Discretionary target depends on withdrawal method; healthcare/LTC/
      // one-offs are handled inside spendingForYear, so methods only
      // reshape the baseline.
      let targetSpend = rawSpend
      if (S.strategy.withdrawalMethod === 'fourPercent' && fourPctBase > 0) {
        const baseAtRet = fourPctBase * 0.04
        const discretionary = baseAtRet * Math.pow(1 + infl, t - tRet)
        targetSpend = discretionary + (rawSpend - baselineComponent(S, age, t))
      } else if (S.strategy.withdrawalMethod === 'guardrails') {
        const portfolio = totalAll(bal)
        if (guardW === null) {
          guardW = baselineComponent(S, age, t)
          guardInitRate = portfolio > 0 ? guardW / portfolio : 0
        } else {
          const currentW: number = guardW
          const initRate: number = guardInitRate ?? 0
          let tentative: number = currentW
          const rate = portfolio > 0 ? currentW / portfolio : 0
          // capital-preservation: skip the inflation raise after last year
          // was down if overspending
          if (!(prevReturn != null && prevReturn < 0 && rate > initRate)) tentative = currentW * (1 + infl)
          if (initRate > 0 && rate > 1.2 * initRate) tentative *= 0.9 // guardrail cut
          else if (initRate > 0 && rate < 0.8 * initRate) tentative *= 1.1 // prosperity raise
          guardW = tentative
        }
        targetSpend = guardW + (rawSpend - baselineComponent(S, age, t))
      }

      spendingNeed = targetSpend
      let need = targetSpend - income
      if (need < 0) {
        bal.taxable += -need
        need = 0
      } // surplus income reinvested

      const rmd = rmdRequired(age, bal.traditional)
      const res = withdraw(bal, need, S.strategy.withdrawalOrder, S.assumptions.taxRate, S.assumptions.taxableGainFraction, rmd)
      taxesPaid = res.tax
      withdrawal = res.gross
      if (!res.fullyFunded) {
        success = false
        if (depletionAge === null) depletionAge = age
      }
      growAll(bal, r)
    }

    rows.push({
      age,
      t,
      isRetired,
      taxable: bal.taxable,
      traditional: bal.traditional,
      roth: bal.roth,
      cash: bal.cash,
      hsa: bal.hsa,
      income,
      spending: spendingNeed,
      withdrawal,
      taxes: taxesPaid,
      total: totalAll(bal),
      return: lastReturn,
    })
    prevReturn = r // remembered for next year's guardrails decision
  }

  return { rows, depletionAge, success, endBalance: rows.length ? rows[rows.length - 1]!.total : totalAll(bal) }
}

/** Deterministic single-path projection using the flat return assumptions. */
export function projectDeterministic(S: PlanState): SimulationResult {
  const returnFn: ReturnFn = (_t, isRetired) => (isRetired ? S.assumptions.returnRetire : S.assumptions.returnAccum)
  return simulatePath(S, returnFn)
}

/**
 * Project against an explicit per-year nominal return sequence (for the
 * sequence-of-returns demonstration).
 */
export function projectWithReturns(S: PlanState, returns: readonly number[]): SimulationResult {
  const returnFn: ReturnFn = (t) => (t < returns.length ? returns[t]! : returns.length ? returns[returns.length - 1]! : 0)
  return simulatePath(S, returnFn)
}
