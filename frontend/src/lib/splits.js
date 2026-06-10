function toNumber(value) {
  return Number(value || 0)
}

function isFiniteAmount(value) {
  return value !== '' && Number.isFinite(Number(value))
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

function normalizeEditableAmount(value) {
  if (value === '') return ''
  return fromCents(toCents(value))
}

function normalizeEditablePercent(value) {
  if (value === '') return ''
  return fromCents(toCents(value))
}

function getSplitBasisAmount(transaction) {
  return hasOriginalAmount(transaction) ? transaction.amount_original : transaction.amount_mxn
}

function getAllocationBasisAmount(transaction, allocation) {
  return hasOriginalAmount(transaction) ? allocation.amount_original : allocation.amount_mxn
}

function withValidation(state) {
  const validation = validateSplitRows(state.rows, state.total)
  return {
    ...state,
    validation,
    canSave: validation.valid,
    canUndo: isUndoSplitValid(state),
  }
}

function createRowFromAmount({ category = '', amount = '', notes = '', total }) {
  const normalizedAmount = normalizeEditableAmount(amount)
  return {
    category,
    amount: normalizedAmount,
    percent: normalizedAmount === '' ? '' : amountToPercent(normalizedAmount, total),
    notes: notes || '',
  }
}

function updateRow(state, index, updater) {
  const rows = state.rows.map((row, rowIndex) => (rowIndex === index ? updater(row) : row))
  return withValidation({ ...state, rows })
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
  const invalidAmounts = rows.some((row) => !isFiniteAmount(row.amount))
  const rowAmounts = rows.map((row) => (isFiniteAmount(row.amount) ? toCents(row.amount) : 0))
  const assignedCents = rowAmounts.reduce((sum, amount) => sum + amount, 0)
  const remaining = fromCents(totalCents - assignedCents)

  if (rows.length < 2) {
    errors.push('Add at least two split rows.')
  }

  if (rows.some((row) => !String(row.category || '').trim())) {
    errors.push('Choose a category for every split row.')
  }

  if (invalidAmounts) {
    errors.push('Enter a valid amount for every split row.')
  } else if (rowAmounts.some((amount) => amount <= 0)) {
    errors.push('Split amounts must be greater than zero.')
  }

  const categories = rows
    .map((row) => String(row.category || '').trim())
    .filter(Boolean)
  if (new Set(categories).size !== categories.length) {
    errors.push('Split categories must be unique.')
  }

  if (!invalidAmounts && assignedCents !== totalCents) {
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

export function createSplitModalState(transaction) {
  const total = normalizeEditableAmount(getSplitBasisAmount(transaction))
  const allocations = Array.isArray(transaction.allocations) ? transaction.allocations : []
  const rows = allocations.length
    ? allocations.map((allocation) => createRowFromAmount({
      category: allocation.category,
      amount: getAllocationBasisAmount(transaction, allocation),
      notes: allocation.notes || '',
      total,
    }))
    : [
      createRowFromAmount({ category: transaction.category || '', amount: '', total }),
      createRowFromAmount({ category: '', amount: total, total }),
    ]

  return withValidation({
    total,
    rows,
    replacementCategory: '',
    isExistingSplit: allocations.length > 0 || Boolean(transaction.is_split),
  })
}

export function updateSplitRowAmount(state, index, amount) {
  const normalizedAmount = normalizeEditableAmount(amount)
  return updateRow(state, index, (row) => ({
    ...row,
    amount: normalizedAmount,
    percent: normalizedAmount === '' ? '' : amountToPercent(normalizedAmount, state.total),
  }))
}

export function updateSplitRowPercent(state, index, percent) {
  const normalizedPercent = normalizeEditablePercent(percent)
  return updateRow(state, index, (row) => ({
    ...row,
    percent: normalizedPercent,
    amount: normalizedPercent === '' ? '' : percentToAmount(normalizedPercent, state.total),
  }))
}

export function updateSplitRowCategory(state, index, category) {
  return updateRow(state, index, (row) => ({ ...row, category }))
}

export function updateSplitRowNotes(state, index, notes) {
  return updateRow(state, index, (row) => ({ ...row, notes }))
}

export function addSplitRow(state) {
  return withValidation({
    ...state,
    rows: [...state.rows, createRowFromAmount({ total: state.total })],
  })
}

export function removeSplitRow(state, index) {
  return withValidation({
    ...state,
    rows: state.rows.filter((_, rowIndex) => rowIndex !== index),
  })
}

export function applyFinalRowRemainder(state) {
  const amounts = applyRemainder(state.total, state.rows.map((row) => row.amount))
  return withValidation({
    ...state,
    rows: state.rows.map((row, index) => createRowFromAmount({
      ...row,
      amount: amounts[index],
      total: state.total,
    })),
  })
}

export function updateUndoReplacementCategory(state, replacementCategory) {
  return withValidation({ ...state, replacementCategory })
}

export function isSplitModalSaveValid(state) {
  return validateSplitRows(state.rows, state.total).valid
}

export function isUndoSplitValid(state) {
  return Boolean(state.isExistingSplit && String(state.replacementCategory || '').trim())
}
