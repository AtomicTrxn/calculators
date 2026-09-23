import { z } from 'zod'

const nonNegative = z.coerce.number().finite().min(0)

export const legacySchema = z.object({
  enabled: z.coerce.boolean(),
  amountPerHeir: nonNegative,
  heirs: z.coerce.number().int().min(0).max(20),
})
export type Legacy = z.infer<typeof legacySchema>

export const defaultLegacy: Legacy = {
  enabled: false,
  amountPerHeir: 500000,
  heirs: 2,
}
