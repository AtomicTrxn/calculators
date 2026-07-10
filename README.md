# Calculators

A collection of self-contained browser calculators.

## Included calculators

- Group Expense Tracker: split shared costs by group, headcount, date ranges, and prior payments, with CSV import/export and shareable links.

Open `index.html` to start from the calculator landing page.

Share links store calculator data in the URL hash using a compact browser-readable format. Older compressed links from development builds still load in browsers that support built-in gzip decompression.

## Checks

Run this before committing page changes:

```sh
node scripts/check-links.js
```
