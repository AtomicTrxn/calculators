import { describe, expect, it } from 'vitest'

import { defaultPlanState, planStateSchema } from './plan.schema'

describe('planStateSchema', () => {
  it('accepts a well-formed default plan', () => {
    const result = planStateSchema.safeParse(defaultPlanState())
    expect(result.success).toBe(true)
  })

  it('rejects an out-of-range tax rate', () => {
    const bad = defaultPlanState()
    bad.assumptions.taxRate = 1.5 // valid TS number, invalid per the schema's runtime range check
    const result = planStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects an unknown withdrawal method', () => {
    const bad = defaultPlanState()
    // @ts-expect-error deliberately invalid for the test
    bad.strategy.withdrawalMethod = 'yolo'
    const result = planStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('coerces numeric-looking strings (form inputs arrive as strings)', () => {
    const raw = defaultPlanState()
    // @ts-expect-error simulating a raw form value before RHF/Zod coercion
    raw.accounts.taxable = '50000'
    const result = planStateSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.accounts.taxable).toBe(50000)
  })

  it('rejects a negative account balance', () => {
    const bad = defaultPlanState()
    bad.accounts.taxable = -1
    const result = planStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
