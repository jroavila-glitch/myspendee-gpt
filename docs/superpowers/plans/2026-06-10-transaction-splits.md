# Transaction Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one income or expense transaction allocate its amount across two or more categories while preserving one source transaction in lists and bank reconciliation.

**Architecture:** Store split rows as `TransactionAllocation` children of the source transaction. Source-level totals continue to count the transaction once; category analytics and category drilldowns use allocation amounts whenever allocations exist. A dedicated frontend modal replaces allocations atomically through focused API endpoints.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, Pydantic, React 18, Vite, Node test runner.

---

## File Structure

- `backend/app/models/entities.py`: add `TransactionAllocation` and transaction relationship.
- `backend/app/models/__init__.py`: export the allocation model.
- `backend/alembic/versions/20260610_0004_add_transaction_allocations.py`: create allocation table and indexes.
- `backend/app/schemas/common.py`: allocation request/read schemas and split metadata on transactions.
- `backend/app/services/allocations.py`: validate, replace, remove, round, and serialize allocations.
- `backend/app/services/transactions.py`: serialize allocations; guard total/type edits; use allocations in breakdowns.
- `backend/app/services/insights.py`: use allocation categories for category averages while counting source totals once.
- `backend/app/main.py`: allocation endpoints and bulk-action guard.
- `backend/tests/test_transaction_allocations.py`: allocation service/API/analytics regression coverage.
- `backend/tests/test_insights.py`: split-aware category average/review coverage.
- `frontend/src/components/SplitTransactionModal.jsx`: dedicated split editor.
- `frontend/src/components/TransactionTable.jsx`: split badge, allocation summary, and Split/Edit Split action.
- `frontend/src/components/DashboardWorkspace.jsx`: allocated category drilldown rows.
- `frontend/src/lib/api.js`: allocation API methods.
- `frontend/src/lib/splits.js`: pure allocation calculations and validation.
- `frontend/src/lib/dashboard.js`: split-aware analytics/drilldowns/search.
- `frontend/src/App.jsx`: modal state and allocation save/undo flows.
- `frontend/src/styles/app.css`: desktop/mobile split-modal styles.
- `frontend/tests/splits.test.js`: split editor calculation tests.
- `frontend/tests/dashboard.test.js`: split-aware category analytics/drilldown tests.
- `docs/transaction_rules.md`, `CHANGELOG.md`: canonical behavior and release documentation.

### Task 1: Persist Allocation Child Records

**Files:**
- Modify: `backend/app/models/entities.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/20260610_0004_add_transaction_allocations.py`
- Create: `backend/tests/test_transaction_allocations.py`

- [ ] **Step 1: Write the failing allocation cascade test**

Create an in-memory SQLite test model setup in `backend/tests/test_transaction_allocations.py` and assert a transaction accepts ordered allocation children and deleting the transaction removes them:

```python
def test_transaction_owns_ordered_allocation_children(self) -> None:
    transaction = self.make_transaction(amount_mxn=Decimal("100.00"))
    transaction.allocations = [
        TransactionAllocation(category="Groceries", amount_mxn=Decimal("60.00"), position=0),
        TransactionAllocation(category="Home", amount_mxn=Decimal("40.00"), position=1),
    ]
    self.db.add(transaction)
    self.db.commit()

    loaded = self.db.get(Transaction, transaction.id)
    self.assertEqual(["Groceries", "Home"], [item.category for item in loaded.allocations])
    self.db.delete(loaded)
    self.db.commit()
    self.assertEqual([], self.db.scalars(select(TransactionAllocation)).all())
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_transaction_allocations -v
```

Expected: FAIL because `TransactionAllocation` and `Transaction.allocations` do not exist.

- [ ] **Step 3: Add the allocation model and relationship**

Implement:

