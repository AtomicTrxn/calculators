import { Moon, Printer, Sun, SunMoon } from 'lucide-react'
import { useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/useTheme'
import { exportPlanJson, importPlanJson } from '../persistence/importExport'
import { useShareLink } from '../persistence/shareLink'
import { usePlanEditor } from '../state/PlanContext'

const THEME_ICON = { light: Sun, dark: Moon, system: SunMoon } as const

export function Toolbar() {
  const { state, dispatch } = usePlanEditor()
  const { theme, setTheme } = useTheme()
  const share = useShareLink(state.plan)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [importIssues, setImportIssues] = useState<string[] | null>(null)
  const ThemeIcon = THEME_ICON[theme]

  function cycleTheme() {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  /**
   * Which printable report (PrintSummary.tsx / PrintOnePageSummary.tsx)
   * shows is chosen by this attribute, not React state — globals.css reads
   * it under `@media print`. A plain DOM write takes effect immediately,
   * unlike React state, which wouldn't have committed to the DOM yet by
   * the time the very next line calls window.print().
   */
  function printAs(mode: 'detailed' | 'summary') {
    document.documentElement.dataset.printMode = mode
    window.print()
  }

  function downloadJson() {
    const blob = new Blob([exportPlanJson(state.plan)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'retirement-plan.json'
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus('Exported retirement-plan.json')
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const result = importPlanJson(text)
    if (result.success) {
      dispatch({ type: 'LOAD_PLAN', plan: result.plan })
      setImportIssues(null)
      setStatus('Plan imported.')
    } else {
      setImportIssues(result.issues.map((i) => `${i.path}: ${i.message}`))
      setStatus(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void share.share()}>
          {share.url && typeof navigator.share === 'function' ? 'Share link' : 'Copy share link'}
        </Button>
        {share.isTooLong && <span className="text-xs text-warn">This link is long — consider exporting JSON instead.</span>}
        <Button type="button" variant="secondary" size="sm" onClick={downloadJson}>
          Export JSON
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          Import JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleImportFile(file)
          }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => printAs('detailed')}>
          <Printer className="h-4 w-4" /> Print detailed report
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => printAs('summary')}>
          <Printer className="h-4 w-4" /> Print 1-page summary
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm('Reset to a blank default plan? This clears the current inputs (saved scenarios are kept).')) dispatch({ type: 'RESET_PLAN' })
          }}
        >
          Reset plan
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Theme: ${theme}. Click to change.`} onClick={cycleTheme}>
          <ThemeIcon className="h-4 w-4" />
        </Button>
        <Badge variant="neutral" className="ml-auto">
          ⚛ React
        </Badge>
      </div>
      <div role="status" aria-live="polite" className="text-xs text-muted">
        {status}
      </div>
      {importIssues && (
        <div role="alert" className="rounded-md border border-coral/40 bg-coral/5 p-3 text-xs text-coral">
          <p className="mb-1 font-medium">Import failed — field-level errors:</p>
          <ul className="list-disc pl-4">
            {importIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
