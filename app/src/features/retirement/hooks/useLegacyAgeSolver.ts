import { useCallback, useEffect, useRef, useState } from 'react'

import type { LegacyAgeResult } from '../engine/legacySolver'
import type { PlanState } from '../schema/plan.schema'
import type { CancelRequest, SolveLegacyAgeRequest, WorkerResponse } from '../worker/messages'

export type LegacyAgeSolverStatus = 'idle' | 'running' | 'success' | 'error'

export interface UseLegacyAgeSolver {
  status: LegacyAgeSolverStatus
  /** 0–1. */
  progress: number
  ages: LegacyAgeResult | null
  error: string | null
  solve: (plan: PlanState, targetBequest: number, iterations: number) => void
  cancel: () => void
}

/**
 * On-demand twin of useMonteCarloWorker for the legacy-goal age solver
 * (engine/legacySolver.ts). Deliberately a separate hook with its own
 * Worker instance rather than a new mode bolted onto useMonteCarloWorker:
 * that hook's state (status/result) is shaped for the single reactive
 * MonteCarloResult that reruns on every plan edit, while a solve is a
 * one-off action the user triggers with a button and costs ~N Monte Carlo
 * runs (one per candidate retirement age) instead of one — mixing the two
 * into one requestId/result slot would let a solve's stale response clobber
 * the interactive result, or vice versa.
 */
export function useLegacyAgeSolver(): UseLegacyAgeSolver {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [status, setStatus] = useState<LegacyAgeSolverStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [ages, setAges] = useState<LegacyAgeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../worker/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.requestId !== requestIdRef.current) return // stale response from a superseded solve — drop it

      if (msg.type === 'progress') {
        setProgress(msg.total > 0 ? msg.done / msg.total : 0)
        return
      }
      if (msg.type === 'legacyAgeResult') {
        setAges(msg.ages)
        setProgress(1)
        setStatus('success')
        return
      }
      if (msg.type === 'result') return // not this hook's message — ignore
      setError(msg.message)
      setStatus('error')
    }

    worker.onerror = (event) => {
      setError(event.message || 'Legacy age solver worker crashed.')
      setStatus('error')
    }

    return () => worker.terminate()
  }, [])

  const solve = useCallback((plan: PlanState, targetBequest: number, iterations: number) => {
    const worker = workerRef.current
    if (!worker) return
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setStatus('running')
    setError(null)
    setProgress(0)
    const req: SolveLegacyAgeRequest = { type: 'solveLegacyAge', requestId, plan, targetBequest, iterations }
    worker.postMessage(req)
  }, [])

  const cancel = useCallback(() => {
    const worker = workerRef.current
    if (!worker) return
    const req: CancelRequest = { type: 'cancel', requestId: requestIdRef.current }
    worker.postMessage(req)
    setStatus('idle')
  }, [])

  return { status, progress, ages, error, solve, cancel }
}
