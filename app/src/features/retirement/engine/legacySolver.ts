import type { MonteCarloOptions } from './monteCarlo'
import { runMonteCarlo } from './monteCarlo'
import type { PlanState } from '../schema/plan.schema'

export interface LegacyAgeOutcome {
  /** Earliest retirement age clearing the bequest target at this percentile. */
  age: number
  /**
   * The percentile's own simulated balance at that retirement age — i.e.
   * what your savings need to have grown to by the time you stop working,
   * in this outcome band. Not the same figure as the plan success card's
   * percentiles: those are the terminal balance at `you.endAge` for the
   * plan's *current* retirement age, a different point on the timeline.
   */
  balanceAtRetirement: number
}

export interface LegacyAgeResult {
  /** Null if the target isn't reachable at this percentile even retiring at `you.endAge - 1`. */
  p10: LegacyAgeOutcome | null
  p50: LegacyAgeOutcome | null
  p90: LegacyAgeOutcome | null
}

/**
 * Scans candidate retirement ages to find, for each Monte Carlo terminal
 * percentile, the earliest age at which the plan's simulated balance at
 * `you.endAge` still clears `targetBequest`. Everything about the plan
 * except `you.retireAge` is held fixed — this answers "how much later
 * would I need to retire to hit this legacy goal," not "what plan would
 * hit it."
 *
 * A straight scan from `currentAge` upward, not a binary search: the loop
 * takes the first age (in age order) at which each percentile clears the
 * target, which is correct by construction regardless of whether terminal
 * balance rises monotonically with retire age for every combination of
 * phased spending, one-off events, and income start ages a user can build.
 * A binary search would need that monotonicity to be trustworthy; this
 * doesn't. Each candidate reuses `runMonteCarlo`'s fixed default seed, so
 * results are deterministic and comparable across the scan.
 */
export function findRetirementAgesForLegacy(
  plan: PlanState,
  targetBequest: number,
  opts: MonteCarloOptions = {},
  onProgress?: (done: number, total: number) => void,
): LegacyAgeResult {
  const { currentAge, endAge } = plan.you
  const result: LegacyAgeResult = { p10: null, p50: null, p90: null }
  const total = Math.max(0, endAge - currentAge)

  for (let age = currentAge; age < endAge; age++) {
    const candidate: PlanState = { ...plan, you: { ...plan.you, retireAge: age } }
    const mc = runMonteCarlo(candidate, opts)
    // bands[i].age === currentAge + i by construction (see monteCarlo.ts) — retireAge is always
    // in range here, so this always finds the band for the exact age just simulated.
    const band = mc.bands[age - currentAge]
    if (result.p10 === null && mc.terminal.p10 >= targetBequest) result.p10 = { age, balanceAtRetirement: band?.p10 ?? 0 }
    if (result.p50 === null && mc.terminal.p50 >= targetBequest) result.p50 = { age, balanceAtRetirement: band?.p50 ?? 0 }
    if (result.p90 === null && mc.terminal.p90 >= targetBequest) result.p90 = { age, balanceAtRetirement: band?.p90 ?? 0 }
    onProgress?.(age - currentAge + 1, total)
    if (result.p10 !== null && result.p50 !== null && result.p90 !== null) break
  }

  return result
}
