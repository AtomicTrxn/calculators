import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import type { SolveLegacyAgeRequest, WorkerRequest, WorkerResponse } from '../worker/messages'
import { useLegacyAgeSolver } from './useLegacyAgeSolver'

/** Same FakeWorker approach as useMonteCarloWorker.test.ts — see that file for why. */
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

describe('useLegacyAgeSolver', () => {
  it('posts a typed solveLegacyAge request and reflects progress/result messages', async () => {
    const { result } = renderHook(() => useLegacyAgeSolver())
    const plan = defaultPlanState()

    act(() => result.current.solve(plan, 1000000, 500))

    const worker = FakeWorker.instances[0]!
    const posted = worker.posted[0] as SolveLegacyAgeRequest
    expect(posted.type).toBe('solveLegacyAge')
    expect(posted.targetBequest).toBe(1000000)
    expect(result.current.status).toBe('running')

    act(() => worker.emit({ type: 'progress', requestId: posted.requestId, done: 3, total: 6 }))
    await waitFor(() => expect(result.current.progress).toBeCloseTo(0.5))

    const ages = { p10: { age: 68, balanceAtRetirement: 900000 }, p50: { age: 65, balanceAtRetirement: 1100000 }, p90: { age: 62, balanceAtRetirement: 1400000 } }
    act(() => worker.emit({ type: 'legacyAgeResult', requestId: posted.requestId, ages }))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.ages).toEqual(ages)
  })

  it('ignores a plain Monte Carlo result message', async () => {
    const { result } = renderHook(() => useLegacyAgeSolver())
    act(() => result.current.solve(defaultPlanState(), 1000000, 500))
    const worker = FakeWorker.instances[0]!
    const posted = worker.posted[0] as SolveLegacyAgeRequest

    act(() =>
      worker.emit({
        type: 'result',
        requestId: posted.requestId,
        result: { iterations: 500, successRate: 0.9, terminal: { p10: 1, p50: 2, p90: 3 }, medianDepletionAge: null, failureCount: 50, bands: [] },
      }),
    )
    expect(result.current.status).toBe('running')
    expect(result.current.ages).toBeNull()
  })

  it('surfaces a worker error as UI state', async () => {
    const { result } = renderHook(() => useLegacyAgeSolver())
    act(() => result.current.solve(defaultPlanState(), 1000000, 100))
    const worker = FakeWorker.instances[0]!
    const posted = worker.posted[0] as SolveLegacyAgeRequest

    act(() => worker.emit({ type: 'error', requestId: posted.requestId, message: 'boom' }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('boom')
  })

  it('drops a stale response from a superseded solve', async () => {
    const { result } = renderHook(() => useLegacyAgeSolver())
    const plan = defaultPlanState()

    act(() => result.current.solve(plan, 1000000, 100))
    const worker = FakeWorker.instances[0]!
    const firstRequestId = (worker.posted[0] as SolveLegacyAgeRequest).requestId

    act(() => result.current.solve(plan, 2000000, 100)) // supersedes the first solve before it resolves

    act(() =>
      worker.emit({
        type: 'legacyAgeResult',
        requestId: firstRequestId,
        ages: { p10: { age: 70, balanceAtRetirement: 900000 }, p50: { age: 68, balanceAtRetirement: 1000000 }, p90: { age: 65, balanceAtRetirement: 1200000 } },
      }),
    )

    expect(result.current.status).toBe('running')
    expect(result.current.ages).toBeNull()
  })

  it('posts a typed cancel request', () => {
    const { result } = renderHook(() => useLegacyAgeSolver())
    act(() => result.current.solve(defaultPlanState(), 1000000, 100))
    act(() => result.current.cancel())
    const worker = FakeWorker.instances[0]!
    expect(worker.posted[1]?.type).toBe('cancel')
    expect(result.current.status).toBe('idle')
  })
})
