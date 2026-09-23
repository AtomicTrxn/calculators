import { Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { PlanState } from '../../schema/plan.schema'
import { ArrayRowCard } from './ArrayRowCard'
import { NumberField } from './NumberField'
import { SelectField } from './SelectField'
import { SwitchField } from './SwitchField'

const INCOME_TYPE_OPTIONS = [
  { value: 'socialSecurity', label: 'Social Security' },
  { value: 'pension', label: 'Pension' },
  { value: 'other', label: 'Other' },
] as const

const INCOME_FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const

export function IncomeForm() {
  const { control } = useFormContext<PlanState>()
  const { fields, append, remove } = useFieldArray({ control, name: 'income' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retirement income</CardTitle>
        <CardDescription>
          Guaranteed income lines — each has an amount, a frequency, a start age, and a COLA flag. Enter the amount however it&apos;s actually
          quoted to you (Social Security and most pensions show a monthly figure) — the plan converts it internally.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fields.length === 0 && <p className="text-xs text-muted">No income lines yet — add Social Security, a pension, or anything else you expect to receive.</p>}
        {fields.map((field, index) => (
          <IncomeRow key={field.id} index={index} onRemove={() => remove(index)} />
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ type: 'other', label: `Income ${fields.length + 1}`, amount: 0, frequency: 'annual', startAge: 67, cola: false })}
        >
          <Plus className="h-4 w-4" /> Add income line
        </Button>
      </CardContent>
    </Card>
  )
}

function IncomeRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control, register } = useFormContext<PlanState>()
  const frequency = useWatch({ control, name: `income.${index}.frequency` })

  return (
    <ArrayRowCard legend={`Income line ${index + 1}`} removeLabel={`Remove income line ${index + 1}`} onRemove={onRemove}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField name={`income.${index}.type`} label="Type" options={INCOME_TYPE_OPTIONS} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-navy" htmlFor={`income-${index}-label`}>
            Label
          </label>
          <input
            id={`income-${index}-label`}
            className="flex h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy"
            {...register(`income.${index}.label` as const)}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SelectField name={`income.${index}.frequency`} label="Quoted" options={INCOME_FREQUENCY_OPTIONS} />
        <NumberField
          name={`income.${index}.amount`}
          label={frequency === 'monthly' ? 'Monthly amount' : 'Annual amount'}
          suffix={frequency === 'monthly' ? '$/mo' : '$/yr'}
          currency
          min={0}
        />
        <NumberField name={`income.${index}.startAge`} label="Start age" min={0} max={120} />
        <SwitchField name={`income.${index}.cola`} label="COLA" hint="Grows w/ inflation" />
      </div>
    </ArrayRowCard>
  )
}
