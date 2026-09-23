import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { decisionSections } from './decisions/content'
import { ViewSwitcher } from './components/ViewSwitcher'

/**
 * The in-app companion to docs/retirement-react-rewrite-plan.md — one
 * entry per Planner section, in the same order they appear there, so
 * "what does this do, how is it built, why" is readable right next to the
 * thing it describes instead of only in a repo file a visitor won't open.
 */
export function DecisionsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Retirement plan calculators — React</p>
            <h1 className="font-serif text-3xl text-navy">Design decisions</h1>
          </div>
          <ViewSwitcher />
        </div>
        <p className="text-sm text-muted">
          How each section of the Planner is built, and why it was built that way — one entry per section, in the order they appear there. The
          full architecture writeup, including the alternatives considered for each pattern, lives in{' '}
          <code className="rounded bg-line px-1 py-0.5 text-xs">docs/retirement-react-rewrite-plan.md</code> in the repo.
        </p>
      </header>

      <ol className="flex flex-col gap-4">
        {decisionSections.map((section, index) => (
          <li key={section.id}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{index + 1}</Badge>
                  <CardTitle>{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <DecisionField label="What it does">{section.what}</DecisionField>
                <DecisionField label="How it's built">{section.how}</DecisionField>
                <DecisionField label="Why this way">{section.why}</DecisionField>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  )
}

function DecisionField({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-navy">{children}</p>
    </div>
  )
}
