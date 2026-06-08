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
  summary.income = Number(summary.income.toFixed(2))
  summary.expenses = Number(summary.expenses.toFixed(2))
  summary.net = Number((summary.income - summary.expenses).toFixed(2))
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

export function mergeDrilldownFilters(currentFilters, drilldown) {
  return {
    category: drilldown.category ?? currentFilters.category ?? '',
    type: drilldown.type ?? currentFilters.type ?? '',
  }
}

export function filterTransactionsByDrilldown(transactions, drilldown) {
  return transactions.filter((transaction) => {
    if (drilldown.category && transaction.category !== drilldown.category) return false
    if (drilldown.type && transaction.type !== drilldown.type) return false
    return true
  })
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

export function convertInsightMetric(valueMxn, displayCurrency, displayRates) {
  if (displayCurrency === 'MXN') return Number(valueMxn || 0)
  const rate = Number(displayRates[displayCurrency] || 0)
  return rate ? Number(valueMxn || 0) / rate : null
}
