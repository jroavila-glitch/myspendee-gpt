function toNumber(value) {
  return Number(value || 0)
}

function toCents(value) {
  return Math.round(toNumber(value) * 100)
}

function fromCents(cents) {
  const value = cents / 100
  return Object.is(value, -0) ? 0 : value
}

function formatAmount(value) {
  return fromCents(toCents(value)).toFixed(2)
}

function hasOriginalAmount(transaction) {
  if (transaction.amount_original == null || transaction.amount_original === '') return false
  return Number.isFinite(Number(transaction.amount_original))
}

export function amountToPercent(amount, total) {
  const totalCents = toCents(total)
  if (!totalCents) return 0
  return fromCents(Math.round((toCents(amount) * 10000) / totalCents))
}

export function percentToAmount(percent, total) {
  return fromCents(Math.round((toCents(total) * toNumber(percent)) / 100))
}

export function applyRemainder(total, amounts) {
  const totalCents = toCents(total)
  let assignedCents = 0

  return amounts.map((amount, index) => {
    if (index === amounts.length - 1) {
      return fromCents(totalCents - assignedCents)
    }
    const cents = toCents(amount)
    assignedCents += cents
    return fromCents(cents)
  })
}

export function allocateByPercent(total, percentages) {
  const amounts = percentages.map((percent) => percentToAmount(percent, total))
  return applyRemainder(total, amounts)
}

export function validateSplitRows(rows, total) {
  const errors = []
  const totalCents = toCents(total)
  const rowAmounts = rows.map((row) => toCents(row.amount))
  const assignedCents = rowAmounts.reduce((sum, amount) => sum + amount, 0)
  const remaining = fromCents(totalCents - assignedCents)

  if (rows.length < 2) {
    errors.push('Add at least two split rows.')
  }

  if (rows.some((row) => !String(row.category || '').trim())) {
    errors.push('Choose a category for every split row.')
  }

  if (rowAmounts.some((amount) => amount <= 0)) {
    errors.push('Split amounts must be greater than zero.')
  }

  const categories = rows
    .map((row) => String(row.category || '').trim())
    .filter(Boolean)
  if (new Set(categories).size !== categories.length) {
    errors.push('Split categories must be unique.')
  }

  if (assignedCents !== totalCents) {
    errors.push(`Split amounts must total ${formatAmount(total)}. Remaining: ${formatAmount(remaining)}.`)
  }

  return {
    valid: errors.length === 0,
    errors,
    remaining,
  }
}

export function buildSplitPayload({ transaction, rows }) {
  const amountField = hasOriginalAmount(transaction) ? 'amount_original' : 'amount_mxn'

  return {
    expected_amount_mxn: fromCents(toCents(transaction.amount_mxn)),
    expected_type: transaction.type,
    allocations: rows.map((row) => ({
      category: String(row.category || '').trim(),
      [amountField]: fromCents(toCents(row.amount)),
      notes: String(row.notes || '').trim() || null,
    })),
  }
}