```python
class TransactionAllocation(Base):
    __tablename__ = "transaction_allocations"
    __table_args__ = (
        Index("ix_transaction_allocations_transaction_id", "transaction_id"),
        Index("ix_transaction_allocations_category", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    amount_mxn: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_original: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    transaction: Mapped["Transaction"] = relationship(back_populates="allocations")
```

Add to `Transaction`:

```python
allocations: Mapped[list["TransactionAllocation"]] = relationship(
    back_populates="transaction",
    cascade="all, delete-orphan",
    passive_deletes=True,
    order_by="TransactionAllocation.position",
)
```

- [ ] **Step 4: Add the Alembic migration**

Create the table with all columns, the foreign key cascade, and the two indexes. The migration starts empty and does not backfill existing transactions.

- [ ] **Step 5: Run the focused test**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models backend/alembic/versions/20260610_0004_add_transaction_allocations.py backend/tests/test_transaction_allocations.py
git commit -m "Add transaction allocation model"
```

### Task 2: Validate And Replace Splits Atomically

**Files:**
- Create: `backend/app/services/allocations.py`
- Modify: `backend/app/schemas/common.py`
- Modify: `backend/tests/test_transaction_allocations.py`

- [ ] **Step 1: Write failing validation and replacement tests**

Add tests asserting:

```python
def test_replace_allocations_requires_two_rows_and_exact_total(self) -> None:
    with self.assertRaisesRegex(ValueError, "at least two allocations"):
        replace_allocations(self.db, self.transaction, [AllocationInput(category="Groceries", amount_original=Decimal("100"))])
    with self.assertRaisesRegex(ValueError, "must equal transaction total"):
        replace_allocations(self.db, self.transaction, [
            AllocationInput(category="Groceries", amount_original=Decimal("60")),
            AllocationInput(category="Home", amount_original=Decimal("30")),
        ])

def test_replace_allocations_rounds_mxn_and_marks_reviewed(self) -> None:
    allocations = replace_allocations(self.db, self.transaction, [
        AllocationInput(category="Groceries", amount_original=Decimal("33.33"), notes="Food"),
        AllocationInput(category="Home", amount_original=Decimal("66.67"), notes="Lamp"),
    ])
    self.assertEqual(Decimal("100.00"), sum(item.amount_original for item in allocations))
    self.assertEqual(self.transaction.amount_mxn, sum(item.amount_mxn for item in allocations))
    self.assertIsNotNone(self.transaction.reviewed_at)
```

Also test invalid type-category combinations and zero/negative amounts.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_transaction_allocations -v
```

Expected: FAIL because allocation schemas and service do not exist.

- [ ] **Step 3: Add schemas**

Add:

```python
class TransactionAllocationInput(BaseModel):
    category: str
    amount_original: Decimal | None = None
    amount_mxn: Decimal | None = None
    notes: str | None = None

class TransactionAllocationsUpdate(BaseModel):
    allocations: list[TransactionAllocationInput]
    expected_amount_mxn: Decimal
    expected_type: str

class TransactionAllocationRead(BaseModel):
    id: UUID
    category: str
    amount_original: Decimal | None
    amount_mxn: Decimal
    notes: str | None
    position: int
```

- [ ] **Step 4: Implement allocation service**

In `backend/app/services/allocations.py`, implement:

```python
def replace_allocations(db: Session, transaction: Transaction, inputs: list[TransactionAllocationInput]) -> list[TransactionAllocation]:
    if len(inputs) < 2:
        raise ValueError("A split requires at least two allocations")
    allowed_categories = INCOME_CATEGORIES if transaction.type == "income" else EXPENSE_CATEGORIES
    if transaction.type not in {"income", "expense"}:
        raise ValueError("Ignored transactions cannot be split")
    if any(item.category not in allowed_categories for item in inputs):
        raise ValueError("Every allocation category must match the transaction type")
    if any((item.amount_original or item.amount_mxn or ZERO) <= ZERO for item in inputs):
        raise ValueError("Allocation amounts must be greater than zero")
    resolved = resolve_allocation_amounts(transaction, inputs)
    if sum(item.amount_mxn for item in resolved) != transaction.amount_mxn:
        raise ValueError("Allocation amounts must equal transaction total")
    transaction.allocations = [
        TransactionAllocation(
            category=item.category,
            amount_original=item.amount_original,
            amount_mxn=item.amount_mxn,
            notes=item.notes,
            position=position,
        )
        for position, item in enumerate(resolved)
    ]
    transaction.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(transaction)
    return transaction.allocations
```

