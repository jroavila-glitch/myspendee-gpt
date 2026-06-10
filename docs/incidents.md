# Incident Log

Use this file for meaningful incidents, not every bug.

Each entry should answer:

- What happened?
- Impact
- Root cause
- Resolution
- Prevention

## 2026-06-05: Wrong Frontend Served on Expense Domain

- Impact: the expense domain showed a tennis site instead of the finance app
- Root cause: this workspace had previously contained unrelated tennis-site files and had been linked to the wrong Vercel project locally
- Resolution: restored the correct expense frontend, relinked Vercel to the correct project, cleaned stray tennis files
- Prevention:
  - keep projects in separate folders/repos
  - avoid ad-hoc deploys from mixed workspaces
  - verify local `.vercel` project linkage before deploy

## 2026-06-07: ARQ USD Upload Failure

- Impact: uploading newer ARQ USD statements returned `Unable to resolve MXN amount for transaction`
- Root cause: newer statements used a different title/layout (`Dólares digitales Estado de Cuenta`) so the deterministic parser did not recognize them and fallback extraction produced incomplete amount data
- Resolution: updated ARQ parser layout detection and strengthened currency normalization
- Prevention:
  - add fixture-based parser tests for each new statement layout
  - prefer deterministic parsing for known institutions

## 2026-06-10: Millennium GPT Extraction Dropped And Misassigned Rows

- Impact: Millennium imports from January through May 2026 contained missing
  transactions, incorrect dates and descriptions, and some amounts assigned
  to adjacent rows. In the clearest case, Jonathan James Moss was stored as
  EUR 990 instead of EUR 189, while the following Bridge Building row owned
  the EUR 990 amount.
- Root cause: Millennium statements had no deterministic parser and relied on
  vision-model extraction of dense transaction tables.
- Resolution: added a deterministic Millennium parser that binds values within
  each row, uses the value date, and validates every transaction against the
  running account balance.
- Prevention:
  - recognized Millennium statements fail upload if every row cannot be
    balance-validated
  - keep a regression fixture for adjacent income and expense transfers
  - audit and re-import existing Millennium statements after explicit approval
