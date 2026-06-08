# Moneo Financial Clarity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Moneo's guided financial Dashboard, transparent comparisons and Month Status, and dedicated Review workspace without regressing statement imports or transaction rules.

**Architecture:** Keep FastAPI as the source of deterministic comparison/status data through a new `/insights` endpoint, while the React client owns display-currency conversion and workspace interaction. Split the current monolithic `App.jsx` into focused workspace and calculation modules incrementally, preserving existing API behavior and manual-edit overrides throughout.

**Tech Stack:** FastAPI, SQLAlchemy 2, Pydantic 2, PostgreSQL, React 18, Vite 7, Recharts, Node test runner, Python `unittest`, Railway, Vercel, Browser plugin.

---

## Scope And Delivery Boundaries

This plan implements the approved design in five shippable slices:

1. Frontend workspace foundations and existing-data Dashboard hierarchy
2. Backend comparisons and review metadata
3. Guided Dashboard with comparisons and transparent Month Status
4. Dedicated Review workspace
5. Responsive/premium polish, Browser QA, documentation, and release

Do not add machine-learning confidence scores, persistent user settings, new
database columns, or schema migrations in this release. The 25% savings target
is an explicit constant. Review reasons are computed deterministically from
existing transaction fields.

## Target File Structure

### Backend

- `backend/app/services/insights.py`: period resolution, comparisons, Month
  Status, review-reason calculation, and `/insights` response assembly
- `backend/app/schemas/insights.py`: typed response models for comparisons,
  status, and review reasons
- `backend/app/main.py`: thin `/insights` route only
- `backend/tests/test_insights.py`: deterministic unit tests for period,
  comparison, status, and review-reason behavior

### Frontend

- `frontend/src/lib/dashboard.js`: pure display-currency Dashboard calculations
  and drill-down filter helpers
- `frontend/src/lib/review.js`: review grouping and selection helpers
- `frontend/src/components/AppHeader.jsx`: shared workspace navigation/actions
- `frontend/src/components/GlobalFilters.jsx`: shared global Dashboard filters
- `frontend/src/components/TransactionTable.jsx`: reusable transaction table
- `frontend/src/components/DashboardWorkspace.jsx`: guided financial Dashboard
- `frontend/src/components/ReviewWorkspace.jsx`: dedicated review workflow
- `frontend/src/components/StatementsWorkspace.jsx`: extracted Statements view
- `frontend/src/App.jsx`: data loading, global state, modal orchestration, and
  workspace composition
- `frontend/src/styles/app.css`: calm-premium tokens and responsive workspace
  styling
- `frontend/tests/dashboard.test.js`: pure Dashboard calculation tests
- `frontend/tests/review.test.js`: pure review helper tests

---

### Task 0: Preserve The Current Production Rule Changes

**Files:**
- Verify: `backend/app/schemas/common.py`
- Verify: `backend/app/services/classification.py`
- Verify: `backend/tests/test_classification_rules.py`
- Verify: `backend/app/services/arq_parser.py`
- Verify: `backend/tests/test_arq_parser.py`
- Verify: `docs/transaction_rules.md`
- Verify: `docs/runbooks/deploy-and-restore.md`
- Verify: `CHANGELOG.md`
- Verify: `frontend/src/App.jsx`

- [ ] **Step 1: Review the dirty worktree before redesign edits**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: only the already-completed Moneo identity, ARQ parser, Tennis Rush,
Clube VII/Unitenis, docs, and related regression-test changes are present.

- [ ] **Step 2: Re-run the existing verification set**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python -m unittest \
  backend.tests.test_arq_parser \
  backend.tests.test_classification_rules \
  backend.tests.test_normalization_rules \
  backend.tests.test_fx_rates \
  backend.tests.test_hsbc_parser \
  backend.tests.test_rappi_parser -v
npm test --prefix frontend
npm run build --prefix frontend
```

Expected: 33 backend tests pass, 4 frontend tests pass, and Vite builds.

- [ ] **Step 3: Commit the existing completed changes separately**

```bash
git add CHANGELOG.md backend/.env.example backend/app/schemas/common.py \
  backend/app/services/arq_parser.py backend/app/services/classification.py \
  backend/tests/test_arq_parser.py backend/tests/test_classification_rules.py \
  docs/runbooks/deploy-and-restore.md docs/transaction_rules.md frontend/src/App.jsx
