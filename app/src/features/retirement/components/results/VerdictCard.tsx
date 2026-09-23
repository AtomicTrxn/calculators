import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCompactCurrency, formatPercent } from '@/lib/utils'
import type { MonteCarloResult } from '../../engine/monteCarlo'
import { verdict } from '../../engine/monteCarlo'

const TONE_VARIANT = { good: 'default', warn: 'warn', bad: 'bad' } as const

export function VerdictCard({ result, isStale, progress }: { result: MonteCarloResult | null; isStale: boolean; progress: number }) {
  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Running the first simulation…</CardTitle>
        </CardHeader>
        <CardContent>
          <div role="status" aria-live="polite" className="text-sm text-muted">
            {Math.round(progress * 100)}% complete
          </div>
        </CardContent>
      </Card>
    )
  }

  const v = verdict(result.successRate)

  return (
    <Card aria-busy={isStale}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Plan success probability</CardTitle>
        <Badge variant={TONE_VARIANT[v.tone]}>{v.label}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-4xl text-navy">{formatPercent(result.successRate)}</span>
          <span className="text-sm text-muted">across {result.iterations.toLocaleString()} simulated paths</span>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">10th percentile</dt>
            <dd className="font-medium text-navy">{formatCompactCurrency(result.terminal.p10)}</dd>
          </div>
          <div>
            <dt className="text-muted">Median</dt>
            <dd className="font-medium text-navy">{formatCompactCurrency(result.terminal.p50)}</dd>
          </div>
          <div>
            <dt className="text-muted">90th percentile</dt>
            <dd className="font-medium text-navy">{formatCompactCurrency(result.terminal.p90)}</dd>
          </div>
        </dl>
        {/* E1: the previous result stays visible and interactive while a
            recompute is in flight — this status line is the only thing
            that changes, not the whole card blanking out. */}
        <div role="status" aria-live="polite" className="text-xs text-muted">
          {isStale ? 'Recalculating…' : 'Up to date'}
        </div>
      </CardContent>
    </Card>
  )
}
