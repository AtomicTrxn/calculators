import { z } from 'zod'

import { accountsSchema, contributionsSchema, defaultAccounts, defaultContributions } from './account.schema'
import { defaultAssumptions, assumptionsSchema } from './assumptions.schema'
import { defaultIncome, incomeSchema, sampleIncome } from './income.schema'
import { defaultLegacy, legacySchema } from './legacy.schema'
import { defaultSpending, spendingSchema } from './spending.schema'
import { defaultStrategy, strategySchema } from './strategy.schema'

export const PLAN_SCHEMA_VERSION = 2 as const

export const youSchema = z.object({
  currentAge: z.coerce.number().int().min(0).max(120),
  retireAge: z.coerce.number().int().min(0).max(120),
  endAge: z.coerce.number().int().min(1).max(120),
})
export type You = z.infer<typeof youSchema>

/**
 * The full plan. This schema is the single source of truth for the
 * PlanState type (via z.infer below) — see
 * docs/retirement-react-rewrite-plan.md §4.2 ("parse, don't validate").
 */
export const planStateSchema = z.object({
  v: z.literal(PLAN_SCHEMA_VERSION),
  you: youSchema,
  accounts: accountsSchema,
  contributions: contributionsSchema,
  income: incomeSchema,
  spending: spendingSchema,
  assumptions: assumptionsSchema,
  strategy: strategySchema,
  legacy: legacySchema,
})
export type PlanState = z.infer<typeof planStateSchema>

export const defaultYou: You = { currentAge: 40, retireAge: 67, endAge: 95 }

export function defaultPlanState(): PlanState {
  return {
    v: PLAN_SCHEMA_VERSION,
    you: { ...defaultYou },
    accounts: { ...defaultAccounts },
    contributions: { ...defaultContributions },
    income: defaultIncome.map((i) => ({ ...i })),
    spending: {
      ...defaultSpending,
      items: [],
      phased: { ...defaultSpending.phased },
      healthcare: { ...defaultSpending.healthcare },
      ltc: { ...defaultSpending.ltc },
      oneOffs: [],
    },
    assumptions: { ...defaultAssumptions },
    strategy: { ...defaultStrategy, withdrawalOrder: [...defaultStrategy.withdrawalOrder] },
    legacy: { ...defaultLegacy },
  }
}

/** A populated example plan — mirrors the legacy engine's sampleState(), used for demos/tests. */
export function samplePlanState(): PlanState {
  const s = defaultPlanState()
  s.you = { currentAge: 45, retireAge: 65, endAge: 92 }
  s.accounts = { taxable: 120000, traditional: 380000, roth: 90000, cash: 30000, hsa: 15000 }
  s.contributions = { taxable: 6000, traditional: 20000, roth: 7000, hsa: 4000, employerMatch: 8000 }
  s.income = sampleIncome.map((line, i) => (i === 0 ? { ...line, amount: 34000, frequency: 'annual' } : { ...line }))
  s.spending.mode = 'items'
  s.spending.items = [
    { label: 'Mortgage', category: 'housing', amount: 1800, frequency: 'monthly', inflation: 'fixed', startAge: null, endAge: 75 },
    { label: 'Property tax & insurance', category: 'housing', amount: 9000, frequency: 'annual', inflation: 'general', startAge: null, endAge: null },
    { label: 'Food & household', category: 'living', amount: 1600, frequency: 'monthly', inflation: 'general', startAge: null, endAge: null },
    { label: 'Travel & hobbies', category: 'leisure', amount: 12000, frequency: 'annual', inflation: 'general', startAge: null, endAge: 85 },
    { label: 'Medigap premium', category: 'living', amount: 3000, frequency: 'annual', inflation: 'medical', startAge: 65, endAge: null },
  ]
  s.spending.phased.enabled = true
  s.spending.healthcare.enabled = true
  s.strategy.ssClaimAge = 70
  return s
}
