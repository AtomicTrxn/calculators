import { ACCOUNT_KEYS, type AccountKey } from '../schema/account.schema'
import { defaultPlanState, planStateSchema, type PlanState } from '../schema/plan.schema'
import { ITEM_CATEGORIES, ITEM_INFLATION, type SpendingItem } from '../schema/spending.schema'
import { WITHDRAWAL_METHODS } from '../schema/strategy.schema'
import { clamp, clampInt } from './util'

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Optional per-line age bound: null/''/missing means "no bound". */
function optionalAge(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? clamp(n, 0, 120) : null
}

function normalizeItem(it: unknown, i: number): SpendingItem {
  const src = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
  return {
    label: String(src.label || `Expense ${i + 1}`),
    category: ITEM_CATEGORIES.includes(src.category as SpendingItem['category']) ? (src.category as SpendingItem['category']) : 'other',
    amount: Math.max(0, num(src.amount, 0)),
    frequency: src.frequency === 'monthly' ? 'monthly' : 'annual',
    inflation: ITEM_INFLATION.includes(src.inflation as SpendingItem['inflation']) ? (src.inflation as SpendingItem['inflation']) : 'general',
    startAge: optionalAge(src.startAge),
    endAge: optionalAge(src.endAge),
  }
}

/**
 * Deep-fill a partial/loaded plan against the defaults so the engine never
 * hits an undefined field, then run the result through the Zod schema as a
 * final safety net. Ported from retirement-engine.js's normalizeState —
 * same field-by-field defaulting behavior, ending in a schema-guaranteed
 * type instead of an unchecked object.
 */
