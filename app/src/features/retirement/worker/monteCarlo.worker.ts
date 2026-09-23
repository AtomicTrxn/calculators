/// <reference lib="webworker" />
import { runMonteCarlo } from '../engine/monteCarlo'
import { findRetirementAgesForLegacy } from '../engine/legacySolver'
import type { WorkerRequest, WorkerResponse } from './messages'

declare const self: DedicatedWorkerGlobalScope

class Cancelled extends Error {}

const cancelledRequestIds = new Set<number>()

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  if (msg.type === 'cancel') {
    cancelledRequestIds.add(msg.requestId)
    return
  }

  const { requestId } = msg
  try {
    if (msg.type === 'run') {
      const result = runMonteCarlo(msg.plan, { iterations: msg.iterations, seed: msg.seed }, (done, total) => {
        if (cancelledRequestIds.has(requestId)) throw new Cancelled()
        const progress: WorkerResponse = { type: 'progress', requestId, done, total }
        self.postMessage(progress)
      })
      const response: WorkerResponse = { type: 'result', requestId, result }
      self.postMessage(response)
    } else {
      const ages = findRetirementAgesForLegacy(msg.plan, msg.targetBequest, { iterations: msg.iterations }, (done, total) => {
        if (cancelledRequestIds.has(requestId)) throw new Cancelled()
        const progress: WorkerResponse = { type: 'progress', requestId, done, total }
        self.postMessage(progress)
      })
      const response: WorkerResponse = { type: 'legacyAgeResult', requestId, ages }
      self.postMessage(response)
    }
  } catch (err) {
    cancelledRequestIds.delete(requestId)
    if (err instanceof Cancelled) return // silently stop — the main thread already gave up on this requestId
    const response: WorkerResponse = { type: 'error', requestId, message: err instanceof Error ? err.message : String(err) }
    self.postMessage(response)
  } finally {
    cancelledRequestIds.delete(requestId)
  }
}
