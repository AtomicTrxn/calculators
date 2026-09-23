# Retirement Planner — React Rewrite: Implementation Plan

Status: **implemented** — all 5 phases built in `app/`, 78 tests passing, deployed via `.github/workflows/deploy-pages.yml` (pending the one-time Pages-source switch to "GitHub Actions" in repo settings). See the end-of-implementation summary in the PR/commit history for what shipped vs. what's a known follow-up.

## Purpose & scope

Build a standalone, modern React rewrite of the existing vanilla-JS Retirement
Planner (`retirement-calculator.html` + `retirement-engine.js`) as an
**entirely new, additive set of modules that runs side by side with the
existing calculator, permanently — not a replacement.** Nothing under the
repo root (`retirement-calculator.html`, `retirement-engine.js`, `shared.css`,
`common.js`, `plan-state.js`, the other calculators) is modified. The React
app is a portfolio piece: the goal is not just a working calculator but a
codebase that demonstrates current React architecture patterns with each
choice explicitly reasoned, ADR-style — and, per your direction, one that
goes beyond replicating the vanilla feature set where React's model
genuinely enables something better. See §6.

**Not in scope:** re-deriving or changing the financial model. The simulation
logic in `retirement-engine.js` — deterministic projection, Monte Carlo, RMDs,
tax tiers, Social Security claiming factor, withdrawal methods (fixed-real,
4%, guardrails), itemized/phased spending, healthcare/IRMAA/LTC — is proven and
correct. It gets **ported and typed**, not redesigned. No backend, no account
system, no server-side persistence; static SPA only (GitHub Pages or
Cloudflare Pages). No edits to the legacy calculator or its engine at any
point in this project.

## Context this plan is built on

Read before this plan: [`retirement-engine.js`](../retirement-engine.js) (the
engine to port), [`plan-state.js`](../plan-state.js) (the existing cross-tool
persistence/share-link layer), [`docs/retirement-calculator-plan.md`](retirement-calculator-plan.md)
(original feature spec — its "Open Decisions" section already flagged Web
Worker vs. main-thread chunking as unresolved; this rewrite resolves it), and
[`AGENTS.md`](../AGENTS.md) (repo conventions: no build step today, hand-rolled
zero-dependency Node test scripts, engine/UI split).

Three things from the existing repo materially shaped this plan; all
resulting decisions are recorded in §5:

1. **Repo currently has no build step or root `package.json`** by deliberate
   convention (`AGENTS.md`). This React app is an intentional, scoped
   exception — it needs its own `package.json`/Vite config, isolated from the
   rest of the repo's zero-dependency pages.
2. **The three retirement-plan calculators (Debt, FIRE, Retirement) are
   currently wired together** through `plan-state.js`: one unified
   `localStorage` schema, versioned migrations, a share-link codec, and
   pure cross-page prefill functions (`prefillFireFromDebt`,
   `prefillRetirementFromFire`). Decision (§5, item 5): the React app stays
   fully separate from this — no shared schema, no prefill.
3. **A concrete, verified perf ceiling in the vanilla version:** every field
   edit debounces 180ms (`scheduleRecompute`) then runs `recompute()`
   synchronously on the main thread — a full `projectDeterministic` +
   `runMonteCarlo` (default 1,000 paths), *plus* `renderNudges()` re-running
   `runMonteCarlo` again at 500 iterations for each of several sensitivity
   presets. That's several thousand simulated 60-year paths blocking the
   only thread, on every settled edit, today. This isn't hypothetical —
   it's the exact case the Web Worker phase (§2 Phase 3) fixes, and it
   motivates a further enhancement in §6.

---

## 1. Proposed folder / file structure

Lives in a new top-level `app/` directory (own `package.json`, isolated from
the rest of the repo's no-build-step pages; own `localStorage` key, no
dependency on `plan-state.js` — see §5, items 1 and 5).

