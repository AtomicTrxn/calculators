import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'

import { initialPlanEditorState, planReducer, type PlanAction, type PlanEditorState } from './planReducer'

interface PlanContextValue {
  state: PlanEditorState
  dispatch: Dispatch<PlanAction>
}

const PlanContext = createContext<PlanContextValue | null>(null)

/**
 * Single provider for the feature's committed plan/scenario state — see
 * docs/retirement-react-rewrite-plan.md §3.3. Scoped to the retirement
 * route, not the whole app shell, so a second tool (Group Expense Tracker)
 * joining later gets its own provider rather than sharing this one.
 */
export function PlanProvider({ children, initialState }: { children: ReactNode; initialState?: PlanEditorState }) {
  const [state, dispatch] = useReducer(planReducer, initialState ?? initialPlanEditorState())
  return <PlanContext.Provider value={{ state, dispatch }}>{children}</PlanContext.Provider>
}

export function usePlanEditor(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlanEditor must be used within a PlanProvider')
  return ctx
}
