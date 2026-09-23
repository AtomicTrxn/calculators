import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { NumberField } from './NumberField'

export function AccountsForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings & contributions</CardTitle>
        <CardDescription>Balances by account type, so tax treatment downstream is correct.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <legend className="text-sm font-medium text-navy">Balances today</legend>
          <NumberField name="accounts.taxable" label="Taxable" suffix="$" currency min={0} />
          <NumberField name="accounts.traditional" label="Traditional" suffix="$" currency min={0} />
          <NumberField name="accounts.roth" label="Roth" suffix="$" currency min={0} />
          <NumberField name="accounts.cash" label="Cash" suffix="$" currency min={0} />
          <NumberField name="accounts.hsa" label="HSA" suffix="$" currency min={0} />
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <legend className="text-sm font-medium text-navy">Annual contributions</legend>
          <NumberField name="contributions.taxable" label="Taxable" suffix="$/yr" currency min={0} />
          <NumberField name="contributions.traditional" label="Traditional" suffix="$/yr" currency min={0} />
          <NumberField name="contributions.roth" label="Roth" suffix="$/yr" currency min={0} />
          <NumberField name="contributions.hsa" label="HSA" suffix="$/yr" currency min={0} />
          <NumberField name="contributions.employerMatch" label="Employer match" suffix="$/yr" currency min={0} />
        </fieldset>
      </CardContent>
    </Card>
  )
}
