import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCompactCurrency, formatCurrency } from '@/lib/utils'
import type { UseLegacyAgeSolver } from '../../hooks/useLegacyAgeSolver'
import type { PlanState } from '../../schema/plan.schema'

const ROWS = [
  { key: 'p10', label: 'Worst case', hint: '10th percentile' },
  { key: 'p50', label: 'Typical', hint: 'Median' },
  { key: 'p90', label: 'Best case', hint: '90th percentile' },
] as const

/**
 * `solver` is owned by RetirementPageContent, not this component, so its
 * `ages` result can also reach PrintSummary — a printed report should be
 * able to include the last-solved retirement ages, not just what's shown
 * on screen at the moment of printing.
 */
export function LegacyGoalCard({ plan, solver }: { plan: PlanState; solver: UseLegacyAgeSolver }) {
  if (!plan.legacy.enabled) return null

  const target = plan.legacy.amountPerHeir * plan.legacy.heirs
  const running = solver.status === 'running'

  return (
    <Card aria-busy={running}>
      <CardHeader>
        <CardTitle>Retirement age by outcome</CardTitle>
        <CardDescription>
          Earliest age you could retire and still leave {formatCurrency(target)} ({plan.legacy.heirs} × {formatCurrency(plan.legacy.amountPerHeir)}) at the
          end of the plan, holding everything else fixed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" onClick={() => solver.solve(plan, target, plan.strategy.monteCarloIterations)} disabled={running}>
          {running ? `Solving… ${Math.round(solver.progress * 100)}%` : 'Find my retirement age'}
        </Button>

        {solver.error && (
          <div role="alert" className="rounded-md border border-coral/40 bg-coral/5 p-3 text-xs text-coral">
            The solver failed: {solver.error}
          </div>
        )}

        {solver.ages && (
          <dl className="grid grid-cols-3 gap-3 text-sm" aria-live="polite">
            {ROWS.map(({ key, label, hint }) => {
              const outcome = solver.ages![key]
              return (
                <div key={key}>
                  <dt className="text-muted">
                    {label} <span className="block text-xs">{hint}</span>
                  </dt>
                  <dd className="font-medium text-navy">{outcome === null ? `Not by ${plan.you.endAge}` : `Age ${outcome.age}`}</dd>
                  {outcome !== null && <dd className="text-xs text-muted">{formatCompactCurrency(outcome.balanceAtRetirement)} saved by then</dd>}
                </div>
              )
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
