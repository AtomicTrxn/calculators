import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { YearRow } from '../../engine/projection'

/**
 * The audit trail that makes the tool trustworthy — every balance, every
 * withdrawal, every dollar of tax, visible per year. Kept as a real
 * <table> (not styled divs) so screen readers get row/column semantics
 * for free, and so it doubles as the non-visual fallback for the
 * projection chart (docs/retirement-react-rewrite-plan.md §3.5).
 */
export function YearByYearTable({ rows }: { rows: YearRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Year by year</CardTitle>
        <CardDescription>The deterministic projection, one row per year, in nominal dollars.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Year-by-year projected balances, income, spending, withdrawals, and taxes</caption>
            <thead className="sticky top-0 bg-sand text-left">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Age
                </th>
                <th scope="col" className="px-3 py-2">
                  Total
                </th>
                <th scope="col" className="px-3 py-2">
                  Income
                </th>
                <th scope="col" className="px-3 py-2">
                  Spending
                </th>
                <th scope="col" className="px-3 py-2">
                  Withdrawal
                </th>
                <th scope="col" className="px-3 py-2">
                  Taxes
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.age} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {row.age}
                    {row.isRetired && <span className="ml-1 text-xs text-muted">(retired)</span>}
                  </th>
                  <td className="px-3 py-1.5">{formatCurrency(row.total)}</td>
                  <td className="px-3 py-1.5">{formatCurrency(row.income)}</td>
                  <td className="px-3 py-1.5">{formatCurrency(row.spending)}</td>
                  <td className="px-3 py-1.5">{formatCurrency(row.withdrawal)}</td>
                  <td className="px-3 py-1.5">{formatCurrency(row.taxes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
