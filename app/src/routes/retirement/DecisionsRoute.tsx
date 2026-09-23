import { lazy } from 'react'

/** Lazy boundary for the design-decisions page — same pattern as RetirementRoute, kept as its own chunk since most visits won't need it. */
export const DecisionsRoute = lazy(() => import('../../features/retirement/DecisionsPage').then((m) => ({ default: m.DecisionsPage })))
