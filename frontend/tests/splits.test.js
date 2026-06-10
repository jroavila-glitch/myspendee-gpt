import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateByPercent,
  amountToPercent,
  buildSplitPayload,
  createSplitModalState,
  isSplitModalSaveValid,
  isUndoSplitValid,
  percentToAmount,
  updateSplitRowAmount,
  updateSplitRowPercent,
  updateUndoReplacementCategory,
  validateSplitRows,
} from '../src/lib/splits.js'

test('allocates by percent and assigns the final remainder', () => {
  assert.deepEqual(allocateByPercent(100, [60, 40]), [60, 40])
  assert.deepEqual(allocateByPercent(100, [33.33, 33.33, 33.34]), [33.33, 33.33, 33.34])
})

test('validates two split rows whose amounts equal the transaction amount', () => {
  const result = validateSplitRows([
    { amount: 60, category: 'Groceries' },
    { amount: 40, category: 'Home' },
  ], 100)

  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.remaining, 0)
})

test('rejects invalid split rows with actionable messages', () => {
  assert.deepEqual(
    validateSplitRows([{ amount: 100, category: 'Groceries' }], 100),
    {
      valid: false,
      errors: ['Add at least two split rows.'],
      remaining: 0,
    },
  )

  assert.deepEqual(
    validateSplitRows([
      { amount: 60, category: 'Groceries' },
      { amount: 40, category: '' },
    ], 100),
    {
      valid: false,
      errors: ['Choose a category for every split row.'],
      remaining: 0,
    },
  )

  assert.deepEqual(
    validateSplitRows([
      { amount: 100, category: 'Groceries' },
      { amount: 0, category: 'Home' },
    ], 100),
    {
      valid: false,
      errors: ['Split amounts must be greater than zero.'],
      remaining: 0,
    },
  )

  assert.deepEqual(
    validateSplitRows([
      { amount: 60, category: 'Groceries' },
      { amount: 40, category: 'Groceries' },
    ], 100),
    {
      valid: false,
      errors: ['Split categories must be unique.'],
      remaining: 0,
    },
  )

  assert.deepEqual(
    validateSplitRows([
      { amount: 60, category: 'Groceries' },
      { amount: 39.5, category: 'Home' },
    ], 100),
    {
      valid: false,
      errors: ['Split amounts must total 100.00. Remaining: 0.50.'],
      remaining: 0.5,
    },
  )

  assert.deepEqual(
    validateSplitRows([
      { amount: Number.NaN, category: 'Groceries' },
      { amount: 40, category: 'Home' },
    ], 100),
    {
      valid: false,
      errors: ['Enter a valid amount for every split row.'],
      remaining: 60,
    },
  )
})

test('converts amounts and percentages with cent-safe UI rounding', () => {
  assert.equal(amountToPercent(33.33, 100), 33.33)
  assert.equal(amountToPercent(1, 3), 33.33)
  assert.equal(percentToAmount(33.33, 100), 33.33)
  assert.equal(percentToAmount(33.333, 3), 1)
})

test('builds split payload using original amount when available', () => {
  const payload = buildSplitPayload({
    transaction: {
      amount_mxn: '2000.00',
      amount_original: '100.00',
      type: 'expense',
    },
    rows: [
      { amount: 60, category: 'Groceries', notes: '' },
      { amount: 40, category: 'Home', notes: 'Desk' },
    ],
  })

  assert.deepEqual(payload, {
    expected_amount_mxn: 2000,
    expected_type: 'expense',
    allocations: [
      { category: 'Groceries', amount_original: 60, notes: null },
      { category: 'Home', amount_original: 40, notes: 'Desk' },
    ],
  })
})

test('builds split payload using MXN amount when original amount is unavailable', () => {
  const payload = buildSplitPayload({
    transaction: {
      amount_mxn: '100.00',
      amount_original: null,
      type: 'expense',
    },
    rows: [
      { amount: 60, category: 'Groceries', notes: 'Food' },
      { amount: 40, category: 'Home', notes: '  ' },
    ],
  })

  assert.deepEqual(payload, {
    expected_amount_mxn: 100,
    expected_type: 'expense',
    allocations: [
      { category: 'Groceries', amount_mxn: 60, notes: 'Food' },
      { category: 'Home', amount_mxn: 40, notes: null },
    ],
  })
})

test('opening an unsplit transaction creates two rows and assigns the second row the remainder', () => {
  const state = createSplitModalState({
    amount_mxn: '100.00',
    amount_original: null,
    category: 'Food & Drink',
    type: 'expense',
    allocations: [],
  })

  assert.equal(state.rows.length, 2)
  assert.equal(state.rows[0].category, 'Food & Drink')
  assert.equal(state.rows[0].amount, '')
  assert.equal(state.rows[0].percent, '')
  assert.equal(state.rows[1].amount, 100)
  assert.equal(state.rows[1].percent, 100)
})

test('opening an existing split uses existing allocations', () => {
  const state = createSplitModalState({
    amount_mxn: '2000.00',
    amount_original: '100.00',
    category: 'Other',
    type: 'expense',
    allocations: [
      { category: 'Groceries', amount_original: '60.00', amount_mxn: '1200.00', notes: 'Market' },
      { category: 'Home', amount_original: '40.00', amount_mxn: '800.00', notes: null },
    ],
  })

  assert.deepEqual(state.rows, [
    { category: 'Groceries', amount: 60, percent: 60, notes: 'Market' },
    { category: 'Home', amount: 40, percent: 40, notes: '' },
  ])
})

test('editing amount updates percentage', () => {
  const state = createSplitModalState({
    amount_mxn: '100.00',
    amount_original: null,
    category: 'Other',
    type: 'expense',
  })

  const updated = updateSplitRowAmount(state, 0, '25.00')

  assert.equal(updated.rows[0].amount, 25)
  assert.equal(updated.rows[0].percent, 25)
})

test('editing percentage updates amount', () => {
  const state = createSplitModalState({
    amount_mxn: '200.00',
    amount_original: null,
    category: 'Other',
    type: 'expense',
  })

  const updated = updateSplitRowPercent(state, 0, '12.5')

  assert.equal(updated.rows[0].percent, 12.5)
  assert.equal(updated.rows[0].amount, 25)
})

test('save remains invalid until total reconciles', () => {
  const state = createSplitModalState({
    amount_mxn: '100.00',
    amount_original: null,
    category: 'Other',
    type: 'expense',
    allocations: [
      { category: 'Groceries', amount_mxn: '60.00' },
      { category: 'Home', amount_mxn: '40.00' },
    ],
  })

  const unreconciled = updateSplitRowAmount(state, 1, '30.00')
  assert.equal(isSplitModalSaveValid(unreconciled), false)

  const reconciled = updateSplitRowAmount(unreconciled, 1, '40.00')
  assert.equal(isSplitModalSaveValid(reconciled), true)
})

test('undo split requires a replacement category', () => {
  const state = createSplitModalState({
    amount_mxn: '100.00',
    amount_original: null,
    category: 'Other',
    type: 'expense',
    allocations: [
      { category: 'Groceries', amount_mxn: '60.00' },
      { category: 'Home', amount_mxn: '40.00' },
    ],
  })

  assert.equal(isUndoSplitValid(state), false)
  assert.equal(isUndoSplitValid(updateUndoReplacementCategory(state, 'Home')), true)
})
