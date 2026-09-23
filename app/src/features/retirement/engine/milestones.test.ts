import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { projectDeterministic } from './projection'
import { pickMilestoneRows } from './milestones'

describe('pickMilestoneRows', () => {
  it('includes current age, retirement age, and end-of-plan age', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 40, retireAge: 65, endAge: 90 }
    const { rows } = projectDeterministic(plan)
    const milestones = pickMilestoneRows(plan, rows)
    const ages = milestones.map((r) => r.age)
    expect(ages).toContain(40)
    expect(ages).toContain(65)
    expect(ages).toContain(90)
  })

  it('returns ages sorted ascending with no duplicates', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 40, retireAge: 65, endAge: 90 }
    const { rows } = projectDeterministic(plan)
    const ages = pickMilestoneRows(plan, rows).map((r) => r.age)
    const sorted = [...ages].sort((a, b) => a - b)
    expect(ages).toEqual(sorted)
    expect(new Set(ages).size).toBe(ages.length)
  })

  it('only includes the Social Security claim age when a Social Security income line exists', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 40, retireAge: 65, endAge: 90 }
    plan.strategy.ssClaimAge = 70
    const { rows } = projectDeterministic(plan)

    expect(pickMilestoneRows(plan, rows).map((r) => r.age)).not.toContain(70)

    plan.income = [{ type: 'socialSecurity', label: 'SS', amount: 2000, frequency: 'monthly', startAge: 67, cola: true }]
    const { rows: rowsWithSS } = projectDeterministic(plan)
    expect(pickMilestoneRows(plan, rowsWithSS).map((r) => r.age)).toContain(70)
  })

  it('collapses to a single row when the whole plan is one year', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 80, retireAge: 80, endAge: 80 }
    const { rows } = projectDeterministic(plan)
    expect(pickMilestoneRows(plan, rows)).toHaveLength(1)
    expect(pickMilestoneRows(plan, rows)[0]!.age).toBe(80)
  })

  it('returns an empty list when there are no rows', () => {
    const plan = defaultPlanState()
    expect(pickMilestoneRows(plan, [])).toEqual([])
  })
})
