import { useId } from 'react'
import { Controller, useFormContext, type FieldErrors, type FieldPath } from 'react-hook-form'
import { NumericFormat } from 'react-number-format'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { PlanState } from '../../schema/plan.schema'

interface NumberFieldProps {
  name: FieldPath<PlanState>
  label: string
  hint?: string
  step?: number
  min?: number
  max?: number
  suffix?: string
  /** Dollar amounts get live thousands-separator formatting as you type (e.g. 12000 -> 12,000). */
  currency?: boolean
}

/**
 * One labeled numeric input, wired to RHF's context and carrying its own
 * error announcement. Centralizing the label/error/aria-describedby wiring
 * here — rather than repeating it per field — is what makes the
 * accessibility pass (docs/retirement-react-rewrite-plan.md §3.5)
 * consistent across ~40 fields instead of hand-checked per instance.
 *
 * Currency fields (`currency`) render as a NumericFormat text input
 * instead of a native `type="number"` input: native number inputs can't
 * show thousands separators while typing, and their browser spin buttons
 * were colliding with the `$`/`$/yr` suffix label. Non-currency numeric
 * fields (ages, rates, iteration counts) keep the native input — the spin
 * buttons for those are hidden globally (styles/globals.css) so they stop
 * overlapping any suffix too, without losing keyboard up/down-arrow
 * stepping.
 */
export function NumberField({ name, label, hint, step = 1, min, max, suffix, currency }: NumberFieldProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<PlanState>()
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const error = getFieldError(errors, name)
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const inputClassName = cn(suffix && 'pr-14')

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {currency ? (
          <Controller
            name={name}
            control={control}
            render={({ field }) => (
              <NumericFormat
                id={id}
                customInput={Input}
                className={inputClassName}
                thousandSeparator=","
                decimalScale={2}
                allowNegative={min === undefined || min < 0}
                inputMode="decimal"
                value={typeof field.value === 'number' ? field.value : ''}
                onValueChange={(values) => field.onChange(values.floatValue ?? 0)}
                onBlur={field.onBlur}
                aria-invalid={!!error}
                aria-describedby={describedBy}
              />
            )}
          />
        ) : (
          <Input
            id={id}
            type="number"
            step={step}
            min={min}
            max={max}
            className={inputClassName}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            {...register(name, { valueAsNumber: true })}
          />
        )}
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}
    </div>
  )
}

function getFieldError(errors: FieldErrors<PlanState>, name: string): string | undefined {
  const parts = name.split('.')
  let cursor: unknown = errors
  for (const p of parts) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[p]
  }
  if (cursor && typeof cursor === 'object' && 'message' in cursor) {
    const message = (cursor as { message?: unknown }).message
    return typeof message === 'string' ? message : undefined
  }
  return undefined
}
