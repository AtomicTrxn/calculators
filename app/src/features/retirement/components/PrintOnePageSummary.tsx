import { formatCurrency } from '@/lib/utils'
import { pickMilestoneRows } from '../engine/milestones'
import type { LegacyAgeResult } from '../engine/legacySolver'
import type { MonteCarloResult } from '../engine/monteCarlo'
import type { YearRow } from '../engine/projection'
import type { PlanState } from '../schema/plan.schema'
import { AtAGlancePanel, INK, KV, KVGrid, ReportHeader, RULE_LIGHT, Section, SUBTLE, WITHDRAWAL_METHOD_LABELS, td, tdRight, th, thRight } from './printShared'

/**
 * The condensed sibling of PrintSummary — same results (AtAGlancePanel),
 * but everything below it is compressed to fit one printed page: a short
 * key-inputs strip instead of full input tables, and a milestone timeline
 * (engine/milestones.ts) instead of every simulated year. For the full
 * year-by-year audit trail, use "Print detailed report" instead.
 */
export function PrintOnePageSummary({
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
  const milestones = pickMilestoneRows(plan, rows)
  const totalBalance = (['taxable', 'traditional', 'roth', 'cash', 'hsa'] as const).reduce((sum, k) => sum + plan.accounts[k], 0)
  const spendingSummary =
    plan.spending.mode === 'flat' ? `${formatCurrency(plan.spending.baseline)}/yr` : `Itemized — ${plan.spending.items.length} line item(s)`

  return (
    <div className={`print-onepage hidden text-[13px] leading-relaxed ${INK}`}>
      <ReportHeader subtitle="1-page summary" />
      <AtAGlancePanel plan={plan} rows={rows} mc={mc} legacyAges={legacyAges} />

      <Section title="Key inputs">
        <KVGrid cols={4}>
          <KV label="Current age" value={plan.you.currentAge} />
          <KV label="Retirement age" value={plan.you.retireAge} />
          <KV label="End-of-plan age" value={plan.you.endAge} />
          <KV label="SS claim age" value={plan.strategy.ssClaimAge} />
          <KV label="Withdrawal method" value={WITHDRAWAL_METHOD_LABELS[plan.strategy.withdrawalMethod]} />
          <KV label="Total savings today" value={formatCurrency(totalBalance)} />
          <KV label="Baseline spending" value={spendingSummary} />
          {plan.legacy.enabled && <KV label="Legacy goal" value={formatCurrency(plan.legacy.amountPerHeir * plan.legacy.heirs)} />}
        </KVGrid>
      </Section>

      <Section title="Milestone timeline">
        <table className="w-full border-collapse text-xs">
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
            {milestones.map((row) => (
              <tr key={row.age} className={`border-b ${RULE_LIGHT}`}>
                <td className={td}>{row.age}</td>
                <td className={tdRight}>{formatCurrency(row.total)}</td>
                <td className={tdRight}>{formatCurrency(row.income)}</td>
                <td className={tdRight}>{formatCurrency(row.spending)}</td>
                <td className={tdRight}>{formatCurrency(row.taxes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`mt-1 text-[10px] ${SUBTLE}`}>
          Key ages only — today, retirement, Social Security claim age, RMD eligibility (73), the balance&apos;s peak, and the end of the plan. See the
          detailed report for every simulated year.
        </p>
      </Section>
    </div>
  )
}