Implement `resolve_allocation_amounts()` using `Decimal("0.01")` quantization,
proportional MXN conversion, and final-row remainder adjustment. Implement
`remove_allocations(db, transaction, category)` with category validation,
allocation deletion, source category update, and reviewed state preservation.

- [ ] **Step 5: Run focused tests**

Expected: all allocation service tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/allocations.py backend/app/schemas/common.py backend/tests/test_transaction_allocations.py
git commit -m "Add transaction split validation"
```

### Task 3: Expose Split APIs And Protect Existing Edits

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/transactions.py`
- Modify: `backend/app/schemas/common.py`
- Modify: `backend/tests/test_transaction_allocations.py`
- Modify: `backend/tests/test_transaction_review.py`

- [ ] **Step 1: Write failing API and guard tests**

Test:

```python
def test_put_allocations_replaces_split_and_serializes_it(self) -> None:
    response = self.client.put(f"/transactions/{self.transaction.id}/allocations", json={
        "expected_amount_mxn": "100.00",
        "expected_type": "expense",
        "allocations": [
            {"category": "Groceries", "amount_original": "60.00", "notes": "Food"},
            {"category": "Home", "amount_original": "40.00", "notes": "Lamp"},
        ]
    })
    self.assertEqual(200, response.status_code)
    self.assertTrue(response.json()["is_split"])
    self.assertEqual(2, response.json()["allocation_count"])

def test_total_type_and_bulk_category_edits_reject_split_transactions(self) -> None:
    self.create_split(self.transaction)
    total_response = self.client.put(
        f"/transactions/{self.transaction.id}",
        json={"amount_mxn": "120.00"},
    )
    type_response = self.client.put(
        f"/transactions/{self.transaction.id}",
        json={"type": "income"},
    )
    bulk_response = self.client.post(
        "/transactions/bulk-update",
        json={"ids": [str(self.transaction.id)], "category": "Home"},
    )
    self.assertEqual(409, total_response.status_code)
    self.assertEqual(409, type_response.status_code)
    self.assertEqual(409, bulk_response.status_code)

def test_put_allocations_rejects_a_stale_transaction_total(self) -> None:
    response = self.client.put(f"/transactions/{self.transaction.id}/allocations", json={
        "expected_amount_mxn": "90.00",
        "expected_type": "expense",
        "allocations": [
            {"category": "Groceries", "amount_mxn": "50.00"},
            {"category": "Home", "amount_mxn": "50.00"},
        ],
    })
    self.assertEqual(409, response.status_code)
```

Test `DELETE /transactions/{id}/allocations?category=Home` returns an unsplit reviewed transaction.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_transaction_allocations backend.tests.test_transaction_review -v
```

Expected: FAIL because endpoints, serialization, and guards are missing.

- [ ] **Step 3: Serialize split metadata**

Extend `TransactionRead` with defaults:

```python
allocations: list[TransactionAllocationRead] = []
is_split: bool = False
allocation_count: int = 0
```

Extend `serialize_transaction()` to include ordered serialized allocations.

- [ ] **Step 4: Add endpoints**

Add:

```python
@app.put("/transactions/{transaction_id}/allocations", response_model=TransactionRead)
def set_transaction_allocations(
    transaction_id: UUID,
    payload: TransactionAllocationsUpdate,
    db: Session = Depends(get_db),
) -> TransactionRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if transaction.amount_mxn != payload.expected_amount_mxn or transaction.type != payload.expected_type:
        raise HTTPException(status_code=409, detail="Transaction changed; reopen the split editor")
    allocations = replace_allocations(db, transaction, payload.allocations)
    return TransactionRead.model_validate(serialize_transaction(transaction))

