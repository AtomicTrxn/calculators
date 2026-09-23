import { formatCurrency, formatPercent } from '@/lib/utils'
import type { LegacyAgeResult } from '../engine/legacySolver'
import type { MonteCarloResult } from '../engine/monteCarlo'
import type { YearRow } from '../engine/projection'
import type { PlanState } from '../schema/plan.schema'
import {
  ACCOUNT_LABELS,
  AtAGlancePanel,
  CATEGORY_LABELS,
  INCOME_TYPE_LABELS,
  INFLATION_LABELS,
  INK,
  KV,
  KVGrid,
  ReportHeader,
  RULE_LIGHT,
  Section,
  SUBTLE,
  WITHDRAWAL_METHOD_LABELS,
  td,
  tdRight,
  th,
  thRight,
} from './printShared'

/**
 * E7 — the detailed printable plan report (docs/retirement-react-rewrite-plan.md
 * §6): a print-only view for handing a plan to a spouse or advisor.
 * Hidden on screen, and shown only when `document.documentElement`'s
 * `data-print-mode` is *not* `'summary'` (globals.css) — Toolbar's "Print
 * detailed report" button sets that before calling window.print(); its
 * "Print 1-page summary" sibling (PrintOnePageSummary.tsx) sets it to
 * `'summary'` instead, so the two reports never both render on the same
 * printed page.
 *
 * Reproduces every input and assumption, not just the headline numbers —
 * the point of this report is that it's self-contained for someone who
 * never saw the on-screen form. Results lead (AtAGlancePanel, shared with
 * the one-page report) because that's what a reader wants first; every
 * input that produced those results follows below it, once, not repeated.
 */
