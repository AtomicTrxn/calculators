import type { PlanState } from '../schema/plan.schema'
import { makeGaussian, mulberry32 } from './random'
import { simulatePath } from './projection'
import { clampInt } from './util'

export interface MonteCarloOptions {
  iterations?: number
  seed?: number
}

export interface Band {
  age: number
  p10: number
  p50: number
  p90: number
}

export interface MonteCarloResult {
  iterations: number
  successRate: number
  terminal: { p10: number; p50: number; p90: number }
  medianDepletionAge: number | null
  failureCount: number
  bands: Band[]
}

export function percentile(sortedAsc: readonly number[], p: number): number {
  if (!sortedAsc.length) return 0
  const idx = (p / 100) * (sortedAsc.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]!
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo)
}

function median(arr: readonly number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export type Verdict = { label: string; tone: 'good' | 'warn' | 'bad' }

export function verdict(rate: number): Verdict {
  if (rate >= 0.9) return { label: 'Very likely', tone: 'good' }
  if (rate >= 0.75) return { label: 'Likely', tone: 'good' }
  if (rate >= 0.5) return { label: 'Borderline', tone: 'warn' }
  return { label: 'At risk', tone: 'bad' }
}

/**
 * Runs `iterations` normally-distributed-return paths and summarizes them.
 * Ported from retirement-engine.js's runMonteCarlo — same PRNG (mulberry32)
 * and Gaussian sampler, so results are bit-identical to the legacy engine
 * for the same seed. This is the function the Web Worker (Phase 3) calls;
 * it accepts an optional `onProgress` callback so the worker can report
 * partial progress without changing the underlying algorithm.
 */
export function runMonteCarlo(state: PlanState, opts: MonteCarloOptions = {}, onProgress?: (done: number, total: number) => void): MonteCarloResult {
  const iterations = clampInt(opts.iterations ?? state.strategy.monteCarloIterations, 100, 50000, 1000)
  const rng = mulberry32(opts.seed ?? 0x9e3779b9)
  const gauss = makeGaussian(rng)
  const vol = state.assumptions.volatility
  const years = state.you.endAge - state.you.currentAge + 1

  const terminals: number[] = []
  const depletionAges: number[] = []
  let successes = 0
  const byYear: number[][] = []
  for (let i = 0; i < years; i++) byYear.push([])

  for (let k = 0; k < iterations; k++) {
    const returnFn = (_t: number, isRetired: boolean) => {
      const mean = isRetired ? state.assumptions.returnRetire : state.assumptions.returnAccum
      return mean + vol * gauss()
    }
    const res = simulatePath(state, returnFn)
    if (res.success) successes++
    else if (res.depletionAge !== null) depletionAges.push(res.depletionAge)
    terminals.push(res.endBalance)
    for (let i = 0; i < res.rows.length; i++) byYear[i]!.push(res.rows[i]!.total)

    if (onProgress && (k % 50 === 0 || k === iterations - 1)) onProgress(k + 1, iterations)
  }

  terminals.sort((a, b) => a - b)
  const bands: Band[] = byYear.map((arr, i) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return {
      age: state.you.currentAge + i,
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
    }
  })

  return {
    iterations,
    successRate: successes / iterations,
    terminal: { p10: percentile(terminals, 10), p50: percentile(terminals, 50), p90: percentile(terminals, 90) },
    medianDepletionAge: depletionAges.length ? Math.round(median(depletionAges)) : null,
    failureCount: iterations - successes,
    bands,
  }
}
