import { describe, expect, it } from 'vitest'

import { compactState } from '../engine/shareCodec'
import { samplePlanState } from '../schema/plan.schema'
import { compressJson, decompressJson } from './compression'

describe('compressJson / decompressJson', () => {
  it('round-trips a compact plan payload', async () => {
    const payload = compactState(samplePlanState())
    const compressed = await compressJson(payload)
    const restored = await decompressJson<typeof payload>(compressed)
    expect(restored).toEqual(payload)
  })

  it('is URL-safe (no +, /, or = characters)', async () => {
    const compressed = await compressJson({ a: 1, b: 'x'.repeat(200) })
    expect(compressed).not.toMatch(/[+/=]/)
  })

  it('rejects an unknown format marker', async () => {
    await expect(decompressJson('Xnotvalid')).rejects.toThrow(/unknown/i)
  })
})