export function PrintSummary({
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
  const totalBalance = (['taxable', 'traditional', 'roth', 'cash', 'hsa'] as const).reduce((sum, k) => sum + plan.accounts[k], 0)
  const totalContribution =
    (['taxable', 'traditional', 'roth', 'hsa'] as const).reduce((sum, k) => sum + plan.contributions[k], 0) + plan.contributions.employerMatch

  const hasExtras = plan.spending.phased.enabled || plan.spending.healthcare.enabled || plan.spending.ltc.enabled || plan.spending.oneOffs.length > 0

  return (
    <div className={`print-detailed hidden text-[13px] leading-relaxed ${INK}`}>
      <ReportHeader subtitle="Detailed report" />
      <AtAGlancePanel plan={plan} rows={rows} mc={mc} legacyAges={legacyAges} />

      <Section title="Your plan">
        <KVGrid>
          <KV label="Current age" value={plan.you.currentAge} />
          <KV label="Retirement age" value={plan.you.retireAge} />
          <KV label="End-of-plan age" value={plan.you.endAge} />
          <KV label="Social Security claim age" value={plan.strategy.ssClaimAge} />
          <KV label="Withdrawal method" value={WITHDRAWAL_METHOD_LABELS[plan.strategy.withdrawalMethod]} />
          <KV label="Monte Carlo iterations" value={plan.strategy.monteCarloIterations.toLocaleString()} />
        </KVGrid>
        <p className={`mt-2 text-xs ${SUBTLE}`}>
          Withdrawal order: <span className={INK}>{plan.strategy.withdrawalOrder.map((key) => ACCOUNT_LABELS[key]).join(' → ')}</span>
        </p>
      </Section>

      <Section title="Savings & contributions">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className={th}>Account</th>
              <th className={thRight}>Current balance</th>
              <th className={thRight}>Annual contribution</th>
            </tr>
          </thead>
          <tbody>
            {(['taxable', 'traditional', 'roth', 'cash', 'hsa'] as const).map((key) => (
              <tr key={key} className={`border-b ${RULE_LIGHT}`}>
                <td className={td}>{ACCOUNT_LABELS[key]}</td>
                <td className={tdRight}>{formatCurrency(plan.accounts[key])}</td>
                <td className={tdRight}>{key === 'cash' ? '—' : formatCurrency(plan.contributions[key])}</td>
              </tr>
            ))}
            <tr className={`border-b ${RULE_LIGHT}`}>
              <td className={td}>Employer match</td>
              <td className={tdRight}>—</td>
              <td className={tdRight}>{formatCurrency(plan.contributions.employerMatch)}</td>
            </tr>
            <tr className="border-b-2 border-slate-900 font-semibold">
              <td className={td}>Total</td>
              <td className={tdRight}>{formatCurrency(totalBalance)}</td>
              <td className={tdRight}>{formatCurrency(totalContribution)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Retirement income">
        {plan.income.length === 0 ? (
          <p className={`text-xs ${SUBTLE}`}>No income lines added.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className={th}>Source</th>
                <th className={th}>Type</th>
                <th className={thRight}>Amount</th>
                <th className={thRight}>Start age</th>
                <th className={thRight}>COLA</th>
              </tr>
            </thead>
            <tbody>
              {plan.income.map((line, i) => (
                <tr key={i} className={`border-b ${RULE_LIGHT}`}>
                  <td className={td}>{line.label}</td>
                  <td className={td}>{INCOME_TYPE_LABELS[line.type]}</td>
                  <td className={tdRight}>
                    {formatCurrency(line.amount)}/{line.frequency === 'monthly' ? 'mo' : 'yr'}
                  </td>
                  <td className={tdRight}>{line.startAge}</td>
                  <td className={tdRight}>{line.cola ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Spending plan">
        {plan.spending.mode === 'flat' ? (
          <p className="text-xs">
            Flat baseline spending: <span className={`font-medium tabular-nums ${INK}`}>{formatCurrency(plan.spending.baseline)}/yr</span> (today&apos;s
            dollars).
          </p>
        ) : plan.spending.items.length === 0 ? (
          <p className={`text-xs ${SUBTLE}`}>Itemized budget selected, but no line items added.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className={th}>Item</th>
                <th className={th}>Category</th>
                <th className={thRight}>Amount</th>
                <th className={th}>Inflation</th>
                <th className={thRight}>Ages</th>
              </tr>
            </thead>
            <tbody>
              {plan.spending.items.map((item, i) => (
                <tr key={i} className={`border-b ${RULE_LIGHT}`}>
                  <td className={td}>{item.label}</td>
                  <td className={td}>{CATEGORY_LABELS[item.category]}</td>
                  <td className={tdRight}>
                    {formatCurrency(item.amount)}/{item.frequency === 'monthly' ? 'mo' : 'yr'}
                  </td>
                  <td className={td}>{INFLATION_LABELS[item.inflation]}</td>
                  <td className={tdRight}>
                    {item.startAge ?? '—'}–{item.endAge ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hasExtras && (
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {plan.spending.phased.enabled && (
              <li>
                <span className={`font-medium ${INK}`}>Phased spending:</span> go-go {formatCurrency(plan.spending.phased.goGo)}/yr, slow-go{' '}
                {formatCurrency(plan.spending.phased.slowGo)}/yr from age {plan.spending.phased.slowGoAge}, no-go{' '}
                {formatCurrency(plan.spending.phased.noGo)}/yr from age {plan.spending.phased.noGoAge}.
              </li>
            )}
            {plan.spending.healthcare.enabled && (
              <li>
                <span className={`font-medium ${INK}`}>Healthcare:</span> {formatCurrency(plan.spending.healthcare.preMedicarePremium)}/yr pre-Medicare,{' '}
                {formatCurrency(plan.spending.healthcare.medicareAnnual)}/yr Medicare (IRMAA tier {plan.spending.healthcare.irmaaTier}).
              </li>
            )}
            {plan.spending.ltc.enabled && (
              <li>
                <span className={`font-medium ${INK}`}>Long-term care:</span> {formatCurrency(plan.spending.ltc.annualCost)}/yr for{' '}
                {plan.spending.ltc.years} years starting at age {plan.spending.ltc.startAge}.
              </li>
            )}
            {plan.spending.oneOffs.map((event, i) => (
              <li key={i}>
                <span className={`font-medium ${INK}`}>One-off:</span> {event.label} — {formatCurrency(event.amount)} at age {event.age}.
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Assumptions">
        <KVGrid cols={4}>
          <KV label="Return while working" value={`${formatPercent(plan.assumptions.returnAccum, 1)}/yr`} />
          <KV label="Return in retirement" value={`${formatPercent(plan.assumptions.returnRetire, 1)}/yr`} />
          <KV label="Inflation" value={`${formatPercent(plan.assumptions.inflation, 1)}/yr`} />
          <KV label="Medical inflation" value={`${formatPercent(plan.assumptions.medicalInflation, 1)}/yr`} />
          <KV label="Market volatility" value={formatPercent(plan.assumptions.volatility, 1)} />
          <KV label="Effective tax rate" value={formatPercent(plan.assumptions.taxRate, 1)} />
          <KV label="Taxable gain fraction" value={formatPercent(plan.assumptions.taxableGainFraction, 1)} />
          <KV label="Contribution growth" value={`${formatPercent(plan.assumptions.contributionGrowth, 1)}/yr`} />
        </KVGrid>
      </Section>

      <section className="mt-5 [break-before:page]">
        <h2 className={`border-b border-slate-300 pb-1 font-serif text-base font-semibold ${INK}`}>Year by year</h2>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className={th}>Age</th>
              <th className={thRight}>Total</th>
              <th className={thRight}>Income</th>
              <th className={thRight}>Spending</th>
              <th className={thRight}>Taxes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.age} className={`border-b ${(i + 1) % 5 === 0 ? 'border-slate-400' : RULE_LIGHT} [break-inside:avoid]`}>
                <td className={td}>{row.age}</td>
                <td className={tdRight}>{formatCurrency(row.total)}</td>
                <td className={tdRight}>{formatCurrency(row.income)}</td>
                <td className={tdRight}>{formatCurrency(row.spending)}</td>
                <td className={tdRight}>{formatCurrency(row.taxes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
