import { describe, expect, it } from 'vitest'

import { defaultPlanState, samplePlanState, type PlanState } from '../schema/plan.schema'
import type { SpendingItem } from '../schema/spending.schema'
import {
  baselineComponent,
  compactState,
  expandState,
  incomeAnnual,
  incomeForYear,
  irmaaSurcharge,
  itemAnnual,
  itemsForYear,
  normalizeState,
  projectDeterministic,
  projectWithReturns,
  rmdRequired,
  runMonteCarlo,
  spendingForYear,
  ssFactor,
  validate,
  verdict,
} from './index'

/**
 * Parity oracle: these fixtures are ported 1:1 from
 * scripts/retirement-tests.js (the legacy engine's own test suite) so this
 * ported TypeScript engine is verified against the same hand-computed
 * numbers, not just "compiles and runs" — see
 * docs/retirement-react-rewrite-plan.md Phase 1 "done when".
 */

function approx(actual: number, expected: number, tol = 1e-6) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)
}

// A minimal, hand-verifiable state: pure accumulation, no taxes/income/spending.
function accumOnly(overrides?: Partial<PlanState>): PlanState {
  const s = defaultPlanState()
  s.you = { currentAge: 30, retireAge: 33, endAge: 32 } // exactly 3 accumulation years (ages 30,31,32)
  s.accounts = { taxable: 0, traditional: 1000, roth: 0, cash: 0, hsa: 0 }
  s.contributions = { taxable: 0, traditional: 0, roth: 0, hsa: 0, employerMatch: 0 }
  s.income = s.income.map((i) => ({ ...i, amount: 0 }))
  s.spending.baseline = 0
  s.assumptions.returnAccum = 0.1
  s.assumptions.returnRetire = 0.1
  s.assumptions.inflation = 0
  s.assumptions.contributionGrowth = 0
  return Object.assign(s, overrides)
}

function itemsState(overrides?: Partial<PlanState>): PlanState {
  const s = defaultPlanState()
  s.you = { currentAge: 65, retireAge: 65, endAge: 90 }
  s.spending.mode = 'items'
  s.spending.items = [
    { label: 'Mortgage', category: 'housing', amount: 2000, frequency: 'monthly', inflation: 'fixed', startAge: null, endAge: null },
    { label: 'Property tax', category: 'housing', amount: 6000, frequency: 'annual', inflation: 'general', startAge: null, endAge: null },
  ]
  return Object.assign(s, overrides)
}

describe('normalize / validate', () => {
  it('fills defaults and coerces bad numbers', () => {
    const s = normalizeState({ you: { currentAge: 'x', retireAge: 65, endAge: 90 }, accounts: { taxable: -5 } })
    expect(Number.isFinite(s.you.currentAge)).toBe(true)
    expect(s.you.retireAge).toBe(65)
    expect(s.accounts.taxable).toBe(0)
    expect(Array.isArray(s.strategy.withdrawalOrder)).toBe(true)
  })

  it('flags end age before retirement age', () => {
    const s = normalizeState(defaultPlanState())
    s.you = { currentAge: 40, retireAge: 70, endAge: 65 }
    const issues = validate(s)
    expect(issues.some((m) => /end-of-plan age must be after retirement/i.test(m))).toBe(true)
  })

  it('sanitizes malformed expense items', () => {
    const s = normalizeState({
      spending: {
        mode: 'items',
        items: [
          { label: '', amount: -500, frequency: 'weekly', inflation: 'crypto', startAge: 'x', endAge: 999 },
          null,
          { label: 'Ok', amount: 100, frequency: 'monthly', inflation: 'fixed', startAge: 70, endAge: '' },
        ],
      },
    })
    const [a, b, c] = s.spending.items as [SpendingItem, SpendingItem, SpendingItem]
    expect(a.label).toBe('Expense 1')
    expect(a.amount).toBe(0)
    expect(a.frequency).toBe('annual')
    expect(a.inflation).toBe('general')
    expect(a.startAge).toBeNull()
    expect(a.endAge).toBe(120)
    expect(b.label).toBe('Expense 2')
    expect(b.amount).toBe(0)
    expect(c.frequency).toBe('monthly')
    expect(c.inflation).toBe('fixed')
    expect(c.startAge).toBe(70)
    expect(c.endAge).toBeNull()
  })

  it('warns when items mode has no line items', () => {
    const s = itemsState()
    s.spending.items = []
    expect(validate(s).some((i) => /expense list is empty/i.test(i))).toBe(true)
    s.spending.items = [{ label: 'X', category: 'other', amount: 1, frequency: 'annual', inflation: 'general', startAge: null, endAge: null }]
    expect(validate(s).some((i) => /expense list is empty/i.test(i))).toBe(false)
  })
})

