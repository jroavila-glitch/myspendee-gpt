# Pending Transaction Reminders Design

## Goal

Show manually added pending transactions on the Dashboard so they are easy to notice before adding a duplicate receipt or planned payment.

## Approved Approach

Add a compact Dashboard card titled `Pending / waiting for statement`.

The card shows manual transactions that:

- have `source_status` set to `pending`
- are not `reconciled_pending`

The card is informational. It does not change how selected-period totals, category breakdowns, insights, or review counts are calculated. Future transactions only affect totals when they naturally belong to the active reporting period loaded by the existing transaction filters.

## User Actions

Each listed transaction keeps the normal row actions:

- edit
- split or edit split
- delete
- notes autosave
- row selection for existing bulk actions when applicable

## UX Notes

The card should sit above the normal transaction table. It should stay small, showing all manual pending rows passed to the Dashboard, and use the existing `TransactionTable` component to avoid creating a second editing experience.

## Testing

Add frontend helper tests that prove:

- manual pending rows are selected
- posted rows, statement-backed rows, and reconciled pending rows are excluded
- rows are sorted by most recent capture date first
