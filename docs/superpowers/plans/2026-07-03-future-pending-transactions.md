# Pending Transaction Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dashboard card that shows manual pending transactions so the user can avoid duplicate entry.

**Architecture:** Keep accounting unchanged. Derive manual pending reminder rows in frontend state from selected-year transaction data, render them with the existing `TransactionTable`, and reuse existing edit/split/delete handlers.

**Tech Stack:** React + Vite frontend, Node test runner, existing Moneo dashboard helpers.

---

### Task 1: Pending Reminder Helper

**Files:**
- Modify: `frontend/src/lib/dashboard.js`
- Test: `frontend/tests/dashboard.test.js`

- [ ] Add `getPendingReminderTransactions(transactions)` tests for manual pending rows, exclusion of posted/statement-backed/reconciled rows, and descending date sort.
- [ ] Run `npm test -- tests/dashboard.test.js` and verify the test fails because the helper is missing.
- [ ] Implement `getPendingReminderTransactions` in `frontend/src/lib/dashboard.js`.
- [ ] Run `npm test -- tests/dashboard.test.js` and verify it passes.

### Task 2: Dashboard Card

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardWorkspace.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] Compute pending reminder rows in `App.jsx` from selected-year transactions.
- [ ] Pass them into `DashboardWorkspace`.
- [ ] Render a compact `Pending / waiting for statement` section above the normal transaction table using `TransactionTable`.
- [ ] Reuse existing edit, split, delete, notes, selection, and menu props.
- [ ] Style the card so it feels like an alert/reminder without overwhelming the Dashboard.

### Task 3: Docs, Verification, Release

**Files:**
- Modify: `docs/transaction_rules.md`
- Modify: `CHANGELOG.md`

- [ ] Document that manual pending transactions appear in a Dashboard visibility card without changing period totals.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Use Browser visual QA when local frontend can be launched.
- [ ] Commit, push, and deploy the frontend if verification passes.
