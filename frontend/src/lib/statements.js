export function getStatementWarnings(statement) {
  return Array.isArray(statement?.audit_warnings) ? statement.audit_warnings.filter(Boolean) : []
}

export function getWarningStatementCount(statements) {
  return statements.filter((statement) => getStatementWarnings(statement).length > 0).length
}

export function getStatementWarningSummary(statements) {
  const warningCount = getWarningStatementCount(statements)
  if (!warningCount) return 'No import warnings'
  return `${warningCount} statement${warningCount === 1 ? '' : 's'} with import warnings`
}
