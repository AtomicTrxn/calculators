# Retirement Calculator — Feature Spec & Build Plan

## Goal

Add a second calculator to the collection: a retirement planner that is honest,
transparent, and genuinely useful — without a backend, an account, or data
leaving the device.

The market splits into two tiers: fast institutional "are you on track?" widgets
(Fidelity Score, Vanguard, NerdWallet) that hide their assumptions and model few
variables, and subscription power tools (Boldin, ProjectionLab, Pralana) that are
powerful but require a login, a learning curve, and often data linking. This
calculator targets the whitespace between them, using the same strengths as the
existing Group Expense Tracker:

- **Self-contained** — one HTML file, no build step, no dependencies.
- **Private** — all data stays in the browser (`localStorage` + optional share
  link), no server, no account.
- **Transparent** — every assumption is visible and editable, with disclosed
  defaults.

## Design Principles

These are the decisions that separate this tool from the basic tier. They drive
every feature below.

1. **Output a range and a success rate, not a single number.** A point estimate
   ("you'll have $1.2M") implies a precision that does not exist and hides
   sequence-of-returns risk. The headline result is a *probability the plan
   survives* plus a band of outcomes.
2. **Budget from planned expenses, not a "% of income" rule.** The default may
   suggest a number, but the user models actual spending. Support phased
   spending (the go-go / slow-go / no-go curve), not one flat inflation-adjusted
   line.
3. **Every assumption is on-screen and editable.** Return, inflation, tax rate,
   life expectancy, and healthcare inflation are inputs, never hidden constants.
4. **Be tax-aware at account-type granularity.** A traditional-401(k) dollar and
   a Roth dollar are not worth the same. Even a coarse model beats ignoring taxes
   entirely (the most common basic-tier flaw).
5. **Healthcare and long-term care are first-class.** The pre-Medicare gap,
   Medicare + IRMAA, and a potential six-figure LTC event are modeled, not
   omitted.
6. **Scenarios are comparable side by side.** "Retire at 62 vs. 65," "claim Social
   Security at 67 vs. 70" — compared on one screen, not by re-running from memory.
7. **Progressive disclosure.** A first-time user answers a handful of questions
   and gets a result. Advanced inputs live behind expanders so the tool is not a
   wall of fields.

## Scope & Phasing

The full vision is large. Build it in phases so each one ships something useful.

### Phase 1 — Deterministic core (MVP)

A single-path, year-by-year projection. No randomness yet, but everything is
transparent and the phased-spending / account-type model is in place so later
phases slot in without a rewrite.

- Accumulation and drawdown modeled year by year to end-of-plan age.
- Inputs: current age, retirement age, end-of-plan (life-expectancy) age, current
  balances by account type, annual contributions (+ employer match), expected
  return, inflation, and a spending plan.
- Account types: taxable, traditional (pre-tax), Roth, cash. HSA optional/deferred.
- Social Security and pension as income lines with a start age.
- Simple, disclosed tax treatment (see Tax Model — Tier 1).
- Output: end balance, the year money runs out (if it does), and a real-vs-nominal
  toggle.
- Parity with the existing tracker: `localStorage` autosave, share links via URL
  hash, CSV import/export, and passes `scripts/check-links.js`.

### Phase 2 — Risk & realism

- **Monte Carlo** simulation (default 1,000 paths) → probability of success and a
  fan chart of outcome percentiles (10th / 50th / 90th).
- **Sequence-of-returns** visualization: show how an early-retirement downturn
  changes the result versus the same returns reordered.
- Optional **historical backtest** (rolling real-return sequences) as an
  alternative to normally-distributed returns.
- **Phased spending** UI (distinct go-go / slow-go / no-go budgets or a decay
  curve).
- **Healthcare + LTC** module (pre-Medicare gap, Medicare + IRMAA, medical
  inflation separate from general inflation, optional LTC shock).

### Phase 3 — Strategy & comparison

- **Side-by-side scenarios** (A/B, up to a small fixed number).
- **Tax-aware withdrawal ordering** across account types (taxable → traditional →
  Roth, with a Roth-conversion-runway view).
- **RMDs** on traditional accounts from the SECURE 2.0 age.
- **Withdrawal strategies**: fixed real, 4% rule, and a guardrails rule
  (Guyton-Klinger) as selectable methods.
- **Social Security claiming** helper (benefit at 62 / FRA / 70 tradeoff).

## Inputs

Grouped by card, mirroring the tracker's numbered-card layout. Advanced fields
sit inside `<details>` expanders.

### 1. About you
- Current age.
- Planned retirement age.
- End-of-plan age (life expectancy; default 95, editable — see Assumptions).
- Optional: spouse/partner as a second set of ages and accounts (Phase 3; keep
  the data model ready for it in Phase 1).

### 2. Savings today
Balances entered per account type so tax treatment is correct downstream:
- Taxable (brokerage/savings).
- Traditional / pre-tax (401k, 403b, traditional IRA).
- Roth (Roth 401k/IRA).
- Cash.
- HSA (optional; Phase 2+).

