# Retirement Planner (React)

Standalone Vite + React + TypeScript rewrite of the repo's vanilla Retirement Planner. Runs independently of the root calculators (own `package.json`, own `localStorage` key).

```sh
npm install
npm run dev      # local dev server
npm test         # Vitest — engine parity, schema, hooks, reducer, forms
npm run build    # tsc -b + production build (deployed to GitHub Pages under /app/)
npm run lint     # oxlint
```

Architecture and the reasoning behind each choice: [`../docs/retirement-react-rewrite-plan.md`](../docs/retirement-react-rewrite-plan.md), and in-app at `/retirement/decisions`.
