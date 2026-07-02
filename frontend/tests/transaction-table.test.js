import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canSplitTransaction,
  getSplitActionLabel,
  getTransactionCategoryDisplay,
  getTransactionSourceStatusLabel,
} from '../src/lib/transactions.js'

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

test('shows split rows as split instead of the stale source category', () => {
  assert.deepEqual(
    getTransactionCategoryDisplay({
      type: 'income',
      category: 'Tennis Lessons',
      allocations: [
        { category: 'Tennis Rush', amount_mxn: 537.5 },
        { category: 'Tennis Smash & Social', amount_mxn: 645 },
      ],
    }),
    { label: 'Split · 2 categories', tone: 'split', context: '' },
  )
})

test('shows drilldown allocation category instead of the source split category', () => {
  assert.deepEqual(
    getTransactionCategoryDisplay({
      type: 'income',
      category: 'Tennis Lessons',
      drilldown_category: 'Tennis Rush',
      allocations: [
        { category: 'Tennis Rush', amount_mxn: 537.5 },
        { category: 'Tennis Smash & Social', amount_mxn: 645 },
      ],
    }),
    { label: 'Tennis Rush', tone: 'income', context: 'Source: Tennis Lessons' },
  )
})

test('labels pending transactions as waiting for statement', () => {
  assert.equal(getTransactionSourceStatusLabel({ source_status: 'pending' }), 'Pending · waiting for statement')
  assert.equal(getTransactionSourceStatusLabel({ source_status: 'posted' }), '')
})