```
app/
├── public/                 # static assets served as-is, unprocessed by Vite
├── src/
│   ├── main.tsx             # entry point, mounts <App/>
│   ├── App.tsx              # app shell: router, providers, layout
│   ├── routes/               # route-level modules, one per tool, lazy-loaded
│   │   └── retirement/
│   │       ├── RetirementRoute.tsx
│   │       └── index.ts       # React.lazy() export boundary
│   ├── features/
│   │   └── retirement/        # everything specific to this tool, isolated
│   │       ├── schema/         # Zod schemas = source of truth for types + validation
│   │       ├── engine/         # pure, framework-free simulation core (ported from retirement-engine.js)
│   │       ├── worker/         # Web Worker entry + typed message contract
│   │       ├── hooks/          # custom hooks adapting engine -> React state
│   │       ├── state/          # Context + useReducer for plan/scenario state
│   │       ├── components/
│   │       │   ├── forms/       # RHF-bound input forms, one per plan section
│   │       │   ├── charts/      # Recharts: projection curve, fan chart, RMD timeline
│   │       │   └── results/     # verdict card, year-by-year audit table
│   │       └── persistence/    # own localStorage key + share-link codec (reuses plan-state.js's compression approach, not its schema — §5.5)
│   ├── components/ui/        # shared design-system primitives (shadcn output, not hand-edited)
│   ├── lib/                  # small generic helpers with no feature knowledge (cn(), formatters)
│   ├── styles/globals.css    # Tailwind entry + design tokens
│   └── test/setup.ts         # Vitest + RTL/jest-dom global setup
├── index.html                # Vite entry HTML
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json             # strict: true
└── package.json
```

One-line purpose per top-level directory:

| Path | Purpose |
|---|---|
| `public/` | Static assets copied verbatim; not run through the bundler. |
| `src/routes/` | Route-level entry points, one per tool, each behind a `React.lazy` boundary. |
| `src/features/retirement/schema/` | Zod schemas — single source of truth for both runtime validation and TS types. |
| `src/features/retirement/engine/` | Pure simulation logic, no React, no DOM — ported 1:1 from `retirement-engine.js`. |
| `src/features/retirement/worker/` | Web Worker entry point and the typed request/response message contract. |
| `src/features/retirement/hooks/` | Custom hooks that expose engine output to components without embedding logic in them. |
| `src/features/retirement/state/` | Context + reducer holding committed plan/scenario state. |
| `src/features/retirement/components/` | Presentational components only — forms, charts, results — no simulation logic. |
| `src/features/retirement/persistence/` | `localStorage` autosave under its own key, plus share-link encode/decode via `useShareLink` — reuses `plan-state.js`'s compression approach, not its schema or storage key. |
| `src/components/ui/` | Cross-feature design-system primitives (Shadcn/Radix wrappers). |
| `src/lib/` | Feature-agnostic utilities. |
| `src/test/` | Shared test configuration. |

---

## 2. Phased build sequence

### Phase 1 — Simulation core, no UI
Port `retirement-engine.js` to typed, framework-free TypeScript in
`features/retirement/engine/`, plus the Zod schemas in `schema/` that both
validate and type the account/plan model. Write the custom hooks
(`useMonteCarloSimulation`, `useAccountModel`, `useTaxProjection`) as thin
adapters over the engine — still no rendered UI.

**Done when:** every exported engine function (RMD table, SS claiming
factor, tax-tier withdrawal, guardrails/4%/fixed-real methods, itemized +
phased spending, Monte Carlo with the `mulberry32` PRNG) is ported with
parity tests asserting identical output to the vanilla engine for the same
seed — the existing `scripts/retirement-tests.js` fixtures are the parity
oracle. Zod schema compiles, infers correct types, and rejects invalid
input the same way `normalizeState`/`validate` do today. App boots to a
blank shell; no forms or charts yet.

### Phase 2 — Forms + validation
Build the RHF + Zod forms for every plan section (about you, accounts,
contributions, income, spending — flat/itemized/phased/healthcare/LTC,
assumptions, strategy). Wire them to the Context/reducer plan state. Render
a deterministic single-path projection as a table only — no charts, no
worker yet.