@app.delete("/transactions/{transaction_id}/allocations", response_model=TransactionRead)
def clear_transaction_allocations(
    transaction_id: UUID,
    category: str = Query(...),
    db: Session = Depends(get_db),
) -> TransactionRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    remove_allocations(db, transaction, category)
    return TransactionRead.model_validate(serialize_transaction(transaction))
```

Translate allocation `ValueError` messages to HTTP 422.

- [ ] **Step 5: Add split guards**

In `update_transaction`, reject changes to `amount_mxn`, `amount_original`, `currency_original`, or `type` when allocations exist and the supplied value changes.

In `bulk_update`, return HTTP 409 if selected split transactions would receive category or type changes. Mark-reviewed-only bulk actions remain allowed.

- [ ] **Step 6: Run focused and full backend tests**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/app/services/transactions.py backend/app/schemas/common.py backend/tests
git commit -m "Expose transaction split APIs"
```

### Task 4: Make Category Analytics Split-Aware

**Files:**
- Modify: `backend/app/services/transactions.py`
- Modify: `backend/app/services/insights.py`
- Modify: `backend/tests/test_transaction_allocations.py`
- Modify: `backend/tests/test_insights.py`

- [ ] **Step 1: Write failing summary/breakdown/insight tests**

Create a `100 MXN` expense split `60 Groceries / 40 Home` and assert:

```python
summary = get_summary(self.db, month=6, year=2026)
self.assertEqual(Decimal("100.00"), summary.expenses)

breakdown = get_breakdown(self.db, month=6, year=2026)
self.assertEqual(
    {("Groceries", Decimal("60.00")), ("Home", Decimal("40.00"))},
    {(item.category, item.total) for item in breakdown.expenses},
)
```

Add insight tests proving category averages use allocation amounts while review risk/source totals count the transaction once.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_transaction_allocations backend.tests.test_insights -v
```

Expected: breakdown and category-average assertions FAIL.

- [ ] **Step 3: Implement split-aware breakdown query**

Use a `UNION ALL` between:

```sql
SELECT transactions.category, transactions.type, transactions.amount_mxn
FROM transactions
WHERE NOT EXISTS (SELECT 1 FROM transaction_allocations WHERE transaction_id = transactions.id)
UNION ALL
SELECT transaction_allocations.category, transactions.type, transaction_allocations.amount_mxn
FROM transaction_allocations
JOIN transactions ON transactions.id = transaction_allocations.transaction_id
```

Apply source transaction date/bank/type filters to both branches before grouping.

- [ ] **Step 4: Implement split-aware insight category averages**

Build category average inputs from allocation rows for split transactions and source rows for unsplit transactions. Keep income/expense/net and review amount calculations source-based.

- [ ] **Step 5: Run focused and full backend tests**

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/transactions.py backend/app/services/insights.py backend/tests
git commit -m "Use splits in category analytics"
```

### Task 5: Add Frontend Split Calculation Helpers

**Files:**
- Create: `frontend/src/lib/splits.js`
- Create: `frontend/tests/splits.test.js`

- [ ] **Step 1: Write failing pure-function tests**

Test:

```javascript
test('calculates amount and percentage while assigning final remainder', () => {
  assert.deepEqual(
    allocateByPercent(100, [60, 40]),
    [60, 40],
  )
  assert.deepEqual(
    allocateByPercent(100, [33.33, 33.33, 33.34]),
    [33.33, 33.33, 33.34],
  )
})

test('validates exact totals and at least two positive rows', () => {
  assert.equal(validateSplitRows([{ amount: 60 }, { amount: 40 }], 100).valid, true)
  assert.match(validateSplitRows([{ amount: 100 }], 100).message, /at least two/)
  assert.match(validateSplitRows([{ amount: 60 }, { amount: 30 }], 100).message, /remaining/)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test --prefix frontend -- --test-name-pattern="split|allocat"
```

