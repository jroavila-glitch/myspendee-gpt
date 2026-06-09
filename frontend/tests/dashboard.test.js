import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  buildPeriodComparisonLabel,
  buildReviewBannerSummary,
  buildSavingsRateComparison,
  calculateSavingsRate,
  convertInsightMetric,
  filterTransactionsByDrilldown,
  filterTransactionsForWorkspace,
  getPreviewTransactions,
  getTransactionReviewReasons,
  joinReviewItems,
  mergeDrilldownFilters,
  replaceDisplayRatesFromFx,
  shouldApplyRequestVersion,
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
  assert.equal(analytics.conversionAvailable, true)
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

test('marks display analytics unavailable instead of using fake FX rates', () => {
  const analytics = buildDisplayAnalytics([
    { type: 'expense', category: 'Food', amount_mxn: 200, currency_original: 'MXN' },
  ], 'EUR', { MXN: 1 })

  assert.equal(analytics.conversionAvailable, false)
  assert.deepEqual(analytics.summary, { income: 0, expenses: 0, net: 0 })
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

test('prepares review banner summary from insight inputs', () => {
  assert.deepEqual(
    buildReviewBannerSummary({
      review_count: 3,
      review_amount_mxn: 1000,
      review_reasons: [
        { label: 'Unclassified', count: 2 },
        { label: 'Missing FX', count: 1 },
      ],
    }, 'EUR', rates),
    {
      count: 3,
      affectedValue: 50,
      reasons: 'Unclassified 2 · Missing FX 1',
      conversionAvailable: true,
    },
  )
})

test('keeps savings rate at zero when income is zero', () => {
  assert.equal(calculateSavingsRate({ income: 0, net: -25 }), 0)
})

test('merges preview drilldown independently from global filters', () => {
  const globalFilters = { bank_name: 'NU', type: 'expense' }
  assert.deepEqual(
    mergeDrilldownFilters({ category: '', type: '' }, buildDrilldownFilter({ category: 'Food & Drink', type: 'income' })),
    { category: 'Food & Drink', type: 'income' },
  )
  assert.deepEqual(globalFilters, { bank_name: 'NU', type: 'expense' })
})

test('filters compact preview by dashboard drilldown only', () => {
  const transactions = [
    { id: 1, type: 'expense', category: 'Food & Drink' },
    { id: 2, type: 'expense', category: 'Transport' },
    { id: 3, type: 'income', category: 'Tennis Rush' },
  ]

  assert.deepEqual(
    filterTransactionsByDrilldown(transactions, { category: 'Food & Drink', type: 'expense' }).map((item) => item.id),
    [1],
  )
  assert.deepEqual(
    filterTransactionsByDrilldown(transactions, { category: '', type: 'income' }).map((item) => item.id),
    [3],
  )
})

test('shows all matching transactions for a drilldown and limits the default preview', () => {
  const transactions = Array.from({ length: 12 }, (_, index) => ({ id: String(index) }))

  assert.equal(getPreviewTransactions(transactions, false).length, 8)
  assert.equal(getPreviewTransactions(transactions, true).length, 12)
})

test('keeps preview transaction records available for edit actions', () => {
  const transactions = [{ id: 'one' }, { id: 'two' }]

  assert.equal(getPreviewTransactions(transactions, true)[1], transactions[1])
})

test('filters an editable transaction workspace by category and search text', () => {
  const transactions = [
    { id: '1', description: 'Morning coffee', category: 'Food & Drink', bank_name: 'Revolut', notes: '' },
    { id: '2', description: 'Tennis lesson', category: 'Tennis', bank_name: 'Millennium', notes: 'Filip' },
  ]

  assert.deepEqual(filterTransactionsForWorkspace(transactions, 'Tennis', ''), [transactions[1]])
  assert.deepEqual(filterTransactionsForWorkspace(transactions, '', 'revolut'), [transactions[0]])
  assert.deepEqual(filterTransactionsForWorkspace(transactions, '', 'filip'), [transactions[1]])
})

test('derives savings-rate previous and average comparisons from insights', () => {
  const comparison = buildSavingsRateComparison({
    income: { current: 2000, previous: 1000, average: 800 },
    net: { current: 1500, previous: 300, average: 160 },
  })

  assert.deepEqual(comparison, {
    previousRate: 30,
    averageRate: 20,
    previousPointChange: 45,
  })
})

test('handles unavailable savings-rate comparison inputs safely', () => {
  assert.deepEqual(buildSavingsRateComparison({ income: { previous: 0, average: null }, net: { previous: 10, average: 5 } }), {
    previousRate: null,
    averageRate: null,
    previousPointChange: null,
  })
})

test('labels previous comparison basis clearly', () => {
  assert.equal(buildPeriodComparisonLabel({ year: 2026, month: '5' }), 'April 2026')
  assert.equal(buildPeriodComparisonLabel({ year: 2026, month: 'custom' }), 'previous equal period')
  assert.equal(buildPeriodComparisonLabel({ year: 2026, month: 'ytd' }), '2025 YTD')
})

test('joins review items to loaded transactions by transaction ID and keeps insight reasons', () => {
  const transactions = [
    { id: 'a', description: 'Coffee' },
    { id: 'b', description: 'Transfer' },
  ]
  const reviewItems = [
    { transaction_id: 'b', reasons: ['Missing FX', 'Unclassified'] },
    { transaction_id: 'missing', reasons: ['Higher than usual'] },
  ]

  assert.deepEqual(joinReviewItems(transactions, reviewItems), [
    { id: 'b', description: 'Transfer', review_reasons: ['Missing FX', 'Unclassified'] },
  ])
})

test('only applies the latest mounted request version', () => {
  assert.equal(shouldApplyRequestVersion(4, 4, true), true)
  assert.equal(shouldApplyRequestVersion(3, 4, true), false)
  assert.equal(shouldApplyRequestVersion(4, 4, false), false)
})

test('replaces display rates with latest successful FX payload only', () => {
  assert.deepEqual(replaceDisplayRatesFromFx({ EUR: 20 }), { MXN: 1, EUR: 20 })
  assert.deepEqual(replaceDisplayRatesFromFx({ USD: 18, EUR: 0 }), { MXN: 1, USD: 18 })
})

test('clears non-MXN display rates on FX failure', () => {
  assert.deepEqual(replaceDisplayRatesFromFx(null), { MXN: 1 })
})

test('prefers supplied backend review reasons including multiple reasons', () => {
  assert.deepEqual(getTransactionReviewReasons({
    type: 'expense',
    category: 'Other',
    review_reasons: ['Missing FX', 'Higher than usual'],
  }), ['Missing FX', 'Higher than usual'])
})

test('falls back to legacy review heuristic only without supplied reasons', () => {
  assert.deepEqual(getTransactionReviewReasons({ type: 'expense', category: 'Other' }), ['Unclassified expense'])
  assert.deepEqual(getTransactionReviewReasons({ type: 'expense', category: 'Other', review_reasons: [] }), [])
})
