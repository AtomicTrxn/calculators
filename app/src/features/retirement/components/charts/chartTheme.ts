import type { CSSProperties } from 'react'

/**
 * Recharts' <Tooltip> renders its own popover outside Tailwind's utility
 * classes and defaults to a hardcoded white background with no explicit
 * text color — in dark mode the surrounding page's inherited (near-white)
 * text color lands on that white background, making the tooltip's age and
 * values almost unreadable. These props wire the tooltip's colors to the
 * same design tokens as everything else, so it inverts with the rest of
 * the page instead of staying stuck light.
 */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: 'var(--color-paper)',
    border: '1px solid var(--color-line)',
    borderRadius: '6px',
    color: 'var(--color-navy)',
  } satisfies CSSProperties,
  labelStyle: { color: 'var(--color-navy)' } satisfies CSSProperties,
  itemStyle: { color: 'var(--color-navy)' } satisfies CSSProperties,
}
