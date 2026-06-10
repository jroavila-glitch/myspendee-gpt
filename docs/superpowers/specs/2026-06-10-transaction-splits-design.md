# Transaction Splits Design

## Product Intent

Moneo should let one source transaction allocate its amount across two or more
categories. The bank transaction remains one record, while Dashboard category
reporting uses the allocations. Splitting works for both income and expense
transactions, one transaction at a time.

## Approved Product Decisions

- A split keeps the original transaction type. Expense splits use only expense
  categories; income splits use only income categories.
- A split can contain two or more allocation rows.
- Users can enter exact amounts or percentages. Editing either updates the
  other, and the final row can receive the remaining balance automatically.
- Transaction lists show one source transaction with a
  `Split · N categories` badge. They never duplicate bank activity.
- Category drilldowns show a split transaction under each allocated category,
  using only that category's allocated amount while also showing the original
  transaction total.
- Saving a split is an intentional manual decision: the transaction leaves
  Review and automatic classification no longer overwrites its allocations.
- Splitting is available only for one transaction at a time. Bulk splitting is
  out of scope.
- Each allocation can have an optional note. The source transaction retains its
  overall note.
- Canonical allocation storage uses MXN. The UI displays and accepts original
  currency when available and allocates MXN proportionally.
- Undo Split removes allocations after the user chooses the single category to
  restore. The transaction remains reviewed.
- The UI uses a dedicated Split Transaction modal.

## Data Model

Add a `transaction_allocations` table:

- `id`: UUID primary key
- `transaction_id`: UUID foreign key to `transactions`, cascade delete
- `category`: approved category matching the source transaction type
- `amount_mxn`: positive canonical allocation amount
- `amount_original`: optional positive allocation in the source currency
- `notes`: optional allocation-specific note
- `position`: integer preserving display order
- `created_at`, `updated_at`: timestamps

The source transaction keeps its full original and MXN amounts, bank identity,
description, date, type, statement relationship, and overall note. Its
single `category` remains populated as a fallback for unsplit state and is not
used for category analytics while allocations exist.

Database constraints and service validation:

- A split transaction must contain at least two allocations.
- Every allocation category must be valid for the source transaction type.
- Every allocation amount must be greater than zero.
- Allocation `amount_mxn` values must sum exactly to the source
  `transaction.amount_mxn`.
- When original amount exists, allocation original amounts must sum exactly to
  the source original amount.
- Income and expense allocations cannot be mixed.

## Rounding

The UI calculates allocations in the displayed/original currency when
available. The backend calculates canonical MXN allocations proportionally
using decimal arithmetic. Any one-cent remainder is applied to the final
allocation so the canonical total reconciles exactly.

The backend is authoritative. It rejects incomplete, negative, zero, or
over-allocated split payloads rather than silently adjusting user intent.

## API Design

Transaction reads include:

- `is_split`
- `allocations`
- `allocation_count`

Add endpoints:

- `PUT /transactions/{id}/allocations`
  - Replaces the complete allocation set atomically.
  - Requires at least two rows.
  - Marks the source transaction reviewed.
- `DELETE /transactions/{id}/allocations`
  - Requires a valid replacement single category.
  - Deletes all allocations atomically.
  - Updates the source category and keeps it reviewed.

Existing transaction deletion and statement deletion cascade through
allocations. Existing edit behavior must reject a changed transaction total or
type when allocations would no longer reconcile; the user must rebalance or
undo the split first.

Bulk category/type operations must reject split transactions with a clear
message instead of overwriting their allocations.

## Analytics And Filtering

Summary income, expense, net cash flow, and savings rate continue to use each
source transaction's full amount exactly once.

Category breakdowns use:

- the source transaction category and full amount when unsplit
- allocation categories and allocation amounts when split

Category drilldowns return the source transaction once for the selected
allocation category with:

- `display_amount` set to that category's allocation
- `source_transaction_amount` available for context
- split badge and allocation summary

Bank, date, period, and type filters remain based on the source transaction.
Search matches the source description, bank, overall note, allocation
categories, and allocation notes.

Review insights treat a valid split transaction as reviewed. Allocation
creation, editing, and Undo Split are intentional manual decisions.

## Dedicated Split Modal

Entry points:

- Transaction action menu: `Split transaction` or `Edit split`
- Edit Transaction modal: secondary `Split transaction` action

The modal header shows source description, date, bank, type, original total,
and MXN total. Each allocation row contains:

- category selector restricted to the source type
- amount input
- percentage input
- optional split note
- remove-row action

Controls and feedback:

- `+ Add category`
- final-row automatic remainder behavior
- live allocated and remaining totals
- live percentage total
- Save Split disabled until exactly reconciled
- Cancel
- Undo Split when allocations already exist

Desktop uses a compact allocation grid. Mobile uses stacked allocation cards.

Transaction lists show a `Split · N categories` badge and a concise allocation
summary. Expanding or editing reveals the full allocation details.

## Error Handling

- Saving an invalid split returns a specific validation message and does not
  change existing allocations.
- Concurrent transaction changes cause a conflict response rather than saving
  against a stale total/type.
- If display-currency conversion is unavailable, the modal uses canonical MXN
  amounts and explains why.
- Undo Split requires explicit category selection before confirmation.
- Split transactions selected in bulk operations are skipped/rejected with an
  actionable message.

## Migration And Backward Compatibility

The new allocation table starts empty; every existing transaction remains
unsplit and behaves exactly as today. No backfill is required.

Transaction serialization adds allocation fields without removing existing
fields. Frontend code treats missing allocations as an empty list during
deployment transitions.

## Testing

Backend regression coverage:

- create/update/delete allocations atomically
- exact MXN and original-currency reconciliation
- final-cent rounding
- invalid category/type and invalid totals
- summary counts source transaction once
- breakdown and drilldown use allocation amounts
- search includes allocation notes/categories
- total/type edits and bulk actions reject split transactions
- transaction/statement deletion cascades allocations
- valid splits are reviewed

Frontend regression coverage:

- amount and percentage synchronization
- automatic remainder
- Save disabled until reconciled
- category options match transaction type
- split badge and allocation summary
- category drilldown displays allocated amount and original total
- Undo Split requires replacement category

Visual QA:

- dedicated modal on desktop and mobile
- existing unsplit edit flow remains uncluttered
- split badge and drilldown rows remain readable
- validation and conflict states are clear

## Out Of Scope

- Bulk splitting
- Splitting one source transaction across both income and expense
- Recurring split templates
- Automatic parser-created splits
- Splitting across different dates, banks, or source transactions
