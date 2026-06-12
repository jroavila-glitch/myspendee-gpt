import { getDisplayAmount } from './currency.js'

function toNumber(value) {
  return Number(value || 0)
}

function getAllocations(transaction) {
  return Array.isArray(transaction.allocations) ? transaction.allocations : []
}

function hasAllocations(transaction) {
  return getAllocations(transaction).length > 0
}

function hasFiniteValue(value) {
  return value != null && value !== '' && Number.isFinite(Number(value))
}

function getAllocationDisplayAmount(transaction, allocation, displayCurrency, displayRates) {
  const originalCurrency = (transaction.currency_original || 'MXN').toUpperCase()
  if (displayCurrency === originalCurrency && hasFiniteValue(allocation.amount_original)) {
    return toNumber(allocation.amount_original)
  }
  if (displayCurrency === 'MXN' && hasFiniteValue(allocation.amount_mxn)) {
    return toNumber(allocation.amount_mxn)
  }
  if (displayCurrency === originalCurrency && hasFiniteValue(allocation.amount_mxn) && hasFiniteValue(transaction.exchange_rate_used)) {
    return toNumber(allocation.amount_mxn) / toNumber(transaction.exchange_rate_used)
  }
  if (hasFiniteValue(allocation.amount_mxn)) {
    const fallbackRate = toNumber(displayRates[displayCurrency])
    return fallbackRate ? toNumber(allocation.amount_mxn) / fallbackRate : null
  }
  if (hasFiniteValue(allocation.amount_original) && hasFiniteValue(transaction.exchange_rate_used)) {
    const amountMxn = toNumber(allocation.amount_original) * toNumber(transaction.exchange_rate_used)
    if (displayCurrency === 'MXN') return amountMxn
    const fallbackRate = toNumber(displayRates[displayCurrency])
    return fallbackRate ? amountMxn / fallbackRate : null
  }
  return null
}

function cloneWithDrilldownAllocation(transaction, allocation) {
  return {
    ...transaction,
    drilldown_category: allocation.category,
    drilldown_amount_mxn: hasFiniteValue(allocation.amount_mxn) ? toNumber(allocation.amount_mxn) : null,
    drilldown_amount_original: hasFiniteValue(allocation.amount_original) ? toNumber(allocation.amount_original) : null,
    drilldown_notes: allocation.notes || '',
    source_amount_mxn: transaction.amount_mxn,
    source_category: transaction.category,
  }
}

export function calculateSavingsRate({ income, net }) {
  return income > 0 ? Number(((net / income) * 100).toFixed(1)) : 0
}

