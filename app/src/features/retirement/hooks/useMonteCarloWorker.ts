import { useCallback, useEffect, useRef, useState } from 'react'

import type { MonteCarloResult } from '../engine/monteCarlo'
import type { PlanState } from '../schema/plan.schema'
import type { CancelRequest, RunRequest, WorkerResponse } from '../worker/messages'

export type WorkerStatus = 'idle' | 'running' | 'success' | 'error'

export interface UseMonteCarloWorker {
  status: WorkerStatus
  /** 0–1. */
  progress: number
  result: MonteCarloResult | null
  error: string | null
  run: (plan: PlanState, iterations: number, seed: number) => void
  cancel: () => void
}

/**
 * Owns the Monte Carlo worker's lifecycle: spawn once, post typed run/cancel
 * requests, tag every request with an incrementing id so a stale response
 * from a superseded run is dropped rather than overwriting a newer one, and
 * terminate on unmount. See docs/retirement-react-rewrite-plan.md §3.2 for
 * the message contract this talks over.
 */
export function useMonteCarloWorker(): UseMonteCarloWorker {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [status, setStatus] = useState<WorkerStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../worker/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.requestId !== requestIdRef.current) return // stale response from a superseded run — drop it

      if (msg.type === 'progress') {
        setProgress(msg.total > 0 ? msg.done / msg.total : 0)
        return
      }
      if (msg.type === 'result') {
        setResult(msg.result)
        setProgress(1)
        setStatus('success')
        return
      }
      if (msg.type === 'legacyAgeResult') return // not this hook's message — ignore
      setError(msg.message)
      setStatus('error')
    }

    worker.onerror = (event) => {
      setError(event.message || 'Monte Carlo worker crashed.')
      setStatus('error')
    }

    return () => worker.terminate()
  }, [])

  const run = useCallback((plan: PlanState, iterations: number, seed: number) => {
    const worker = workerRef.current
    if (!worker) return
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setStatus('running')
    setError(null)
    setProgress(0)
    const req: RunRequest = { type: 'run', requestId, plan, iterations, seed }
    worker.postMessage(req)
  }, [])

  const cancel = useCallback(() => {
    const worker = workerRef.current
    if (!worker) return
    const req: CancelRequest = { type: 'cancel', requestId: requestIdRef.current }
    worker.postMessage(req)
    setStatus('idle')
  }, [])

  return { status, progress, result, error, run, cancel }
}
