# Changelog

This file tracks meaningful product, architecture, and operations changes for `Moneo`.

It should not include tiny style tweaks or trivial wording changes. It should include:

- New capabilities
- Bank/parser changes
- Data-model or migration changes
- Production incidents and fixes
- Infrastructure or deployment changes

## Unreleased

- Normalized `NuBank` statement/import metadata into `Nu` and kept Statements
  coverage split between `Nu Debit` and `Nu Credit` instead of showing a stray
  `NuBank` row.
- Added retry handling for transient frontend GET request failures so support
  data like banks, categories, statements, and exchange rates is less likely to
  show one-off `Failed to fetch` banners.
- Added a bulk remembered-rule option so selected transactions can be
  recategorized and taught to future imports in one flow.
- Restored the production Vercel frontend after a root-level deploy produced a
  protected `NOT_FOUND` response, and documented the Vercel project-linking
  incident plus prevention steps.
- Cleaned up Month Status explanations so low/no-income periods no longer show
  raw spending-ratio decimals or noisy diagnostic text.
- Added reimbursement/shared-expense accounting with neutral
  `Reimbursement expected` and `Reimbursement received` categories, so shared
  food/orders can reduce real category spending without inflating income.
- Added safe single-transaction delete undo and pending-to-statement
  reconciliation so manual pending captures can be matched to posted statement
  rows and hidden from analytics after reconciliation.
- Added a Dashboard `Pending / waiting for statement` card for manual pending
  transactions, keeping them editable and visible before their bank statements
  arrive without changing period totals.
- Added remembered personal classification rules from the transaction edit
  modal, backed by a new `user_classification_rules` table and applied to
  future transaction normalization without changing history automatically.
- Added a Statements coverage matrix and filters so uploaded PDFs can be
  checked by bank, month, year, warning state, and possible duplicates at a
  glance.
- Added deterministic classification for Spotify variants as `Entertainment`,
  Obsidian variants as `IG Ro Project`, and Club7/Clube VII/Unitenis gym
  memberships at exactly 120 EUR starting July while keeping 110 EUR support.
- Fixed HSBC 2Now parsing for interest and IVA rows whose sign/amount is
  extracted on the following PDF text line or only visible in image-based PDFs,
  so June-style repeated `INTERESES SUJETOS A IVA PROMOCION` and `IVA SOBRE
  COMISIONES E INTERESES` rows are imported.
- Added `Ro App Studio`, a reusable solo-founder app-building operating kit
  with agent protocols, lifecycle, design/UX standards, security rules, launch
  checklist, copyable starter templates, app intake worksheet, Claude handoff
  prompt, and a `create-app.sh` bootstrap script. Also installed a standalone
  copy at `/Users/roavila/ro-app-studio`.
- Fixed pending foreign-currency split creation so manually added EUR/USD
  receipts can omit MXN and still save allocations after backend normalization.
- Fixed manual foreign-currency pending transactions with blank bank/MXN fields
  by sending the current FX rate and returning a clear 422 instead of a backend
  crash when MXN cannot be resolved.
- Added `Tennis Smash & Social` as an expense category and allowed pending
  manual transactions to be split directly while they are being added.
- Added backend support for pending manual transactions, including a
  `reconciled_pending` source state reserved for future statement matching and
  hidden from normal analytics to avoid double counting.
- Added a `Loan Papá` reconciliation card and deterministic ARQ/DolarApp
  transfer classification for Jose Roberto Avila payments, with repayments
  counted as normal expenses.
- Added deterministic ARQ import audit tooling, surfaced statement import
  warnings in the Statements UI, and restored 16 confirmed missing
  January-May 2026 ARQ rows in production from the original PDFs.
- Optimized reviewed-only bulk review actions so multi-select “mark selected
  reviewed” uses one database update instead of one transaction update at a
  time.

- Added assigned reporting month/year for transactions so rent paid around a
  month boundary can count in the intended month without changing the bank
  transaction date. Only the monthly rent charge with original amount exactly
  600 EUR is shifted: days 28+ are suggested for the next month, while days
  1-3 stay in the current transaction month.
- Added statement-level import audit warnings, starting with ARQ checks for
  skipped date-like transaction blocks and raw `Almitas Inc Invest` mentions
  that do not become parsed transactions.
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