git commit -m "Apply Moneo identity and transaction rule updates"
```

Expected: redesign work begins from a clean worktree and does not bury the
already-deployed production rules in a UI commit.

---

### Task 1: Add Pure Frontend Dashboard And Review Helpers

**Files:**
- Create: `frontend/src/lib/dashboard.js`
- Create: `frontend/src/lib/review.js`
- Create: `frontend/tests/dashboard.test.js`
- Create: `frontend/tests/review.test.js`

- [ ] **Step 1: Write failing Dashboard helper tests**

Create `frontend/tests/dashboard.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  calculateSavingsRate,
  convertInsightMetric,
} from '../src/lib/dashboard.js'

const rates = { MXN: 1, EUR: 20, USD: 18 }

test('calculates income expenses net and savings rate', () => {
  const transactions = [
    { type: 'income', category: 'Tennis Rush', amount_mxn: 1000, currency_original: 'MXN' },
    { type: 'expense', category: 'Food & Drink', amount_mxn: 250, currency_original: 'MXN' },
    { type: 'ignored', category: 'ignored', amount_mxn: 500, currency_original: 'MXN' },
  ]
  const analytics = buildDisplayAnalytics(transactions, 'MXN', rates)
  assert.deepEqual(analytics.summary, { income: 1000, expenses: 250, net: 750 })
  assert.equal(calculateSavingsRate(analytics.summary), 75)
})

test('builds a category drilldown filter', () => {
  assert.deepEqual(
    buildDrilldownFilter({ category: 'Food & Drink', type: 'expense' }),
    { category: 'Food & Drink', type: 'expense' },
  )
})

test('converts backend MXN insight metrics into display currency', () => {
  assert.equal(convertInsightMetric(400, 'EUR', rates), 20)
})
```

- [ ] **Step 2: Write failing review-helper tests**

Create `frontend/tests/review.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { groupReviewReasons, reviewAffectedValue } from '../src/lib/review.js'

test('groups review reasons and totals affected MXN value', () => {
  const items = [
    { review_reasons: ['Unclassified'], amount_mxn: 100 },
    { review_reasons: ['Unclassified', 'Higher than usual'], amount_mxn: 50 },
  ]
  assert.deepEqual(groupReviewReasons(items), [
    { label: 'Unclassified', count: 2 },
    { label: 'Higher than usual', count: 1 },
  ])
  assert.equal(reviewAffectedValue(items), 150)
})
```

- [ ] **Step 3: Run tests and verify missing-module failures**

Run:

```bash
npm test --prefix frontend
```

Expected: FAIL because `dashboard.js` and `review.js` do not exist.

- [ ] **Step 4: Implement the pure helpers**

Create `frontend/src/lib/dashboard.js` with:

```js
import { getDisplayAmount } from './currency.js'

export function calculateSavingsRate({ income, net }) {
  return income > 0 ? Number(((net / income) * 100).toFixed(1)) : 0
}

