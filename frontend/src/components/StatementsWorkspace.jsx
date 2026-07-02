import { useMemo, useState } from 'react'
import { getStatementWarningSummary, getStatementWarnings } from '../lib/statements'

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })

const EXPECTED_STATEMENT_BANKS = [
  'HSBC',
  'Rappi',
  'Oro Banamex',
  'Costco Banamex',
  'Nu Credit',
  'Nu Debit',
  'Revolut',
  'Millennium',
  'ARQ EUR',
  'ARQ USD',
]

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  month: index + 1,
  label: monthFormatter.format(new Date(2026, index, 1)),
}))

function formatStatementPeriod(statement) {
  if (!statement.period_start && !statement.period_end) return 'Unknown period'
  if (!statement.period_start || !statement.period_end) return statement.period_start || statement.period_end
  return `${statement.period_start} - ${statement.period_end}`
}

function getStatementMonth(statement) {
  const sourceDate = statement.period_end || statement.period_start
  if (!sourceDate) return null
  const date = new Date(`${sourceDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

function getCoverageBankName(statement) {
  const bankName = statement.bank_name || 'Unknown'
  const filename = (statement.filename || '').toUpperCase()

  if (bankName === 'ARQ') {
    if (filename.includes('USD')) return 'ARQ USD'
    if (filename.includes('EUR')) return 'ARQ EUR'
  }

  if (bankName === 'Nu') {
    if (filename.includes('CREDIT')) return 'Nu Credit'
    if (filename.includes('DEBIT')) return 'Nu Debit'
  }

  return bankName
}

function buildCoverage(statements, year) {
  const coverage = new Map()
  for (const bank of EXPECTED_STATEMENT_BANKS) {
    coverage.set(bank, new Map(MONTHS.map(({ month }) => [month, []])))
  }

  for (const statement of statements) {
    const period = getStatementMonth(statement)
    if (!period || period.year !== year) continue
    const bank = getCoverageBankName(statement)
    if (!coverage.has(bank)) coverage.set(bank, new Map(MONTHS.map(({ month }) => [month, []])))
    coverage.get(bank).get(period.month).push(statement)
  }

  return Array.from(coverage.entries()).map(([bank, months]) => ({
    bank,
    months: MONTHS.map(({ month, label }) => {
      const monthStatements = months.get(month) || []
      const warningCount = monthStatements.reduce((sum, statement) => sum + getStatementWarnings(statement).length, 0)
      const status = monthStatements.length === 0
        ? 'missing'
        : monthStatements.length > 1
          ? 'duplicate'
          : warningCount > 0
            ? 'warning'
            : 'uploaded'
      return { month, label, statements: monthStatements, warningCount, status }
    }),
  }))
}

function getCoverageSummary(coverageRows) {
  const cells = coverageRows.flatMap((row) => row.months)
  const missing = cells.filter((cell) => cell.status === 'missing').length
  const warnings = cells.filter((cell) => cell.status === 'warning').length
  const duplicates = cells.filter((cell) => cell.status === 'duplicate').length
  const uploaded = cells.filter((cell) => cell.status !== 'missing').length
  return { missing, warnings, duplicates, uploaded, total: cells.length }
}

function matchesStatus(statement, status, duplicateKeys) {
  if (status === 'all') return true
  if (status === 'warnings') return getStatementWarnings(statement).length > 0
  if (status === 'duplicates') {
    const period = getStatementMonth(statement)
    if (!period) return false
    return duplicateKeys.has(`${getCoverageBankName(statement)}:${period.year}:${period.month}`)
  }
  return true
}

export default function StatementsWorkspace({ statements, onViewStatement, onDeleteStatement }) {
  const currentYear = new Date().getFullYear()
  const availableYears = useMemo(() => {
    const years = new Set([currentYear])
    statements.forEach((statement) => {
      const period = getStatementMonth(statement)
      if (period) years.add(period.year)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [currentYear, statements])
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedBank, setSelectedBank] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const warningSummary = getStatementWarningSummary(statements)
  const coverageRows = useMemo(() => buildCoverage(statements, selectedYear), [statements, selectedYear])
  const coverageSummary = getCoverageSummary(coverageRows)
  const duplicateKeys = useMemo(() => {
    const keys = new Set()
    coverageRows.forEach((row) => {
      row.months.forEach((cell) => {
        if (cell.status === 'duplicate') keys.add(`${row.bank}:${selectedYear}:${cell.month}`)
      })
    })
    return keys
  }, [coverageRows, selectedYear])
  const bankOptions = useMemo(() => {
    const banks = new Set(EXPECTED_STATEMENT_BANKS)
    statements.forEach((statement) => banks.add(getCoverageBankName(statement)))
    return Array.from(banks).sort((a, b) => a.localeCompare(b))
  }, [statements])
  const query = searchQuery.trim().toUpperCase()
  const visibleStatements = statements.filter((statement) => {
    const period = getStatementMonth(statement)
    const bank = getCoverageBankName(statement)
    if (!period || period.year !== selectedYear) return false
    if (selectedBank !== 'all' && bank !== selectedBank) return false
    if (selectedMonth !== 'all' && period.month !== Number(selectedMonth)) return false
    if (!matchesStatus(statement, selectedStatus, duplicateKeys)) return false
    if (query && !`${statement.filename || ''} ${bank} ${statement.bank_name || ''}`.toUpperCase().includes(query)) return false
    return true
  })

  function selectCoverageCell(bank, cell) {
    setSelectedBank(bank)
    setSelectedMonth(String(cell.month))
    setSelectedStatus(cell.status === 'missing' ? 'missing' : 'all')
    setSearchQuery('')
  }

  return (
    <main className="panel statements-panel">
      <div className="panel-header">
        <div>
          <h3>Uploaded Statements</h3>
          <p className="section-meta">{statements.length} statements available · {warningSummary}</p>
        </div>
      </div>

      <section className="statement-coverage" aria-label="Statement coverage">
        <div className="coverage-header">
          <div>
            <span className="eyebrow">Coverage</span>
            <h4>Bank-by-month checklist</h4>
            <p>{coverageSummary.uploaded} of {coverageSummary.total} expected bank-months uploaded · {coverageSummary.missing} missing · {coverageSummary.warnings + coverageSummary.duplicates} need attention</p>
          </div>
          <div className="coverage-legend" aria-label="Coverage status legend">
            <span><i className="coverage-dot uploaded"></i>Uploaded</span>
            <span><i className="coverage-dot missing"></i>Missing</span>
            <span><i className="coverage-dot warning"></i>Warning</span>
            <span><i className="coverage-dot duplicate"></i>Duplicate?</span>
          </div>
        </div>

        <div className="coverage-table-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>Bank</th>
                {MONTHS.map(({ label }) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {coverageRows.map((row) => (
                <tr key={row.bank}>
                  <th>{row.bank}</th>
                  {row.months.map((cell) => (
                    <td key={cell.month}>
                      <button
                        type="button"
                        className={`coverage-cell ${cell.status}`}
                        onClick={() => selectCoverageCell(row.bank, cell)}
                        title={`${row.bank} ${cell.label} ${selectedYear}: ${cell.status}`}
                      >
                        {cell.status === 'uploaded' ? '✓' : cell.status === 'missing' ? 'Missing' : cell.status === 'warning' ? '!' : `${cell.statements.length}x`}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="statement-filters" aria-label="Statement filters">
        <label>
          <span>Year</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          <span>Bank</span>
          <select value={selectedBank} onChange={(event) => setSelectedBank(event.target.value)}>
            <option value="all">All banks</option>
            {bankOptions.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
          </select>
        </label>
        <label>
          <span>Month</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            <option value="all">All months</option>
            {MONTHS.map(({ month, label }) => <option key={month} value={month}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="missing">Missing</option>
            <option value="warnings">Warnings</option>
            <option value="duplicates">Duplicates</option>
          </select>
        </label>
        <label>
          <span>Search</span>
          <input value={searchQuery} placeholder="Filename or bank..." onChange={(event) => setSearchQuery(event.target.value)} />
        </label>
      </section>

      <div className="statement-list">
        {selectedStatus === 'missing' ? (
          <div className="empty-panel">
            <p>{selectedBank === 'all' || selectedMonth === 'all' ? 'Choose a specific missing cell to see what to upload.' : `No ${selectedBank} statement found for ${MONTHS.find(({ month }) => month === Number(selectedMonth))?.label} ${selectedYear}.`}</p>
          </div>
        ) : null}

        {selectedStatus !== 'missing' && visibleStatements.map((statement) => {
          const warnings = getStatementWarnings(statement)
          return (
            <article key={statement.id} className={`statement-card${warnings.length ? ' has-warning' : ''}`}>
              <div className="statement-main">
                <strong>{statement.filename}</strong>
                <span>{getCoverageBankName(statement)} · {statement.bank_name}</span>
                <span>{formatStatementPeriod(statement)}</span>
                {warnings.length ? <span className="statement-warning-pill">{warnings.length} import warning{warnings.length === 1 ? '' : 's'}</span> : null}
              </div>
              <div className="statement-metrics">
                <div>
                  <span>Transactions</span>
                  <strong>{statement.transaction_count}</strong>
                </div>
                <div>
                  <span>Ignored</span>
                  <strong>{statement.ignored_count}</strong>
                </div>
                <div>
                  <span>Uploaded</span>
                  <strong>{dateTimeFormatter.format(new Date(statement.uploaded_at))}</strong>
                </div>
              </div>
              <div className="statement-actions">
                <button className="ghost-button compact-button" onClick={() => onViewStatement(statement)}>View period</button>
                <button className="ghost-button danger" onClick={() => onDeleteStatement(statement.id)}>Delete</button>
              </div>
              {warnings.length ? (
                <div className="statement-warning-details">
                  {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
            </article>
          )
        })}

        {selectedStatus !== 'missing' && visibleStatements.length === 0 ? (
          <div className="empty-panel">
            <p>No statements match these filters.</p>
          </div>
        ) : null}
      </div>
    </main>
  )
}
