import { useId } from 'react'
import { Controller, useFormContext, type FieldPath } from 'react-hook-form'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PlanState } from '../../schema/plan.schema'

export function SwitchField({ name, label, hint }: { name: FieldPath<PlanState>; label: string; hint?: string }) {
  const { control } = useFormContext<PlanState>()
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <Controller
        name={name}
        control={control}
        render={({ field }) => <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} />}
      />
    </div>
  )
}
