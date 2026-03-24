import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from './lib/api'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN' })
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const PIE_COLORS = ['#0f766e', '#f97316', '#dc2626', '#2563eb', '#ca8a04', '#64748b']

function formatMoney(value) {
  return currencyFormatter.format(Number(value || 0))
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
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

function SummaryCard({ label, value }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  )
}

function BreakdownSection({ title, data, onSelectCategory }) {
  const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0)
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="breakdown-layout">
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="category" innerRadius={48} outerRadius={82}>
                {data.map((entry, index) => (
                  <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="breakdown-table">
          {data.length === 0 ? <p className="muted">No data for this period.</p> : null}
          {data.length > 0 ? (
            <div className="breakdown-table-header">
              <span>Category</span>
              <span>Amount</span>
              <span>%</span>
            </div>
          ) : null}
          {data.map((item) => (
            <button key={`${title}-${item.category}`} className="category-row" onClick={() => onSelectCategory(item)}>
              <span className="category-name">{item.category}</span>
              <strong>{formatMoney(item.total)}</strong>
              <span className="category-share">{formatPercent(total ? (Number(item.total) / total) * 100 : 0)}</span>
            </button>
          ))}
        </div>
      </div>
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

function TransactionMenu({ onEdit, onDelete, anchorRect }) {
  if (!anchorRect) return null
  return createPortal(
    <div
      className="menu-popover"
      style={{ top: anchorRect.bottom + window.scrollY + 6, left: anchorRect.left + window.scrollX - 96 }}
    >
      <button onClick={onEdit}>Edit</button>
      <button onClick={onDelete}>Delete</button>
    </div>,
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
      <label><span>Original Currency</span><input value={form.currency_original} onChange={(e) => updateField('currency_original', e.target.value)} /></label>
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
  const notesTimers = useRef({})

  const queryParams = useMemo(() => ({
    month: String(period.month),
    year: String(period.year),
    ...(filters.bank_name ? { bank_name: filters.bank_name } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  }), [period, filters])

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories])

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    if (!normalizedSearch) return transactions
    return transactions.filter((transaction) => {
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

      return haystack.includes(normalizedSearch)
    })
  }, [transactions, searchText])

  const activeFilters = useMemo(() => {
    const chips = []
    if (filters.bank_name) chips.push({ key: 'bank_name', label: filters.bank_name })
    if (filters.category) chips.push({ key: 'category', label: filters.category })
    if (filters.type) chips.push({ key: 'type', label: filters.type })
    if (searchText.trim()) chips.push({ key: 'search', label: `Search: ${searchText.trim()}` })
    return chips
  }, [filters, searchText])

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
    setNotesDrafts(
      Object.fromEntries(transactions.map((transaction) => [transaction.id, transaction.notes || ''])),
    )
  }, [transactions])

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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">MY</span>
          <div>
            <h1>myspendee-gpt</h1>
            <p>Expense tracking dashboard</p>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={tab === 'statements' ? 'active' : ''} onClick={() => setTab('statements')}>Statements</button>
        </nav>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="dashboard-stack">
        <section className="toolbar">
          <div className="period-pickers">
            <select value={period.month} onChange={(e) => setPeriod((current) => ({ ...current, month: Number(e.target.value) }))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{monthFormatter.format(new Date(2026, month - 1, 1))}</option>
              ))}
            </select>
            <input className="year-input" type="number" value={period.year} onChange={(e) => setPeriod((current) => ({ ...current, year: Number(e.target.value) }))} />
          </div>
          <div className="toolbar-actions">
            <button className="accent-button" onClick={() => setShowCreateModal(true)}>+ Add Transaction</button>
            <label className="upload-button">
              {uploading ? 'Uploading...' : 'Upload PDFs'}
              <input type="file" accept="application/pdf" multiple onChange={handleUpload} />
            </label>
          </div>
        </section>

        {tab === 'dashboard' ? (
          <main className="dashboard-layout">
            <aside className="panel sidebar-panel">
              <div className="panel-header">
                <h3>Filters</h3>
                {activeFilters.length ? <button className="ghost-button compact-button" onClick={() => {
                  setFilters({ bank_name: '', category: '', type: '' })
                  setSearchText('')
                }}>Clear</button> : null}
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
                  <input placeholder="Merchant, note, bank..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
                </label>
              </div>
            </aside>

            <div className="main-grid">
            <section className="summary-grid">
              <SummaryCard label="Total Income" value={summary.income} />
              <SummaryCard label="Total Expenses" value={summary.expenses} />
              <SummaryCard label="Net" value={summary.net} />
            </section>

            <section className="breakdown-grid">
              <BreakdownSection
                title="Income Breakdown"
                data={breakdown.income}
                onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))}
              />
              <BreakdownSection
                title="Expense Breakdown"
                data={breakdown.expenses}
                onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))}
              />
            </section>

            <section className="panel transaction-panel">
              <div className="panel-header">
                <h3>Transactions</h3>
                <span className="muted">{visibleTransactions.length === transactions.length ? `${transactions.length} rows` : `${visibleTransactions.length} of ${transactions.length} rows`}</span>
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
                        setFilters((current) => ({ ...current, [filter.key]: '' }))
                      }}
                    >
                      {filter.label} ×
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="table-wrap transaction-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Bank</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td><input type="checkbox" checked={selectedIds.includes(transaction.id)} onChange={() => toggleSelected(transaction.id)} /></td>
                        <td>{transaction.date}</td>
                        <td className="description-cell">
                          <strong>{transaction.description}</strong>
                          {transaction.manually_added ? <span className="row-meta">Manual entry</span> : null}
                        </td>
                        <td className="bank-cell">{transaction.bank_name}</td>
                        <td>
                          <span className={`pill ${transaction.type}`}>{transaction.category}</span>
                        </td>
                        <td>
                          <strong className={Number(transaction.amount_mxn) >= 0 ? '' : ''}>{formatMoney(transaction.amount_mxn)}</strong>
                          {transaction.original_amount_display ? <span className="sub-amount">{transaction.original_amount_display}</span> : null}
                        </td>
                        <td>
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
                        </td>
                        <td>
                          <button
                            className="ghost-button"
                            onClick={(event) => setMenuState({ id: transaction.id, rect: event.currentTarget.getBoundingClientRect() })}
                          >
                            •••
                          </button>
                          {menuState?.id === transaction.id ? (
                            <TransactionMenu
                              anchorRect={menuState.rect}
                              onEdit={() => {
                                setEditingTransaction(transaction)
                                setMenuState(null)
                              }}
                              onDelete={() => handleDeleteTransaction(transaction.id)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {visibleTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-cell">No transactions match the current filters.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
            </div>
          </main>
        ) : (
          <main className="panel statements-panel">
            <div className="panel-header">
              <h3>Uploaded Statements</h3>
            </div>
            <div className="table-wrap statements-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Bank</th>
                    <th>Period</th>
                    <th>Transactions</th>
                    <th>Ignored</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((statement) => (
                    <tr key={statement.id}>
                      <td>{statement.filename}</td>
                      <td>{statement.bank_name}</td>
                      <td>{formatStatementPeriod(statement)}</td>
                      <td>{statement.transaction_count}</td>
                      <td>{statement.ignored_count}</td>
                      <td>{dateTimeFormatter.format(new Date(statement.uploaded_at))}</td>
                      <td><button className="ghost-button danger" onClick={() => handleStatementDelete(statement.id)}>Delete</button></td>
                    </tr>
                  ))}
                  {statements.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-cell">No statements uploaded yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </main>
        )}
      </div>

      {selectedIds.length > 0 ? (
        <div className="bulk-bar">
          <span>{selectedIds.length} selected</span>
          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Change category</option>
            {categoryOptions.map((category) => <option key={category}>{category}</option>)}
          </select>
          <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
            <option value="">Change type</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button onClick={handleBulkApply}>Apply</button>
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
