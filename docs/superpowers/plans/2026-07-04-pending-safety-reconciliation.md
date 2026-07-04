# Pending Safety And Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pending transaction workflows safer by supporting undo after single deletes, matching pending captures to posted statement transactions, and reconciling matched pending rows.

**Architecture:** Backend owns durable matching and reconciliation so production data stays consistent. Frontend owns the short-lived delete undo toast and renders likely matches in the existing pending reminder card. Existing transaction summaries remain unchanged: pending rows still count normally until reconciled, and reconciled pending rows are hidden by the existing source-status filter.

**Tech Stack:** FastAPI + SQLAlchemy backend, PostgreSQL-compatible models, React + Vite frontend, Node test runner, pytest.

---

### Task 1: Backend Delete Undo Shape

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_transaction_review.py`

- [x] Add a backend regression test that deleting a transaction returns the deleted `TransactionRead` payload, including fields needed for frontend undo.
- [x] Run `PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests/test_transaction_review.py -k delete -q` and verify the new test fails because delete currently returns only `{"ok": true}`.
- [x] Change `DELETE /transactions/{transaction_id}` to `response_model=TransactionRead`, serialize the transaction before deletion, then delete and return the serialized payload.
- [x] Rerun the focused backend delete tests and verify they pass.

### Task 2: Pending Match And Reconcile API

**Files:**
- Modify: `backend/app/schemas/common.py`
- Modify: `backend/app/services/transactions.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_transaction_review.py`

- [x] Add a `PendingMatchRead` response schema that returns the pending transaction plus candidate `TransactionRead` rows.
- [x] Add tests proving a manual pending transaction matches a posted transaction when amount/currency align, dates are close, and merchant text is similar.
- [x] Add tests proving unrelated amounts do not match.
- [x] Add tests proving reconcile marks the pending row `reconciled_pending` and sets `matched_transaction_id`.
- [x] Run focused tests and verify they fail before implementation.
- [x] Implement matching helpers in `services/transactions.py` with deterministic rules: pending source status, manual pending only, posted candidates only, 45-day date window, same original currency/amount when available or same MXN amount, and normalized merchant token overlap.
- [x] Add `GET /pending-matches?year=YYYY` and `POST /transactions/{pending_id}/reconcile/{posted_id}` endpoints.
- [x] Rerun focused backend tests and verify they pass.

### Task 3: Frontend Undo Toast

**Files:**
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/dashboard.test.js`

- [x] Add a frontend helper test for building an undo payload from a deleted transaction, including allocations when present.
- [x] Run dashboard tests and verify the new helper test fails before implementation.
- [x] Update `api.deleteTransaction` to return the deleted transaction payload.
- [x] Add an `undoToast` state in `App.jsx` after single-row delete, with an Undo button that calls `api.addTransaction` and restores allocations if needed.
- [x] Add toast CSS fixed near the bottom-right, avoiding the bulk bar and modal layers.
- [x] Rerun frontend tests and verify they pass.

### Task 4: Frontend Pending Match UI

**Files:**
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardWorkspace.jsx`
- Modify: `frontend/src/components/TransactionTable.jsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/dashboard.test.js`

- [x] Add frontend helper tests for indexing pending matches by pending transaction id.
- [x] Run dashboard tests and verify the new helper test fails before implementation.
- [x] Add API calls for `pendingMatches(year)` and `reconcilePending(pendingId, postedId)`.
- [x] Load pending matches with dashboard data.
- [x] Pass pending match data and reconcile handler into the pending reminder transaction table only.
- [x] Render a compact likely-match note and `Reconcile` button in pending rows with candidates.
- [x] After reconcile, refresh data and clear selected ids for the reconciled pending row.
- [x] Rerun frontend tests and verify they pass.

### Task 5: Verification, Docs, And Deploy

**Files:**
- Modify: `docs/transaction_rules.md`
- Modify: `CHANGELOG.md`

- [x] Document delete undo and pending reconciliation behavior.
- [x] Run `PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests/test_transaction_review.py`.
- [x] Run `npm test -- tests/dashboard.test.js`.
- [x] Run `npm run build`.
- [x] Use Browser visual QA locally for: pending card renders, edit modal save visible, and single delete asks confirmation without removing data. Pending-match reconcile UI is covered by backend/frontend tests and will be smoke-tested after the backend endpoint is deployed.
- [ ] Commit, push, deploy backend if API changed, deploy frontend, and smoke-test production endpoints.