describe('deterministic growth math', () => {
  it('pure accumulation compounds correctly (1000 @ 10% x3 = 1331)', () => {
    const r = projectDeterministic(accumOnly())
    approx(r.endBalance, 1331)
    expect(r.success).toBe(true)
    expect(r.depletionAge).toBeNull()
  })

  it('adds contributions before growth each year', () => {
    const s = accumOnly()
    s.accounts.traditional = 0
    s.contributions.traditional = 100 // +100 then grow 10% each of 3 years
    // yr1: (0+100)*1.1=110; yr2: (110+100)*1.1=231; yr3: (231+100)*1.1=364.1
    const r = projectDeterministic(s)
    approx(r.endBalance, 364.1)
  })

  it('lands employer match in the traditional account', () => {
    const s = accumOnly()
    s.accounts.traditional = 0
    s.contributions.traditional = 0
    s.contributions.employerMatch = 100
    const r = projectDeterministic(s)
    approx(r.endBalance, 364.1)
  })

  it('raises contributions over time with contribution growth', () => {
    const s = accumOnly()
    s.accounts.traditional = 0
    s.contributions.traditional = 100
    s.assumptions.contributionGrowth = 0.1
    // contrib grows 10%/yr: 100,110,121 ; each grown at 10%
    // yr1:(100)*1.1=110; yr2:(110+110)*1.1=242; yr3:(242+121)*1.1=399.3
    const r = projectDeterministic(s)
    approx(r.endBalance, 399.3)
  })
})

describe('withdrawals & taxes', () => {
  it('leaves Roth withdrawals untaxed but grosses up traditional', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 65 } // single retirement year
    s.accounts = { taxable: 0, traditional: 0, roth: 100000, cash: 0, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 10000
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.returnRetire = 0
    s.assumptions.taxRate = 0.25
    const r = projectDeterministic(s)
    approx(r.rows[0]!.taxes, 0)
    approx(r.endBalance, 90000)

    s.accounts = { taxable: 0, traditional: 100000, roth: 0, cash: 0, hsa: 0 }
    const r2 = projectDeterministic(s)
    approx(r2.rows[0]!.taxes, 3333.333333, 1e-4)
    approx(r2.endBalance, 86666.6667, 1e-3)
  })

  it('draws cash before taxable before traditional', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 65 }
    s.accounts = { taxable: 5000, traditional: 100000, roth: 0, cash: 3000, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 6000
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.returnRetire = 0
    s.assumptions.taxRate = 0.2
    s.assumptions.taxableGainFraction = 0
    const r = projectDeterministic(s)
    const row = r.rows[0]!
    approx(row.cash, 0)
    approx(row.taxable, 2000)
    approx(row.traditional, 100000)
  })

  it('reinvests surplus guaranteed income instead of losing it', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 65 }
    s.accounts = { taxable: 0, traditional: 0, roth: 0, cash: 1000, hsa: 0 }
    s.income = [{ type: 'other', label: 'Pension', amount: 40000, frequency: 'annual', startAge: 65, cola: false }]
    s.spending.baseline = 30000
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.returnRetire = 0
    const r = projectDeterministic(s)
    approx(r.endBalance, 11000)
    expect(r.success).toBe(true)
  })
})

