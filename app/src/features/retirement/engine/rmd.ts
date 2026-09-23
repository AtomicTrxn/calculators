import { RMD_AGE, RMD_TABLE } from './constants'

export function rmdRequired(age: number, traditionalBalance: number): number {
  if (age < RMD_AGE || traditionalBalance <= 0) return 0
  const factor = RMD_TABLE[age] ?? RMD_TABLE[120]!
  return traditionalBalance / factor
}
