import type { PlanState } from '../schema/plan.schema'
import type { YearRow } from './projection'

/**
 * Picks a small, meaningful set of ages for the one-page report's
 * timeline — not every simulated year, just the ones that mark an actual
 * change in the plan: today, retirement, when Social Security starts (if
 * any income line is Social Security), when RMDs become possible, the
 * balance's peak, and the end of the plan. Ages are deduped (two
 * milestones can land on the same age, e.g. retiring right at your SS
 * claim age) and sorted, so the result is always a short, readable list
 * rather than a fixed row count.
 */
export function pickMilestoneRows(plan: PlanState, rows: YearRow[]): YearRow[] {
  if (rows.length === 0) return []
  const minAge = rows[0]!.age
  const maxAge = rows[rows.length - 1]!.age
  const inRange = (age: number) => age >= minAge && age <= maxAge

  const peak = rows.reduce((best, row) => (row.total > best.total ? row : best), rows[0]!)

  const ages = new Set<number>()
  ages.add(plan.you.currentAge)
  ages.add(plan.you.retireAge)
  if (plan.income.some((line) => line.type === 'socialSecurity')) ages.add(plan.strategy.ssClaimAge)
  ages.add(73) // RMD eligibility age
  ages.add(peak.age)
  ages.add(plan.you.endAge)

  const byAge = new Map(rows.map((row) => [row.age, row]))
  return [...ages]
    .filter(inRange)
    .sort((a, b) => a - b)
    .map((age) => byAge.get(age)!)
}