### 3. Contributions
- Annual contribution per account type (or a total with a pre-tax/Roth split).
- Employer match (% of salary up to a cap).
- Optional annual contribution growth (raises), disclosed default 0–2%.
- Contributions stop at retirement age unless overridden.

### 4. Retirement income
Each line has an amount (today's dollars), a start age, and a COLA flag:
- Social Security (with claiming age; Phase 3 adds the 62/FRA/70 helper).
- Pension.
- Other (annuity, rental, part-time work).

### 5. Spending plan
- Baseline annual spending in retirement (today's dollars) — the anchor, entered
  directly rather than derived from income.
- **Phased spending** (Phase 2): separate go-go / slow-go / no-go amounts or a
  percentage decay, with age boundaries.
- **Healthcare** (Phase 2): pre-Medicare premium estimate for the gap years,
  Medicare + optional IRMAA tier, medical inflation rate.
- **Long-term care** (Phase 2): optional late-life annual cost for N years, or a
  probability-weighted shock in Monte Carlo.
- One-off events (Phase 3): home sale, downsizing, inheritance, a wedding — an
  amount at a given age, positive or negative.

### 6. Assumptions (always visible, never hidden)
- Expected nominal return in accumulation and in retirement (may differ).
- General inflation.
- Medical inflation (separate).
- Return volatility / std-dev (Phase 2, for Monte Carlo).
- Effective tax rate or bracket model (see Tax Model).
- Real-vs-nominal display toggle.

## Calculation Engine

### Projection loop
Year-by-year (annual granularity is sufficient and keeps the math legible),
from current age to end-of-plan age. For each year:

1. Apply contributions and employer match (accumulation years only).
2. Grow each account by its return (deterministic in Phase 1; a sampled return in
   Phase 2).
3. In retirement years, compute the spending need for that year (phased +
   healthcare + one-offs), subtract guaranteed income (Social Security, pension),
   and withdraw the remainder from accounts in tax order.
4. Apply taxes on the withdrawal / income for the year.
5. Apply RMDs where they exceed the discretionary withdrawal (Phase 3).
6. Record end-of-year balances, whether the shortfall was covered, and the year
   of depletion if any.

### Monte Carlo (Phase 2)
- Default 1,000 iterations; each iteration draws a return per year (normal by
  default: mean = expected return, std-dev = volatility input; log-normal
  optional) or samples a historical rolling sequence.
- **Success** = plan reaches end-of-plan age without depleting spendable assets
  (guaranteed income alone covering spending in a year counts as surviving).
- Report success probability and the 10th / 50th / 90th percentile terminal
  balances and depletion ages.
- Must run in-browser without freezing the UI — chunk the loop
  (`requestAnimationFrame` or a Web Worker) and show progress. 1,000 × ~60 years
  is trivially fast; keep it responsive anyway for larger runs.

### Tax Model
Deliberately tiered so Phase 1 ships without a full tax engine.

- **Tier 1 (Phase 1):** single effective-tax-rate input applied to withdrawals
  from traditional accounts and to taxable income; Roth withdrawals untaxed;
  taxable-account withdrawals taxed only on a disclosed assumed gain fraction.
  Crude but honest and visible.
- **Tier 2 (Phase 3):** approximate federal brackets (standard deduction +
  marginal brackets, inflation-indexed), Social Security taxability, and IRMAA
  tiers. State tax as a flat optional add-on. Explicitly *not* tax advice; label
  it as an estimate.

### Withdrawal ordering (Phase 3)
Default: taxable → traditional → Roth, with RMDs forced when due. Expose the
order and let advanced users model Roth conversions in low-income early-retirement
years (the "conversion runway").

## Outputs & UI

Match the tracker's aesthetic (Nord-ish palette, serif headings, numbered cards,
`.scroller` for wide tables, responsive at 640px).

- **Headline verdict.** Phase 1: end balance and depletion age. Phase 2: a big
  **probability-of-success** figure with a plain-language read ("Very likely /
  Borderline / At risk").
- **Fan chart** (Phase 2): outcome percentiles over time. Inline SVG, no chart
  library (consistent with the no-dependency rule).
- **Year-by-year table** behind a `<details>` expander: age, balances by account,
  income, spending, withdrawals, taxes, end balance — the audit trail that makes
  the tool trustworthy.
- **Assumptions panel** always visible so the result is never a black box.
- **Sensitivity nudges:** "retire 1 year later," "spend $5k less," "save $x more"
  — one-tap deltas showing the effect on success probability.
- **Scenario compare** (Phase 3): two columns, shared axes.
- Every dollar figure labeled real vs. nominal; a global toggle.

## Data Model & Persistence

Follow the tracker's proven patterns so the two calculators feel consistent and
share tooling.

- A single state object: `{ v, you, accounts, contributions, income, spending,
  assumptions, scenarios }`. Version it (`v:1`) from day one.
- **`localStorage`** autosave under `retirementCalculator.v1` (separate key from
  the tracker).
- **Share links**: encode a compact form of state into the URL hash
  (`retirement-calculator.html#data=...`), reusing the tracker's base64url +
  optional gzip (`CompressionStream`) approach with the same `u.` / `z.` prefixes
  and graceful fallback. Keep a `compactState` / `expandState` pair and a
  `v`-guarded `applyState`, exactly as the tracker does, so old links keep working.
- **CSV import/export**: reuse the tracker's RFC-style parser and header
  auto-detection. Export assumptions, accounts, and income as labeled CSVs;
  imports are atomic (roll back all files if any fails).
- All user-supplied text HTML-escaped on render (`esc()`), same as the tracker.
- Editing any field clears the share hash (`markUserChanged`) and re-saves.

## Assumptions & Disclosed Defaults

Shown in the UI and pre-filled; all editable. Sourced from common
industry defaults (see research notes below), not presented as guarantees.

| Assumption | Default | Note |
|---|---|---|
| Retirement age | 67 | Full Social Security age for most |
| End-of-plan age | 95 | Plan to a long life, not an average one |
| Return, accumulation | 6% nominal | Conservative vs. many tools' 7%+ |
| Return, retirement | 5% nominal | More conservative glide path |
| General inflation | 3% | |
| Medical inflation | 5% | Consistently outpaces general inflation |
| Return volatility (Monte Carlo) | ~12% std-dev | Editable; drives the fan chart |
| Contribution growth | 2%/yr | Optional |
| Assumed taxable gain fraction | 50% | Tier-1 tax model only |

A short "How this works / what we assume" disclosure panel states plainly that
this is an educational estimate, not financial advice, and that results are only
as good as the inputs.

## Edge Cases & Guardrails

- Retirement age ≤ current age → treat as "already retired," skip accumulation.
- End-of-plan age ≤ retirement age → validation error, flagged inline like the
  tracker's date validation.
- Negative or non-numeric balances/contributions → flagged, excluded, not
  silently coerced.
- Depletion before end-of-plan → clearly surfaced (year and age), never hidden by
  a rosy average.
- Zero contributions / zero return / 100% Roth → all valid, must not divide-by-zero.
- Very long horizons or large Monte Carlo counts → keep UI responsive (chunk /
  Web Worker) and cap iterations to a sane maximum.
- Share links that are very long → warn and suggest CSV export, as the tracker
  already does.

## Testing

Mirror the tracker's lightweight, dependency-free checking.

- `node scripts/check-links.js` passes (the new page is linked from `index.html`
  and links back).
- Inline-script syntax check.
- Deterministic engine unit checks (can live in a small `scripts/` node file or
  an inline self-test): a hand-computed 3-year projection matches; depletion year
  is correct; real-vs-nominal conversion is consistent.
- Monte Carlo sanity checks: success probability is 100% when income ≥ spending
  every year; 0% when assets are trivially small and spending large; percentiles
  ordered (10th ≤ 50th ≤ 90th).
- Tax-tier checks: Roth withdrawals untaxed; traditional taxed at the effective
  rate; totals reconcile.
- Share-link round-trip: `compactState` → encode → decode → `expandState`
  reproduces state; old prefixless/`u.`/`z.` links still load.
- CSV round-trip: export then import reproduces state; malformed file rolls back.

## Landing Page & Navigation

- Add a second `.calc-card` to `index.html` for the Retirement Calculator, with
  its own icon treatment and badges (e.g. "Monte Carlo," "Private / on-device").
- The new page links back via the `All calculators` top-nav, matching the tracker.
- Update `README.md`'s "Included calculators" list.

## Open Decisions

- **Randomness model:** normal-distribution Monte Carlo vs. historical
  backtesting as the Phase 2 default (leaning normal for simplicity, backtest as
  an option).
- **Couples:** how far to model two people in v1 (leaning single-person for Phase
  1, data model ready for two).
- **Tax depth:** how much bracket detail is worth the complexity and the
  maintenance of annually-changing figures (leaning Tier-1 for MVP).
- **HSA:** include in Phase 1 or defer to Phase 2.
- **Currency/locale:** US-only assumptions (Social Security, Medicare, IRMAA) vs.
  a more generic "guaranteed income" framing.
- **Web Worker vs. main-thread chunking** for Monte Carlo — decide when Phase 2
  performance is measured.

## Research Notes

Analysis behind the design principles (competitive scan of Fidelity, Vanguard,
NerdWallet, SmartAsset, AARP, Boldin, ProjectionLab, Pralana, Empower, and expert
critiques):

- Most basic calculators output a single point estimate, hide their return/tax
  assumptions, and use a flat "70% of income" spending rule — all three mislead.
- Advanced tools differentiate on Monte Carlo, tax-aware withdrawals, Roth
  conversions, phased spending, and scenario comparison, but sit behind
  subscriptions/logins.
- The biggest gaps retirees actually care about: probability-of-success over a
  point number, sequence-of-returns risk made visible, realistic phased spending,
  healthcare + long-term care as real line items, and transparent editable
  assumptions.

Sources: PlanEasy (assumptions critique), Boldin "10 best retirement
calculators," Rob Berger "best retirement calculators," Fidelity retirement
tools, NerdWallet, SmartAsset, annuity.org and Creative Planning (healthcare
costs), HumanGood (calculator limitations).
