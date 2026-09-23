import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactCurrency, formatCurrency } from '@/lib/utils'
import type { YearRow } from '../../engine/projection'
import { toProjectionData } from './chartData'
import { CHART_TOOLTIP_PROPS } from './chartTheme'

/**
 * The deterministic single-path projection curve. The YearByYearTable is
 * this chart's accessible fallback (docs/retirement-react-rewrite-plan.md
 * §3.5) — the same data, in table form, already renders alongside it.
 */
export function ProjectionChart({ rows }: { rows: YearRow[] }) {
  const data = toProjectionData(rows)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projected balance</CardTitle>
        <CardDescription>Deterministic single-path projection using the flat return assumptions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full" role="img" aria-label="Line chart of projected total balance by age; see the year-by-year table below for exact figures.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="age" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} width={64} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(age) => `Age ${age}`} {...CHART_TOOLTIP_PROPS} />
              <Line type="monotone" dataKey="total" stroke="var(--color-frost)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
