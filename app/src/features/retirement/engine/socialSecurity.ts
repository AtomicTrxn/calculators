import { FRA } from './constants'

/** Social Security benefit multiplier for claiming at `claimAge` relative to `fra`. */
export function ssFactor(claimAge: number, fra: number = FRA): number {
  if (claimAge === fra) return 1
  if (claimAge < fra) {
    const months = (fra - claimAge) * 12
    const first36 = Math.min(months, 36)
    const beyond = Math.max(0, months - 36)
    return Math.max(0, 1 - (first36 * (5 / 9)) / 100 - (beyond * (5 / 12)) / 100)
  }
  const months = (Math.min(claimAge, 70) - fra) * 12
  return 1 + (months * (2 / 3)) / 100 // +8%/yr delayed credit
}
