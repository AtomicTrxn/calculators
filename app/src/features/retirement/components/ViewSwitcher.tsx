import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

/**
 * The toggle between the working Planner and the in-app "Design
 * decisions" page. Each Planner section has a matching entry there
 * explaining how it's built and why (decisions/content.ts) — this is the
 * one control that switches between "using it" and "reading about it."
 */
export function ViewSwitcher() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-frost text-white' : 'text-navy hover:bg-line')

  return (
    <div className="inline-flex gap-1 rounded-md border border-line bg-paper p-1 print:hidden" role="group" aria-label="Switch between the planner and the design decisions page">
      <NavLink to="/retirement" end className={linkClass}>
        Planner
      </NavLink>
      <NavLink to="/retirement/decisions" className={linkClass}>
        Design decisions
      </NavLink>
    </div>
  )
}
