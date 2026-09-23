import { useId } from 'react'
import { Controller, useFormContext, type FieldPath } from 'react-hook-form'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PlanState } from '../../schema/plan.schema'

export function SelectField({
  name,
  label,
  options,
}: {
  name: FieldPath<PlanState>
  label: string
  options: readonly { value: string; label: string }[]
}) {
  const { control } = useFormContext<PlanState>()
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select value={String(field.value)} onValueChange={field.onChange}>
            <SelectTrigger id={id} onBlur={field.onBlur}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}
