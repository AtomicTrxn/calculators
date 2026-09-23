import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { NumberField } from './NumberField'

export function AssumptionsForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assumptions</CardTitle>
        <CardDescription>Always visible, always editable — never hidden constants.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="sr-only">Return, inflation, and tax assumptions</legend>
          <NumberField name="assumptions.returnAccum" label="Return (accumulation)" step={0.001} suffix="/yr" />
          <NumberField name="assumptions.returnRetire" label="Return (retirement)" step={0.001} suffix="/yr" />
          <NumberField name="assumptions.inflation" label="General inflation" step={0.001} suffix="/yr" />
          <NumberField name="assumptions.medicalInflation" label="Medical inflation" step={0.001} suffix="/yr" />
          <NumberField name="assumptions.volatility" label="Return volatility" step={0.001} min={0} hint="Std-dev, drives the Monte Carlo fan chart." />
          <NumberField name="assumptions.taxRate" label="Effective tax rate" step={0.001} min={0} max={0.9} />
          <NumberField name="assumptions.taxableGainFraction" label="Taxable gain fraction" step={0.01} min={0} max={1} hint="Share of a taxable withdrawal treated as a gain." />
          <NumberField name="assumptions.contributionGrowth" label="Contribution growth" step={0.001} />
        </fieldset>
      </CardContent>
    </Card>
  )
}
