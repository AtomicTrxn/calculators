import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactCurrency, formatCurrency } from '@/lib/utils'
import type { YearRow } from '../../engine/projection'
import { toRmdData } from './chartData'
import { CHART_TOOLTIP_PROPS } from './chartTheme'

/**
 * Required minimum distribution per year, computed from each year's
 * starting traditional balance (the prior row's end-of-year figure) — a
 * separate view from the balance projection because RMDs are a required
 * cash-flow event, not a balance, and the legacy tool has no equivalent
 * chart for it at all (buried in the year-by-year table only).
 */
export function RmdTimelineChart({ rows }: { rows: YearRow[] }) {
  const data = toRmdData(rows)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RMD timeline</CardTitle>
          <CardDescription>No required minimum distributions fall within this plan's horizon.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RMD timeline</CardTitle>
        <CardDescription>Required minimum distributions from the traditional account, starting at age 73.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full" role="img" aria-label={`Bar chart of required minimum distributions from age ${data[0]!.age} to ${data[data.length - 1]!.age}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="age" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} width={64} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(age) => `Age ${age}`} {...CHART_TOOLTIP_PROPS} />
              <Bar dataKey="rmd" fill="var(--color-coral)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
