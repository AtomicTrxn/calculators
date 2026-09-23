import type { ReactNode } from 'react'

import { formatCurrency, formatPercent } from '@/lib/utils'
import type { AccountKey } from '../schema/account.schema'
import type { LegacyAgeResult } from '../engine/legacySolver'
import type { MonteCarloResult } from '../engine/monteCarlo'
import { verdict } from '../engine/monteCarlo'
import type { YearRow } from '../engine/projection'
import type { PlanState } from '../schema/plan.schema'

/**
 * Shared building blocks for the two printable reports (PrintSummary, the
 * full multi-page report, and PrintOnePageSummary, the condensed one-pager
 * — see Toolbar's "Print detailed report" / "Print 1-page summary"). Kept
 * in one place so the two reports can't quietly drift apart on labels or
 * on how a result is computed.
 *
 * Every color below is a fixed slate value, not the app's --color-navy /
 * --color-muted / --color-line theme tokens. Those tokens flip to a
 * near-white-on-dark palette when the app is in dark mode, and that
 * attribute lives on <html> independent of @media print — so a report
 * printed straight from dark mode would otherwise come out as pale gray
 * text on a white page. Printed reports always use the same paper-and-ink
 * palette regardless of on-screen theme.
 */
export const INK = 'text-slate-900'
export const SUBTLE = 'text-slate-500'
export const RULE = 'border-slate-300'
export const RULE_LIGHT = 'border-slate-200'

export const LEGACY_AGE_ROWS = [
  { key: 'p10', label: 'Worst case', hint: '10th percentile' },
  { key: 'p50', label: 'Typical', hint: 'Median' },
  { key: 'p90', label: 'Best case', hint: '90th percentile' },
] as const

export const ACCOUNT_LABELS: Record<AccountKey, string> = {
  taxable: 'Taxable',
  traditional: 'Traditional',
  roth: 'Roth',
  cash: 'Cash',
  hsa: 'HSA',
}

export const WITHDRAWAL_METHOD_LABELS: Record<PlanState['strategy']['withdrawalMethod'], string> = {
  fixedReal: 'Fixed, inflation-adjusted',
  fourPercent: '4% rule',
  guardrails: 'Guardrails (Guyton-Klinger)',
}

export const INCOME_TYPE_LABELS: Record<PlanState['income'][number]['type'], string> = {
  socialSecurity: 'Social Security',
  pension: 'Pension',
  other: 'Other',
}

export const CATEGORY_LABELS: Record<PlanState['spending']['items'][number]['category'], string> = {
  housing: 'Housing',
  transport: 'Transport',
  living: 'Living',
  leisure: 'Leisure',
  other: 'Other',
}

export const INFLATION_LABELS: Record<PlanState['spending']['items'][number]['inflation'], string> = {
  general: 'General',
  medical: 'Medical',
  fixed: 'Fixed',
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 [break-inside:avoid-page]">
      <h2 className={`border-b ${RULE} pb-1 font-serif text-base font-semibold ${INK}`}>{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className={`text-[10px] font-semibold uppercase tracking-wide ${SUBTLE}`}>{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${INK}`}>{value}</dd>
    </div>
  )
}

export function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-dotted ${RULE_LIGHT} py-1 text-xs`}>
      <dt className={SUBTLE}>{label}</dt>
      <dd className={`text-right font-medium tabular-nums ${INK}`}>{value}</dd>
    </div>
  )
}

export function KVGrid({ cols = 2, children }: { cols?: 2 | 4; children: ReactNode }) {
  return <dl className={`grid gap-x-6 ${cols === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>{children}</dl>
}

export const th = `py-1 pr-2 text-left text-[10px] font-semibold uppercase tracking-wide ${SUBTLE}`
export const thRight = `py-1 pl-2 text-right text-[10px] font-semibold uppercase tracking-wide ${SUBTLE}`
export const td = `py-1 pr-2`
export const tdRight = `py-1 pl-2 text-right tabular-nums`

export function ReportHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-slate-900 pb-2">
      <h1 className="font-serif text-2xl font-semibold">Retirement Plan Summary</h1>
      <div className={`text-right text-[10px] ${SUBTLE}`}>
        <p>
          Prepared {new Date().toLocaleDateString()} · {subtitle}
        </p>
        <p>Educational estimate — not financial advice</p>
      </div>
    </div>
  )
}

/**
 * The results block both reports lead with — headline outcome first, plan
 * inputs after, since that's the order a reader actually wants them in.
 * Identical in both reports so the two can never show different numbers
 * for the same plan.
 */
export function AtAGlancePanel({
  plan,
  rows,
  mc,
  legacyAges,
}: {
  plan: PlanState
  rows: YearRow[]
  mc: MonteCarloResult | null
  legacyAges: LegacyAgeResult | null
}) {
  const retireRow = rows.find((row) => row.age === plan.you.retireAge)
  const finalRow = rows[rows.length - 1]
  const v = mc ? verdict(mc.successRate) : null
  const legacyTarget = plan.legacy.amountPerHeir * plan.legacy.heirs

  return (
    <section className={`mt-4 rounded-md border ${RULE} bg-slate-50 p-4 [print-color-adjust:exact] [break-inside:avoid-page]`}>
      <h2 className={`font-serif text-sm font-semibold ${INK}`}>At a glance</h2>
      <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
        <Stat label="Retirement age" value={`${plan.you.retireAge}`} />
        <Stat label="Current → end-of-plan age" value={`${plan.you.currentAge} → ${plan.you.endAge}`} />
        <Stat label="Withdrawal method" value={WITHDRAWAL_METHOD_LABELS[plan.strategy.withdrawalMethod]} />
        {retireRow && <Stat label="Balance at retirement" value={formatCurrency(retireRow.total)} />}
        {finalRow && <Stat label="Balance at end of plan" value={formatCurrency(finalRow.total)} />}
        {mc && v && <Stat label="Success probability" value={`${formatPercent(mc.successRate)} — ${v.label}`} />}
        {mc && (
          <>
            <Stat label="End-of-plan · 10th percentile" value={formatCurrency(mc.terminal.p10)} />
            <Stat label="End-of-plan · median" value={formatCurrency(mc.terminal.p50)} />
            <Stat label="End-of-plan · 90th percentile" value={formatCurrency(mc.terminal.p90)} />
          </>
        )}
      </dl>

      {plan.legacy.enabled && (
        <div className={`mt-3 border-t ${RULE} pt-3`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${SUBTLE}`}>
            Legacy goal — leave {formatCurrency(legacyTarget)} ({plan.legacy.heirs} × {formatCurrency(plan.legacy.amountPerHeir)}) to your heirs
          </p>
          {legacyAges ? (
            <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2">
              {LEGACY_AGE_ROWS.map(({ key, label, hint }) => {
                const outcome = legacyAges[key]
                return (
                  <Stat
                    key={key}
                    label={`${label} (${hint})`}
                    value={outcome === null ? `not by ${plan.you.endAge}` : `age ${outcome.age} · ${formatCurrency(outcome.balanceAtRetirement)}`}
                  />
                )
              })}
            </dl>
          ) : (
            <p className={`mt-1 text-xs ${SUBTLE}`}>
              Retirement age by outcome not yet calculated — click &ldquo;Find my retirement age&rdquo; before printing to include it.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
