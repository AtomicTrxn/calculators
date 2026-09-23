import { useEffect, useRef } from 'react'

import { planFromShareUrl } from '../persistence/shareLink'
import { loadStoredPlan, saveStoredPlan } from '../persistence/storage'
import { usePlanEditor } from './PlanContext'

/**
 * Hydrates the plan once on mount (a shared link takes priority over the
 * saved local copy, matching the legacy tool's load order), then autosaves
 * on every change. Lives in state/ rather than persistence/ because it
 * dispatches into the reducer — persistence/ stays free of any React
 * state dependency so its pieces (storage.ts, shareLink.ts) stay testable
 * in isolation.
 */
export function usePlanPersistence(): void {
  const { state, dispatch } = usePlanEditor()
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    void planFromShareUrl().then((shared) => {
      if (shared) {
        dispatch({ type: 'LOAD_PLAN', plan: shared })
        return
      }
      const stored = loadStoredPlan()
      if (stored) dispatch({ type: 'LOAD_PLAN', plan: stored })
    })
  }, [dispatch])

  useEffect(() => {
    const id = setTimeout(() => saveStoredPlan(state.plan), 400)
    return () => clearTimeout(id)
  }, [state.plan])
}
