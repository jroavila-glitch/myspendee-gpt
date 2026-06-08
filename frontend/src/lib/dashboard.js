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

export function convertInsightMetric(valueMxn, displayCurrency, displayRates) {
  if (displayCurrency === 'MXN') return Number(valueMxn || 0)
  const rate = Number(displayRates[displayCurrency] || 0)
  return rate ? Number(valueMxn || 0) / rate : null
}
