import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './lib/api'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN' })
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const BreakdownChart = lazy(() => import('./components/BreakdownChart'))
const PIE_COLORS = ['#1d7a6f', '#f47d38', '#d85757', '#4c6fff', '#c59a2d', '#74809b']

function formatMoney(value) {
  return currencyFormatter.format(Number(value || 0))
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatShortDate(value) {
  return shortDateFormatter.format(new Date(`${value}T00:00:00`))
}

function getCurrentMonthState() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

function dedupeCategories(categories) {
  return Array.from(new Set([...categories.expense, ...categories.income]))
}

function formatStatementPeriod(statement) {
  if (!statement.period_start && !statement.period_end) return 'Unknown period'
  if (!statement.period_start || !statement.period_end) return statement.period_start || statement.period_end
  return `${statement.period_start} - ${statement.period_end}`
}

function getReviewReason(transaction) {
  const notes = (transaction.notes || '').toLowerCase()
  if (transaction.category === 'Other' && notes.includes('manual review')) return 'Needs category review'
  if (transaction.category === 'Other' && transaction.type === 'expense') return 'Unclassified expense'
  if (transaction.type === 'ignored') return 'Ignored transaction'
  return null
}

function getAmountTone(value) {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  )
}

function BreakdownSection({ title, data, onSelectCategory, tone }) {
  const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0)

  return (
    <section className={`panel analytics-panel ${tone}`}>
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">{data.length ? `${data.length} categories` : 'No activity this period'}</p>
        </div>
        {data.length ? <strong className="panel-total">{formatMoney(total)}</strong> : null}
      </div>

      {data.length === 0 ? (
        <div className="empty-panel">
          <p>No transactions in this period.</p>
        </div>
      ) : (
        <div className="analytics-layout">
          <div className="analytics-chart">
            <Suspense fallback={<div className="chart-skeleton" />}>
              <BreakdownChart data={data} />
            </Suspense>
          </div>

          <div className="analytics-list">
            {data.map((item, index) => {
              const share = total ? (Number(item.total) / total) * 100 : 0
              return (
                <button
                  key={`${title}-${item.category}`}
                  className="analytics-row"
                  onClick={() => onSelectCategory(item)}
                >
                  <div className="analytics-row-main">
                    <span className="analytics-dot" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <strong>{item.category}</strong>
                  </div>
                  <div className="analytics-row-meta">
                    <div className="analytics-row-values">
                      <strong>{formatMoney(item.total)}</strong>
                    </div>
                    <div className="analytics-row-share">
                      <span>{formatPercent(share)}</span>
                    </div>
                  </div>
                  <div className="analytics-row-progress">
                    <div className="analytics-bar">
                      <span style={{ width: `${Math.min(share, 100)}%`, backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function ReviewPanel({ items, onOpenAll, onSelectTransaction }) {
  const [expanded, setExpanded] = useState(false)
  const visibleItems = expanded ? items : items.slice(0, 4)

  return (
    <section className="panel review-panel">
      <div className="panel-header">
        <div>
          <h3>Review Queue</h3>
          <p className="section-meta">{items.length ? `${items.length} transactions need attention` : 'No flagged transactions right now'}</p>
        </div>
        {items.length ? (
          <div className="review-actions">
            <button className="ghost-button compact-button" onClick={() => setExpanded((current) => !current)}>
              {expanded ? 'Show less' : 'Show all'}
            </button>
            <button className="ghost-button compact-button" onClick={onOpenAll}>Open in table</button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="empty-panel compact-empty">
          <p>Everything in this month looks classified and tidy.</p>
        </div>
      ) : (
        <div className="review-list">
          {visibleItems.map((item) => (
            <button key={item.id} className="review-row" onClick={() => onSelectTransaction(item)}>
              <div className="review-main">
                <strong>{item.description}</strong>
                <span>{item.reviewReason} · {item.bank_name}</span>
              </div>
              <div className={`review-amount ${getAmountTone(Number(item.amount_mxn))}`}>
                <strong>{formatMoney(item.amount_mxn)}</strong>
                <span>{formatShortDate(item.date)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function Modal({ title, children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function TransactionMenu({ onEdit, onDelete, anchorRect, onClose }) {
  if (!anchorRect) return null
  const top = anchorRect.bottom + window.scrollY + 8
  const left = anchorRect.right + window.scrollX - 184

  return createPortal(
    <>
      <button className="menu-backdrop" aria-label="Close actions menu" onClick={onClose} />
      <div className="menu-popover" style={{ top, left }}>
        <button onClick={onEdit}>Edit</button>
        <button className="danger-action" onClick={onDelete}>Delete</button>
      </div>
    </>,
    document.body,
  )
}

function TransactionForm({ categories, initialValue, onSubmit, onCancel }) {
  const [form, setForm] = useState(
    initialValue || {
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount_mxn: '',
      amount_original: '',
      currency_original: 'MXN',
      category: 'Other',
      type: 'expense',
      bank_name: '',
      notes: '',
    },
  )

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          ...form,
          amount_mxn: Number(form.amount_mxn),
          amount_original: form.amount_original ? Number(form.amount_original) : null,
          manually_added: true,
        })
      }}
    >
      <label><span>Date</span><input type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} /></label>
      <label><span>Description</span><input value={form.description} onChange={(e) => updateField('description', e.target.value)} /></label>
      <label><span>Amount (MXN)</span><input type="number" step="0.01" value={form.amount_mxn} onChange={(e) => updateField('amount_mxn', e.target.value)} /></label>
      <label><span>Original Amount</span><input type="number" step="0.01" value={form.amount_original} onChange={(e) => updateField('amount_original', e.target.value)} /></label>
      <label><span>Original Currency</span>
        <select value={form.currency_original} onChange={(e) => updateField('currency_original', e.target.value)}>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </label>
      <label><span>Category</span>
        <select value={form.category} onChange={(e) => updateField('category', e.target.value)}>
          {[...categories.expense, ...categories.income].map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label><span>Type</span>
        <select value={form.type} onChange={(e) => updateField('type', e.target.value)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignored">Ignored</option>
        </select>
      </label>
      <label><span>Bank</span><input value={form.bank_name} onChange={(e) => updateField('bank_name', e.target.value)} /></label>
      <label className="full"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} /></label>
      <div className="form-actions full">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  )
}

function App() {
  const [tab, setTab] = useState('dashboard')
  const [period, setPeriod] = useState(getCurrentMonthState)
  const [filters, setFilters] = useState({ bank_name: '', category: '', type: '' })
  const [searchText, setSearchText] = useState('')
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 })
  const [breakdown, setBreakdown] = useState({ income: [], expenses: [] })
  const [transactions, setTransactions] = useState([])
  const [statements, setStatements] = useState([])
  const [banks, setBanks] = useState([])
  const [categories, setCategories] = useState({ income: ['Other'], expense: ['Other'] })
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkType, setBulkType] = useState('')
  const [menuState, setMenuState] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notesDrafts, setNotesDrafts] = useState({})
  const [savingNotesIds, setSavingNotesIds] = useState([])
  const [density, setDensity] = useState('comfortable')
  const [showReviewOnly, setShowReviewOnly] = useState(false)
  const notesTimers = useRef({})
  const searchInputRef = useRef(null)
  const uploadInputRef = useRef(null)

  const queryParams = useMemo(() => ({
    month: String(period.month),
    year: String(period.year),
    ...(filters.bank_name ? { bank_name: filters.bank_name } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  }), [period, filters])

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories])
  const reviewItems = useMemo(
    () => transactions
      .map((transaction) => {
        const reviewReason = getReviewReason(transaction)
        return reviewReason ? { ...transaction, reviewReason } : null
      })
      .filter(Boolean),
    [transactions],
  )

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return transactions.filter((transaction) => {
      if (showReviewOnly && !getReviewReason(transaction)) return false
      const haystack = [
        transaction.description,
        transaction.category,
        transaction.type,
        transaction.bank_name,
        transaction.notes,
        transaction.original_amount_display,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return normalizedSearch ? haystack.includes(normalizedSearch) : true
    })
  }, [transactions, searchText, showReviewOnly])

  const activeFilters = useMemo(() => {
    const chips = []
    if (filters.bank_name) chips.push({ key: 'bank_name', label: filters.bank_name })
    if (filters.category) chips.push({ key: 'category', label: filters.category })
    if (filters.type) chips.push({ key: 'type', label: filters.type })
    if (searchText.trim()) chips.push({ key: 'search', label: `Search: ${searchText.trim()}` })
    if (showReviewOnly) chips.push({ key: 'review_only', label: 'Review queue' })
    return chips
  }, [filters, searchText, showReviewOnly])

  async function loadAll() {
    try {
      setError('')
      const [summaryRes, breakdownRes, transactionsRes, statementsRes, banksRes, categoriesRes] = await Promise.all([
        api.summary(queryParams),
        api.breakdown(queryParams),
        api.listTransactions(queryParams),
        api.statements(),
        api.banks(),
        api.categories(),
      ])
      setSummary(summaryRes)
      setBreakdown(breakdownRes)
      setTransactions(transactionsRes)
      setStatements(statementsRes)
      setBanks(banksRes)
      setCategories(categoriesRes)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadAll()
  }, [queryParams])

  useEffect(() => {
    setNotesDrafts(Object.fromEntries(transactions.map((transaction) => [transaction.id, transaction.notes || ''])))
  }, [transactions])

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuState(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    function handleShortcuts(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setShowCreateModal(true)
      }
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault()
        uploadInputRef.current?.click()
      }
    }

    window.addEventListener('keydown', handleShortcuts)
    return () => window.removeEventListener('keydown', handleShortcuts)
  }, [])

  function toggleSelected(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function saveNotes(transaction, notes) {
    const currentNotes = transaction.notes || ''
    if (notes === currentNotes) return
    setSavingNotesIds((current) => [...new Set([...current, transaction.id])])
    try {
      await api.updateTransaction(transaction.id, { notes })
      setTransactions((current) => current.map((item) => item.id === transaction.id ? { ...item, notes } : item))
    } finally {
      setSavingNotesIds((current) => current.filter((id) => id !== transaction.id))
    }
  }

  async function handleDeleteTransaction(id) {
    await api.deleteTransaction(id)
    setMenuState(null)
    await loadAll()
  }

  async function handleBulkApply() {
    await api.bulkUpdate({ ids: selectedIds, category: bulkCategory || null, type: bulkType || null })
    setSelectedIds([])
    setBulkCategory('')
    setBulkType('')
    await loadAll()
  }

  async function handleStatementDelete(id) {
    await api.deleteStatement(id)
    await loadAll()
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      await api.uploadStatements(files)
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className={`app-shell density-${density}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">MY</span>
          <div>
            <h1>MySpendee GPT</h1>
            <p>Expense dashboard in MXN</p>
          </div>
        </div>

        <div className="topbar-actions">
          <nav className="tabs">
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
            <button className={tab === 'statements' ? 'active' : ''} onClick={() => setTab('statements')}>Statements</button>
          </nav>
          <button className="accent-button secondary-action" onClick={() => setShowCreateModal(true)}>New Transaction</button>
          <label className="upload-button quiet-action">
            {uploading ? 'Uploading...' : 'Upload PDFs'}
            <input ref={uploadInputRef} type="file" accept="application/pdf" multiple onChange={handleUpload} />
          </label>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="dashboard-stack">
        <section className="toolbar panel">
          <div className="toolbar-main">
            <div className="period-pickers">
              <label>
                <span>Month</span>
                <select value={period.month} onChange={(e) => setPeriod((current) => ({ ...current, month: Number(e.target.value) }))}>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>{monthFormatter.format(new Date(2026, month - 1, 1))}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Year</span>
                <input className="year-input" type="number" value={period.year} onChange={(e) => setPeriod((current) => ({ ...current, year: Number(e.target.value) }))} />
              </label>
            </div>
            <div className="toolbar-quick-actions">
              <button className="ghost-button compact-button" onClick={() => setDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}>
                {density === 'compact' ? 'Comfortable view' : 'Compact view'}
              </button>
              {reviewItems.length ? (
                <button
                  className="ghost-button compact-button"
                  onClick={() => {
                    setShowReviewOnly(true)
                    setSearchText('')
                  }}
                >
                  Review {reviewItems.length}
                </button>
              ) : null}
            </div>
          </div>

          {activeFilters.length ? (
            <div className="active-filters">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  className="filter-chip"
                  onClick={() => {
                    if (filter.key === 'search') {
                      setSearchText('')
                      return
                    }
                    if (filter.key === 'review_only') {
                      setShowReviewOnly(false)
                      return
                    }
                    setFilters((current) => ({ ...current, [filter.key]: '' }))
                  }}
                >
                  {filter.label} ×
                </button>
              ))}
            </div>
          ) : (
            <p className="toolbar-copy">Filter by bank, category, type, or merchant search.</p>
          )}
        </section>

        {tab === 'dashboard' ? (
          <main className="dashboard-layout">
            <aside className="panel sidebar-panel">
              <div className="panel-header">
                <h3>Filters</h3>
                {activeFilters.length ? (
                  <button
                    className="ghost-button compact-button"
                    onClick={() => {
                      setFilters({ bank_name: '', category: '', type: '' })
                      setSearchText('')
                      setShowReviewOnly(false)
                    }}
                  >
                    Reset
                  </button>
                ) : null}
              </div>

              <div className="sidebar-fields">
                <label>
                  <span>Bank</span>
                  <select value={filters.bank_name} onChange={(e) => setFilters((current) => ({ ...current, bank_name: e.target.value }))}>
                    <option value="">All banks</option>
                    {banks.map((bank) => <option key={bank}>{bank}</option>)}
                  </select>
                </label>
                <label>
                  <span>Type</span>
                  <select value={filters.type} onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value }))}>
                    <option value="">All types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <select value={filters.category} onChange={(e) => setFilters((current) => ({ ...current, category: e.target.value }))}>
                    <option value="">All categories</option>
                    {categoryOptions.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  <span>Search</span>
                  <input ref={searchInputRef} placeholder="Merchant, note, bank..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </label>
              </div>
            </aside>

            <div className="main-grid">
              <section className="insight-strip">
                <div className="insight-card">
                  <span>Transactions</span>
                  <strong>{transactions.length}</strong>
                  <p>{visibleTransactions.length === transactions.length ? 'All visible in current view' : `${visibleTransactions.length} shown with current filters`}</p>
                </div>
                <div className="insight-card">
                  <span>Needs Review</span>
                  <strong>{reviewItems.length}</strong>
                  <p>{reviewItems.length ? 'Unclassified or ignored items available' : 'No review queue for this month'}</p>
                </div>
                <div className="insight-card">
                  <span>Ignored</span>
                  <strong>{transactions.filter((item) => item.type === 'ignored').length}</strong>
                  <p>Hidden from summary metrics, still accessible below</p>
                </div>
              </section>

              <section className="summary-grid">
                <SummaryCard label="Total Income" value={summary.income} tone="income" />
                <SummaryCard label="Total Expenses" value={summary.expenses} tone="expense" />
                <SummaryCard label="Net" value={summary.net} tone="net" />
              </section>

              <div className="analysis-grid">
                <section className="breakdown-grid">
                  <BreakdownSection
                    title="Income Breakdown"
                    data={breakdown.income}
                    tone="income"
                    onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))}
                  />
                  <BreakdownSection
                    title="Expense Breakdown"
                    data={breakdown.expenses}
                    tone="expense"
                    onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))}
                  />
                </section>
                <ReviewPanel
                  items={reviewItems}
                  onOpenAll={() => {
                    setShowReviewOnly(true)
                    setSearchText('')
                  }}
                  onSelectTransaction={(transaction) => {
                    setShowReviewOnly(true)
                    setSearchText(transaction.description)
                  }}
                />
              </div>

              <section className="panel transaction-panel">
                <div className="panel-header">
                  <div>
                    <h3>Transactions</h3>
                    <p className="section-meta">{visibleTransactions.length === transactions.length ? `${transactions.length} transactions` : `${visibleTransactions.length} of ${transactions.length} shown`}</p>
                  </div>
                  {showReviewOnly ? (
                    <button className="ghost-button compact-button" onClick={() => setShowReviewOnly(false)}>
                      Exit review
                    </button>
                  ) : null}
                </div>

                <div className="transaction-head transaction-grid">
                  <span></span>
                  <span>Transaction</span>
                  <span>Category</span>
                  <span>Amount</span>
                  <span>Notes</span>
                  <span></span>
                </div>

                <div className="transaction-list">
                  {visibleTransactions.map((transaction) => (
                    <div key={transaction.id} className="transaction-row transaction-grid">
                    <div className="transaction-check">
                        <input aria-label={`Select ${transaction.description}`} type="checkbox" checked={selectedIds.includes(transaction.id)} onChange={() => toggleSelected(transaction.id)} />
                      </div>

                      <div className="transaction-primary">
                        <strong>{transaction.description}</strong>
                        <div className="transaction-meta">
                          <span>{formatShortDate(transaction.date)}</span>
                          <span>{transaction.bank_name}</span>
                        </div>
                        {transaction.manually_added ? <span className="row-meta">Manual entry</span> : null}
                      </div>

                      <div className="transaction-category">
                        <span className={`pill ${transaction.type}`}>{transaction.category}</span>
                      </div>

                      <div className={`transaction-amount ${transaction.type}`}>
                        <strong className="amount-value">{formatMoney(transaction.amount_mxn)}</strong>
                        {transaction.original_amount_display ? <span className="sub-amount">{transaction.original_amount_display}</span> : null}
                      </div>

                      <div className="transaction-notes">
                        <input
                          className="notes-input"
                          value={notesDrafts[transaction.id] ?? ''}
                          placeholder="Add a note"
                          onBlur={(event) => saveNotes(transaction, event.target.value)}
                          onChange={(event) => {
                            clearTimeout(notesTimers.current[transaction.id])
                            const value = event.target.value
                            setNotesDrafts((current) => ({ ...current, [transaction.id]: value }))
                            notesTimers.current[transaction.id] = setTimeout(() => saveNotes(transaction, value), 900)
                          }}
                        />
                        {savingNotesIds.includes(transaction.id) ? <span className="row-meta">Saving…</span> : null}
                      </div>

                      <div className="actions-cell">
                        <button
                          aria-label={`Actions for ${transaction.description}`}
                          className="ghost-button icon-button"
                          onClick={(event) => setMenuState({ id: transaction.id, rect: event.currentTarget.getBoundingClientRect() })}
                        >
                          •••
                        </button>
                        {menuState?.id === transaction.id ? (
                          <TransactionMenu
                            anchorRect={menuState.rect}
                            onClose={() => setMenuState(null)}
                            onEdit={() => {
                              setEditingTransaction(transaction)
                              setMenuState(null)
                            }}
                            onDelete={() => handleDeleteTransaction(transaction.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {visibleTransactions.length === 0 ? (
                    <div className="empty-list">
                      <p>No transactions match the current filters.</p>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </main>
        ) : (
          <main className="panel statements-panel">
              <div className="panel-header">
                <div>
                  <h3>Uploaded Statements</h3>
                  <p className="section-meta">{statements.length} statements available</p>
                </div>
              </div>

            <div className="statement-list">
              {statements.map((statement) => (
                <article key={statement.id} className="statement-card">
                  <div className="statement-main">
                    <strong>{statement.filename}</strong>
                    <span>{statement.bank_name}</span>
                    <span>{formatStatementPeriod(statement)}</span>
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
                  <button className="ghost-button danger" onClick={() => handleStatementDelete(statement.id)}>Delete</button>
                </article>
              ))}

              {statements.length === 0 ? (
                <div className="empty-panel">
                  <p>No statements uploaded yet.</p>
                </div>
              ) : null}
            </div>
          </main>
        )}
      </div>

      {selectedIds.length > 0 ? (
        <div className="bulk-bar">
          <div className="bulk-summary">
            <strong>{selectedIds.length}</strong>
            <span>selected</span>
          </div>
          <div className="bulk-controls">
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
              <option value="">Change category</option>
              {categoryOptions.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
              <option value="">Change type</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button className="bulk-apply" onClick={handleBulkApply}>Apply</button>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <Modal title="Add Transaction" onClose={() => setShowCreateModal(false)}>
          <TransactionForm
            categories={categories}
            onCancel={() => setShowCreateModal(false)}
            onSubmit={async (values) => {
              await api.addTransaction(values)
              setShowCreateModal(false)
              await loadAll()
            }}
          />
        </Modal>
      ) : null}

      {editingTransaction ? (
        <Modal title="Edit Transaction" onClose={() => setEditingTransaction(null)}>
          <TransactionForm
            categories={categories}
            initialValue={editingTransaction}
            onCancel={() => setEditingTransaction(null)}
            onSubmit={async (values) => {
              await api.updateTransaction(editingTransaction.id, values)
              setEditingTransaction(null)
              await loadAll()
            }}
          />
        </Modal>
      ) : null}
    </div>
  )
}

export default App
