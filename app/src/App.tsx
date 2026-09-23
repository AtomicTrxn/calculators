import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { DecisionsRoute, RetirementRoute } from './routes/retirement'

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted" role="status" aria-live="polite">
      Loading…
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/retirement" replace />} />
          <Route path="/retirement" element={<RetirementRoute />} />
          <Route path="/retirement/decisions" element={<DecisionsRoute />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
