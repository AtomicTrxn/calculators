import { ArrowDown, ArrowUp } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { AccountKey } from '../../schema/account.schema'
import type { PlanState } from '../../schema/plan.schema'
import { NumberField } from './NumberField'
import { SelectField } from './SelectField'
import { SwitchField } from './SwitchField'

const WITHDRAWAL_METHOD_OPTIONS = [
  { value: 'fixedReal', label: 'Fixed, inflation-adjusted' },
  { value: 'fourPercent', label: '4% rule' },
  { value: 'guardrails', label: 'Guardrails (Guyton-Klinger)' },
] as const

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  taxable: 'Taxable',
  traditional: 'Traditional',
  roth: 'Roth',
  cash: 'Cash',
  hsa: 'HSA',
}

export function StrategyForm() {
  const { control, setValue } = useFormContext<PlanState>()
  // A primitive string[] field — useFieldArray requires object elements, so
  // reordering goes through setValue directly instead.
  const order = useWatch({ control, name: 'strategy.withdrawalOrder' })
  const legacyEnabled = useWatch({ control, name: 'legacy.enabled' })

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    setValue('strategy.withdrawalOrder', next, { shouldDirty: true, shouldValidate: true })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal strategy</CardTitle>
        <CardDescription>How the plan draws down accounts, and when Social Security starts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="sr-only">Claiming and simulation settings</legend>
          <SelectField name="strategy.withdrawalMethod" label="Withdrawal method" options={WITHDRAWAL_METHOD_OPTIONS} />
          <NumberField name="strategy.ssClaimAge" label="Social Security claim age" min={62} max={70} />
          <NumberField name="strategy.monteCarloIterations" label="Monte Carlo iterations" min={100} max={50000} step={100} />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-navy">Withdrawal order</legend>
          <p className="mb-2 text-xs text-muted">Accounts are drawn from top to bottom; RMDs are still enforced regardless of order.</p>
          <ol className="flex flex-col gap-2">
            {order.map((key, index) => (
              <li key={key} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                <span>
                  {index + 1}. {ACCOUNT_LABELS[key]}
                </span>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${ACCOUNT_LABELS[key]} earlier`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${ACCOUNT_LABELS[key]} later`}
                    disabled={index === order.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        </fieldset>

        <Separator />

        <SwitchField name="legacy.enabled" label="Legacy goal" hint="Leave a target amount for your heirs — used by the &ldquo;retire by age&rdquo; solver below." />
        {legacyEnabled && (
          <fieldset className="grid grid-cols-2 gap-3 sm:max-w-xs">
            <legend className="sr-only">Legacy goal</legend>
            <NumberField name="legacy.amountPerHeir" label="Per heir" suffix="$" currency min={0} />
            <NumberField name="legacy.heirs" label="Heirs" min={0} max={20} />
          </fieldset>
        )}
      </CardContent>
    </Card>
  )
}
