import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberField } from './NumberField'

export function AboutYouForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="sr-only">About you — ages that anchor the plan</legend>
          <NumberField name="you.currentAge" label="Current age" min={0} max={120} />
          <NumberField name="you.retireAge" label="Planned retirement age" min={0} max={120} />
          <NumberField name="you.endAge" label="End-of-plan age" hint="Life expectancy — default is intentionally long." min={1} max={120} />
        </fieldset>
      </CardContent>
    </Card>
  )
}
