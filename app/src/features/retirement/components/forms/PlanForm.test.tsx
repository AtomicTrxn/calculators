import { act, render, screen } from '@testing-library/react'
import { useFormContext } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import type { PlanState } from '../../schema/plan.schema'
import { PlanProvider, usePlanEditor } from '../../state/PlanContext'
import { PlanForm } from './PlanForm'

/**
 * Regression test for a real bug caught in browser testing (see
 * PlanForm.tsx's comment): dispatching PATCH_PLAN — the path a what-if
 * slider uses, bypassing RHF entirely — triggered an infinite
 * reset -> watch -> dispatch -> reset loop under the earlier
 * reference-equality version of the sync effect. This exercises that
 * exact path end-to-end (reducer dispatch -> form reflects it) with no
 * mocking, so a regression here would fail the same way it failed live.
 */

/** Stands in for WhatIfSliders: dispatches PATCH_PLAN directly, bypassing RHF — the path that caused the original bug. */
function PatchButton() {
  const { dispatch } = usePlanEditor()
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'PATCH_PLAN', patch: (p) => ({ ...p, you: { ...p.you, retireAge: p.you.retireAge + 1 } }) })}
    >
      bump retire age
    </button>
  )
}

// A minimal registered field so we can assert the form reflects a reducer-originated change.
function RetireAgeInputBound() {
  const { register } = useFormContext<PlanState>()
  return <input aria-label="retire age" {...register('you.retireAge', { valueAsNumber: true })} />
}

function Harness() {
  return (
    <PlanProvider>
      <PlanForm>
        <PatchButton />
        <RetireAgeInputBound />
      </PlanForm>
    </PlanProvider>
  )
}

describe('PlanForm <-> reducer sync', () => {
  it('applies a PATCH_PLAN dispatch (the slider path) to the form without looping', async () => {
    const errors: unknown[] = []
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }
    try {
      render(<Harness />)
      const input = screen.getByLabelText('retire age') as HTMLInputElement
      expect(input.value).toBe('67')

      await act(async () => {
        screen.getByText('bump retire age').click()
        await new Promise((r) => setTimeout(r, 0))
      })

      expect(input.value).toBe('68')
      expect(errors.some((e) => String(e).includes('Maximum update depth exceeded'))).toBe(false)
    } finally {
      console.error = originalConsoleError
    }
  })

  it('applying several PATCH_PLAN dispatches in a row settles rather than looping', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('retire age') as HTMLInputElement
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        screen.getByText('bump retire age').click()
        await new Promise((r) => setTimeout(r, 0))
      })
    }
    expect(input.value).toBe('72')
  })
})
