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

test('returns null when a requested display rate is unavailable', () => {
  assert.equal(convertInsightMetric(400, 'EUR', { MXN: 1 }), null)
  assert.equal(convertInsightMetric(400, 'EUR', { MXN: 1, EUR: 0 }), null)
  assert.equal(convertInsightMetric('400', 'MXN', { MXN: 1 }), 400)
})

test('normalizes display summary values to two decimal places', () => {
  const transactions = [
    { type: 'income', category: 'Income', amount_mxn: 0.1, currency_original: 'MXN' },
    { type: 'income', category: 'Income', amount_mxn: 0.2, currency_original: 'MXN' },
    { type: 'expense', category: 'Expense', amount_mxn: 0.1, currency_original: 'MXN' },
    { type: 'expense', category: 'Expense', amount_mxn: 0.2, currency_original: 'MXN' },
  ]

  assert.deepEqual(buildDisplayAnalytics(transactions, 'MXN', rates).summary, {
    income: 0.3,
    expenses: 0.3,
    net: 0,
  })
})
