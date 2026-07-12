# Calculators

A collection of self-contained browser calculators.

## Included calculators

- Group Expense Tracker: split shared costs by group, headcount, date ranges, and prior payments, with CSV import/export and shareable links.
- Retirement Planner: project savings year by year through retirement and run a Monte Carlo simulation to estimate the probability the plan lasts. Models account types (taxable/traditional/Roth/HSA), taxes, RMDs, Social Security claiming, phased spending, and healthcare/long-term care. Calculation logic lives in `retirement-engine.js`. See `docs/retirement-calculator-plan.md` for the design.

Open `index.html` to start from the calculator landing page.

Share links store calculator data in the URL hash using a compact browser-readable format. Older compressed links from development builds still load in browsers that support built-in gzip decompression.

## Checks

Run these before committing page changes:

```sh
node scripts/check-links.js
node scripts/retirement-tests.js
```
