export function getCoverageBankName(statement) {
  const bankName = statement.bank_name || 'Unknown'
  const normalizedBankName = bankName.toUpperCase()
  const filename = (statement.filename || '').toUpperCase()

  if (bankName === 'ARQ') {
    if (filename.includes('USD')) return 'ARQ USD'
    if (filename.includes('EUR')) return 'ARQ EUR'
  }

  if (bankName === 'Nu' || normalizedBankName === 'NUBANK') {
    if (filename.includes('CREDIT')) return 'Nu Credit'
    if (filename.includes('DEBIT')) return 'Nu Debit'
  }

  return bankName
}
