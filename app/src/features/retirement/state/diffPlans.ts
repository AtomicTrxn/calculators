import type { PlanState } from '../schema/plan.schema'

export interface PlanDiffEntry {
  path: string
  a: unknown
  b: unknown
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Field-level diff between two plans — the mechanism behind the scenario
 * compare view's "what actually changed" table (E2, plan §6). Walks
 * objects recursively; arrays are compared by JSON equality rather than
 * element-by-element, since a changed income line or expense item is more
 * useful reported as "the whole list changed" than as a confusing
 * per-index diff.
 */
export function diffPlans(a: PlanState, b: PlanState): PlanDiffEntry[] {
  const entries: PlanDiffEntry[] = []

  function walk(path: string, av: unknown, bv: unknown) {
    if (isPlainObject(av) && isPlainObject(bv)) {
      const keys = new Set([...Object.keys(av), ...Object.keys(bv)])
      for (const key of keys) walk(path ? `${path}.${key}` : key, av[key], bv[key])
      return
    }
    const equal = Array.isArray(av) || Array.isArray(bv) ? JSON.stringify(av) === JSON.stringify(bv) : av === bv
    if (!equal) entries.push({ path, a: av, b: bv })
  }

  walk('', a, b)
  return entries
}
