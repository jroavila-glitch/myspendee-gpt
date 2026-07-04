import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  buildPeriodComparisonLabel,
  buildLoanPapaSummary,
  buildReviewBannerSummary,
  buildSavingsRateComparison,
  buildUndoTransactionPayload,
  calculateSavingsRate,
  convertInsightMetric,
  excludeTransactionsById,
  indexPendingMatchesByPendingId,
  getBulkActionState,
  getPendingReminderTransactions,
  filterTransactionsByDrilldown,
  filterTransactionsForWorkspace,
  getPreviewTransactions,
  getPreviewToggleLabel,
  getTransactionReviewReasons,
  joinReviewItems,
  mergeDrilldownFilters,
  replaceDisplayRatesFromFx,
  shouldShowPreviewToggle,
  shouldShowGlobalBulkBar,
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

test('prepares Loan Papa summary from backend reconciliation values', () => {
  assert.deepEqual(
    buildLoanPapaSummary({
      loan_papa: {
        total_amount_mxn: '458221.80',
        monthly_amount_mxn: '7637.03',
        total_due_mxn: '106918.42',
        paid_mxn: '93707.33',
        behind_mxn: '13211.09',
        remaining_balance_mxn: '364514.47',
        installments_due: 14,
        installment_count: 60,
      },
    }),
    {
      totalAmount: 458221.8,
      monthlyAmount: 7637.03,
      totalDue: 106918.42,
      paid: 93707.33,
      behind: 13211.09,
      behindInstallments: 1.7,
      expectedPercent: 23.3,
      remainingBalance: 364514.47,
      installmentsDue: 14,
      installmentCount: 60,
      isBehind: true,
      paidPercent: 20.5,
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

test('filters split transaction drilldowns by allocation category with allocation context', () => {
  const transaction = {
    id: 'split-1',
    type: 'expense',
    amount_mxn: 100,
    category: 'Other',
    description: 'Big store run',
    allocations: [
      { category: 'Groceries', amount_mxn: 60 },
      { category: 'Home', amount_mxn: 40, notes: 'lamp shade' },
    ],
  }

  const results = filterTransactionsByDrilldown([transaction], { category: 'Home', type: 'expense' })

  assert.equal(results.length, 1)
  assert.notEqual(results[0], transaction)
  assert.equal(results[0].id, 'split-1')
  assert.equal(results[0].description, 'Big store run')
  assert.equal(results[0].type, 'expense')
  assert.equal(results[0].amount_mxn, 100)
  assert.equal(results[0].category, 'Other')
  assert.equal(results[0].drilldown_category, 'Home')
  assert.equal(results[0].drilldown_amount_mxn, 40)
  assert.equal(results[0].drilldown_notes, 'lamp shade')
  assert.equal(results[0].source_amount_mxn, 100)
})

test('shows all matching transactions for a drilldown and limits the default preview', () => {
  const transactions = Array.from({ length: 12 }, (_, index) => ({ id: String(index) }))

  assert.equal(getPreviewTransactions(transactions, false).length, 8)
  assert.equal(getPreviewTransactions(transactions, true).length, 12)
})

test('excludes reminder transactions from the normal dashboard preview', () => {
  const transactions = [
    { id: 'pending', description: 'Amazon' },
    { id: 'posted', description: 'Coffee' },
  ]

  assert.deepEqual(excludeTransactionsById(transactions, [{ id: 'pending' }]), [transactions[1]])
})

test('shows a dashboard preview toggle only when extra transactions are hidden', () => {
  assert.equal(shouldShowPreviewToggle(Array.from({ length: 8 })), false)
  assert.equal(shouldShowPreviewToggle(Array.from({ length: 9 })), true)
  assert.equal(shouldShowPreviewToggle(Array.from({ length: 9 }), true), false)
  assert.equal(getPreviewToggleLabel(66, false), 'Show all 66')
  assert.equal(getPreviewToggleLabel(66, true), 'Show recent')
})

test('keeps preview transaction records available for edit actions', () => {
  const transactions = [{ id: 'one' }, { id: 'two' }]

  assert.equal(getPreviewTransactions(transactions, true)[1], transactions[1])
})

test('hides the global bulk bar while the review modal owns bulk actions', () => {
  assert.equal(shouldShowGlobalBulkBar('dashboard', 2, true), false)
  assert.equal(shouldShowGlobalBulkBar('dashboard', 2, false), true)
  assert.equal(shouldShowGlobalBulkBar('review', 2, false), true)
  assert.equal(shouldShowGlobalBulkBar('dashboard', 0, false), false)
})

test('marks bulk action controls busy while a request is pending', () => {
  assert.deepEqual(getBulkActionState('reviewed'), {
    disabled: true,
    applyLabel: 'Apply',
    reviewedLabel: 'Marking reviewed...',
    deleteLabel: 'Delete selected',
  })
  assert.deepEqual(getBulkActionState(''), {
    disabled: false,
    applyLabel: 'Apply',
    reviewedLabel: 'Mark selected reviewed',
    deleteLabel: 'Delete selected',
  })
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

test('filters an editable transaction workspace by allocation category and notes', () => {
  const transaction = {
    id: 'split-1',
    description: 'Big store run',
    category: 'Other',
    bank_name: 'Nu',
    notes: '',
    allocations: [
      { category: 'Groceries', amount_mxn: 60, notes: 'weekly pantry' },
      { category: 'Home', amount_mxn: 40, notes: 'lamp shade' },
    ],
  }

  assert.deepEqual(filterTransactionsForWorkspace([transaction], 'Home', ''), [transaction])
  assert.deepEqual(filterTransactionsForWorkspace([transaction], '', 'lamp'), [transaction])
})

test('selects manual pending reminder transactions sorted by most recent capture date', () => {
  const transactions = [
    { id: 'later', date: '2026-07-20', source_status: 'pending', manually_added: true },
    { id: 'posted-future', date: '2026-07-08', source_status: 'posted', manually_added: true },
    { id: 'statement-future', date: '2026-07-09', source_status: 'pending', manually_added: false },
    { id: 'today', date: '2026-07-03', source_status: 'pending', manually_added: true },
    { id: 'past', date: '2026-07-02', source_status: 'pending', manually_added: true },
    { id: 'soon', date: '2026-07-05', source_status: 'pending', manually_added: true },
    { id: 'reconciled', date: '2026-07-06', source_status: 'reconciled_pending', manually_added: true },
  ]

  assert.deepEqual(
    getPendingReminderTransactions(transactions).map((transaction) => transaction.id),
    ['later', 'soon', 'today', 'past'],
  )
})

test('builds an undo payload from a deleted transaction without volatile backend fields', () => {
  const payload = buildUndoTransactionPayload({
    id: 'old-id',
    date: '2026-07-01',
    description: 'Amazon',
    amount_original: '335.33',
    currency_original: 'MXN',
    amount_mxn: '335.33',
    exchange_rate_used: '1.000000',
    category: 'Groceries',
    type: 'expense',
    bank_name: '',
    assigned_month: 7,
    assigned_year: 2026,
    source_status: 'pending',
    manually_added: true,
    notes: null,
    statement_id: null,
    created_at: '2026-07-04T10:00:00',
  })

  assert.deepEqual(payload, {
    date: '2026-07-01',
    description: 'Amazon',
    amount_original: '335.33',
    currency_original: 'MXN',
    amount_mxn: '335.33',
    exchange_rate_used: '1.000000',
    category: 'Groceries',
    type: 'expense',
    bank_name: '',
    assigned_month: 7,
    assigned_year: 2026,
    source_status: 'pending',
    manually_added: true,
    notes: null,
  })
})

test('indexes pending matches by pending transaction id', () => {
  const matches = [
    {
      pending_transaction: { id: 'pending-1' },
      candidates: [{ id: 'posted-1' }],
    },
    {
      pending_transaction: { id: 'pending-2' },
      candidates: [{ id: 'posted-2' }],
    },
  ]

  assert.deepEqual(indexPendingMatchesByPendingId(matches), {
    'pending-1': matches[0],
    'pending-2': matches[1],
  })
})

test('builds display analytics with split breakdowns without duplicating source summaries', () => {
  const analytics = buildDisplayAnalytics([
    {
      id: 'split-1',
      type: 'expense',
      amount_mxn: 100,
      category: 'Other',
      currency_original: 'MXN',
      allocations: [
        { category: 'Groceries', amount_mxn: 60 },
        { category: 'Home', amount_mxn: 40 },
      ],
    },
    { id: 'income-1', type: 'income', amount_mxn: 200, category: 'Tennis Lessons', currency_original: 'MXN' },
  ], 'MXN', rates)

  assert.deepEqual(analytics.summary, { income: 200, expenses: 100, net: 100 })
  assert.deepEqual(analytics.breakdown.expenses, [
    { category: 'Groceries', type: 'expense', total: 60, count: 1 },
    { category: 'Home', type: 'expense', total: 40, count: 1 },
  ])
})

test('counts split income under allocation categories instead of the source category', () => {
  const analytics = buildDisplayAnalytics([
    {
      id: 'split-income-1',
      type: 'income',
      amount_mxn: 1182.5,
      category: 'Tennis Lessons',
      currency_original: 'EUR',
      amount_original: 55,
      allocations: [
        { category: 'Tennis Rush', amount_mxn: 537.5, amount_original: 25 },
        { category: 'Tennis Smash & Social', amount_mxn: 645, amount_original: 30 },
      ],
    },
  ], 'MXN', rates)

  assert.deepEqual(analytics.summary, { income: 1182.5, expenses: 0, net: 1182.5 })
  assert.deepEqual(analytics.breakdown.income, [
    { category: 'Tennis Smash & Social', type: 'income', total: 645, count: 1 },
    { category: 'Tennis Rush', type: 'income', total: 537.5, count: 1 },
  ])
  assert.equal(analytics.breakdown.income.some((item) => item.category === 'Tennis Lessons'), false)
})

test('builds split breakdowns from canonical allocation amounts for third-currency display', () => {
  const analytics = buildDisplayAnalytics([
    {
      id: 'split-usd',
      type: 'expense',
      amount_mxn: 1999.9,
      amount_original: 100,
      currency_original: 'USD',
      exchange_rate_used: 20,
      category: 'Other',
      allocations: [
        { category: 'Groceries', amount_original: 50, amount_mxn: 1000 },
        { category: 'Home', amount_original: 50, amount_mxn: 999.9 },
      ],
    },
  ], 'EUR', { MXN: 1, EUR: 10, USD: 20 })

  assert.deepEqual(analytics.summary, { income: 0, expenses: 199.99, net: -199.99 })
  assert.deepEqual(analytics.breakdown.expenses, [
    { category: 'Groceries', type: 'expense', total: 100, count: 1 },
    { category: 'Home', type: 'expense', total: 99.99, count: 1 },
  ])
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
