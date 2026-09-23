import { Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { PlanState } from '../../schema/plan.schema'
import { ArrayRowCard } from './ArrayRowCard'
import { NumberField } from './NumberField'
import { SelectField } from './SelectField'
import { SwitchField } from './SwitchField'

const CATEGORY_OPTIONS = [
  { value: 'housing', label: 'Housing' },
  { value: 'transport', label: 'Transport' },
  { value: 'living', label: 'Living' },
  { value: 'leisure', label: 'Leisure' },
  { value: 'other', label: 'Other' },
] as const

const FREQUENCY_OPTIONS = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
] as const

// Short labels for the closed select trigger — the field's own "Inflation"
// label already gives the context, so the options don't need to repeat it.
const INFLATION_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'medical', label: 'Medical' },
  { value: 'fixed', label: 'Fixed' },
] as const

export function SpendingForm() {
  const { control, register } = useFormContext<PlanState>()
  const mode = useWatch({ control, name: 'spending.mode' })
  const phasedEnabled = useWatch({ control, name: 'spending.phased.enabled' })
  const healthcareEnabled = useWatch({ control, name: 'spending.healthcare.enabled' })
  const ltcEnabled = useWatch({ control, name: 'spending.ltc.enabled' })

  const items = useFieldArray({ control, name: 'spending.items' })
  const oneOffs = useFieldArray({ control, name: 'spending.oneOffs' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending plan</CardTitle>
        <CardDescription>What you actually plan to spend in retirement — the anchor the rest of the plan withdraws to cover.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-navy" id="spending-mode-label">
            Budget mode
          </span>
          <div role="radiogroup" aria-labelledby="spending-mode-label" className="flex gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="flat" className="accent-frost" {...register('spending.mode')} /> Flat amount
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="items" className="accent-frost" {...register('spending.mode')} /> Itemized budget
            </label>
          </div>
        </div>

        {mode === 'flat' && <NumberField name="spending.baseline" label="Baseline annual spending" hint="Today's dollars." suffix="$/yr" currency min={0} />}

        {mode === 'items' && (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-navy">Itemized expenses</legend>
            {items.fields.length === 0 && <p className="text-xs text-muted">No line items yet — yearly living costs are zero until you add some.</p>}
            {items.fields.map((field, index) => (
              <ArrayRowCard
                key={field.id}
                legend={`Expense line ${index + 1}`}
                removeLabel={`Remove ${field.label || `expense ${index + 1}`}`}
                onRemove={() => items.remove(index)}
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-navy" htmlFor={`item-${index}-label`}>
                    Label
                  </label>
                  <input
                    id={`item-${index}-label`}
                    className="flex h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy"
                    {...register(`spending.items.${index}.label` as const)}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SelectField name={`spending.items.${index}.category`} label="Category" options={CATEGORY_OPTIONS} />
                  <NumberField name={`spending.items.${index}.amount`} label="Amount" suffix="$" currency min={0} />
                  <SelectField name={`spending.items.${index}.frequency`} label="Frequency" options={FREQUENCY_OPTIONS} />
                  <SelectField name={`spending.items.${index}.inflation`} label="Inflation" options={INFLATION_OPTIONS} />
                </div>
                <div className="mt-3 grid max-w-xs grid-cols-2 gap-3">
                  <NumberField name={`spending.items.${index}.startAge`} label="Start age" hint="Optional" min={0} max={120} />
                  <NumberField name={`spending.items.${index}.endAge`} label="End age" hint="Optional" min={0} max={120} />
                </div>
              </ArrayRowCard>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                items.append({ label: `Expense ${items.fields.length + 1}`, category: 'other', amount: 0, frequency: 'annual', inflation: 'general', startAge: null, endAge: null })
              }
            >
              <Plus className="h-4 w-4" /> Add expense line
            </Button>
          </fieldset>
        )}

        <Separator />

        <SwitchField name="spending.phased.enabled" label="Phased spending" hint="Distinct go-go / slow-go / no-go budgets by age, instead of one flat line." />
        {phasedEnabled && (
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <legend className="sr-only">Phased spending bands</legend>
            <NumberField name="spending.phased.goGo" label="Go-go" suffix="$/yr" currency min={0} />
            <NumberField name="spending.phased.slowGo" label="Slow-go" suffix="$/yr" currency min={0} />
            <NumberField name="spending.phased.noGo" label="No-go" suffix="$/yr" currency min={0} />
            <NumberField name="spending.phased.slowGoAge" label="Slow-go starts at" min={0} max={120} />
            <NumberField name="spending.phased.noGoAge" label="No-go starts at" min={0} max={120} />
          </fieldset>
        )}

        <Separator />

        <SwitchField name="spending.healthcare.enabled" label="Healthcare" hint="Pre-Medicare premium gap, then Medicare + IRMAA." />
        {healthcareEnabled && (
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="sr-only">Healthcare costs</legend>
            <NumberField name="spending.healthcare.preMedicarePremium" label="Pre-Medicare premium" suffix="$/yr" currency min={0} />
            <NumberField name="spending.healthcare.medicareAnnual" label="Medicare annual" suffix="$/yr" currency min={0} />
            <NumberField name="spending.healthcare.irmaaTier" label="IRMAA tier" min={0} max={5} hint="0 = no surcharge, up to 5." />
            <NumberField name="spending.healthcare.medicalInflation" label="Medical inflation" step={0.001} suffix="/yr" />
          </fieldset>
        )}

        <Separator />

        <SwitchField name="spending.ltc.enabled" label="Long-term care" hint="A late-life annual cost for N years." />
        {ltcEnabled && (
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <legend className="sr-only">Long-term care</legend>
            <NumberField name="spending.ltc.annualCost" label="Annual cost" suffix="$/yr" currency min={0} />
            <NumberField name="spending.ltc.years" label="Duration" suffix="years" min={0} max={60} />
            <NumberField name="spending.ltc.startAge" label="Starts at age" min={0} max={120} />
          </fieldset>
        )}

        <Separator />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-navy">One-off events</legend>
          <p className="text-xs text-muted">An amount at a given age — positive for an expense, negative for an inflow (e.g. a home sale).</p>
          {oneOffs.fields.map((field, index) => (
            <ArrayRowCard
              key={field.id}
              legend={`One-off event ${index + 1}`}
              removeLabel={`Remove ${field.label || `event ${index + 1}`}`}
              onRemove={() => oneOffs.remove(index)}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-navy" htmlFor={`oneoff-${index}-label`}>
                    Label
                  </label>
                  <input
                    id={`oneoff-${index}-label`}
                    className="flex h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy"
                    {...register(`spending.oneOffs.${index}.label` as const)}
                  />
                </div>
                <NumberField name={`spending.oneOffs.${index}.amount`} label="Amount" suffix="$" currency />
                <NumberField name={`spending.oneOffs.${index}.age`} label="At age" min={0} max={120} />
              </div>
            </ArrayRowCard>
          ))}
          <Button type="button" variant="secondary" onClick={() => oneOffs.append({ label: `Event ${oneOffs.fields.length + 1}`, amount: 0, age: 70 })}>
            <Plus className="h-4 w-4" /> Add one-off event
          </Button>
        </fieldset>
      </CardContent>
    </Card>
  )
}