describe('depletion / success', () => {
  it('detects and reports depletion by age', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 60, retireAge: 60, endAge: 70 }
    s.accounts = { taxable: 0, traditional: 0, roth: 20000, cash: 0, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 15000
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.returnRetire = 0
    const r = projectDeterministic(s)
    expect(r.success).toBe(false)
    expect(r.depletionAge).toBe(61)
  })

  it('counts guaranteed income covering spending as success with zero assets', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 90 }
    s.accounts = { taxable: 0, traditional: 0, roth: 0, cash: 0, hsa: 0 }
    s.income = [{ type: 'other', label: 'Pension', amount: 50000, frequency: 'annual', startAge: 65, cola: true }]
    s.spending.baseline = 40000
    s.spending.phased.enabled = false
    const r = projectDeterministic(s)
    expect(r.success).toBe(true)
  })
})

describe('Social Security claiming factor', () => {
  it('matches SSA rules', () => {
    approx(ssFactor(67, 67), 1.0, 1e-9)
    approx(ssFactor(62, 67), 0.7, 1e-9)
    approx(ssFactor(70, 67), 1.24, 1e-9)
    approx(ssFactor(66, 67), 1 - (12 * (5 / 9)) / 100, 1e-9)
  })

  it('raises the modeled benefit when delayed', () => {
    const base = defaultPlanState()
    base.you = { currentAge: 62, retireAge: 62, endAge: 63 }
    base.accounts = { taxable: 0, traditional: 0, roth: 0, cash: 1000000, hsa: 0 }
    base.income = [{ type: 'socialSecurity', label: 'SS', amount: 30000, frequency: 'annual', startAge: 67, cola: false }]
    base.spending.baseline = 0
    base.spending.phased.enabled = false
    base.assumptions.inflation = 0
    base.assumptions.returnRetire = 0

    const at62: PlanState = JSON.parse(JSON.stringify(base))
    at62.strategy.ssClaimAge = 62
    const at70: PlanState = JSON.parse(JSON.stringify(base))
    at70.strategy.ssClaimAge = 70

    const r62 = projectDeterministic(at62)
    const r70 = projectDeterministic(at70)
    expect(r62.endBalance).toBeGreaterThan(r70.endBalance)
    approx(r62.rows[0]!.income, 30000 * 0.7)
    approx(r70.rows[0]!.income, 0)
  })
})

describe('income frequency (monthly vs annual)', () => {
  it('annualizes a monthly amount by x12', () => {
    approx(incomeAnnual({ type: 'other', label: 'Pension', amount: 2500, frequency: 'monthly', startAge: 65, cola: false }), 30000, 1e-9)
    approx(incomeAnnual({ type: 'other', label: 'Pension', amount: 30000, frequency: 'annual', startAge: 65, cola: false }), 30000, 1e-9)
  })

  it('produces the same simulated income whether entered monthly or annually', () => {
    const monthly = defaultPlanState()
    monthly.you = { currentAge: 65, retireAge: 65, endAge: 65 }
    monthly.income = [{ type: 'other', label: 'Pension', amount: 3000, frequency: 'monthly', startAge: 65, cola: false }]

    const annual = defaultPlanState()
    annual.you = { currentAge: 65, retireAge: 65, endAge: 65 }
    annual.income = [{ type: 'other', label: 'Pension', amount: 36000, frequency: 'annual', startAge: 65, cola: false }]

    approx(incomeForYear(monthly, 65, 0), incomeForYear(annual, 65, 0), 1e-9)
    approx(incomeForYear(monthly, 65, 0), 36000, 1e-9)
  })

  it('annualizes a monthly Social Security amount before applying the claiming-age factor', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 67, retireAge: 67, endAge: 67 }
    // 2,000/mo at FRA (67) -> 24,000/yr, claimed exactly at FRA so the factor is 1.0
    s.income = [{ type: 'socialSecurity', label: 'SS', amount: 2000, frequency: 'monthly', startAge: 67, cola: false }]
    s.strategy.ssClaimAge = 67
    approx(incomeForYear(s, 67, 0), 24000, 1e-6)
  })

  it('defaults a missing frequency to annual when normalizing untrusted input', () => {
    const s = normalizeState({ income: [{ type: 'other', label: 'X', amount: 1000, startAge: 65, cola: false }] })
    expect(s.income[0]!.frequency).toBe('annual')
  })
})

