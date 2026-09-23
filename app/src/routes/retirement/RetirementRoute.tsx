import { lazy } from 'react'

/**
 * The `React.lazy` boundary itself — see
 * docs/retirement-react-rewrite-plan.md §3.4. Scaffolded now, before a
 * second tool exists, so adding one later (Group Expense Tracker) is
 * purely additive: a sibling lazy import here, not a refactor of this one.
 */
export const RetirementRoute = lazy(() => import('../../features/retirement/RetirementPage').then((m) => ({ default: m.RetirementPage })))
