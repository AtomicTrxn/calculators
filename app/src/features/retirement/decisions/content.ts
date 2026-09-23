export interface DecisionSection {
  id: string
  title: string
  /** What this section of the app does, in plain terms. */
  what: string
  /** The concrete implementation — hooks, libraries, patterns used. */
  how: string
  /** Why it was built that way, including alternatives considered and rejected. */
  why: string
}

/**
 * Content for the in-app "Design decisions" page — one entry per visible
 * section of the Planner, in the same order they appear there, plus a
 * couple of cross-cutting entries (state sync, testing) that don't belong
 * to one card. This is the condensed, in-app companion to the full
 * writeup in docs/retirement-react-rewrite-plan.md; keep entries short
 * enough to read in place rather than reproducing that document.
 */
export const decisionSections: DecisionSection[] = [
  {
    id: 'about-you',
    title: 'About you',
    what: 'The three ages the entire plan pivots on: how old you are now, when you plan to retire, and how long the plan should assume you’ll live.',
    how: 'A plain React Hook Form fieldset with three number fields, validated on blur by the Zod plan schema (retire age can’t be absurd, end age must be after both).',
    why: 'No special pattern needed here — the point is these three fields are exactly as simple as they look, which is a deliberate contrast with sections further down that do need extra machinery.',
  },
  {
    id: 'accounts',
    title: 'Savings & contributions',
    what: 'Current balances and annual contributions across five account types — taxable, traditional, Roth, cash, HSA — the granularity the tax model depends on.',
    how: 'Ten number fields wired to the same Zod-typed accounts/contributions shape the engine consumes; a separate useAccountModel hook derives allocation percentages for anything that wants to summarize this without recomputing it inline.',
    why: 'Account-type granularity is what makes the tax treatment downstream correct — a traditional dollar and a Roth dollar aren’t worth the same. Collapsing them into one “savings” number, the way basic calculators do, would silently break every projection after this point.',
  },
  {
    id: 'income',
    title: 'Retirement income',
    what: 'Guaranteed income lines — Social Security, pension, other — each with an amount, a frequency, a start age, and a cost-of-living-adjustment flag.',
    how: 'React Hook Form’s useFieldArray manages the list (add/remove rows). Each line also carries a monthly/annual frequency, mirroring the same pattern the itemized spending list already uses — the engine annualizes at simulation time (incomeAnnual in engine/income.ts), so the stored value stays in whatever unit the user actually typed.',
    why: 'Social Security and most pensions are quoted monthly on the statement you’d actually be looking at, not annually. Forcing an annual-only field meant everyone had to mentally multiply by 12 before typing; letting the unit match the source document removes a step that only existed because the original schema didn’t have this option yet.',
  },
  {
    id: 'spending',
    title: 'Spending plan',
    what: 'The anchor the withdrawal simulation subtracts guaranteed income from — flat annual spending or an itemized budget, plus optional phased spending, healthcare, long-term care, and one-off events.',
    how: 'useFieldArray for the itemized line items and one-off events; useWatch drives which subfields are visible (items vs. flat, phased/healthcare/LTC on or off) without re-rendering the whole form.',
    why: 'This is the most complex form section because the underlying financial model is genuinely the most complex — the UI complexity here is a direct reflection of the domain, not over-engineering.',
  },
  {
    id: 'assumptions',
    title: 'Assumptions',
    what: 'Return, inflation, volatility, tax rate — every number the simulation runs on, always visible and always editable.',
    how: 'Plain number fields, same pattern as About You — no conditional logic needed.',
    why: 'A deliberate transparency principle carried over from the original tool: assumptions are never hidden constants baked into the engine. Zod’s schema enforces sane ranges (e.g. tax rate capped 0–90%) rather than the UI silently clamping a value you typed.',
  },
  {
    id: 'strategy',
    title: 'Withdrawal strategy',
    what: 'Which withdrawal method to use (fixed / 4% rule / guardrails), when to claim Social Security, how many Monte Carlo iterations to run, and the order accounts are drawn from.',
    how: 'The withdrawal order is a plain string array, not an array of objects — useFieldArray requires object elements, so reordering goes through setValue directly, with up/down buttons rather than drag-and-drop.',
    why: 'Keyboard-only reordering was a deliberate accessibility call, not a shortcut: native drag-and-drop has no reliable keyboard equivalent, and accessibility here isn’t a checkbox — it’s whether someone who can’t use a mouse can actually build this plan.',
  },
  {
    id: 'legacy',
    title: 'Retirement age by outcome (legacy goal)',
    what: 'An optional target — a dollar amount per heir, times a number of heirs — and, on request, the earliest retirement age that still leaves that much at the end of the plan, reported separately for the pessimistic (10th percentile), typical (median), and optimistic (90th percentile) simulated outcome.',
    how: 'engine/legacySolver.ts scans candidate retirement ages one at a time (not a binary search — see the function’s own comment for why monotonicity isn’t assumed), running a full Monte Carlo at each and taking the first age where each percentile’s terminal balance clears the target. It runs in its own Web Worker instance (useLegacyAgeSolver), separate from the reactive per-edit simulation, and only on an explicit “Find my retirement age” click — a scan costs roughly as many Monte Carlo runs as there are candidate ages, so it isn’t something to rerun on every keystroke the way the headline success rate is.',
    why: 'The definition of “comfortably” here was a specific ask, not a guess: it means the terminal balance at the end of the plan (what’s actually left to inherit), checked against each of the three outcome bands separately, so a “retire at 65” answer can mean three different ages depending on how much luck you’re willing to assume.',
  },
  {
    id: 'sliders',
    title: 'What if… sliders',
    what: 'Live-draggable controls for retirement age, spending, and Social Security claim age — an upgrade of the legacy tool’s static “retire 1 year later” preset deltas into something continuously explorable.',
    how: 'These bypass React Hook Form entirely and dispatch straight to the plan reducer. A slider’s value is already valid by construction (clamped to its own min/max), so there’s no field-level validation step for RHF to own.',
    why: 'This is the concrete case for why the reducer, not the form, is the single source of truth for committed plan state: two different input mechanisms — typing in a field, dragging a slider — converge on the same dispatched action instead of needing two parallel state stores.',
  },
  {
    id: 'monte-carlo',
    title: 'Plan success probability',
    what: 'The headline number — probability the plan survives to the end age, computed from however many simulated market paths you’ve set.',
    how: 'Runs in a Web Worker over a typed message contract, not on the main thread. useDeferredValue keeps input fields responsive while a recompute is queued, and the previous result stays visible — marked stale, not blanked — while the new one computes.',
    why: 'The legacy calculator runs this synchronously on the main thread after a short debounce — a real, measured freeze on every settled edit (thousands of simulated years, plus more for its sensitivity nudges). Moving it off-thread was the one decision the original tool’s own plan explicitly left unresolved; this is where it gets resolved.',
  },
  {
    id: 'charts',
    title: 'Charts',
    what: 'The projection curve, the Monte Carlo outcome fan, and the RMD timeline.',
    how: 'Recharts, fed by small pure functions (toProjectionData, toFanData, toRmdData) that map hook output to chart props — those functions are what get unit tested, not Recharts’ own rendering.',
    why: 'Every chart has a non-visual fallback: the projection curve’s fallback is the year-by-year table already on screen; the fan and RMD charts carry a descriptive label summarizing the same data in words, since there’s no simpler existing table to point to for those two.',
  },
  {
    id: 'table',
    title: 'Year by year',
    what: 'The full audit trail — every year’s balance, income, spending, withdrawal, and tax — the thing that makes the headline number checkable rather than a black box.',
    how: 'A real HTML table, not styled divs, so row and column semantics come from the browser for free.',
    why: 'Screen-reader users get correct table navigation without any extra ARIA work — the plainest possible choice was also the most accessible one.',
  },
  {
    id: 'scenarios',
    title: 'Compare scenarios',
    what: 'Save the current plan under a name, then compare any two side by side with a field-level diff.',
    how: 'Scenarios live as a named array in the same reducer, generalizing the legacy tool’s fixed two-slot A/B compare to as many as you want to save, not just two. The diff is a small recursive walk that treats a changed array (like an edited income list) as one changed field rather than diffing it index by index.',
    why: 'A full object-level diff would be noisier than useful for arrays — knowing “the income lines are different” is more useful here than a line-by-line index comparison that shifts every entry when one row is inserted.',
  },
  {
    id: 'toolbar',
    title: 'Share link, import/export, print, theme',
    what: 'Copy or share a link that reproduces the plan with no server, export/import the plan as JSON, print a report, toggle dark mode.',
    how: 'The share link reuses the legacy tool’s compression approach (deflate + base64url in the URL hash) wrapped in a useShareLink hook instead of imperative global functions. Import reuses the same Zod schema already validating the forms, so a bad file reports exactly which field failed instead of an all-or-nothing rollback. Dark mode is CSS custom properties re-pointed under a data-theme attribute, so no individual component needed a dark: variant.',
    why: 'A shorter share link than deflate+base64 isn’t achievable without a backend, which is explicitly out of scope for this app — so “better, in React” here means better encapsulated (a hook, testable in isolation) and paired with the Web Share API on mobile, not a shorter URL.',
  },
  {
    id: 'sync',
    title: 'How the form and the plan state stay in sync',
    what: 'Every field above ultimately reads from and writes to one plan object held in a reducer, not scattered across components.',
    how: 'Two one-way syncs, not one shared object: the form parses its values through the Zod schema and dispatches the result to the reducer; the reducer resets the form whenever the plan changes from outside it — a scenario loaded, a slider dragged, a share link applied.',
    why: 'An earlier version of this used object-reference equality to avoid syncing in a loop, and it was wrong: Zod always returns a freshly-constructed object even for already-valid input, so === can never answer “did I already see this.” That caused a real infinite-render bug, caught by actually clicking through the app in a browser, not by tests or the type checker. The fix is an explicit flag marking “this update came from me, don’t echo it back” — documented here because it’s the one bug in this codebase that was genuinely non-obvious.',
  },
  {
    id: 'testing',
    title: 'Testing strategy',
    what: 'The engine and schema get near-exhaustive coverage; hooks are tested via renderHook; forms are tested through user-facing interaction, not internal state shape.',
    how: 'The engine’s test suite is a parity oracle: every ported function is checked against the same hand-computed numbers the original vanilla engine’s own tests use, plus independent cross-checks run directly against that live legacy engine’s output for the same inputs.',
    why: 'A rendering smoke test proves nothing about whether the Monte Carlo math or the tax treatment is actually right. The simulation engine is this tool’s real credibility, so that’s where the testing effort concentrates — not spread evenly across every file just to hit a coverage number.',
  },
]