describe('RMDs', () => {
  it('forces a taxable traditional withdrawal even when not needed', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 73, retireAge: 73, endAge: 73 }
    s.accounts = { taxable: 0, traditional: 265000, roth: 0, cash: 1000000, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 10000 // easily covered by cash, so traditional wouldn't be touched
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.returnRetire = 0
    s.assumptions.taxRate = 0.2
    const r = projectDeterministic(s)
    approx(r.rows[0]!.traditional, 255000, 1e-4)
    expect(r.rows[0]!.taxes).toBeGreaterThanOrEqual(2000 - 1e-6)
  })

  it('applies no RMD before age 73', () => {
    approx(rmdRequired(72, 1000000), 0, 1e-9)
    expect(rmdRequired(73, 265000)).toBeGreaterThan(0)
  })
})

describe('phased spending, healthcare, LTC', () => {
  it('uses the right band per age', () => {
    const s = defaultPlanState()
    s.assumptions.inflation = 0
    s.spending.phased = { enabled: true, goGo: 90000, slowGo: 60000, noGo: 40000, slowGoAge: 75, noGoAge: 85 }
    approx(spendingForYear(s, 70, 5), 90000)
    approx(spendingForYear(s, 80, 15), 60000)
    approx(spendingForYear(s, 88, 23), 40000)
  })

  it('adds a pre-Medicare premium that ends at 65', () => {
    const s = defaultPlanState()
    s.assumptions.inflation = 0
    s.spending.baseline = 0
    s.spending.phased.enabled = false
    s.spending.healthcare = { enabled: true, preMedicarePremium: 12000, medicareAnnual: 7000, irmaaTier: 0, medicalInflation: 0 }
    approx(spendingForYear(s, 63, 0), 12000)
    approx(spendingForYear(s, 66, 0), 7000)
  })

  it('adds the IRMAA surcharge on top of Medicare for higher tiers', () => {
    const s = defaultPlanState()
    s.assumptions.inflation = 0
    s.spending.baseline = 0
    s.spending.phased.enabled = false
    s.spending.healthcare = { enabled: true, preMedicarePremium: 0, medicareAnnual: 7000, irmaaTier: 2, medicalInflation: 0 }
    approx(spendingForYear(s, 70, 0), 7000 + irmaaSurcharge(2))
  })

  it('applies LTC only within its window', () => {
    const s = defaultPlanState()
    s.assumptions.inflation = 0
    s.spending.baseline = 0
    s.spending.phased.enabled = false
    s.spending.ltc = { enabled: true, annualCost: 100000, years: 3, startAge: 88 }
    approx(spendingForYear(s, 87, 0), 0)
    approx(spendingForYear(s, 88, 0), 100000)
    approx(spendingForYear(s, 90, 0), 100000)
    approx(spendingForYear(s, 91, 0), 0)
  })
})

