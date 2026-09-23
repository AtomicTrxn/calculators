import { rmdRequired } from '../../engine/rmd'
import type { Band } from '../../engine/monteCarlo'
import type { YearRow } from '../../engine/projection'

/**
 * Pure hook-output -> chart-prop mappings, pulled out of the chart
 * components so they're unit-testable without rendering Recharts (see
 * docs/retirement-react-rewrite-plan.md §7 — chart tests cover data
 * mapping only, not Recharts' own rendering).
 */

export function toProjectionData(rows: YearRow[]) {
  return rows.map((r) => ({ age: r.age, total: Math.round(r.total) }))
}

export function toFanData(bands: Band[]) {
  return bands.map((b) => ({ age: b.age, p10: Math.round(b.p10), p50: Math.round(b.p50), p90: Math.round(b.p90), band: Math.round(b.p90 - b.p10) }))
}

export function toRmdData(rows: YearRow[]) {
  return rows
    .map((row, i) => {
      const startBalance = i > 0 ? rows[i - 1]!.traditional : row.traditional
      return { age: row.age, rmd: Math.round(rmdRequired(row.age, startBalance)) }
    })
    .filter((d) => d.rmd > 0)
}
