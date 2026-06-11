# Changelog

This file tracks meaningful product, architecture, and operations changes for `Moneo`.

It should not include tiny style tweaks or trivial wording changes. It should include:

- New capabilities
- Bank/parser changes
- Data-model or migration changes
- Production incidents and fixes
- Infrastructure or deployment changes

## Unreleased

- Added assigned reporting month/year for transactions so rent paid around a
  month boundary can count in the intended month without changing the bank
  transaction date. Rent paid on days 28+ is suggested for the next month; rent
  paid on days 1-3 stays in the current transaction month.
- Fixed transaction edit handling so metadata-only edits and explicit manual
  amount corrections do not unexpectedly re-normalize historical FX amounts.

- Added transaction splits, allowing one income or expense source transaction
  to allocate its amount across multiple same-type categories while preserving
  one bank record, reviewed-state intent, split-aware category analytics, and a
  dedicated Split Transaction modal

- Added deterministic Millennium statement parsing with balance-validated row
  amounts, preventing adjacent transactions from borrowing each other's values
- Reconciled and replaced the five January-May 2026 Millennium imports from
  their original PDFs, preserving reviewed/annotated transactions and allowing
  legitimate identical rows visible within one statement

- Replaced the Dashboard transaction preview with the full selectable
  transaction table, including select-all, bulk category/type changes, and
  confirmed bulk deletion

- Reduced revealed net cash-flow prominence, added direct editing from
  Dashboard drilldown transactions, and classified Aeromexico variants as
  Travel

- Added persistent transaction review completion: manually corrected
  transactions and explicitly confirmed single/bulk selections leave the
  Review queue, while notes-only edits remain unresolved

- Restored Review to the editable transaction-table workflow in both the Review
  tab and Dashboard popup, including per-transaction edit/delete actions,
  local search/category filters, and contained multi-select bulk editing

- Made Dashboard financial totals safer for public-space use with a
  privacy-first net cash-flow reveal control, changed the review banner action
  to an in-page modal, and expanded active drilldowns to show every matching
  transaction

- Added a guided financial-clarity Dashboard with review-first status, net cash
  flow, Month Status, prior-period arrows, recent three-month averages,
  savings-rate comparisons, ranked income/spending, and preview-only
  click-to-explain drilldowns
- Added a dedicated Review workspace backed by deterministic review reasons,
  expandable transaction context, keyboard triage, bulk actions, quick edit,
  notes autosave, and a trusted-period completion state
- Added the deterministic `/insights` API for comparisons, Month Status, review
  summaries, and per-transaction review reasons
- Split the frontend into focused Dashboard, Review, and Statements workspaces
  with responsive global filters and hardened asynchronous/FX state handling

- Added `Tennis Rush` income classification for exact EUR 25 Millennium/Revolut income and amount-aware Clube VII/Unitenis expense classification
- Added `Monsanto courts` expense classification for Câmara Lisboa / Monsanto court booking transactions

- Renamed the Vercel frontend project to `moneoapp`, deployed the Moneo identity, and retired the previous production alias

- Fixed deterministic ARQ parsing so transactions continued on later PDF pages are not dropped after first-page summaries

- Established project operating docs under `docs/`
- Added team-role definitions, roadmap, runbooks, and incident log

## 2026-06

- Completed the app identity migration to `Moneo` across code and UI
- Added deterministic ARQ handling for newer `Dólares digitales` USD statements
- Added global display-currency support in the UI
- Added canonical transaction rules documentation and regression tests
