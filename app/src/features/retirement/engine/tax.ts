import type { AccountKey } from '../schema/account.schema'
import { IRMAA_SURCHARGE } from './constants'
import { clampInt } from './util'

export function irmaaSurcharge(tier: number): number {
  return IRMAA_SURCHARGE[clampInt(tier, 0, IRMAA_SURCHARGE.length - 1, 0)]!
}

export type Balances = Record<AccountKey, number>

export interface WithdrawResult {
  fullyFunded: boolean
  tax: number
  gross: number
  shortfall: number
}

/**
 * Pull `need` (net, after-tax dollars) from accounts in `order`, grossing up
 * for taxes, then enforce `rmd`. Mutates `bal` in place — matches the
 * legacy engine's imperative style so the per-year loop in projection.ts
 * reads the same way as retirement-engine.js's simulatePath.
 */
export function withdraw(
  bal: Balances,
  need: number,
  order: readonly AccountKey[],
  taxRate: number,
  gainFrac: number,
  rmd: number,
): WithdrawResult {
  let remaining = need
  let tax = 0
  let gross = 0
  let fromTrad = 0

  for (const acct of order) {
    if (remaining <= 1e-9) break
    const avail = bal[acct]
    if (avail <= 0) continue
    const effRate = acct === 'traditional' ? taxRate : acct === 'taxable' ? taxRate * gainFrac : 0 // roth, cash, hsa untaxed in this model
    const grossNeeded = remaining / (1 - effRate)
    const grossTake = Math.min(grossNeeded, avail)
    const net = grossTake * (1 - effRate)
    bal[acct] -= grossTake
    tax += grossTake * effRate
    gross += grossTake
    remaining -= net
    if (acct === 'traditional') fromTrad += grossTake
  }

  const fullyFunded = remaining <= 1e-6

  // RMD enforcement: if discretionary traditional withdrawal fell short of
  // the RMD, take the difference (taxed) and reinvest the net into taxable.
  const rmdExtra = Math.max(0, rmd - fromTrad)
  if (rmdExtra > 0 && bal.traditional > 0) {
    const take = Math.min(rmdExtra, bal.traditional)
    bal.traditional -= take
    const t2 = take * taxRate
    tax += t2
    gross += take
    bal.taxable += take - t2
  }

  return { fullyFunded, tax, gross, shortfall: Math.max(0, remaining) }
}