Expected: FAIL because `splits.js` does not exist.

- [ ] **Step 3: Implement helpers**

Implement decimal-safe cent arithmetic helpers:

```javascript
const toCents = (value) => Math.round(Number(value || 0) * 100)
const fromCents = (value) => Number((value / 100).toFixed(2))

export function amountToPercent(amount, total) {
  return total ? Number(((Number(amount) / Number(total)) * 100).toFixed(2)) : 0
}

export function percentToAmount(percent, total) {
  return fromCents(Math.round((toCents(total) * Number(percent || 0)) / 100))
}

export function applyRemainder(rows, total) {
  const remainder = toCents(total) - rows.slice(0, -1).reduce((sum, row) => sum + toCents(row.amount), 0)
  return rows.map((row, index) => index === rows.length - 1
    ? { ...row, amount: fromCents(remainder), percent: amountToPercent(fromCents(remainder), total) }
    : row)
}

export function validateSplitRows(rows, total) {
  if (rows.length < 2) return { valid: false, message: 'Add at least two allocations.' }
  if (rows.some((row) => !row.category || toCents(row.amount) <= 0)) {
    return { valid: false, message: 'Every allocation needs a category and positive amount.' }
  }
  const remaining = toCents(total) - rows.reduce((sum, row) => sum + toCents(row.amount), 0)
  return remaining === 0
    ? { valid: true, message: '' }
    : { valid: false, message: `${fromCents(Math.abs(remaining))} remaining.` }
}

export function buildSplitPayload(rows, transaction) {
  return rows.map(({ category, amount, notes }) => ({
    category,
    amount_original: transaction.amount_original == null ? null : amount,
    amount_mxn: transaction.amount_original == null ? amount : null,
    notes: notes || null,
  }))
}
```

- [ ] **Step 4: Run frontend tests**

Expected: split helper tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/splits.js frontend/tests/splits.test.js
git commit -m "Add split allocation calculations"
```

### Task 6: Build Dedicated Split Transaction Modal

**Files:**
- Create: `frontend/src/components/SplitTransactionModal.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/tests/splits.test.js`

- [ ] **Step 1: Add failing state-transition tests**

Add pure helper/state tests for:

- opening an unsplit transaction creates two rows and assigns the second row the remainder
- editing amount updates percentage
- editing percentage updates amount
- Save remains invalid until total reconciles
- Undo Split requires a replacement category

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test --prefix frontend -- --test-name-pattern="split"
```

Expected: FAIL for missing state helpers.

- [ ] **Step 3: Add API methods**

```javascript
setAllocations: (id, transaction, allocations) => request(`/transactions/${id}/allocations`, {
  method: 'PUT',
  body: JSON.stringify({
    expected_amount_mxn: transaction.amount_mxn,
    expected_type: transaction.type,
    allocations,
  }),
}),
clearAllocations: (id, category) => request(`/transactions/${id}/allocations?category=${encodeURIComponent(category)}`, {
  method: 'DELETE',
}),
```

- [ ] **Step 4: Implement the modal**

Build the approved dedicated modal with:

- source transaction header
- category, amount, percent, note, remove controls
- add category
- live allocated/remaining totals
- final-row remainder action
- disabled Save until valid
- Undo Split with replacement category confirmation
- desktop grid and mobile stacked cards

- [ ] **Step 5: Wire App state and reload flow**

