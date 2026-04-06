const moneyFormatters = new Map()

function toNumber(value) {
  return Number(value || 0)
}

export function getMoneyFormatter(currency) {
  if (!moneyFormatters.has(currency)) {
    moneyFormatters.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }))
  }
  return moneyFormatters.get(currency)
}

export function formatMoney(value, currency = 'MXN') {
  return getMoneyFormatter(currency).format(Number(value || 0))
}

export function getDisplayAmount(transaction, displayCurrency, displayRates) {
  const amountMxn = toNumber(transaction.amount_mxn)
  if (displayCurrency === 'MXN') return amountMxn

  const originalCurrency = (transaction.currency_original || 'MXN').toUpperCase()
  const amountOriginal = transaction.amount_original != null ? toNumber(transaction.amount_original) : null
  const exchangeRate = transaction.exchange_rate_used != null ? toNumber(transaction.exchange_rate_used) : null

  if (originalCurrency === displayCurrency) {
    if (amountOriginal != null) return amountOriginal
    if (exchangeRate) return amountMxn / exchangeRate
  }

  const fallbackRate = toNumber(displayRates[displayCurrency])
  if (!fallbackRate) return amountMxn
  return amountMxn / fallbackRate
}

export function getSecondaryAmountLabel(transaction, displayCurrency) {
  const originalCurrency = (transaction.currency_original || 'MXN').toUpperCase()
  if (displayCurrency === 'MXN') {
    return transaction.original_amount_display || null
  }
  if (originalCurrency !== displayCurrency && transaction.original_amount_display) {
    return transaction.original_amount_display
  }
  return `MXN ${toNumber(transaction.amount_mxn).toFixed(2)}`
}

