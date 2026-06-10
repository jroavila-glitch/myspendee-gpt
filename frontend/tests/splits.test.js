import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateByPercent,
  amountToPercent,
  buildSplitPayload,
  percentToAmount,
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
