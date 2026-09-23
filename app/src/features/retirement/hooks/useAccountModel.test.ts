import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { useAccountModel } from './useAccountModel'

describe('useAccountModel', () => {
  it('computes total assets and per-account shares', () => {
    const plan = defaultPlanState()
    plan.accounts = { taxable: 100, traditional: 300, roth: 100, cash: 0, hsa: 500 }
    const { result } = renderHook(() => useAccountModel(plan))
    expect(result.current.totalAssets).toBe(1000)
    const traditional = result.current.byAccount.find((a) => a.key === 'traditional')
    expect(traditional?.share).toBeCloseTo(0.3)
  })

  it('buckets shares into taxable / tax-deferred / tax-free', () => {
    const plan = defaultPlanState()
    plan.accounts = { taxable: 200, traditional: 400, roth: 200, cash: 200, hsa: 0 }
    const { result } = renderHook(() => useAccountModel(plan))
    expect(result.current.taxableShare).toBeCloseTo(0.4) // taxable + cash
    expect(result.current.taxDeferredShare).toBeCloseTo(0.4)
    expect(result.current.taxFreeShare).toBeCloseTo(0.2)
  })

  it('does not divide by zero when all balances are zero', () => {
    const plan = defaultPlanState()
    plan.accounts = { taxable: 0, traditional: 0, roth: 0, cash: 0, hsa: 0 }
    const { result } = renderHook(() => useAccountModel(plan))
    expect(result.current.totalAssets).toBe(0)
    expect(result.current.byAccount.every((a) => a.share === 0)).toBe(true)
  })
})
