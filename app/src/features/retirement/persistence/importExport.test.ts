import { describe, expect, it } from 'vitest'

import { defaultPlanState, samplePlanState } from '../schema/plan.schema'
import { exportPlanJson, importPlanJson } from './importExport'

describe('exportPlanJson / importPlanJson', () => {
  it('round-trips a full plan', () => {
    const plan = samplePlanState()
    const result = importPlanJson(exportPlanJson(plan))
    expect(result.success).toBe(true)
    if (result.success) expect(result.plan).toEqual(plan)
  })

  it('reports which field failed rather than an all-or-nothing rollback', () => {
    const plan = defaultPlanState()
    const raw = JSON.stringify({ ...plan, assumptions: { ...plan.assumptions, taxRate: 5 } })
    const result = importPlanJson(raw)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some((i) => i.path === 'assumptions.taxRate')).toBe(true)
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('reports invalid JSON distinctly from a schema failure', () => {
    const result = importPlanJson('{not json')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues[0]!.path).toBe('(file)')
  })
})
