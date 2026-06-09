# Changelog

This file tracks meaningful product, architecture, and operations changes for `Moneo`.

It should not include tiny style tweaks or trivial wording changes. It should include:

- New capabilities
- Bank/parser changes
- Data-model or migration changes
- Production incidents and fixes
- Infrastructure or deployment changes

## Unreleased

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

- Renamed the Vercel frontend project to `moneoapp`, deployed the Moneo identity, and retired the previous production alias

- Fixed deterministic ARQ parsing so transactions continued on later PDF pages are not dropped after first-page summaries

- Established project operating docs under `docs/`
- Added team-role definitions, roadmap, runbooks, and incident log

## 2026-06

- Completed the app identity migration to `Moneo` across code and UI
- Added deterministic ARQ handling for newer `Dólares digitales` USD statements
- Added global display-currency support in the UI
- Added canonical transaction rules documentation and regression tests
