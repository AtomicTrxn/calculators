import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { projectDeterministic } from '../../engine/projection'
import { runMonteCarlo, verdict } from '../../engine/monteCarlo'
import { diffPlans } from '../../state/diffPlans'
import { usePlanEditor } from '../../state/PlanContext'

/**
 * Generalizes the legacy calculator's fixed two-slot A/B compare to N
 * named scenarios (E2, docs/retirement-react-rewrite-plan.md §6) — save
 * as many as you like, then pick any two to see exactly what differs and
 * how the outcomes diverge.
 */
export function ScenarioCompare() {
  const { state, dispatch } = usePlanEditor()
  const [name, setName] = useState('')

  function saveScenario() {
    const trimmed = name.trim() || `Scenario ${state.scenarios.length + 1}`
    dispatch({ type: 'SAVE_SCENARIO', id: crypto.randomUUID(), name: trimmed })
    setName('')
  }

  function toggleCompare(id: string) {
    const selected = state.compareSelection.includes(id) ? state.compareSelection.filter((x) => x !== id) : [...state.compareSelection, id]
    dispatch({ type: 'SET_COMPARE_SELECTION', ids: selected })
  }

  const [selectedA, selectedB] = state.compareSelection.map((id) => state.scenarios.find((s) => s.id === id)).filter(Boolean)

  const diffs = useMemo(() => (selectedA && selectedB ? diffPlans(selectedA.plan, selectedB.plan) : []), [selectedA, selectedB])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare scenarios</CardTitle>
        <CardDescription>Save the current plan under a name, then pick any two saved scenarios to see what differs.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input placeholder={`Scenario ${state.scenarios.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} aria-label="New scenario name" />
          <Button type="button" onClick={saveScenario}>
            Save current as scenario
          </Button>
        </div>

        {state.scenarios.length > 0 && (
          <ul className="flex flex-col gap-2">
            {state.scenarios.map((s) => {
              const det = projectDeterministic(s.plan)
              const checked = state.compareSelection.includes(s.id)
              return (
                <li key={s.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-frost"
                      checked={checked}
                      disabled={!checked && state.compareSelection.length >= 2}
                      onChange={() => toggleCompare(s.id)}
                      aria-label={`Select ${s.name} for comparison`}
                    />
                    <span className="font-medium text-navy">{s.name}</span>
                    <span className="text-xs text-muted">retire at {s.plan.you.retireAge}, end balance {formatCurrency(det.endBalance)}</span>
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: 'DELETE_SCENARIO', id: s.id })}>
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {selectedA && selectedB && <ScenarioDiff nameA={selectedA.name} nameB={selectedB.name} planA={selectedA.plan} planB={selectedB.plan} diffs={diffs} />}
      </CardContent>
    </Card>
  )
}

function ScenarioDiff({
  nameA,
  nameB,
  planA,
  planB,
  diffs,
}: {
  nameA: string
  nameB: string
  planA: ReturnType<typeof usePlanEditor>['state']['plan']
  planB: ReturnType<typeof usePlanEditor>['state']['plan']
  diffs: ReturnType<typeof diffPlans>
}) {
  const mcA = runMonteCarlo(planA, { iterations: 300, seed: 42 })
  const mcB = runMonteCarlo(planB, { iterations: 300, seed: 42 })

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-medium text-navy">{nameA}</p>
          <p className="text-muted">
            {Math.round(mcA.successRate * 100)}% success ({verdict(mcA.successRate).label})
          </p>
        </div>
        <div>
          <p className="font-medium text-navy">{nameB}</p>
          <p className="text-muted">
            {Math.round(mcB.successRate * 100)}% success ({verdict(mcB.successRate).label})
          </p>
        </div>
      </div>
      {diffs.length === 0 ? (
        <p className="text-xs text-muted">These scenarios are identical.</p>
      ) : (
        <table className="w-full text-xs">
          <caption className="sr-only">
            Field differences between {nameA} and {nameB}
          </caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 pr-2">
                Field
              </th>
              <th scope="col" className="py-1 pr-2">
                {nameA}
              </th>
              <th scope="col" className="py-1">
                {nameB}
              </th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.path} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-navy">
                  {d.path}
                </th>
                <td className="py-1 pr-2">{String(d.a)}</td>
                <td className="py-1">{String(d.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
