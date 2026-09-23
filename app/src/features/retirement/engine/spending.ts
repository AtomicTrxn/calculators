import type { PlanState } from '../schema/plan.schema'
import type { Spending, SpendingItem } from '../schema/spending.schema'
import { irmaaSurcharge } from './tax'

/** Annual-equivalent amount for a line item (the engine only ever sees annual). */
export function itemAnnual(item: SpendingItem): number {
  return (item.amount > 0 ? item.amount : 0) * (item.frequency === 'monthly' ? 12 : 1)
}

export function usingItems(sp: Spending): boolean {
  return sp.mode === 'items' && sp.items.length > 0
}

/**
 * Sum of the enabled age-window line items for one plan year. Each line
 * inflates at its own rate: 'fixed' never grows (nominal payment like a
 * fixed-rate mortgage), 'medical' uses medical inflation, everything else
 * uses general inflation.
 */
export function itemsForYear(S: PlanState, age: number, t: number): number {
  const sp = S.spending
  let total = 0
  for (const it of sp.items) {
    if (it.startAge != null && age < it.startAge) continue
    if (it.endAge != null && age > it.endAge) continue
    const rate = it.inflation === 'fixed' ? 0 : it.inflation === 'medical' ? sp.healthcare.medicalInflation : S.assumptions.inflation
    total += itemAnnual(it) * Math.pow(1 + rate, t)
  }
  return total
}

/**
 * The pure baseline component: itemized budget when items mode is active,
 * otherwise the single flat amount (with optional phasing). Both inflated
 * to year t. Healthcare/LTC/one-offs are added on top by spendingForYear.
 */
export function baselineComponent(S: PlanState, age: number, t: number): number {
  const sp = S.spending
  if (usingItems(sp)) return itemsForYear(S, age, t)
  let base: number
  if (sp.phased.enabled) {
    if (age < sp.phased.slowGoAge) base = sp.phased.goGo
    else if (age < sp.phased.noGoAge) base = sp.phased.slowGo
    else base = sp.phased.noGo
  } else {
    base = sp.baseline
  }
  return base * Math.pow(1 + S.assumptions.inflation, t)
}

export function spendingForYear(S: PlanState, age: number, t: number): number {
  const sp = S.spending
  const infl = S.assumptions.inflation
  const minfl = sp.healthcare.medicalInflation
  let total = baselineComponent(S, age, t)

  if (sp.healthcare.enabled) {
    const hc = age < 65 ? sp.healthcare.preMedicarePremium : sp.healthcare.medicareAnnual + irmaaSurcharge(sp.healthcare.irmaaTier)
    total += hc * Math.pow(1 + minfl, t)
  }
  if (sp.ltc.enabled && age >= sp.ltc.startAge && age < sp.ltc.startAge + sp.ltc.years) {
    total += sp.ltc.annualCost * Math.pow(1 + minfl, t)
  }
  for (const o of sp.oneOffs) {
    if (o.age === age) total += o.amount * Math.pow(1 + infl, t)
  }
  return total
}