**Done when:** the full input surface from the legacy tool round-trips
through RHF + Zod into plan state; validation errors match the legacy
`validate()` checks (e.g. retire age before current age, end age before
retire age, empty itemized budget); all inputs are keyboard-navigable; a
deterministic projection table renders from real form input.

### Phase 3 — Web Worker integration
Move Monte Carlo execution off the main thread. Define the typed
request/response message contract, a `useMonteCarloWorker` hook managing
worker lifecycle (spawn, post, progress, cancel, terminate), and UI state
for running/progress/success/error. **Includes E1** (approved, §6):
`useTransition`/`useDeferredValue` layered on top so the previous result
stays visible and interactive, marked stale, instead of freezing/blanking
while the worker computes.

**Done when:** a 1,000+ iteration run no longer blocks input on the main
thread (verified by keeping an input responsive — e.g. focus doesn't lag —
while a run is in flight), the previous result stays visible/interactive
during a recompute rather than freezing, worker errors surface as UI state
rather than throwing uncaught, and the message contract plus the reducer's
loading/success/error transitions are unit tested.

### Phase 4 — Charts & interactive exploration
Recharts-based projection curve, Monte Carlo fan chart (p10/p50/p90 bands),
and RMD timeline, driven by real hook output. **Includes E3** (approved,
§6): sliders for retire age / spending / SS claim age wired to the reducer,
debounced through the worker, updating the chart/success-rate live as you
drag. **Includes E2** (approved, §6): scenarios generalized from the
legacy two hardcoded slots to an N-entry array with a field-level diff
between any two selected.

**Done when:** charts update live as plan inputs change, each chart has an
accessible non-visual fallback (the year-by-year table already satisfies
this for the projection curve), the live sliders drive the same worker
pipeline as manual form edits (no parallel compute path), scenario compare
supports 3+ named entries, and data-mapping from hook output to chart
props is unit tested.

### Phase 5 — Polish, accessibility, deploy
Accessibility pass (semantic grouping, ARIA labeling, focus management,
full keyboard pass through multi-step forms); share-link capability kept
and reimplemented as a `useShareLink` hook (§3.7); route-level
code-splitting boundary confirmed in place even without a second tool yet;
deploy to **GitHub Pages**. **Includes E4, E5, E6, E7, E8** (all approved,
§6): installable/offline PWA, dark mode, field-level CSV import errors,
printable plan report, and a Storybook component catalog.

`index.html` changes (legacy card untouched, nothing else on the page
edited):
- A **horizontal separator line** dividing the existing retirement-plan
  section from a new one.
- The existing section gets a plain-language label identifying it as the
  **HTML & JavaScript** implementation (e.g. a small eyebrow/subhead near
  the section heading — exact copy is an implementation detail, not a
  content rewrite).
- A **new section**, clearly headed as the **React** version, containing
  one new card for the Retirement Planner (React).
