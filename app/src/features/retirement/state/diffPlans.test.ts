import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { diffPlans } from './diffPlans'

describe('diffPlans', () => {
  it('reports no differences for two identical plans', () => {
    const a = defaultPlanState()
    const b = defaultPlanState()
    expect(diffPlans(a, b)).toHaveLength(0)
  })

  it('reports a single leaf difference by dotted path', () => {
    const a = defaultPlanState()
    const b = { ...defaultPlanState(), you: { ...defaultPlanState().you, retireAge: 62 } }
    const diffs = diffPlans(a, b)
    expect(diffs).toContainEqual({ path: 'you.retireAge', a: a.you.retireAge, b: 62 })
  })

  it('reports an array field as a single changed entry, not per-index', () => {
    const a = defaultPlanState()
    const b = {
      ...defaultPlanState(),
      income: [...defaultPlanState().income, { type: 'other' as const, label: 'Rental', amount: 5000, frequency: 'annual' as const, startAge: 65, cola: false }],
    }
    const diffs = diffPlans(a, b)
    expect(diffs.filter((d) => d.path === 'income')).toHaveLength(1)
  })
})