export function buildDisplayAnalytics(transactions, displayCurrency, displayRates) {
  const summary = { income: 0, expenses: 0, net: 0 }
  const grouped = new Map()
  const hasFallbackRate = displayCurrency === 'MXN' || Number(displayRates[displayCurrency]) > 0
  let conversionAvailable = true
  for (const transaction of transactions) {
    if (transaction.type === 'ignored') continue
    const originalCurrency = (transaction.currency_original || 'MXN').toUpperCase()
    const hasOriginalAmount = transaction.amount_original != null && Number.isFinite(Number(transaction.amount_original))
    const canUseOriginal = originalCurrency === displayCurrency && hasOriginalAmount
    const amount = hasFallbackRate || canUseOriginal
      ? getDisplayAmount(transaction, displayCurrency, displayRates)
      : null
    if (amount === null) {
      conversionAvailable = false
      continue
    }
    if (transaction.type === 'income') summary.income += amount
    if (transaction.type === 'expense') summary.expenses += amount
    const breakdownItems = hasAllocations(transaction)
      ? getAllocations(transaction).map((allocation) => ({
        category: allocation.category,
        amount: getAllocationDisplayAmount(transaction, allocation, displayCurrency, displayRates),
      }))
      : [{ category: transaction.category, amount }]
    for (const item of breakdownItems) {
      if (!item.category || item.amount === null) continue
      const key = `${transaction.type}::${item.category}`
      const current = grouped.get(key) || {
        category: item.category,
        type: transaction.type,
        total: 0,
        count: 0,
      }
      current.total += item.amount
      current.count += 1
      grouped.set(key, current)
    }
  }
  summary.income = Number(summary.income.toFixed(2))
  summary.expenses = Number(summary.expenses.toFixed(2))
  summary.net = Number((summary.income - summary.expenses).toFixed(2))
  const items = [...grouped.values()]
    .map((item) => ({ ...item, total: Number(item.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)
  return {
    conversionAvailable,
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

export function mergeDrilldownFilters(currentFilters, drilldown) {
  return {
    category: drilldown.category ?? currentFilters.category ?? '',
    type: drilldown.type ?? currentFilters.type ?? '',
  }
}

export function filterTransactionsByDrilldown(transactions, drilldown) {
  return transactions.flatMap((transaction) => {
    if (drilldown.type && transaction.type !== drilldown.type) return []
    if (!drilldown.category) return [transaction]
    const matchingAllocations = getAllocations(transaction)
      .filter((allocation) => allocation.category === drilldown.category)
    if (matchingAllocations.length) {
      return matchingAllocations.map((allocation) => cloneWithDrilldownAllocation(transaction, allocation))
    }
    return transaction.category === drilldown.category ? [transaction] : []
  })
}

export function getPreviewTransactions(transactions, hasDrilldown) {
  return hasDrilldown ? transactions : transactions.slice(0, 8)
}

export function shouldShowGlobalBulkBar(tab, selectedCount, showReviewModal) {
  if (!selectedCount || showReviewModal) return false
  return tab === 'review' || tab === 'dashboard'
}

export function getBulkActionState(pendingAction) {
  return {
    disabled: Boolean(pendingAction),
    applyLabel: pendingAction === 'apply' ? 'Applying...' : 'Apply',
    reviewedLabel: pendingAction === 'reviewed' ? 'Marking reviewed...' : 'Mark selected reviewed',
    deleteLabel: pendingAction === 'delete' ? 'Deleting...' : 'Delete selected',
  }
}

export function filterTransactionsForWorkspace(transactions, category, searchText) {
  const normalizedSearch = searchText.trim().toLowerCase()
  return transactions.filter((transaction) => {
    const allocationFields = getAllocations(transaction).flatMap((allocation) => [
      allocation.category,
      allocation.notes,
    ])
    if (category && transaction.category !== category && !getAllocations(transaction).some((allocation) => allocation.category === category)) return false
    if (!normalizedSearch) return true

    return [
      transaction.description,
      transaction.category,
      transaction.type,
      transaction.bank_name,
      transaction.notes,
      transaction.original_amount_display,
      ...allocationFields,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch)
  })
}

export function joinReviewItems(transactions, reviewItems) {
  const transactionsById = new Map(transactions.map((transaction) => [String(transaction.id), transaction]))
  return reviewItems.flatMap((item) => {
    const transaction = transactionsById.get(String(item.transaction_id))
    return transaction ? [{ ...transaction, review_reasons: item.reasons || [] }] : []
  })
}

export function shouldApplyRequestVersion(requestVersion, latestVersion, isMounted) {
  return isMounted && requestVersion === latestVersion
}

export function replaceDisplayRatesFromFx(fxRates) {
  if (!fxRates) return { MXN: 1 }
  return {
    MXN: 1,
    ...(Number(fxRates.EUR) > 0 ? { EUR: Number(fxRates.EUR) } : {}),
    ...(Number(fxRates.USD) > 0 ? { USD: Number(fxRates.USD) } : {}),
  }
}

export function getTransactionReviewReasons(transaction) {
  if (Array.isArray(transaction.review_reasons)) return transaction.review_reasons
  const notes = (transaction.notes || '').toLowerCase()
  if (transaction.category === 'Other' && notes.includes('manual review')) return ['Needs category review']
  if (transaction.category === 'Other' && transaction.type === 'expense') return ['Unclassified expense']
  if (transaction.type === 'ignored') return ['Ignored transaction']
  return []
}

function nullableSavingsRate(income, net) {
  const numericIncome = Number(income)
  const numericNet = Number(net)
  if (!Number.isFinite(numericIncome) || numericIncome <= 0 || !Number.isFinite(numericNet)) return null
  return Number(((numericNet / numericIncome) * 100).toFixed(1))
}

export function buildSavingsRateComparison(insights) {
  const currentRate = nullableSavingsRate(insights?.income?.current, insights?.net?.current)
  const previousRate = nullableSavingsRate(insights?.income?.previous, insights?.net?.previous)
  const averageRate = nullableSavingsRate(insights?.income?.average, insights?.net?.average)
  return {
    previousRate,
    averageRate,
    previousPointChange: currentRate === null || previousRate === null
      ? null
      : Number((currentRate - previousRate).toFixed(1)),
  }
}

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function buildPeriodComparisonLabel(period) {
  if (period.month === 'custom') return 'previous equal period'
  if (period.month === 'ytd') return `${Number(period.year) - 1} YTD`
  const previousMonthEnd = new Date(Date.UTC(Number(period.year), Number(period.month) - 1, 0))
  return monthLabelFormatter.format(previousMonthEnd)
}

export function buildReviewBannerSummary(insights, displayCurrency, displayRates) {
  const affectedValue = convertInsightMetric(insights?.review_amount_mxn, displayCurrency, displayRates)
  return {
    count: Number(insights?.review_count || 0),
    affectedValue,
    reasons: (insights?.review_reasons || [])
      .map((reason) => `${reason.label} ${reason.count}`)
      .join(' · '),
    conversionAvailable: affectedValue !== null,
  }
}

export function buildLoanPapaSummary(insights) {
  const loan = insights?.loan_papa
  if (!loan) return null
  const behind = toNumber(loan.behind_mxn)
  const paid = toNumber(loan.paid_mxn)
  const totalAmount = toNumber(loan.total_amount_mxn)
  const totalDue = toNumber(loan.total_due_mxn)
  const monthlyAmount = toNumber(loan.monthly_amount_mxn)
  const paidPercent = totalAmount > 0 ? Number(((paid / totalAmount) * 100).toFixed(1)) : 0
  const expectedPercent = totalAmount > 0 ? Number(((totalDue / totalAmount) * 100).toFixed(1)) : 0
  return {
    totalAmount,
    monthlyAmount,
    totalDue,
    paid,
    behind,
    behindInstallments: monthlyAmount > 0 ? Number((behind / monthlyAmount).toFixed(1)) : 0,
    expectedPercent,
    installmentsDue: Number(loan.installments_due || 0),
    installmentCount: Number(loan.installment_count || 0),
    isBehind: behind > 0,
    paidPercent,
    remainingBalance: toNumber(loan.remaining_balance_mxn),
  }
}

export function convertInsightMetric(valueMxn, displayCurrency, displayRates) {
  if (displayCurrency === 'MXN') return Number(valueMxn || 0)
  const rate = Number(displayRates[displayCurrency] || 0)
  return rate ? Number(valueMxn || 0) / rate : null
}