export function buildDisplayAnalytics(transactions, displayCurrency, displayRates) {
  const summary = { income: 0, expenses: 0, net: 0 }
  const grouped = new Map()
  for (const transaction of transactions) {
    if (transaction.type === 'ignored') continue
    const amount = getDisplayAmount(transaction, displayCurrency, displayRates)
    if (transaction.type === 'income') summary.income += amount
    if (transaction.type === 'expense') summary.expenses += amount
    const key = `${transaction.type}::${transaction.category}`
    const current = grouped.get(key) || {
      category: transaction.category,
      type: transaction.type,
      total: 0,
      count: 0,
    }
    current.total += amount
    current.count += 1
    grouped.set(key, current)
  }
  summary.net = summary.income - summary.expenses
  const items = [...grouped.values()]
    .map((item) => ({ ...item, total: Number(item.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)
  return {
    summary,
    breakdown: {
      income: items.filter((item) => item.type === 'income'),
      expenses: items.filter((item) => item.type === 'expense'),
    },
  }
}

export function buildDrilldownFilter({ category = '', type = '' }) {
  return { category, type }
}

export function convertInsightMetric(valueMxn, displayCurrency, displayRates) {
  if (displayCurrency === 'MXN') return Number(valueMxn || 0)
  const rate = Number(displayRates[displayCurrency] || 0)
  return rate ? Number(valueMxn || 0) / rate : Number(valueMxn || 0)
}
```

Create `frontend/src/lib/review.js` with deterministic grouping and affected
value helpers. Sort reason groups by descending count and then label.

- [ ] **Step 5: Run frontend tests**

Run:

```bash
npm test --prefix frontend
```

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/dashboard.js frontend/src/lib/review.js \
  frontend/tests/dashboard.test.js frontend/tests/review.test.js
git commit -m "Add dashboard and review calculation helpers"
```

---

### Task 2: Add Deterministic Backend Insights Models And Logic

**Files:**
- Create: `backend/app/schemas/insights.py`
- Create: `backend/app/services/insights.py`
- Create: `backend/tests/test_insights.py`

- [ ] **Step 1: Write failing tests for review reasons and Month Status**

Create `backend/tests/test_insights.py` with unit tests for pure functions:

```python
from datetime import date
from decimal import Decimal
from unittest import TestCase

from app.services.insights import (
    calculate_month_status,
    calculate_percent_change,
    review_reasons_for_transaction,
    resolve_comparison_period,
)


class InsightsTest(TestCase):
    def test_previous_month_preserves_full_month_bounds(self) -> None:
        current, previous = resolve_comparison_period(
            year=2026, month=5, date_from=None, date_to=None
        )
        self.assertEqual((date(2026, 5, 1), date(2026, 5, 31)), current)
        self.assertEqual((date(2026, 4, 1), date(2026, 4, 30)), previous)

    def test_percent_change_handles_zero_baseline(self) -> None:
        self.assertIsNone(calculate_percent_change(Decimal("10"), Decimal("0")))

    def test_status_is_needs_attention_for_negative_net(self) -> None:
        status = calculate_month_status(
            income=Decimal("1000"),
            expenses=Decimal("1200"),
            average_expenses=Decimal("800"),
            review_count=0,
            review_amount=Decimal("0"),
        )
        self.assertEqual("Needs Attention", status.label)
        self.assertIn("negative net", status.explanation.lower())

    def test_unclassified_expense_has_explicit_review_reason(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Other",
            tx_type="expense",
            notes="Unclassified expense — manual review needed",
            amount_mxn=Decimal("100"),
            category_average=None,
        )
        self.assertIn("Unclassified", reasons)
```

- [ ] **Step 2: Run the failing insights tests**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python \
  -m unittest backend.tests.test_insights -v
```

Expected: FAIL because the insights module does not exist.

- [ ] **Step 3: Define typed response schemas**

Create `backend/app/schemas/insights.py` with Pydantic models:

```python
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class MetricComparison(BaseModel):
    current: Decimal
    previous: Decimal
    average: Decimal | None
    previous_change_percent: Decimal | None

class MonthStatusRead(BaseModel):
    label: Literal["Excellent", "Healthy", "Watch", "Needs Attention"]
    explanation: str
    savings_rate: Decimal
    target_savings_rate: Decimal = Decimal("25")

class ReviewReasonSummary(BaseModel):
    label: str
    count: int

class ReviewItemInsight(BaseModel):
    transaction_id: UUID
    reasons: list[str]

class InsightsResponse(BaseModel):
    income: MetricComparison
    expenses: MetricComparison
    net: MetricComparison
    status: MonthStatusRead
    review_count: int
    review_amount_mxn: Decimal
    review_reasons: list[ReviewReasonSummary]
    review_items: list[ReviewItemInsight]
```

- [ ] **Step 4: Implement pure deterministic insights functions**

Create `backend/app/services/insights.py` with:

- `resolve_comparison_period(...)` for month, YTD, and custom ranges
- `calculate_percent_change(current, previous)`
- `review_reasons_for_transaction(...)`
- `calculate_month_status(...)`

Use these initial explicit status rules:

```python
if net < 0:
    label = "Needs Attention"
elif savings_rate >= 35 and spending_ratio <= Decimal("1.05") and review_risk < Decimal("0.05"):
    label = "Excellent"
elif savings_rate >= 25 and spending_ratio <= Decimal("1.15") and review_risk < Decimal("0.10"):
    label = "Healthy"
elif savings_rate >= 0:
    label = "Watch"
else:
    label = "Needs Attention"
```

Where `spending_ratio = expenses / average_expenses` when an average exists,
otherwise `1`, and `review_risk = review_amount / income` when income is
positive, otherwise `0`.

Initial review reasons:

- `Unclassified`: category is `Other` expense or manual-review note exists
- `Missing FX`: non-MXN transaction has no original amount or exchange rate
- `Higher than usual`: amount is at least twice a non-zero category average

Do not implement possible-duplicate or unexpected-category-change reasons until
there is reliable historical/audit data.

- [ ] **Step 5: Run insights tests**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python \
  -m unittest backend.tests.test_insights -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/insights.py backend/app/services/insights.py \
  backend/tests/test_insights.py
git commit -m "Add deterministic financial insights logic"
```

---

### Task 3: Expose The Insights API

**Files:**
- Modify: `backend/app/services/insights.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/lib/api.js`
- Test: `backend/tests/test_insights.py`

- [ ] **Step 1: Add a failing service-level insights test**

Extend `backend/tests/test_insights.py` with a fake session or lightweight
in-memory test double that verifies `get_insights(...)`:

- applies current global filters
- computes the previous equivalent period
- computes a recent monthly average from the prior three complete months
- returns per-transaction review IDs/reasons for the current period only

Use fixed transactions spanning February-May 2026. Expected May comparison:

```python
self.assertEqual(Decimal("1000"), response.income.current)
self.assertEqual(Decimal("800"), response.income.previous)
self.assertEqual(Decimal("750"), response.income.average)
self.assertEqual("Healthy", response.status.label)
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python \
  -m unittest backend.tests.test_insights -v
```

Expected: FAIL because `get_insights` is missing.

- [ ] **Step 3: Implement `get_insights` using SQLAlchemy queries**

Reuse `apply_transaction_filters` for current-period filtering. Query previous
and average windows with the same bank and activity-type filters. Category is
not sent to `/insights`; category drill-down affects only the transaction
preview so the Dashboard story remains globally meaningful.

- [ ] **Step 4: Add the thin FastAPI route**

Add to `backend/app/main.py`:

```python
@app.get("/insights", response_model=InsightsResponse)
def insights(
    month: int | None = Query(default=None),
    year: int = Query(...),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> InsightsResponse:
    return get_insights(
        db,
        month=month,
        year=year,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        type=type,
    )
```

- [ ] **Step 5: Add the frontend API method**

Add to `frontend/src/lib/api.js`:

```js
insights: (params) => request(`/insights?${new URLSearchParams(params).toString()}`),
```

- [ ] **Step 6: Run backend verification**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python \
  -m unittest discover -s backend/tests -v
```

Expected: all runnable backend tests pass. If `test_upload_rules` cannot import
because local SQLAlchemy is missing, repair the local venv before continuing;
SQLAlchemy is required for this task's tests.

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/app/services/insights.py \
  backend/tests/test_insights.py frontend/src/lib/api.js
git commit -m "Expose financial insights API"
```

---

### Task 4: Extract Shared Frontend Workspace Components

**Files:**
- Create: `frontend/src/components/AppHeader.jsx`
- Create: `frontend/src/components/GlobalFilters.jsx`
- Create: `frontend/src/components/TransactionTable.jsx`
- Create: `frontend/src/components/StatementsWorkspace.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: Extract `AppHeader` and add the Review tab**

Move brand, workspace tabs, New Transaction, and Upload PDFs controls from
`App.jsx` into `AppHeader.jsx`. Tabs must be `dashboard`, `review`, and
`statements`.

- [ ] **Step 2: Extract `GlobalFilters`**

Move period, year/custom dates, display currency, bank, and activity type into
`GlobalFilters.jsx`. Remove the permanent left filter sidebar. Keep category and
search as visible drill-down/search chips near the transaction preview.

- [ ] **Step 3: Extract `TransactionTable`**

Move the transaction header/list/notes/actions markup into
`TransactionTable.jsx`. Accept transactions, selected IDs, category options,
display currency/rates, and event callbacks as props. Preserve notes autosave,
manual edit, delete, and bulk selection behavior.

- [ ] **Step 4: Extract `StatementsWorkspace`**

Move the existing statement list into `StatementsWorkspace.jsx` without
behavior changes.

- [ ] **Step 5: Recompose `App.jsx`**

Keep `App.jsx` responsible for:

- global data loading and query params
- workspace selection
- modal state
- transaction mutation callbacks
- shared selected-ID/bulk state

Do not change Dashboard content yet beyond using `GlobalFilters`.

- [ ] **Step 6: Verify behavior and build**

Run:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

Expected: tests and build pass.

Use Browser to verify:

- Dashboard loads
- Review and Statements tabs switch
- filters still update transactions
- notes autosave still works
- edit modal and upload control still open

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/AppHeader.jsx \
  frontend/src/components/GlobalFilters.jsx \
  frontend/src/components/TransactionTable.jsx \
  frontend/src/components/StatementsWorkspace.jsx frontend/src/styles/app.css
git commit -m "Split Moneo into focused workspaces"
```

---

### Task 5: Build The Guided Financial Dashboard

**Files:**
- Create: `frontend/src/components/DashboardWorkspace.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/dashboard.test.js`

- [ ] **Step 1: Extend Dashboard helper tests**

Add tests for:

- review-banner affected value formatting inputs
- savings-rate calculation when income is zero
- click-to-explain drill-down preserving global bank/type filters

- [ ] **Step 2: Run tests and verify the new case fails**

Run:

```bash
npm test --prefix frontend
```

- [ ] **Step 3: Implement `DashboardWorkspace`**

Render in this exact order:

1. Review banner with count, affected value, reason summary, and Review action
2. Net cash-flow hero and Month Status
3. Income, expenses, and savings-rate KPI cards with arrows
4. Ranked spending and income lists
5. Applied drill-down chip
6. Compact recent-transactions preview using `TransactionTable`

Use `/insights` for comparison/status/review summary and
`buildDisplayAnalytics` for display-currency current-period values. Convert
backend MXN comparison values with `convertInsightMetric` before rendering them
in the selected display currency.

- [ ] **Step 4: Wire click-to-explain**

Income KPI sets `{ type: "income", category: "" }`.
Expenses KPI sets `{ type: "expense", category: "" }`.
Breakdown rows set both category and type.
The applied drill-down chip clears category/type without resetting period,
currency, or bank.

- [ ] **Step 5: Apply calm-premium Dashboard styling**

In `frontend/src/styles/app.css`:

- make net cash flow the visual anchor
- reserve amber for review/caution and green for positive movement
- replace decorative insight-strip cards with meaningful KPI hierarchy
- use ranked bars/lists rather than mandatory pie charts
- preserve visible focus states and reduced-motion behavior

- [ ] **Step 6: Verify**

Run:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

Use Browser at desktop and mobile widths to verify hierarchy, comparison labels,
drill-down behavior, empty states, and no clipping.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/DashboardWorkspace.jsx \
  frontend/src/lib/dashboard.js frontend/tests/dashboard.test.js \
  frontend/src/styles/app.css
git commit -m "Build guided financial dashboard"
```

---

### Task 6: Build The Dedicated Review Workspace

**Files:**
- Create: `frontend/src/components/ReviewWorkspace.jsx`
- Modify: `frontend/src/components/TransactionTable.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/src/lib/review.js`
- Test: `frontend/tests/review.test.js`

- [ ] **Step 1: Add failing review-state tests**

Test that:

- transactions are filtered by `transaction_id` values returned in
  `/insights.review_items`
- reasons are grouped deterministically
- selecting the next unresolved transaction after an update is stable

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test --prefix frontend
```

- [ ] **Step 3: Implement `ReviewWorkspace`**

Default compact row content:

- review reason
- merchant/description
- date and bank
- category/type
- amount
- quick edit action

Expandable content:

- statement source
- original amount/currency
- MXN amount and exchange rate
- notes
- all review reasons
- current automatic category/type

Use existing update and bulk-update endpoints. A successfully categorized item
leaves the queue after data reload.

- [ ] **Step 4: Add keyboard interactions**

When focus is outside an input:

- `j` / `k`: move active review row
- `e`: open edit modal
- `x`: toggle selection
- `Escape`: collapse details or close menus

Do not add single-key category mutations; destructive or financial changes must
remain explicit.

- [ ] **Step 5: Implement trust-confirmation empty state**

When no review IDs remain, show:

> Review complete. Dashboard categories are trusted for this period.

- [ ] **Step 6: Verify**

Run:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

Use Browser to verify banner-to-Review navigation, expand/collapse, keyboard
navigation, bulk update, edit modal, and empty state.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ReviewWorkspace.jsx \
  frontend/src/components/TransactionTable.jsx frontend/src/lib/review.js \
  frontend/tests/review.test.js frontend/src/styles/app.css
git commit -m "Add dedicated transaction review workspace"
```

---

### Task 7: Complete Responsive And Premium Polish

**Files:**
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/src/components/AppHeader.jsx`
- Modify: `frontend/src/components/GlobalFilters.jsx`
- Modify: `frontend/src/components/DashboardWorkspace.jsx`
- Modify: `frontend/src/components/ReviewWorkspace.jsx`
- Modify: `docs/roadmap.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Audit desktop hierarchy**

Use Browser at approximately 1440×900. Verify:

- review banner appears before financial status
- net cash flow dominates
- comparisons remain readable but secondary
- category/source rows look interactive
- recent transactions do not overpower insights

- [ ] **Step 2: Audit tablet and mobile**

Use Browser near 1024×768 and 390×844. Verify:

- global filters wrap/collapse coherently
- story order is preserved
- KPI cards stack without clipped values
- review row actions remain reachable
- no horizontal page scroll

- [ ] **Step 3: Audit accessibility and motion**

Verify:

- visible keyboard focus
- semantic buttons for all clickable rows
- labels/aria text for icon-only actions
- status is not conveyed by color alone
- motion respects `prefers-reduced-motion`

- [ ] **Step 4: Update product documentation**

Update `docs/roadmap.md` to mark the financial-clarity Dashboard and Review
workspace as delivered. Add a meaningful `CHANGELOG.md` entry describing the
new Dashboard, comparisons, Month Status, and Review workflow.

- [ ] **Step 5: Run full verification**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend backend/.venv/bin/python \
  -m unittest discover -s backend/tests -v
npm test --prefix frontend
npm run build --prefix frontend
git diff --check
```

Expected: all tests/build pass and no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/app.css frontend/src/components \
  docs/roadmap.md CHANGELOG.md
git commit -m "Polish financial clarity experience"
```

---

### Task 8: Production Release And Smoke Test

**Files:**
- Follow: `docs/runbooks/deploy-and-restore.md`
- Verify: Railway backend service `d80156f1-6bc2-4f9f-a83b-57d3e8a4b005`
- Verify: Vercel project `moneoapp`

- [ ] **Step 1: Deploy backend first**

Deploy only `backend/` to the confirmed Railway backend service. Smoke test:

```bash
curl -s https://backend-production-d437.up.railway.app/health
curl -s 'https://backend-production-d437.up.railway.app/insights?year=2026&month=5'
```

Expected: health is OK and insights returns comparisons, status, and review
metadata.

- [ ] **Step 2: Deploy frontend**

From `frontend/`, run:

```bash
npm test
npm run build
vercel --prod --yes
```

Expected: deployment targets the `moneoapp` Vercel project.

- [ ] **Step 3: Production Browser smoke test**

Use Browser while authenticated to verify:

- Dashboard loads
- global filters update the financial story
- review banner opens Review
- KPI/category/source drill-down works
- Review edit/bulk actions work
- Statements load and upload modal opens
- mobile layout has no overflow
- console has no relevant errors

- [ ] **Step 4: Verify rollback readiness**

Record the Railway deployment ID and Vercel production deployment URL in the
release notes or final handoff. If any smoke test fails, redeploy the last known
good frontend/backend deployment before touching production data.

- [ ] **Step 5: Final commit if release docs changed**

```bash
git add CHANGELOG.md docs/roadmap.md docs/runbooks/deploy-and-restore.md
git commit -m "Document financial clarity dashboard release"
```

---

## Plan Self-Review

- Spec coverage: Dashboard hierarchy, global filters, review banner, comparisons,
  four-level Month Status, 25% target, dedicated Review, Statements separation,
  responsive behavior, errors/empty states, testing, and staged release are
  covered.
- Scope control: persistent settings, ML confidence, audit-history-based review
  reasons, and database migrations are explicitly excluded.
- Type consistency: `/insights` owns MXN comparison/status values; the frontend
  owns display-currency current-period analytics and UI drill-down state.
- Release safety: backend deploy precedes frontend, and both use the confirmed
  Moneo production targets.
