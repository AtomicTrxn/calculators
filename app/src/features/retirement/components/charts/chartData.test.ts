import { describe, expect, it } from 'vitest'

import { defaultPlanState } from '../../schema/plan.schema'
import { runMonteCarlo } from '../../engine/monteCarlo'
import { projectDeterministic } from '../../engine/projection'
import { toFanData, toProjectionData, toRmdData } from './chartData'

describe('toProjectionData', () => {
  it('maps rows to rounded age/total pairs', () => {
    const { rows } = projectDeterministic(defaultPlanState())
    const data = toProjectionData(rows)
    expect(data).toHaveLength(rows.length)
    expect(data[0]).toEqual({ age: rows[0]!.age, total: Math.round(rows[0]!.total) })
    expect(data.every((d) => Number.isInteger(d.total))).toBe(true)
  })
})

describe('toFanData', () => {
  it('maps bands to rounded percentile pairs plus a stacked band width', () => {
    const plan = defaultPlanState()
    const mc = runMonteCarlo(plan, { iterations: 100, seed: 1 })
    const data = toFanData(mc.bands)
    expect(data).toHaveLength(mc.bands.length)
    for (const [i, d] of data.entries()) {
      expect(d.band).toBe(Math.round(mc.bands[i]!.p90 - mc.bands[i]!.p10))
    }
  })
})

describe('toRmdData', () => {
  it('is empty when the plan never reaches RMD age', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 40, retireAge: 65, endAge: 70 }
    const { rows } = projectDeterministic(plan)
    expect(toRmdData(rows)).toHaveLength(0)
  })

  it('computes an RMD from the prior year-end traditional balance once RMD age is reached', () => {
    const plan = defaultPlanState()
    plan.you = { currentAge: 70, retireAge: 70, endAge: 80 }
    plan.accounts = { taxable: 0, traditional: 500000, roth: 0, cash: 0, hsa: 0 }
    plan.assumptions.returnRetire = 0
    const { rows } = projectDeterministic(plan)
    const data = toRmdData(rows)
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((d) => d.age >= 73)).toBe(true)
    expect(data.every((d) => d.rmd > 0)).toBe(true)
  })
})
