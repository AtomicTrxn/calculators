import { z } from 'zod'

import { ACCOUNT_KEYS, type AccountKey } from './account.schema'

export const WITHDRAWAL_METHODS = ['fixedReal', 'fourPercent', 'guardrails'] as const
export type WithdrawalMethod = (typeof WITHDRAWAL_METHODS)[number]

export const strategySchema = z.object({
  withdrawalOrder: z.array(z.enum(ACCOUNT_KEYS)),
  withdrawalMethod: z.enum(WITHDRAWAL_METHODS),
  ssClaimAge: z.coerce.number().int().min(62).max(70),
  monteCarloIterations: z.coerce.number().int().min(100).max(50000),
})
export type Strategy = z.infer<typeof strategySchema>

export const defaultWithdrawalOrder: AccountKey[] = ['cash', 'taxable', 'traditional', 'roth', 'hsa']

export const defaultStrategy: Strategy = {
  withdrawalOrder: defaultWithdrawalOrder,
  withdrawalMethod: 'fixedReal',
  ssClaimAge: 67,
  monteCarloIterations: 1000,
}
