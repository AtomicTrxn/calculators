import { z } from 'zod'

export const ITEM_CATEGORIES = ['housing', 'transport', 'living', 'leisure', 'other'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const ITEM_INFLATION = ['general', 'medical', 'fixed'] as const
export type ItemInflation = (typeof ITEM_INFLATION)[number]

const nonNegative = z.coerce.number().finite().min(0)
/** Null/undefined means "no bound" — matches the legacy engine's optionalAge(). */
const optionalAge = z.coerce.number().int().min(0).max(120).nullable().optional().transform((v) => v ?? null)

export const spendingItemSchema = z.object({
  label: z.string().min(1),
  category: z.enum(ITEM_CATEGORIES),
  amount: nonNegative,
  frequency: z.enum(['monthly', 'annual']),
  inflation: z.enum(ITEM_INFLATION),
  startAge: optionalAge,
  endAge: optionalAge,
})
export type SpendingItem = z.infer<typeof spendingItemSchema>

export const phasedSpendingSchema = z.object({
  enabled: z.coerce.boolean(),
  goGo: nonNegative,
  slowGo: nonNegative,
  noGo: nonNegative,
  slowGoAge: z.coerce.number().int().min(0).max(120),
  noGoAge: z.coerce.number().int().min(0).max(120),
})
export type PhasedSpending = z.infer<typeof phasedSpendingSchema>

export const healthcareSchema = z.object({
  enabled: z.coerce.boolean(),
  preMedicarePremium: nonNegative,
  medicareAnnual: nonNegative,
  irmaaTier: z.coerce.number().int().min(0).max(5),
  medicalInflation: z.coerce.number().finite(),
})
export type Healthcare = z.infer<typeof healthcareSchema>

export const ltcSchema = z.object({
  enabled: z.coerce.boolean(),
  annualCost: nonNegative,
  years: z.coerce.number().int().min(0).max(60),
  startAge: z.coerce.number().int().min(0).max(120),
})
export type Ltc = z.infer<typeof ltcSchema>

export const oneOffSchema = z.object({
  label: z.string().min(1),
  /** Negative = inflow (e.g. a home sale). */
  amount: z.coerce.number().finite(),
  age: z.coerce.number().int().min(0).max(120),
})
export type OneOff = z.infer<typeof oneOffSchema>

export const spendingSchema = z.object({
  mode: z.enum(['flat', 'items']),
  baseline: nonNegative,
  items: z.array(spendingItemSchema),
  phased: phasedSpendingSchema,
  healthcare: healthcareSchema,
  ltc: ltcSchema,
  oneOffs: z.array(oneOffSchema),
})
export type Spending = z.infer<typeof spendingSchema>

export const defaultSpending: Spending = {
  mode: 'flat',
  baseline: 70000,
  items: [],
  phased: { enabled: false, goGo: 80000, slowGo: 65000, noGo: 55000, slowGoAge: 75, noGoAge: 85 },
  healthcare: { enabled: false, preMedicarePremium: 12000, medicareAnnual: 7000, irmaaTier: 0, medicalInflation: 0.05 },
  ltc: { enabled: false, annualCost: 100000, years: 3, startAge: 88 },
  oneOffs: [],
}
