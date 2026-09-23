import { useMemo } from 'react'

import { AboutYouForm } from './components/forms/AboutYouForm'
import { AccountsForm } from './components/forms/AccountsForm'
import { IncomeForm } from './components/forms/IncomeForm'
import { PlanForm } from './components/forms/PlanForm'
import { SpendingForm } from './components/forms/SpendingForm'
import { AssumptionsForm } from './components/forms/AssumptionsForm'
import { StrategyForm } from './components/forms/StrategyForm'
import { WhatIfSliders } from './components/forms/WhatIfSliders'
import { FanChart } from './components/charts/FanChart'
import { ProjectionChart } from './components/charts/ProjectionChart'
import { RmdTimelineChart } from './components/charts/RmdTimelineChart'
import { PrintOnePageSummary } from './components/PrintOnePageSummary'
import { PrintSummary } from './components/PrintSummary'
import { LegacyGoalCard } from './components/results/LegacyGoalCard'
import { ScenarioCompare } from './components/results/ScenarioCompare'
import { Toolbar } from './components/Toolbar'
import { ViewSwitcher } from './components/ViewSwitcher'
import { VerdictCard } from './components/results/VerdictCard'
import { YearByYearTable } from './components/results/YearByYearTable'
import { projectDeterministic } from './engine/projection'
import { useLegacyAgeSolver } from './hooks/useLegacyAgeSolver'
import { useMonteCarloSimulation } from './hooks/useMonteCarloSimulation'
import { PlanProvider, usePlanEditor } from './state/PlanContext'
import { usePlanPersistence } from './state/usePlanPersistence'

export function RetirementPage() {
  return (
    <PlanProvider>
      <RetirementPageContent />
    </PlanProvider>
  )
}

function RetirementPageContent() {
  usePlanPersistence()
  const { state } = usePlanEditor()
  const mc = useMonteCarloSimulation(state.plan)
  const legacySolver = useLegacyAgeSolver()
  const det = useMemo(() => projectDeterministic(state.plan), [state.plan])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Retirement plan calculators — React</p>
            <h1 className="font-serif text-3xl text-navy">Retirement Planner</h1>
            <p className="mt-1 text-sm text-muted">Project savings year by year and run Monte Carlo simulations to see how likely your plan is to last.</p>
          </div>
          <ViewSwitcher />
        </div>
        <Toolbar />
      </header>

      <PlanForm>
        <div className="grid grid-cols-1 gap-6 print:hidden lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <AboutYouForm />
            <AccountsForm />
            <IncomeForm />
            <SpendingForm />
            <AssumptionsForm />
            <StrategyForm />
          </div>
          <div className="flex flex-col gap-6">
            <WhatIfSliders />
            <VerdictCard result={mc.result} isStale={mc.isStale} progress={mc.progress} />
            <LegacyGoalCard plan={state.plan} solver={legacySolver} />
            {mc.error && (
              <div role="alert" className="rounded-md border border-coral/40 bg-coral/5 p-3 text-xs text-coral">
                The simulation failed: {mc.error}
              </div>
            )}
          </div>
        </div>
      </PlanForm>

      <div className="flex flex-col gap-6 print:hidden">
        <ProjectionChart rows={det.rows} />
        {mc.result && <FanChart bands={mc.result.bands} />}
        <RmdTimelineChart rows={det.rows} />
        <YearByYearTable rows={det.rows} />
        <ScenarioCompare />
      </div>

      <PrintSummary plan={state.plan} rows={det.rows} mc={mc.result} legacyAges={legacySolver.ages} />
      <PrintOnePageSummary plan={state.plan} rows={det.rows} mc={mc.result} legacyAges={legacySolver.ages} />
    </div>
  )
}
