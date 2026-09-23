import { defaultPlanState, type PlanState } from '../schema/plan.schema'

/** A named snapshot for comparison — generalizes the legacy tool's fixed two-slot A/B compare to N entries (E2, plan §6). */
export interface Scenario {
  id: string
  name: string
  plan: PlanState
  savedAt: number
}

export interface PlanEditorState {
  plan: PlanState
  scenarios: Scenario[]
  /** ids of up to 2 scenarios currently selected for the diff view. */
  compareSelection: string[]
}

export type PlanAction =
  /** The form (RHF) committed a newly-valid plan — see docs/retirement-react-rewrite-plan.md §3.3 on reducer vs. form-field state. */
  | { type: 'REPLACE_PLAN'; plan: PlanState }
  /** A live control that bypasses the form entirely — e.g. a what-if slider (E3). Already-valid by construction, so it dispatches directly. */
  | { type: 'PATCH_PLAN'; patch: (plan: PlanState) => PlanState }
  /** Loaded from localStorage, a share link, or CSV import. */
  | { type: 'LOAD_PLAN'; plan: PlanState }
  | { type: 'RESET_PLAN' }
  | { type: 'SAVE_SCENARIO'; name: string; id: string }
  | { type: 'DELETE_SCENARIO'; id: string }
  | { type: 'RENAME_SCENARIO'; id: string; name: string }
  | { type: 'SET_COMPARE_SELECTION'; ids: string[] }

export function initialPlanEditorState(): PlanEditorState {
  return { plan: defaultPlanState(), scenarios: [], compareSelection: [] }
}

export function planReducer(state: PlanEditorState, action: PlanAction): PlanEditorState {
  switch (action.type) {
    case 'REPLACE_PLAN':
      return { ...state, plan: action.plan }
    case 'PATCH_PLAN':
      return { ...state, plan: action.patch(state.plan) }
    case 'LOAD_PLAN':
      return { ...state, plan: action.plan }
    case 'RESET_PLAN':
      return { ...state, plan: defaultPlanState() }
    case 'SAVE_SCENARIO': {
      const scenario: Scenario = { id: action.id, name: action.name, plan: state.plan, savedAt: Date.now() }
      return { ...state, scenarios: [...state.scenarios, scenario] }
    }
    case 'DELETE_SCENARIO':
      return {
        ...state,
        scenarios: state.scenarios.filter((s) => s.id !== action.id),
        compareSelection: state.compareSelection.filter((id) => id !== action.id),
      }
    case 'RENAME_SCENARIO':
      return { ...state, scenarios: state.scenarios.map((s) => (s.id === action.id ? { ...s, name: action.name } : s)) }
    case 'SET_COMPARE_SELECTION':
      return { ...state, compareSelection: action.ids.slice(0, 2) }
    default:
      return state
  }
}
