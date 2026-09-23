import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { formatCurrency } from '@/lib/utils'
import { usePlanEditor } from '../../state/PlanContext'

/**
 * Live what-if controls (E3, docs/retirement-react-rewrite-plan.md §6) —
 * an upgrade of the legacy tool's static "retire 1 year later" preset
 * deltas into continuously explorable sliders. These dispatch straight to
 * the reducer via PATCH_PLAN rather than going through React Hook Form:
 * a slider's value is already valid by construction (it's clamped to its
 * own min/max), so there's no field-level validation step for RHF to own
 * here — see the ADR on state management (§3.3) for why the reducer
 * accepts both a validated-form path and a pre-validated direct path.
 * PlanForm's reducer -> form sync (its "changed from outside the form"
 * effect) picks up the change and keeps the number inputs in the form in
 * sync automatically.
 */
export function WhatIfSliders() {
  const { state, dispatch } = usePlanEditor()
  const { plan } = state

  function patch(mutate: (p: typeof plan) => typeof plan) {
    dispatch({ type: 'PATCH_PLAN', patch: mutate })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What if…</CardTitle>
        <CardDescription>Drag to explore — the result updates live as you move.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SliderRow
          label="Retirement age"
          value={plan.you.retireAge}
          display={String(plan.you.retireAge)}
          min={plan.you.currentAge + 1}
          max={Math.max(plan.you.currentAge + 2, plan.you.endAge - 1)}
          onChange={(v) => patch((p) => ({ ...p, you: { ...p.you, retireAge: v } }))}
        />
        <SliderRow
          label="Baseline spending"
          value={plan.spending.baseline}
          display={formatCurrency(plan.spending.baseline)}
          min={0}
          max={200000}
          step={1000}
          onChange={(v) => patch((p) => ({ ...p, spending: { ...p.spending, baseline: v } }))}
        />
        <SliderRow
          label="Social Security claim age"
          value={plan.strategy.ssClaimAge}
          display={String(plan.strategy.ssClaimAge)}
          min={62}
          max={70}
          onChange={(v) => patch((p) => ({ ...p, strategy: { ...p.strategy, ssClaimAge: v } }))}
        />
      </CardContent>
    </Card>
  )
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-navy">{label}</span>
        <span className="text-sm text-muted" aria-hidden="true">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        aria-label={label}
        aria-valuetext={display}
      />
    </div>
  )
}
