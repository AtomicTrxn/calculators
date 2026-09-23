import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import type { RunRequest, WorkerRequest, WorkerResponse } from '../worker/messages'
import { useMonteCarloWorker } from './useMonteCarloWorker'

/**
 * jsdom has no real Worker implementation, and exercising the actual
 * worker thread here would need a browser — out of scope per
 * docs/retirement-react-rewrite-plan.md §3.6 ("Phase 3 spike, not
 * assumed"). This instead verifies the message CONTRACT and the hook's
 * handling of it (progress/result/error, stale-response rejection) by
 * standing in a fake Worker that plays back messages the test controls.
 */
class FakeWorker {
  static instances: FakeWorker[] = []
  posted: WorkerRequest[] = []
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(msg: WorkerRequest) {
    this.posted.push(msg)
  }
  terminate() {}
  emit(response: WorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>)
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMonteCarloWorker', () => {
  it('posts a typed run request and reflects progress/result messages', async () => {
    const { result } = renderHook(() => useMonteCarloWorker())
    const plan = defaultPlanState()

    act(() => result.current.run(plan, 500, 42))

    const worker = FakeWorker.instances[0]!
    const posted = worker.posted[0] as RunRequest
    expect(posted.type).toBe('run')
    expect(posted.iterations).toBe(500)
    expect(posted.seed).toBe(42)
    expect(result.current.status).toBe('running')

    act(() => worker.emit({ type: 'progress', requestId: posted.requestId, done: 250, total: 500 }))
    await waitFor(() => expect(result.current.progress).toBeCloseTo(0.5))

    act(() =>
      worker.emit({
        type: 'result',
        requestId: posted.requestId,
        result: { iterations: 500, successRate: 0.9, terminal: { p10: 1, p50: 2, p90: 3 }, medianDepletionAge: null, failureCount: 50, bands: [] },
      }),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.result?.successRate).toBe(0.9)
  })

  it('surfaces a worker error as UI state rather than throwing', async () => {
    const { result } = renderHook(() => useMonteCarloWorker())
    act(() => result.current.run(defaultPlanState(), 100, 1))
    const worker = FakeWorker.instances[0]!
    const posted = worker.posted[0] as RunRequest

    act(() => worker.emit({ type: 'error', requestId: posted.requestId, message: 'boom' }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('boom')
  })

  it('drops a stale response from a superseded run', async () => {
    const { result } = renderHook(() => useMonteCarloWorker())
    const plan = defaultPlanState()

    act(() => result.current.run(plan, 100, 1))
    const worker = FakeWorker.instances[0]!
    const firstRequestId = (worker.posted[0] as RunRequest).requestId

    act(() => result.current.run(plan, 100, 2)) // supersedes the first run before it resolves

    act(() =>
      worker.emit({
        type: 'result',
        requestId: firstRequestId, // late response for the superseded run
        result: { iterations: 100, successRate: 0.1, terminal: { p10: 0, p50: 0, p90: 0 }, medianDepletionAge: null, failureCount: 90, bands: [] },
      }),
    )

    // Still 'running' from the second run — the stale first-run result must not have landed.
    expect(result.current.status).toBe('running')
    expect(result.current.result).toBeNull()
  })

  it('posts a typed cancel request', () => {
    const { result } = renderHook(() => useMonteCarloWorker())
    act(() => result.current.run(defaultPlanState(), 100, 1))
    act(() => result.current.cancel())
    const worker = FakeWorker.instances[0]!
    expect(worker.posted[1]?.type).toBe('cancel')
    expect(result.current.status).toBe('idle')
  })
})
