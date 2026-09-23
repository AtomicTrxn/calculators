import { z } from 'zod'

const rate = z.coerce.number().finite()

export const assumptionsSchema = z.object({
  returnAccum: rate,
  returnRetire: rate,
  inflation: rate,
  medicalInflation: rate,
  volatility: rate.min(0),
  taxRate: rate.min(0).max(0.9),
  taxableGainFraction: rate.min(0).max(1),
  contributionGrowth: rate,
})
export type Assumptions = z.infer<typeof assumptionsSchema>

export const defaultAssumptions: Assumptions = {
  returnAccum: 0.06,
  returnRetire: 0.05,
  inflation: 0.03,
  medicalInflation: 0.05,
  volatility: 0.12,
  taxRate: 0.15,
  taxableGainFraction: 0.5,
  contributionGrowth: 0.02,
}