export function normalizeState(input: unknown): PlanState {
  const d = defaultPlanState()
  const s = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out = defaultPlanState()

  if (s.you && typeof s.you === 'object') {
    const y = s.you as Record<string, unknown>
    out.you.currentAge = clampInt(y.currentAge as number, 0, 120, d.you.currentAge)
    out.you.retireAge = clampInt(y.retireAge as number, 0, 120, d.you.retireAge)
    out.you.endAge = clampInt(y.endAge as number, 1, 120, d.you.endAge)
  }
  if (s.accounts && typeof s.accounts === 'object') {
    const a = s.accounts as Record<string, unknown>
    for (const k of ACCOUNT_KEYS) out.accounts[k] = Math.max(0, num(a[k], d.accounts[k]))
  }
  if (s.contributions && typeof s.contributions === 'object') {
    const c = s.contributions as Record<string, unknown>
    for (const k of Object.keys(out.contributions) as (keyof PlanState['contributions'])[]) {
      out.contributions[k] = Math.max(0, num(c[k], d.contributions[k]))
    }
  }

  if (Array.isArray(s.income)) {
    out.income = s.income.map((inc: unknown, i: number) => {
      const src = inc && typeof inc === 'object' ? (inc as Record<string, unknown>) : {}
      return {
        type: (['socialSecurity', 'pension', 'other'].includes(src.type as string) ? src.type : 'other') as PlanState['income'][number]['type'],
        label: String(src.label || `Income ${i + 1}`),
        amount: Math.max(0, num(src.amount, 0)),
        frequency: (src.frequency === 'monthly' ? 'monthly' : 'annual') as PlanState['income'][number]['frequency'],
        startAge: clampInt(src.startAge as number, 0, 120, 67),
        cola: !!src.cola,
      }
    })
  }

  if (s.spending && typeof s.spending === 'object') {
    const sp = s.spending as Record<string, unknown>
    out.spending.mode = sp.mode === 'items' ? 'items' : 'flat'
    out.spending.baseline = Math.max(0, num(sp.baseline, d.spending.baseline))
    if (Array.isArray(sp.items)) out.spending.items = sp.items.map((it, i) => normalizeItem(it, i))
    if (sp.phased && typeof sp.phased === 'object') {
      const ph = sp.phased as Record<string, unknown>
      out.spending.phased = {
        enabled: !!ph.enabled,
        goGo: Math.max(0, num(ph.goGo, d.spending.phased.goGo)),
        slowGo: Math.max(0, num(ph.slowGo, d.spending.phased.slowGo)),
        noGo: Math.max(0, num(ph.noGo, d.spending.phased.noGo)),
        slowGoAge: clampInt(ph.slowGoAge as number, 0, 120, d.spending.phased.slowGoAge),
        noGoAge: clampInt(ph.noGoAge as number, 0, 120, d.spending.phased.noGoAge),
      }
    }
    if (sp.healthcare && typeof sp.healthcare === 'object') {
      const hc = sp.healthcare as Record<string, unknown>
      out.spending.healthcare = {
        enabled: !!hc.enabled,
        preMedicarePremium: Math.max(0, num(hc.preMedicarePremium, d.spending.healthcare.preMedicarePremium)),
        medicareAnnual: Math.max(0, num(hc.medicareAnnual, d.spending.healthcare.medicareAnnual)),
        irmaaTier: clampInt(hc.irmaaTier as number, 0, 5, 0),
        medicalInflation: num(hc.medicalInflation, d.spending.healthcare.medicalInflation),
      }
    }
    if (sp.ltc && typeof sp.ltc === 'object') {
      const ltc = sp.ltc as Record<string, unknown>
      out.spending.ltc = {
        enabled: !!ltc.enabled,
        annualCost: Math.max(0, num(ltc.annualCost, d.spending.ltc.annualCost)),
        years: clampInt(ltc.years as number, 0, 60, d.spending.ltc.years),
        startAge: clampInt(ltc.startAge as number, 0, 120, d.spending.ltc.startAge),
      }
    }
    if (Array.isArray(sp.oneOffs)) {
      out.spending.oneOffs = sp.oneOffs.map((o: unknown, i: number) => {
        const src = o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
        return {
          label: String(src.label || `Event ${i + 1}`),
          amount: num(src.amount, 0),
          age: clampInt(src.age as number, 0, 120, out.you.retireAge),
        }
      })
    }
  }

  if (s.assumptions && typeof s.assumptions === 'object') {
    const a = s.assumptions as Record<string, unknown>
    out.assumptions = {
      returnAccum: num(a.returnAccum, d.assumptions.returnAccum),
      returnRetire: num(a.returnRetire, d.assumptions.returnRetire),
      inflation: num(a.inflation, d.assumptions.inflation),
      medicalInflation: num(a.medicalInflation, d.assumptions.medicalInflation),
      volatility: Math.max(0, num(a.volatility, d.assumptions.volatility)),
      taxRate: clamp(num(a.taxRate, d.assumptions.taxRate), 0, 0.9),
      taxableGainFraction: clamp(num(a.taxableGainFraction, d.assumptions.taxableGainFraction), 0, 1),
      contributionGrowth: num(a.contributionGrowth, d.assumptions.contributionGrowth),
    }
  }

  if (s.strategy && typeof s.strategy === 'object') {
    const st = s.strategy as Record<string, unknown>
    const rawOrder = Array.isArray(st.withdrawalOrder) ? (st.withdrawalOrder as unknown[]) : []
    const order = (rawOrder.filter((k): k is AccountKey => ACCOUNT_KEYS.includes(k as AccountKey)).length
      ? (rawOrder.filter((k): k is AccountKey => ACCOUNT_KEYS.includes(k as AccountKey)))
      : [...d.strategy.withdrawalOrder]) as AccountKey[]
    // guarantee every account is somewhere in the order
    for (const k of d.strategy.withdrawalOrder) if (!order.includes(k)) order.push(k)
    out.strategy = {
      withdrawalOrder: order,
      withdrawalMethod: WITHDRAWAL_METHODS.includes(st.withdrawalMethod as PlanState['strategy']['withdrawalMethod'])
        ? (st.withdrawalMethod as PlanState['strategy']['withdrawalMethod'])
        : d.strategy.withdrawalMethod,
      ssClaimAge: clampInt(st.ssClaimAge as number, 62, 70, d.strategy.ssClaimAge),
      monteCarloIterations: clampInt(st.monteCarloIterations as number, 100, 20000, d.strategy.monteCarloIterations),
    }
  }

  if (s.legacy && typeof s.legacy === 'object') {
    const lg = s.legacy as Record<string, unknown>
    out.legacy = {
      enabled: !!lg.enabled,
      amountPerHeir: Math.max(0, num(lg.amountPerHeir, d.legacy.amountPerHeir)),
      heirs: clampInt(lg.heirs as number, 0, 20, d.legacy.heirs),
    }
  }

  // Safety net: guarantees the return type actually matches PlanState.
  return planStateSchema.parse(out)
}

export function validate(S: PlanState): string[] {
  const issues: string[] = []
  if (S.you.retireAge < S.you.currentAge) issues.push('Retirement age is before your current age — treated as already retired.')
  if (S.you.endAge <= S.you.retireAge) issues.push('End-of-plan age must be after retirement age.')
  if (S.you.endAge <= S.you.currentAge) issues.push('End-of-plan age must be after your current age.')
  if (S.spending.phased.enabled && S.spending.phased.noGoAge < S.spending.phased.slowGoAge) {
    issues.push('Phased spending: the "no-go" age should not be before the "slow-go" age.')
  }
  if (S.spending.mode === 'items' && S.spending.items.length === 0) {
    issues.push('Itemized spending is selected but the expense list is empty — yearly living costs are zero until you add line items.')
  }
  return issues
}
