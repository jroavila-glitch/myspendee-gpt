import test from 'node:test'
import assert from 'node:assert/strict'

import { canSplitTransaction, getSplitActionLabel } from '../src/lib/transactions.js'

test('allows splitting reviewed income and expense transactions', () => {
  assert.equal(canSplitTransaction({ type: 'expense', reviewed_at: '2026-06-11T12:00:00' }), true)
  assert.equal(canSplitTransaction({ type: 'income', reviewed_at: '2026-06-11T12:00:00' }), true)
})

test('allows splitting category drilldown display rows backed by expense or income sources', () => {
  assert.equal(canSplitTransaction({
    type: 'expense',
    drilldown_category: 'Groceries',
    drilldown_amount_mxn: 50,
    source_amount_mxn: 100,
  }), true)
})

test('blocks splitting ignored transactions', () => {
  assert.equal(canSplitTransaction({ type: 'ignored', reviewed_at: null }), false)
})

test('labels split action by current split state', () => {
  assert.equal(getSplitActionLabel({ type: 'expense', allocations: [] }), 'Split')
  assert.equal(getSplitActionLabel({ type: 'expense', is_split: true }), 'Edit split')
})
