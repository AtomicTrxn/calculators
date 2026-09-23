import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { useTaxProjection } from './useTaxProjection'

describe('useTaxProjection', () => {
  it('reports zero lifetime tax when withdrawals are entirely Roth', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 65, retireAge: 65, endAge: 66 }
    plan.accounts = { taxable: 0, traditional: 0, roth: 200000, cash: 0, hsa: 0 }
    plan.income = plan.income.map((i) => ({ ...i, amount: 0 }))
    plan.spending.baseline = 20000
    plan.spending.phased.enabled = false
    const { result } = renderHook(() => useTaxProjection(plan))
    expect(result.current.lifetimeTaxes).toBeCloseTo(0)
  })

  it('accumulates tax across retirement years when withdrawing from traditional', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 65, retireAge: 65, endAge: 67 }
    plan.accounts = { taxable: 0, traditional: 300000, roth: 0, cash: 0, hsa: 0 }
    plan.income = plan.income.map((i) => ({ ...i, amount: 0 }))
    plan.spending.baseline = 20000
    plan.spending.phased.enabled = false
    plan.assumptions.taxRate = 0.2
    const { result } = renderHook(() => useTaxProjection(plan))
    expect(result.current.lifetimeTaxes).toBeGreaterThan(0)
    expect(result.current.byYear.length).toBe(3)
    expect(result.current.byYear.every((y) => y.effectiveRate >= 0 && y.effectiveRate <= 1)).toBe(true)
  })

  it('excludes pre-retirement accumulation years from the tax-year breakdown', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 60, retireAge: 65, endAge: 66 }
    const { result } = renderHook(() => useTaxProjection(plan))
    expect(result.current.byYear.every((y) => y.age >= 65)).toBe(true)
  })
})
