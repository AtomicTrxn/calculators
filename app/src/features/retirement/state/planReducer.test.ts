import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../schema/plan.schema'
import { initialPlanEditorState, planReducer } from './planReducer'

describe('planReducer', () => {
  it('replaces the plan on REPLACE_PLAN', () => {
    const state = initialPlanEditorState()
    const nextPlan = { ...defaultPlanState(), you: { currentAge: 50, retireAge: 65, endAge: 90 } }
    const next = planReducer(state, { type: 'REPLACE_PLAN', plan: nextPlan })
    expect(next.plan.you.currentAge).toBe(50)
  })

  it('applies a patch function on PATCH_PLAN (the slider/what-if path)', () => {
    const state = initialPlanEditorState()
    const next = planReducer(state, { type: 'PATCH_PLAN', patch: (p) => ({ ...p, you: { ...p.you, retireAge: 70 } }) })
    expect(next.plan.you.retireAge).toBe(70)
  })

  it('saves a named scenario without mutating the live plan', () => {
    const state = { ...initialPlanEditorState(), plan: { ...defaultPlanState(), you: { currentAge: 45, retireAge: 62, endAge: 92 } } }
    const next = planReducer(state, { type: 'SAVE_SCENARIO', id: 'a', name: 'Retire at 62' })
    expect(next.scenarios).toHaveLength(1)
    expect(next.scenarios[0]!.plan.you.retireAge).toBe(62)
    expect(next.plan.you.retireAge).toBe(62) // unchanged
  })

  it('supports more than two saved scenarios (E2 — generalized beyond the legacy A/B pair)', () => {
    let state = initialPlanEditorState()
    for (const [id, retireAge] of [
      ['a', 62],
      ['b', 65],
      ['c', 68],
    ] as const) {
      state = { ...state, plan: { ...state.plan, you: { ...state.plan.you, retireAge } } }
      state = planReducer(state, { type: 'SAVE_SCENARIO', id, name: `Retire at ${retireAge}` })
    }
    expect(state.scenarios.map((s) => s.plan.you.retireAge)).toEqual([62, 65, 68])
  })

  it('removes a scenario and drops it from the compare selection', () => {
    let state = initialPlanEditorState()
    state = planReducer(state, { type: 'SAVE_SCENARIO', id: 'a', name: 'A' })
    state = planReducer(state, { type: 'SET_COMPARE_SELECTION', ids: ['a'] })
    state = planReducer(state, { type: 'DELETE_SCENARIO', id: 'a' })
    expect(state.scenarios).toHaveLength(0)
    expect(state.compareSelection).toHaveLength(0)
  })

  it('caps the compare selection at 2 ids', () => {
    const state = initialPlanEditorState()
    const next = planReducer(state, { type: 'SET_COMPARE_SELECTION', ids: ['a', 'b', 'c'] })
    expect(next.compareSelection).toEqual(['a', 'b'])
  })

  it('resets to a fresh default plan on RESET_PLAN', () => {
    const state = { ...initialPlanEditorState(), plan: { ...defaultPlanState(), you: { currentAge: 99, retireAge: 100, endAge: 110 } } }
    const next = planReducer(state, { type: 'RESET_PLAN' })
    expect(next.plan.you.currentAge).toBe(defaultPlanState().you.currentAge)
  })
})