- The new card carries a **React badge/identifier**, matching the existing
  badge style (e.g. `<span class="badge">React</span>` next to "Monte
  Carlo" / "Private / on-device").
- The **React app itself** displays a persistent React identifier (e.g. a
  small badge in its header/footer) so it's unambiguous which version
  you're using once you've clicked through — not just at the link level.

**Done when:** an accessibility audit (axe or Lighthouse) shows no
critical/serious issues, the app is live at a GitHub Pages URL, README is
updated, `index.html` shows both calculators divided by the separator with
the legacy page fully unmodified, and the React app is self-identifying on
screen.

---

## 3. Architecture decisions (ADR-style)

### 1. Custom hooks separating simulation logic from view
Simulation logic must stay unit-testable independent of rendering and must
be movable into a Web Worker without dragging React along with it; hooks
are the seam that makes both possible. The alternative — computing results
directly inside components via `useEffect`/`useMemo` — was rejected because
it couples business logic to the render lifecycle (untestable without RTL,
and effectively unmovable to a worker without a rewrite). A class-based
service layer was also considered and rejected as non-idiomatic for React;
hooks already give the composition and testability a service layer would,
without the extra indirection.

### 2. Web Worker offload for Monte Carlo
Thousands of 60-year simulated paths will jank the UI on the main thread at
exactly the moment the user is waiting on a result — and this was an
explicitly unresolved decision in the original vanilla-JS plan (see
`docs/retirement-calculator-plan.md`, "Open Decisions"). The alternative,
chunking the loop with `requestAnimationFrame`/`setTimeout` on the main
thread, was the fallback that plan considered; it's kept as a documented
secondary path (useful if a target browser lacks worker support) but not
the default, because a typed worker message contract is both the more
correct fix and the better demonstration of the pattern. Contract: a
discriminated union of request messages (`{ type: 'run', plan, iterations,
seed }`, `{ type: 'cancel' }`) and response messages (`{ type: 'progress',
pct }`, `{ type: 'result', summary }`, `{ type: 'error', message }`),
defined once in `worker/messages.ts` and imported by both the main thread
and the worker entry so the two sides can't drift out of sync — Vite's
native `new Worker(new URL(...), { type: 'module' })` support makes this a
first-class TS import on both ends, no separate build step.

### 3. State management: Context + `useReducer`, justified
Plan/scenario state at this scale is a single object with a small,
enumerable set of transitions (update a field, add/remove an income or
expense line, change withdrawal strategy) — exactly what `useReducer`
models well — and the component tree consuming it is one feature with one
provider, so Context's re-render cost isn't a real concern here. Zustand
was considered and rejected as unneeded for a single-feature app with no
subscriptions outside the React tree; it's flagged as the first thing to
reconsider if/when the Group Expense Tracker joins this app shell and needs
state scoped independently of a single provider tree. Redux Toolkit was
considered and rejected — its boilerplate (slices, store setup, DevTools
wiring) is disproportionate to one reducer with a dozen action types, and
adopting it here would mainly perform "enterprise-readiness" rather than
solve an actual scaling problem, which doesn't serve the goal of
*justified* pattern choices. Form field state is explicitly **not** in this
reducer — RHF owns per-field/form state; the reducer owns committed plan
state that the simulation hooks consume.

### 4. Route-level code splitting
If/when the Group Expense Tracker is ported into this same app shell, its
dependencies (CSV parsing, cloud client, its own state) shouldn't inflate
the Retirement Planner's initial bundle, and vice versa. A single
undivided bundle was the alternative and remains fine as long as this stays
a one-tool app — so the plan scaffolds the `React.lazy`/`Suspense` route
boundary in `routes/retirement/` now, before a second tool exists, making
the eventual addition purely additive rather than a later refactor.

### 5. Accessibility
Financial input forms are exactly where accessibility failures block real
usage — a screen-reader user doing their own retirement planning is a
realistic user, not an edge case — and it's a place competing calculators
(per the original tool's competitive research) tend to fail. Approach:
semantic `fieldset`/`legend` grouping per plan section, label association
via Shadcn's form primitives (built on Radix + RHF), `aria-live` regions
for validation errors and Monte Carlo run progress, `aria-describedby` for
helper/error text, a verified keyboard-only pass through every multi-step
form, and a data-table fallback alongside every chart. Relying on Radix's
built-in accessibility alone was considered and rejected as insufficient —
Radix gets primitive-level correctness (focus traps, listbox roles) right,
but form-level semantics and error announcement remain the app's own
responsibility.

### 6. Testing strategy
The simulation engine is the product's credibility; a rendering smoke test
proves nothing about whether the Monte Carlo math, tax treatment, or RMD
logic is right. Engine and schema code get near-exhaustive unit coverage,
using the existing `scripts/retirement-tests.js` fixtures as a parity
oracle (same seed in, same numbers out). Hooks are tested via
`@testing-library/react`'s `renderHook`. Forms are tested via RTL for
validation-error and successful-submit paths, not pixel snapshots. The
worker's pure message-handling logic is unit tested directly; whether to
also exercise a real worker thread inside Vitest is left as a Phase 3 spike
rather than assumed up front, since jsdom worker support is inconsistent
across setups.

### 7. Share-link architecture: kept, re-encapsulated as a hook
The share-link feature (encode plan state into `#state=…`, deflate +
base64url, so a URL alone reproduces a plan with no account and no server)
stays — you confirmed the capability should not be dropped. What changes is
*how* it's wired, not the wire format: the legacy page manages it with
imperative global functions and a hand-rolled `setTimeout` debounce
(`plan-state.js`, `saveState`/`buildShareUrl`); the React version wraps the
same compression logic in a `useShareLink(state)` hook that returns the
current URL and a `copy()`/`share()` action, with the debounce expressed as
an effect rather than a module-level timer — more idiomatic, easier to
test in isolation (`renderHook`), and reusable if a second tool ever needs
the same pattern. Two things considered and rejected: a URL-shortening
service, which would make the link actually shorter — rejected because it
requires a backend, which is explicitly out of scope (no server, ever, per
the deployment constraint); and a typed-search-params library (e.g.
`nuqs`), which is a good fit for several small named params but not for
one opaque compressed blob — it would add a dependency without solving
anything the current single-`?state=` param doesn't already handle. One
addition: layer the Web Share API (`navigator.share`) on top for a native
mobile share sheet when available, falling back to copy-to-clipboard —
genuinely nicer than "here's a URL, go copy it from the address bar," and
free given the hook already computes the URL. The legacy tool's "very long
link → suggest export instead" guardrail is kept, surfaced through the same
hook rather than a separate warning path.

---

## 4. Why this architecture reflects current React best practice

Each decision in §3 is also a specific instance of a broader, established
React community practice — naming that connection explicitly is part of
the portfolio goal: this isn't just working code, it's legible as "here is
the standard pattern, and here is why it applies here."

1. **Feature-based, colocated structure over layer-based structure.**
   Grouping `schema/`, `engine/`, `worker/`, `hooks/`, `state/`, and
   `components/` under one `features/retirement/` directory (§1), rather
   than one global `hooks/` folder and one global `components/` folder for
   the whole app, follows the widely-adopted "colocate what changes
   together" convention (bulletproof-react, Remix/Next App Router
   conventions) — a PR touching the withdrawal-method logic touches one
   directory, not four scattered ones. `components/ui/` is the deliberate
   exception, because those primitives are genuinely cross-feature.
2. **Schema as the single source of truth for types ("parse, don't
   validate").** Deriving TypeScript types from Zod schemas via `z.infer`
   (§1, `schema/`) means the type-checker and the runtime validator can
   never drift apart the way a hand-written `interface` and a hand-written
   validator can — one definition serves both jobs, at every boundary
   (form submission, `localStorage` read, share-link decode).
3. **Functional core, imperative shell.** `engine/` has zero React or DOM
   imports (§3.1, §3.2) — it's plain, portable TypeScript. This is what
   makes the engine trivially unit-testable with no rendering *and*
   trivially movable into a Web Worker; a framework-entangled core would
   have made both harder, which is exactly the failure mode the hooks
   boundary (§3.1) exists to prevent.
4. **Unidirectional data flow, single source of truth.** Components read
   reducer state and dispatch named actions; nothing mutates plan state
   directly (§3.3). This is React's core mental model, and it pays off
   concretely here: every state transition being an explicit, named action
   is what makes the scenario diff view (E2) and any future undo/history
   feature cheap to add later, because the log of "what changed" already
   exists.
5. **Local state before lifted state before global state.** React Hook
   Form keeps field-level state local and mostly uncontrolled under the
   hood (keystrokes don't re-render the whole form); only *committed* plan
   state lifts into the reducer/Context (§3.3). This mirrors the React
   docs' own "Thinking in React" guidance — keep state as local as
   possible, lift only when something genuinely needs to share it — and is
   the direct justification for not reaching for Zustand/Redux Toolkit by
   default.
6. **Concurrent APIs applied surgically, not by default.**
   `useTransition`/`useDeferredValue` (E1, §6) are applied at exactly the
   one measured bottleneck — Monte Carlo recompute — not sprinkled
   through the app as a reflex. Best practice treats concurrent rendering
   as a targeted fix for a specific cost, not a default posture.
7. **Native semantics before ARIA.** Radix/Shadcn primitives were chosen
   (§3.5) because they render real interactive elements with native focus
   and keyboard behavior, rather than `div`s with ARIA roles bolted on —
   the WAI-ARIA authoring practices' own guidance is "no ARIA is better
   than bad ARIA": reach for it to fill a real gap, not as the default
   toolkit.
8. **Test behavior, not implementation.** Testing Library's stated
   philosophy — "the more your tests resemble how your software is used,
   the more confidence they give you" — is why forms are tested through
   user-facing queries and submit outcomes rather than internal state
   shape (§3.6), while the engine, which has no "user" to speak of, gets
   exhaustive output-based unit tests instead. Different code, different
   testing shape, deliberately.
9. **Strict typing as a design constraint, applied from day one.**
   `tsconfig.json`'s `strict: true` isn't a lint rule bolted on later — it's
   what forces Zod-inferred types to actually flow, unbroken, through
   hooks, components, and the worker message contract without an `any`
   escape hatch, which is what makes the typed worker contract (§3.2)
   load-bearing rather than decorative.

---

## 5. Decisions

All resolved. This is now the record of what was decided and why, not a
list of open items — nothing below is still blocking Phase 1.

1. **Repo location** → new `app/` directory in this same repo, entirely new
   modules, zero edits to any existing file.
2. **Legacy page** → `retirement-calculator.html` stays live permanently,
   unmodified, no swap, no cutover date. Permanent side-by-side.
3. **Card labeling & positioning** → `index.html` gets a horizontal
   separator dividing the existing retirement-plan section from a new one;
   the existing section is labeled as the **HTML & JavaScript**
   implementation; the new section is headed as the **React** version and
   holds one new card carrying a React badge, matching the existing badge
   style. The React app itself also carries a persistent on-screen React
   identifier (header/footer badge), so it's unambiguous which version
   you're in once you've clicked through, not just at the link level. Full
   detail and rationale in Phase 5 (§2) — exact copy/placement is an
   implementation detail decided during that phase, not a content
   commitment made here.
4. **Simulation parameter scope** → confirmed: the complete
   `retirement-engine.js` parameter set (RMD table, IRMAA tiers, SS
   claiming curve, all three withdrawal methods, itemized + phased
   spending, healthcare/LTC) is the v1 target. Nothing simplified or cut.
5. **Cross-tool integration** → kept completely separate. No read or write
   access to `plan-state.js`'s unified schema, no prefill bridge from
   Debt/FIRE. Its own storage key, its own schema, full stop — matches the
   "entirely new modules" framing exactly.
6. **Group Expense Tracker** → left alone for now. Not ported into the app
   shell in this project. The route-level code-splitting boundary (§3.4)
   is still scaffolded now, ready for it later, but no GET code moves.
7. **Share-link parity** → kept, not dropped, and reimplemented in a more
   React-idiomatic form (`useShareLink` hook) rather than the legacy
   page's imperative global functions. Full rationale, and why a shorter
   URL isn't achievable without a backend, in §3.7.
8. **Deploy target** → **GitHub Pages.**
9. **Enhancements** → all of E1–E8 (§6) greenlit and folded into the
   phased plan; see §2 for exactly which phase each lands in.

---

## 6. Enhancements beyond parity — all approved

What React (and the rest of the required stack) genuinely enables that the
vanilla version can't easily do, rather than a 1:1 port. The vanilla
implementation was checked feature-by-feature first, so nothing below
duplicates something it already has — two things initially expected to be
proposed as new (live recompute-on-edit, a two-scenario compare) turned
out to already exist there, so they're marked as **upgrades** to an
existing feature instead. All eight items below are approved and folded
into the phased plan (§2); the table records the reasoning and where each
one lands.

| # | Enhancement | What's there today | What React/the stack enables | Effort | Suggested slot |
|---|---|---|---|---|---|
| E1 | **Non-blocking live results** | Every edit debounces 180ms then runs a full synchronous MC + nudges recompute (see §"Context", item 3) — the whole page freezes for that duration. | The Worker (Phase 3) already fixes the freeze. Add `useTransition`/`useDeferredValue` on top so the *previous* result stays visible and interactive (marked stale) while the new one computes, instead of a blank/frozen state — a React 18 concurrent-rendering capability with no vanilla equivalent. | S | Fold into Phase 3 |
| E2 | **N-way scenario comparison (upgrade)** | Exactly two hardcoded slots (`scenarios.A` / `scenarios.B`), fixed 2-column layout. | Scenarios as a named array in reducer state, rendered via one reusable `<ScenarioColumn>` mapped over N entries — compare 3+ named scenarios ("retire at 62/65/68"), not just two. Add a field-level diff highlight between any two selected. | M | Phase 4, after charts |
| E3 | **Interactive live what-if controls (upgrade)** | Nudges are fixed preset deltas ("retire 1 yr later"), computed on click, not continuously explorable. | Bound sliders (retire age, spending, SS claim age) wired straight to the reducer, debounced through the worker, updating the success-rate/chart continuously as you drag — turns "here are some deltas" into an actual exploration tool. Natural fit once state is a controlled reducer instead of hand-wired DOM. | M | Phase 4 |
| E4 | **Installable / offline (PWA)** | No manifest, no service worker — the tool is fully client-side already but isn't installable or offline-capable. | `vite-plugin-pwa` for an offline-capable, installable app — a strong fit for a no-backend, all-client tool, and close to free given Vite's plugin ecosystem. | S | Phase 5 |
| E5 | **Dark mode** | `shared.css` has no `prefers-color-scheme` support. | Tailwind + CSS custom properties + Radix theming make a correct dark mode (not just inverted colors — checked contrast, chart palette included) cheap to do properly. | S | Phase 5 |
| E6 | **Field-level import validation** | CSV import is atomic: any bad row rolls back the *entire* file with one generic error message. | Since Zod is already the schema source of truth for forms, reuse it on import to report per-row/per-field errors ("row 4: amount must be ≥ 0") instead of an all-or-nothing rollback. Near-free once the schema exists. | S | Phase 2 or 5 |
| E7 | **Printable / exportable plan report** | CSV export and a share link only; no formatted summary. | A dedicated print-stylesheet report view (assumptions, verdict, year-by-year table) for handing a plan to a spouse or advisor — trivial as one more route/component in a componentized app. | S | Phase 5, optional |
| E8 | **Component catalog (dev-experience, not user-facing)** | No isolated way to view/test a form or chart in a given state (loading, error, empty) outside the full app. | A small Storybook (or Ladle) catalog of the form and chart components in each state — itself a demonstrable modern-React practice for a portfolio repo, and useful for the accessibility pass in Phase 5 (test each state in isolation). | M | Optional, parallel to Phase 4–5 |

---

## 7. Testing coverage targets by phase

| Phase | Target | Notes |
|---|---|---|
| 1 — Engine & schema | ~95–100% line coverage on `engine/` and `schema/` | Pure logic, cheap to cover fully; mirrors `scripts/retirement-tests.js`'s existing near-total coverage of the vanilla engine. |
| 2 — Forms & state | ~85%+ on reducer + validation logic; RTL tests per form for required-field errors and successful submit | Not pixel-level snapshots. |
| 3 — Worker | 100% on the message contract and hook adapter (small, critical surface); worker execution itself covered by a thin integration test | Full in-worker execution test is a scoped spike, not assumed. |
| 4 — Charts | Unit tests on data-mapping (hook output → chart props) only | No visual regression tooling in scope; Recharts' own rendering isn't ours to test. |
| 5 — Polish | Accessibility audit (axe/Lighthouse) with no critical/serious findings | End-to-end (Playwright) is a stretch goal, not required for done. |
