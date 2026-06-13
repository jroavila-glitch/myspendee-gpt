function getAllocations(transaction) {
  return Array.isArray(transaction.allocations) ? transaction.allocations : []
}

export function isSplitTransaction(transaction) {
  return Boolean(transaction.is_split) || getAllocations(transaction).length > 0
}

export function canSplitTransaction(transaction) {
  return transaction?.type === 'income' || transaction?.type === 'expense'
}

export function getSplitActionLabel(transaction) {
  return isSplitTransaction(transaction) ? 'Edit split' : 'Split'
}

export function getTransactionSourceStatusLabel(transaction) {
  if (transaction?.source_status === 'pending') return 'Pending · waiting for statement'
  if (transaction?.source_status === 'reconciled_pending') return 'Reconciled pending'
  return ''
}
