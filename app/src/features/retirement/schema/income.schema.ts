import { z } from 'zod'

export const INCOME_TYPES = ['socialSecurity', 'pension', 'other'] as const
export type IncomeType = (typeof INCOME_TYPES)[number]

export const INCOME_FREQUENCIES = ['annual', 'monthly'] as const
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number]

export const incomeLineSchema = z.object({
  type: z.enum(INCOME_TYPES),
  label: z.string().min(1),
  /** In whatever unit `frequency` says — see engine/income.ts's incomeForYear for the annualization. */
  amount: z.coerce.number().finite().min(0),
  /** Social Security statements quote a monthly figure; pensions often do too. Defaults to 'annual' for parity with the pre-frequency schema. */
  frequency: z.enum(INCOME_FREQUENCIES),
  /** For socialSecurity this is overridden by strategy.ssClaimAge at simulation time. */
  startAge: z.coerce.number().int().min(0).max(120),
  cola: z.coerce.boolean(),
})
export type IncomeLine = z.infer<typeof incomeLineSchema>

export const incomeSchema = z.array(incomeLineSchema)
export type Income = z.infer<typeof incomeSchema>

/** A fresh plan starts with no guaranteed-income lines — not everyone has Social Security, a pension, or other income, so nothing is assumed. */
export const defaultIncome: Income = []

/** Populated example rows for samplePlanState()'s demo plan — not used on a fresh load. */
export const sampleIncome: Income = [
  // 2,500/mo — the unit an SSA statement actually shows — rather than a pre-summed annual figure.
  { type: 'socialSecurity', label: 'Social Security', amount: 2500, frequency: 'monthly', startAge: 67, cola: true },
  { type: 'pension', label: 'Pension', amount: 0, frequency: 'monthly', startAge: 65, cola: false },
  { type: 'other', label: 'Other income', amount: 0, frequency: 'annual', startAge: 67, cola: false },
]