describe('sequence-of-returns risk', () => {
  it('does not change accumulation-only end balance with return ordering', () => {
    const s = accumOnly({ you: { currentAge: 30, retireAge: 33, endAge: 32 } })
    s.accounts.traditional = 1000
    const seqA = [0.3, -0.1, 0.05]
    const seqB = [0.05, -0.1, 0.3]
    const a = projectWithReturns(s, seqA).endBalance
    const b = projectWithReturns(s, seqB).endBalance
    approx(a, b)
  })

  it('hurts more from early losses than late losses once withdrawing', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 68 }
    s.accounts = { taxable: 0, traditional: 0, roth: 100000, cash: 0, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 20000
    s.spending.phased.enabled = false
    s.assumptions.inflation = 0
    s.assumptions.taxRate = 0
    const badEarly = projectWithReturns(s, [-0.3, 0.1, 0.1, 0.1]).endBalance
    const badLate = projectWithReturns(s, [0.1, 0.1, 0.1, -0.3]).endBalance
    expect(badLate).toBeGreaterThan(badEarly)
  })

  it('cuts spending the year after a market loss under guardrails', () => {
    const base = defaultPlanState()
    base.you = { currentAge: 65, retireAge: 65, endAge: 85 }
    base.accounts = { taxable: 0, traditional: 0, roth: 800000, cash: 0, hsa: 0 }
    base.income = base.income.map((i) => ({ ...i, amount: 0 }))
    base.spending.baseline = 45000
    base.spending.phased.enabled = false
    base.assumptions.inflation = 0.02
    base.assumptions.taxRate = 0
    base.strategy.withdrawalMethod = 'guardrails'
    const years = base.you.endAge - base.you.currentAge + 1
    const good = new Array(years).fill(0.05)
    const loss = [...good]
    loss[1] = -0.35 // big drop in the 2nd retirement year (t=1)
    const sGood = projectWithReturns(base, good)
    const sLoss = projectWithReturns(base, loss)
    // year t=2 is the first year that can see the t=1 loss as "last year"; guardrails should hold back.
    expect(sLoss.rows[2]!.spending).toBeLessThan(sGood.rows[2]!.spending - 1)
  })
})

describe('Monte Carlo', () => {
  it('is deterministic for a fixed seed', () => {
    const s = samplePlanState()
    const a = runMonteCarlo(s, { iterations: 300, seed: 42 })
    const b = runMonteCarlo(s, { iterations: 300, seed: 42 })
    approx(a.successRate, b.successRate, 1e-12)
    approx(a.terminal.p50, b.terminal.p50)
  })

  it('succeeds 100% when income always covers spending', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 90 }
    s.accounts = { taxable: 0, traditional: 0, roth: 0, cash: 0, hsa: 0 }
    s.income = [{ type: 'other', label: 'Pension', amount: 60000, frequency: 'annual', startAge: 65, cola: true }]
    s.spending.baseline = 40000
    s.spending.phased.enabled = false
    const mc = runMonteCarlo(s, { iterations: 200, seed: 7 })
    approx(mc.successRate, 1.0, 1e-9)
  })

  it('succeeds ~0% when tiny assets face large spending', () => {
    const s = defaultPlanState()
    s.you = { currentAge: 65, retireAge: 65, endAge: 90 }
    s.accounts = { taxable: 0, traditional: 0, roth: 1000, cash: 0, hsa: 0 }
    s.income = s.income.map((i) => ({ ...i, amount: 0 }))
    s.spending.baseline = 50000
    s.spending.phased.enabled = false
    const mc = runMonteCarlo(s, { iterations: 200, seed: 7 })
    approx(mc.successRate, 0.0, 1e-9)
  })

  it('orders terminal percentiles p10 <= p50 <= p90', () => {
    const state = samplePlanState()
    const mc = runMonteCarlo(state, { iterations: 400, seed: 123 })
    expect(mc.terminal.p10).toBeLessThanOrEqual(mc.terminal.p50 + 1e-6)
    expect(mc.terminal.p50).toBeLessThanOrEqual(mc.terminal.p90 + 1e-6)
    expect(mc.bands.length).toBe(state.you.endAge - state.you.currentAge + 1)
    for (const band of mc.bands) {
      expect(band.p10).toBeLessThanOrEqual(band.p50 + 1e-6)
      expect(band.p50).toBeLessThanOrEqual(band.p90 + 1e-6)
    }
  })

  it('maps verdict thresholds to labels', () => {
    expect(verdict(0.95).tone).toBe('good')
    expect(verdict(0.6).tone).toBe('warn')
    expect(verdict(0.2).tone).toBe('bad')
  })
})

