import { useMemo } from 'react'

import { ACCOUNT_KEYS, type AccountKey } from '../schema/account.schema'
import type { PlanState } from '../schema/plan.schema'

export interface AccountBreakdown {
  key: AccountKey
  label: string
  balance: number
  share: number // 0–1 of total
}

export interface AccountModel {
  totalAssets: number
  byAccount: AccountBreakdown[]
  /** Taxable now (brokerage) + tax-deferred later (traditional) vs. never-taxed-again (Roth, HSA for qualified use). */
  taxableShare: number
  taxDeferredShare: number
  taxFreeShare: number
}

const LABELS: Record<AccountKey, string> = {
  taxable: 'Taxable',
  traditional: 'Traditional',
  roth: 'Roth',
  cash: 'Cash',
  hsa: 'HSA',
}

/**
 * A pure selector hook over `accounts` — no simulation, just a memoized
 * view the account cards / allocation chart can render from without each
 * recomputing the same percentages. Kept separate from
 * useMonteCarloSimulation because it never needs the worker: this is O(1)
 * arithmetic, cheap enough for every render.
 */
export function useAccountModel(plan: PlanState): AccountModel {
  return useMemo(() => {
    const { accounts } = plan
    const totalAssets = ACCOUNT_KEYS.reduce((sum, k) => sum + accounts[k], 0)
    const byAccount: AccountBreakdown[] = ACCOUNT_KEYS.map((key) => ({
      key,
      label: LABELS[key],
      balance: accounts[key],
      share: totalAssets > 0 ? accounts[key] / totalAssets : 0,
    }))
    const share = (k: AccountKey) => (totalAssets > 0 ? accounts[k] / totalAssets : 0)
    return {
      totalAssets,
      byAccount,
      taxableShare: share('taxable') + share('cash'),
      taxDeferredShare: share('traditional'),
      taxFreeShare: share('roth') + share('hsa'),
    }
  }, [plan.accounts])
}
