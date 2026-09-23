import { useCallback, useEffect, useRef, useState } from 'react'

import { compactState, expandState } from '../engine/shareCodec'
import type { PlanState } from '../schema/plan.schema'
import { compressJson, decompressJson } from './compression'

/** Above this, the URL is unwieldy in most browsers/chat apps — the legacy tool warns and suggests export instead; this hook exposes the same signal. */
const LONG_LINK_THRESHOLD = 1800

export function planFromShareUrl(): Promise<PlanState | null> {
  const match = /^#plan=(.+)$/.exec(location.hash)
  if (!match) return Promise.resolve(null)
  return decompressJson(decodeURIComponent(match[1]!))
    .then((compact) => expandState(compact))
    .catch(() => null) // a broken/foreign hash is surfaced as "no shared plan", not a crash
}

export interface UseShareLink {
  url: string | null
  isTooLong: boolean
  copy: () => Promise<boolean>
  /** Uses the Web Share API on mobile when available, falling back to copy. */
  share: () => Promise<boolean>
}

/**
 * Owns building and offering the share link for the current plan — see
 * docs/retirement-react-rewrite-plan.md §3.7. Debounced the same way the
 * legacy tool debounces its hash writes, but expressed as a hook effect
 * rather than a module-level timer.
 */
export function useShareLink(plan: PlanState, debounceMs = 400): UseShareLink {
  const [url, setUrl] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      compressJson(compactState(plan)).then((payload) => {
        const u = new URL(location.href)
        u.hash = `plan=${encodeURIComponent(payload)}`
        setUrl(u.toString())
      })
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [plan, debounceMs])

  const copy = useCallback(async () => {
    if (!url) return false
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }, [url])

  const share = useCallback(async () => {
    if (!url) return false
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title: 'Retirement plan' })
        return true
      } catch {
        return false // user cancelled the native share sheet — not an error
      }
    }
    return copy()
  }, [url, copy])

  return { url, isTooLong: (url?.length ?? 0) > LONG_LINK_THRESHOLD, copy, share }
}