describe('share-link codec', () => {
  it('round-trips a full state through compactState -> expandState', () => {
    const s = normalizeState(samplePlanState())
    const restored = expandState(compactState(s))
    approx(restored.you.currentAge, s.you.currentAge, 0)
    approx(restored.accounts.traditional, s.accounts.traditional, 1e-9)
    approx(restored.spending.baseline, s.spending.baseline, 1e-9)
    expect(restored.spending.phased.enabled).toBe(s.spending.phased.enabled)
    expect(restored.strategy.withdrawalMethod).toBe(s.strategy.withdrawalMethod)
    expect(restored.strategy.ssClaimAge).toBe(s.strategy.ssClaimAge)
    expect(restored.income.length).toBe(s.income.length)
    expect(restored.income[0]!.frequency).toBe(s.income[0]!.frequency)
    approx(projectDeterministic(restored).endBalance, projectDeterministic(s).endBalance)
  })

  it('defaults income frequency to annual when decoding a pre-frequency (5-element) share link', () => {
    const s = normalizeState(defaultPlanState())
    const compact = compactState(s)
    // Simulate a link generated before frequency existed: drop the 6th element of each income tuple.
    const legacyCompact = { ...compact, i: compact.i.map((line) => line.slice(0, 5) as typeof line) }
    const restored = expandState(legacyCompact)
    expect(restored.income.every((line) => line.frequency === 'annual')).toBe(true)
  })

  it('round-trips withdrawal order through the codec', () => {
    const s = normalizeState(defaultPlanState())
    s.strategy.withdrawalOrder = ['roth', 'cash', 'taxable', 'traditional', 'hsa']
    const restored = expandState(compactState(s))
    expect(restored.strategy.withdrawalOrder.join(',')).toBe('roth,cash,taxable,traditional,hsa')
  })
})

