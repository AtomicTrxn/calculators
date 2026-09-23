import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactCurrency, formatCurrency } from '@/lib/utils'
import type { Band } from '../../engine/monteCarlo'
import { toFanData } from './chartData'
import { CHART_TOOLTIP_PROPS } from './chartTheme'

/**
 * The Monte Carlo outcome fan: p10–p90 band with the median line on top.
 * This is the one chart with no simpler tabular equivalent already on
 * screen, so it carries its own descriptive summary via aria-label
 * (docs/retirement-react-rewrite-plan.md §3.5) rather than relying on a
 * sibling table.
 */
export function FanChart({ bands }: { bands: Band[] }) {
  const data = toFanData(bands)
  const firstAge = bands[0]?.age
  const lastAge = bands[bands.length - 1]?.age

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simulated outcome range</CardTitle>
        <CardDescription>10th–90th percentile balance across every simulated path, with the median in the middle.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="h-72 w-full"
          role="img"
          aria-label={`Fan chart of the 10th to 90th percentile projected balance from age ${firstAge} to ${lastAge}, with the median balance plotted as a line.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="age" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} width={64} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(age) => `Age ${age}`} {...CHART_TOOLTIP_PROPS} />
              <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" />
              <Area dataKey="band" stackId="band" stroke="none" fill="var(--color-teal)" fillOpacity={0.25} name="10th–90th percentile" />
              <Line type="monotone" dataKey="p50" stroke="var(--color-navy)" strokeWidth={2} dot={false} name="Median" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
