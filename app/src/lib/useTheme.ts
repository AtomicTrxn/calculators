import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'retirement-planner-react.theme'

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

/** E5 — dark mode (docs/retirement-react-rewrite-plan.md §6): a three-way toggle over the `data-theme` attribute the CSS variables in styles/globals.css already key off. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => apply(theme), [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // private mode — theme just won't persist across reloads
    }
  }, [])

  return { theme, setTheme }
}