describe('itemized post-retirement expenses', () => {
  it('converts monthly lines to annual equivalents', () => {
    approx(itemAnnual({ label: 'x', category: 'other', amount: 2000, frequency: 'monthly', inflation: 'general', startAge: null, endAge: null }), 24000, 1e-9)
    approx(itemAnnual({ label: 'x', category: 'other', amount: 6000, frequency: 'annual', inflation: 'general', startAge: null, endAge: null }), 6000, 1e-9)
  })

  it('sums line items in place of the flat baseline', () => {
    const s = itemsState()
    approx(spendingForYear(s, 65, 0), 30000)
    approx(spendingForYear(s, 75, 10), 24000 + 6000 * Math.pow(1.03, 10), 1e-4)
  })

  it('holds fixed lines at nominal value so their real cost shrinks', () => {
    const s = itemsState()
    s.spending.items = [{ label: 'Loan', category: 'other', amount: 10000, frequency: 'annual', inflation: 'fixed', startAge: null, endAge: null }]
    approx(spendingForYear(s, 70, 20), 10000, 1e-9)
    approx(spendingForYear(s, 70, 20) / Math.pow(1.03, 20), 10000 / Math.pow(1.03, 20))
  })

  it('grows medical lines at medical inflation, not general', () => {
    const s = itemsState()
    s.spending.healthcare.medicalInflation = 0.05
    s.spending.items = [{ label: 'Premium', category: 'other', amount: 5000, frequency: 'annual', inflation: 'medical', startAge: null, endAge: null }]
    approx(spendingForYear(s, 70, 10), 5000 * Math.pow(1.05, 10), 1e-4)
  })

  it('includes and excludes line items correctly by age window', () => {
    const s = itemsState()
    s.spending.items = [
      { label: 'Early', category: 'other', amount: 1000, frequency: 'annual', inflation: 'general', startAge: null, endAge: 74 },
      { label: 'Late', category: 'other', amount: 2000, frequency: 'annual', inflation: 'general', startAge: 80, endAge: null },
    ]
    approx(spendingForYear(s, 65, 0), 1000, 1e-9)
    approx(spendingForYear(s, 77, 12), 0, 1e-9)
    approx(spendingForYear(s, 85, 20), 2000 * Math.pow(1.03, 20), 1e-4)
  })

  it('produces identical projections for flat mode and an equivalent items list', () => {
    const flat = defaultPlanState()
    flat.you = { currentAge: 60, retireAge: 65, endAge: 90 }
    flat.spending.baseline = 60000
    const itemized = normalizeState(JSON.parse(JSON.stringify(flat)))
    itemized.spending.mode = 'items'
    itemized.spending.items = [
      { label: 'A', category: 'other', amount: 40000, frequency: 'annual', inflation: 'general', startAge: null, endAge: null },
      { label: 'B', category: 'other', amount: 1666.6666666666667, frequency: 'monthly', inflation: 'general', startAge: null, endAge: null },
    ]
    const a = projectDeterministic(flat)
    const b = projectDeterministic(itemized)
    approx(a.endBalance, b.endBalance, 1.0)
    expect(a.depletionAge).toBe(b.depletionAge)
  })

  it('keeps healthcare, LTC, and one-offs additive on top of items mode', () => {
    const s = itemsState()
    s.spending.healthcare.enabled = true
    s.spending.healthcare.medicareAnnual = 5000
    s.spending.ltc = { enabled: true, annualCost: 80000, years: 2, startAge: 80 }
    s.spending.oneOffs = [{ label: 'Roof', amount: 20000, age: 70 }]
    approx(spendingForYear(s, 65, 0), 35000)
    const t81 = 16
    const minfl = s.spending.healthcare.medicalInflation
    const expected81 = 24000 + 6000 * Math.pow(1.03, t81) + 5000 * Math.pow(1 + minfl, t81) + 80000 * Math.pow(1 + minfl, t81)
    approx(spendingForYear(s, 81, t81), expected81, 1e-3)
    expect(spendingForYear(s, 82, 17)).toBeLessThan(spendingForYear(s, 81, 16))
    approx(spendingForYear(s, 70, 5), 24000 + 6000 * Math.pow(1.03, 5) + 5000 * Math.pow(1.05, 5) + 20000 * Math.pow(1.03, 5), 50)
  })

  it('lets withdrawal methods reshape only the items component in items mode', () => {
    const s = itemsState()
    s.strategy.withdrawalMethod = 'fourPercent'
    approx(baselineComponent(s, 70, 5), itemsForYear(s, 70, 5))
  })
})

describe('cross-engine reference (values captured directly from retirement-engine.js)', () => {
  // Not from scripts/retirement-tests.js — independently captured by running
  // the legacy vanilla engine (`node -e "require('./retirement-engine.js')..."`)
  // against samplePlanState()'s vanilla equivalent, as an extra parity check
  // beyond the shared fixture set above.
  it('matches the legacy engine deterministic projection for sampleState()', () => {
    const det = projectDeterministic(samplePlanState())
    approx(det.endBalance, 10270916.169975698, 1e-3)
    expect(det.depletionAge).toBeNull()
    expect(det.success).toBe(true)
  })

  it('matches the legacy engine Monte Carlo output for sampleState() at seed 42', () => {
    const mc = runMonteCarlo(samplePlanState(), { iterations: 500, seed: 42 })
    approx(mc.successRate, 0.988, 1e-9)
    approx(mc.terminal.p50, 7173792.630063551, 1e-3)
    expect(mc.medianDepletionAge).toBe(83)
  })
})
