import { z } from 'zod'

/** The five account types the engine models. Order here is not withdrawal order. */
export const ACCOUNT_KEYS = ['taxable', 'traditional', 'roth', 'cash', 'hsa'] as const
export type AccountKey = (typeof ACCOUNT_KEYS)[number]

const nonNegative = z.coerce.number().finite().min(0)

export const accountsSchema = z.object({
  taxable: nonNegative,
  traditional: nonNegative,
  roth: nonNegative,
  cash: nonNegative,
  hsa: nonNegative,
})
export type Accounts = z.infer<typeof accountsSchema>

export const contributionsSchema = z.object({
  taxable: nonNegative,
  traditional: nonNegative,
  roth: nonNegative,
  hsa: nonNegative,
  employerMatch: nonNegative,
})
export type Contributions = z.infer<typeof contributionsSchema>

export const defaultAccounts: Accounts = {
  taxable: 50000,
  traditional: 150000,
  roth: 40000,
  cash: 20000,
  hsa: 0,
}

export const defaultContributions: Contributions = {
  taxable: 3000,
  traditional: 15000,
  roth: 6000,
  hsa: 0,
  employerMatch: 5000,
}
