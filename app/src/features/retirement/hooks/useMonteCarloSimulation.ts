import { useDeferredValue, useEffect } from 'react'

import type { PlanState } from '../schema/plan.schema'
import { useMonteCarloWorker, type UseMonteCarloWorker } from './useMonteCarloWorker'

export interface UseMonteCarloSimulationOptions {
  iterations?: number
  seed?: number
  /** Matches the legacy calculator's edit-settle debounce (retirement-calculator.html: scheduleRecompute, 180ms). */
  debounceMs?: number
}

export interface UseMonteCarloSimulation extends UseMonteCarloWorker {
  /**
   * True when `plan` has changed since the worker started its current
   * result — i.e. what's on screen is known to be behind the latest edit.
   * Combine with `status === 'running'` to decide whether to dim/label the
   * displayed result as stale. See docs/retirement-react-rewrite-plan.md
   * §3.2 / E1 for why this uses useDeferredValue rather than useTransition:
   * useTransition's `isPending` only spans synchronous state updates made
   * inside startTransition, and the worker round-trip is inherently async
   * (a postMessage reply arriving in a later task), so it can't correctly
   * track "is the worker still computing." useDeferredValue instead defers
   * *when the expensive recompute is triggered* — input fields keep
   * rendering against the fresh, urgent `plan` value immediately, while
   * this hook's effect (and the worker dispatch it causes) run against a
   * lower-priority value that lags behind under load. `isStale` is that
   * lag made visible.
   */
  isStale: boolean
}

const DEFAULT_SEED = 0x9e3779b9

/**
 * The public seam between the simulation engine and the view — see
 * docs/retirement-react-rewrite-plan.md §3.1. Components never call
 * runMonteCarlo() or touch the worker directly; they call this hook and
 * get back a result plus the state needed to render it responsively.
 * Swapping the worker for, say, a server-computed result later would only
 * change useMonteCarloWorker's internals, not this hook's public shape or
 * any component using it.
 */
export function useMonteCarloSimulation(plan: PlanState, options: UseMonteCarloSimulationOptions = {}): UseMonteCarloSimulation {
  const { iterations, seed = DEFAULT_SEED, debounceMs = 180 } = options
  const deferredPlan = useDeferredValue(plan)
  const worker = useMonteCarloWorker()

  useEffect(() => {
    const id = setTimeout(() => {
      worker.run(deferredPlan, iterations ?? deferredPlan.strategy.monteCarloIterations, seed)
    }, debounceMs)
    return () => clearTimeout(id)
    // worker.run is stable (useCallback with no deps); deferredPlan is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredPlan, iterations, seed, debounceMs])

  return { ...worker, isStale: plan !== deferredPlan || worker.status === 'running' }
}