Add `splittingTransaction` state. Saving or undoing calls the API, closes the modal, and reloads transactions/insights. Opening Split from Review closes the Review modal and returns to it after save/cancel, matching existing edit behavior.

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SplitTransactionModal.jsx frontend/src/App.jsx frontend/src/lib/api.js frontend/src/styles/app.css frontend/tests/splits.test.js
git commit -m "Add split transaction modal"
```

### Task 7: Show Splits In Lists And Drilldowns

**Files:**
- Modify: `frontend/src/components/TransactionTable.jsx`
- Modify: `frontend/src/components/DashboardWorkspace.jsx`
- Modify: `frontend/src/lib/dashboard.js`
- Modify: `frontend/tests/dashboard.test.js`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: Write failing split-aware dashboard tests**

Test:

```javascript
test('category drilldown shows allocation amount and source total', () => {
  const transaction = {
    id: 'one',
    type: 'expense',
    amount_mxn: 100,
    category: 'Other',
    allocations: [
      { category: 'Groceries', amount_mxn: 60 },
      { category: 'Home', amount_mxn: 40 },
    ],
  }
  assert.deepEqual(filterTransactionsByDrilldown([transaction], { category: 'Home', type: 'expense' }), [{
    ...transaction,
    drilldown_amount_mxn: 40,
    source_amount_mxn: 100,
  }])
})
```

Also test workspace search matches allocation category/note and frontend analytics use allocations for category totals without duplicating summary totals.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test --prefix frontend -- --test-name-pattern="allocation|split|drilldown"
```

Expected: FAIL.

- [ ] **Step 3: Implement split-aware frontend helpers**

Update drilldown filtering to clone a transaction with allocation-context fields for the selected category. Update search and client-side category analytics to read allocations while source summary totals remain unchanged.

- [ ] **Step 4: Add split presentation and actions**

In `TransactionTable`:

- show `Split · N categories` badge
- show concise category/amount summary
- add `Split transaction` or `Edit split` menu action
- display allocated amount in category drilldown context and original total beneath it

- [ ] **Step 5: Run frontend tests and build**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components frontend/src/lib/dashboard.js frontend/src/styles/app.css frontend/tests/dashboard.test.js
git commit -m "Show splits in transaction views"
```

### Task 8: Document Rules And Run End-To-End Verification

**Files:**
- Modify: `docs/transaction_rules.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/runbooks/deploy-and-restore.md` only if deployment procedure changes

- [ ] **Step 1: Update canonical rules**

Document:

- source transaction remains one bank record
- splits require two or more same-type categories
- allocation totals reconcile exactly
- category analytics use allocation amounts
- source summaries count transactions once
- splits are reviewed manual decisions
- total/type and bulk category/type edits reject split transactions
- undo split restores one category

- [ ] **Step 2: Run full verification**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -v
npm test --prefix frontend
npm run build --prefix frontend
git diff --check
```

Expected: all backend/frontend tests pass, Vite build succeeds, and diff check is clean.

- [ ] **Step 3: Apply migration locally**

Run from `backend/`:

```bash
PYTHONPATH=. .venv/bin/alembic upgrade head
PYTHONPATH=. .venv/bin/alembic current
```

Expected: current revision is `20260610_0004`.

- [ ] **Step 4: Run Browser visual QA**

Flow under test:

```text
Dashboard or Review transaction menu -> Split transaction -> allocate across 2–3 categories -> save -> split badge appears -> category drilldown shows allocated amount -> Edit split -> Undo Split
```

Verify desktop and mobile:

- modal opens without layout overlap
- Save is disabled for invalid totals
- amount/percentage/remainder behavior is clear
- split badge and summaries are readable
- drilldown shows allocation amount plus original total
- no relevant console errors

- [ ] **Step 5: Update changelog and commit**

```bash
git add docs/transaction_rules.md CHANGELOG.md docs/runbooks/deploy-and-restore.md
git commit -m "Document transaction splits"
```

- [ ] **Step 6: Request code review and finish branch**

Use `superpowers:requesting-code-review`, fix actionable findings, rerun full verification, then use `superpowers:finishing-a-development-branch`.
