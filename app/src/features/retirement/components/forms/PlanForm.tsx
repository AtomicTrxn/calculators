import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, type ReactNode } from 'react'
import { FormProvider, useForm, type Resolver } from 'react-hook-form'

import { planStateSchema, type PlanState } from '../../schema/plan.schema'
import { usePlanEditor } from '../../state/PlanContext'

/**
 * Bridges React Hook Form's field-level state to the reducer's committed
 * plan state — see docs/retirement-react-rewrite-plan.md §3.3. Two
 * one-way syncs, not a single shared object:
 *  - form -> reducer: on every change that parses as a valid PlanState,
 *    the parsed (coerced) value is dispatched as REPLACE_PLAN.
 *  - reducer -> form: when the plan changes from OUTSIDE the form (a
 *    scenario loaded, a share link applied, a what-if slider patch,
 *    reset), the form is reset to match.
 *
 * Object-reference comparison is NOT enough to break the cycle here:
 * Zod's parse always returns a freshly-constructed object even for
 * already-valid input, so "is this the same plan I last saw" can never be
 * answered by `===` once a round trip has gone through safeParse. Instead
 * an explicit flag marks "this reducer update was caused by our own watch
 * callback, so don't feed it back into reset()" — set right before we
 * dispatch, consumed (and cleared) by the very next effect run. That's
 * what stops the reset -> watch -> dispatch -> reset chain from running
 * forever; an earlier reference-equality version of this file could loop
 * indefinitely (a real bug caught in browser testing, not hypothetical).
 */
export function PlanForm({ children }: { children: ReactNode }) {
  const { state, dispatch } = usePlanEditor()
  const methods = useForm<PlanState>({
    // zodResolver infers the schema's pre-coercion input type (z.coerce.number()
    // accepts `unknown`), which structurally differs from PlanState (the
    // post-coercion output). The cast is the standard fix for that mismatch —
    // functionally the resolver still validates and returns a PlanState.
    resolver: zodResolver(planStateSchema) as Resolver<PlanState>,
    defaultValues: state.plan,
    mode: 'onBlur',
  })
  const suppressNextReset = useRef(false)
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true // defaultValues already matches state.plan on mount — nothing to reset
      return
    }
    if (suppressNextReset.current) {
      suppressNextReset.current = false
      return
    }
    methods.reset(state.plan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plan])

  useEffect(() => {
    const subscription = methods.watch((values) => {
      const parsed = planStateSchema.safeParse(values)
      if (parsed.success) {
        suppressNextReset.current = true
        dispatch({ type: 'REPLACE_PLAN', plan: parsed.data })
      }
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  return <FormProvider {...methods}>{children}</FormProvider>
}
