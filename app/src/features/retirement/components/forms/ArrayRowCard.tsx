import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Shared shell for one row of a dynamic list (income lines, itemized
 * expenses, one-off events) — a bordered fieldset with the delete button
 * pinned top-right via flexbox, not grid. Earlier these rows each crammed
 * 6+ fields into one `grid-cols-6`, which looked fine at full viewport
 * width but these cards actually render inside the Planner's ~650px-wide
 * left column (a two-column page layout), so labels and select values
 * truncated badly and, when the row wrapped, the delete button ended up
 * floating disconnected from its row instead of staying in a fixed spot.
 * Pinning it here means the fields inside can wrap onto as many lines as
 * they need without ever dragging the delete control around with them.
 */
export function ArrayRowCard({ legend, onRemove, removeLabel, children }: { legend: string; onRemove: () => void; removeLabel: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="sr-only">{legend}</legend>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <Button type="button" variant="ghost" size="icon" aria-label={removeLabel} onClick={onRemove} className="mt-6 shrink-0">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </fieldset>
  )
}
