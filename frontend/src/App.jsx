import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppHeader from './components/AppHeader'
import GlobalFilters from './components/GlobalFilters'
import StatementsWorkspace from './components/StatementsWorkspace'
import TransactionTable, { getReviewReason } from './components/TransactionTable'
import { api } from './lib/api'
import { formatMoney, getDisplayAmount, getSecondaryAmountLabel } from './lib/currency'

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const BreakdownChart = lazy(() => import('./components/BreakdownChart'))
const PIE_COLORS = ['#1d7a6f', '#f47d38', '#d85757', '#4c6fff', '#c59a2d', '#74809b']

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatShortDate(value) {
  return shortDateFormatter.format(new Date(`${value}T00:00:00`))
}

function getCurrentMonthState() {
  const now = new Date()
  return { month: String(now.getMonth() + 1), year: now.getFullYear(), dateFrom: '', dateTo: '' }
}

function dedupeCategories(categories) {
  return Array.from(new Set([...categories.expense, ...categories.income]))
}

function summarizeReviewItems(items) {
  const summary = new Map()
  for (const item of items) {
    const reason = item.reviewReason || 'Needs review'
    summary.set(reason, (summary.get(reason) || 0) + 1)
  }
  return Array.from(summary.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

function getRoommateLabel(transaction) {
  const haystack = `${transaction.description || ''} ${transaction.notes || ''}`.toLowerCase()
  if (haystack.includes('sebastian wohler')) return 'Sebastian'
  if (haystack.includes('paul pitterlein')) return 'Paul'
  if (haystack.includes('almitas inc invest')) return 'Rent'
  return null
}

function buildRoommateSnapshot(transactions, displayCurrency, displayRates) {
  const entries = transactions
    .map((transaction) => {
      const label = getRoommateLabel(transaction)
      return label
        ? {
            ...transaction,
            roommateLabel: label,
            displayAmount: getDisplayAmount(transaction, displayCurrency, displayRates),
            secondaryAmountLabel: getSecondaryAmountLabel(transaction, displayCurrency),
          }
        : null
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))

  const totals = {
    Sebastian: 0,
    Paul: 0,
    Rent: 0,
  }

  for (const item of entries) {
    totals[item.roommateLabel] += item.displayAmount
  }

  return {
    entries,
    totals,
    inflows: totals.Sebastian + totals.Paul,
    netRent: totals.Rent - (totals.Sebastian + totals.Paul),
  }
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{formatMoney(value.value, value.currency)}</strong>
    </div>
  )
}

function BreakdownSection({ title, data, onSelectCategory, tone, displayCurrency }) {
  const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0)

  return (
    <section className={`panel analytics-panel ${tone}`}>
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">{data.length ? `${data.length} categories` : 'No activity this period'}</p>
        </div>
        {data.length ? <strong className="panel-total">{formatMoney(total, displayCurrency)}</strong> : null}
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
                      <strong>{formatMoney(item.total, displayCurrency)}</strong>
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
  const [displayCurrency, setDisplayCurrency] = useState('MXN')
  const [displayRates, setDisplayRates] = useState({ MXN: 1, EUR: 21.5, USD: 17.9 })
  const [searchText, setSearchText] = useState('')
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
  const notesTimers = useRef({})
  const notesSaveChains = useRef({})
  const notesSaveVersions = useRef({})
  const notesRequestedValues = useRef({})
  const notesPersistedValues = useRef({})
  const notesLatestDrafts = useRef({})
  const searchInputRef = useRef(null)
  const uploadInputRef = useRef(null)

  const queryParams = useMemo(() => {
    const params = {
      year: String(period.year),
      ...(filters.bank_name ? { bank_name: filters.bank_name } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    }

    if (period.month === 'custom') {
      if (period.dateFrom) params.date_from = period.dateFrom
      if (period.dateTo) params.date_to = period.dateTo
    } else if (period.month !== 'ytd') {
      params.month = period.month
    }

    return params
  }, [period, filters])

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
  const reviewSummary = useMemo(() => summarizeReviewItems(reviewItems), [reviewItems])
  const roommateSnapshot = useMemo(
    () => buildRoommateSnapshot(transactions, displayCurrency, displayRates),
    [transactions, displayCurrency, displayRates],
  )

  const analytics = useMemo(() => {
    const base = {
      summary: { income: 0, expenses: 0, net: 0 },
      breakdown: { income: [], expenses: [] },
    }
    const grouped = new Map()

    for (const transaction of transactions) {
      if (transaction.type === 'ignored') continue
      const amount = getDisplayAmount(transaction, displayCurrency, displayRates)
      if (transaction.type === 'income') base.summary.income += amount
      if (transaction.type === 'expense') base.summary.expenses += amount
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

    base.summary.net = base.summary.income - base.summary.expenses
    const items = Array.from(grouped.values())
      .map((item) => ({ ...item, total: Number(item.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
    base.breakdown.income = items.filter((item) => item.type === 'income')
    base.breakdown.expenses = items.filter((item) => item.type === 'expense')
    return base
  }, [transactions, displayCurrency, displayRates])

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
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

      return normalizedSearch ? haystack.includes(normalizedSearch) : true
    })
  }, [transactions, searchText])

  const workspaceTransactions = tab === 'review' ? visibleTransactions.filter(getReviewReason) : visibleTransactions


  async function loadAll() {
    try {
      setError('')
      const [transactionsRes, statementsRes, banksRes, categoriesRes] = await Promise.all([
        api.listTransactions(queryParams),
        api.statements(),
        api.banks(),
        api.categories(),
      ])
      let fxRatesRes = {}
      try {
        fxRatesRes = await api.fxRates()
      } catch {
        fxRatesRes = {}
      }
      setTransactions(transactionsRes)
      setStatements(statementsRes)
      setBanks(banksRes)
      setCategories(categoriesRes)
      setDisplayRates({
        MXN: 1,
        EUR: Number(fxRatesRes.EUR || 21.5),
        USD: Number(fxRatesRes.USD || 17.9),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadAll()
  }, [queryParams])

  useEffect(() => {
    setNotesDrafts(Object.fromEntries(transactions.map((transaction) => {
      const persistedNotes = transaction.notes || ''
      notesPersistedValues.current[transaction.id] = persistedNotes
      return [transaction.id, notesLatestDrafts.current[transaction.id] ?? persistedNotes]
    })))
  }, [transactions])

  useEffect(() => () => {
    Object.values(notesTimers.current).forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!menuState) return undefined

    function handleMenuEscape(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeTransactionMenu(true)
      }
    }

    window.addEventListener('keydown', handleMenuEscape)
    return () => window.removeEventListener('keydown', handleMenuEscape)
  }, [menuState])

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

  function handlePeriodChange(value) {
    setPeriod((current) => {
      if (value !== 'custom') return { ...current, month: value }
      return {
        ...current,
        month: value,
        dateFrom: current.dateFrom || `${current.year}-01-01`,
        dateTo: current.dateTo || `${current.year}-12-31`,
      }
    })
  }

  async function saveNotes(transaction, notes) {
    const id = transaction.id
    const activeSave = notesSaveChains.current[id]
    if (activeSave && notesRequestedValues.current[id] === notes) return activeSave
    if (!activeSave && notes === (notesPersistedValues.current[id] ?? transaction.notes ?? '')) return

    const version = (notesSaveVersions.current[id] || 0) + 1
    notesSaveVersions.current[id] = version
    notesRequestedValues.current[id] = notes
    notesLatestDrafts.current[id] = notes
    setSavingNotesIds((current) => [...new Set([...current, id])])

    const request = (activeSave || Promise.resolve())
      .catch(() => {})
      .then(() => api.updateTransaction(id, { notes }))
    notesSaveChains.current[id] = request

    try {
      await request
      if (notesSaveVersions.current[id] === version) {
        notesPersistedValues.current[id] = notes
        if (notesLatestDrafts.current[id] === notes) {
          setTransactions((current) => current.map((item) => item.id === id ? { ...item, notes } : item))
        }
      }
    } finally {
      if (notesSaveVersions.current[id] === version) {
        delete notesSaveChains.current[id]
        setSavingNotesIds((current) => current.filter((savingId) => savingId !== id))
      }
    }
  }

  function handleNotesChange(transaction, value) {
    clearTimeout(notesTimers.current[transaction.id])
    notesLatestDrafts.current[transaction.id] = value
    setNotesDrafts((current) => ({ ...current, [transaction.id]: value }))
    notesTimers.current[transaction.id] = setTimeout(() => {
      delete notesTimers.current[transaction.id]
      saveNotes(transaction, value)
    }, 900)
  }

  function handleNotesBlur(transaction, value) {
    clearTimeout(notesTimers.current[transaction.id])
    delete notesTimers.current[transaction.id]
    saveNotes(transaction, value)
  }

  function closeTransactionMenu(restoreFocus = false) {
    const trigger = menuState?.trigger
    setMenuState(null)
    if (restoreFocus) requestAnimationFrame(() => trigger?.focus())
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

  function handleViewStatement(statement) {
    setPeriod((current) => ({
      ...current,
      month: 'custom',
      dateFrom: statement.period_start || current.dateFrom || `${current.year}-01-01`,
      dateTo: statement.period_end || current.dateTo || `${current.year}-12-31`,
    }))
    setFilters((current) => ({ ...current, bank_name: statement.bank_name }))
    setTab('dashboard')
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
      <AppHeader
        tab={tab}
        uploading={uploading}
        uploadInputRef={uploadInputRef}
        onTabChange={setTab}
        onCreateTransaction={() => setShowCreateModal(true)}
        onUpload={handleUpload}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="dashboard-stack">
        {tab !== 'statements' ? (
          <GlobalFilters
            period={period}
            filters={filters}
            banks={banks}
            displayCurrency={displayCurrency}
            density={density}
            onPeriodChange={handlePeriodChange}
            onPeriodUpdate={(updates) => setPeriod((current) => ({ ...current, ...updates }))}
            onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
            onDisplayCurrencyChange={setDisplayCurrency}
            onDensityToggle={() => setDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}
          />
        ) : null}

        {tab === 'dashboard' ? (
          <main className="dashboard-layout">
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
                  <p>{reviewItems.length ? `${reviewSummary.slice(0, 2).map((item) => `${item.label} ${item.count}`).join(' · ')}` : 'No review queue for this month'}</p>
                </div>
                <div className="insight-card">
                  <span>Ignored</span>
                  <strong>{transactions.filter((item) => item.type === 'ignored').length}</strong>
                  <p>Hidden from summary metrics, still accessible below</p>
                </div>
              </section>

              <section className="summary-grid">
                <SummaryCard label="Total Income" value={{ value: analytics.summary.income, currency: displayCurrency }} tone="income" />
                <SummaryCard label="Total Expenses" value={{ value: analytics.summary.expenses, currency: displayCurrency }} tone="expense" />
                <SummaryCard label="Net" value={{ value: analytics.summary.net, currency: displayCurrency }} tone="net" />
              </section>

              {roommateSnapshot.entries.length ? (
                <section className="panel roommate-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Rent & Roommates</h3>
                      <p className="section-meta">Ignored roommate transfers, plus rent payments, tracked separately from P&amp;L.</p>
                    </div>
                  </div>

                  <div className="roommate-summary">
                    <div className="roommate-metric"><span>Sebastian</span><strong>{formatMoney(roommateSnapshot.totals.Sebastian, displayCurrency)}</strong></div>
                    <div className="roommate-metric"><span>Paul</span><strong>{formatMoney(roommateSnapshot.totals.Paul, displayCurrency)}</strong></div>
                    <div className="roommate-metric"><span>Rent Paid</span><strong>{formatMoney(roommateSnapshot.totals.Rent, displayCurrency)}</strong></div>
                    <div className="roommate-metric emphasis"><span>Net After Roommates</span><strong>{formatMoney(roommateSnapshot.netRent, displayCurrency)}</strong></div>
                  </div>

                  <div className="roommate-table">
                    <div className="roommate-head"><span>Date</span><span>Line Item</span><span>Group</span><span>Amount</span></div>
                    {roommateSnapshot.entries.map((item) => (
                      <div key={item.id} className="roommate-row">
                        <span>{formatShortDate(item.date)}</span>
                        <div className="roommate-line">
                          <strong>{item.description}</strong>
                          {item.secondaryAmountLabel ? <small>{item.secondaryAmountLabel}</small> : null}
                        </div>
                        <span className={`roommate-tag ${item.roommateLabel.toLowerCase()}`}>{item.roommateLabel}</span>
                        <strong>{formatMoney(item.displayAmount, displayCurrency)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="breakdown-grid">
                <BreakdownSection title="Income Breakdown" data={analytics.breakdown.income} tone="income" displayCurrency={displayCurrency} onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))} />
                <BreakdownSection title="Expense Breakdown" data={analytics.breakdown.expenses} tone="expense" displayCurrency={displayCurrency} onSelectCategory={(item) => setFilters((current) => ({ ...current, category: item.category, type: item.type }))} />
              </section>

              <TransactionTable
                meta={visibleTransactions.length === transactions.length ? `${transactions.length} transactions` : `${visibleTransactions.length} of ${transactions.length} shown`}
                transactions={visibleTransactions}
                selectedIds={selectedIds}
                categoryOptions={categoryOptions}
                category={filters.category}
                searchText={searchText}
                searchInputRef={searchInputRef}
                displayCurrency={displayCurrency}
                displayRates={displayRates}
                notesDrafts={notesDrafts}
                savingNotesIds={savingNotesIds}
                menuState={menuState}
                onCategoryChange={(value) => setFilters((current) => ({ ...current, category: value }))}
                onSearchChange={setSearchText}
                onToggleSelected={toggleSelected}
                onNotesChange={handleNotesChange}
                onNotesBlur={handleNotesBlur}
                onMenuOpen={(id, trigger) => setMenuState({ id, trigger, rect: trigger.getBoundingClientRect() })}
                onMenuClose={closeTransactionMenu}
                onEdit={(transaction) => { setEditingTransaction(transaction); setMenuState(null) }}
                onDelete={handleDeleteTransaction}
              />
            </div>
          </main>
        ) : tab === 'review' ? (
          <main className="workspace-main">
            <TransactionTable
              title="Review Transactions"
              meta={`${workspaceTransactions.length} items need review`}
              transactions={workspaceTransactions}
              selectedIds={selectedIds}
              categoryOptions={categoryOptions}
              category={filters.category}
              searchText={searchText}
              searchInputRef={searchInputRef}
              displayCurrency={displayCurrency}
              displayRates={displayRates}
              notesDrafts={notesDrafts}
              savingNotesIds={savingNotesIds}
              menuState={menuState}
              emptyMessage="No transactions need review for the current filters."
              onCategoryChange={(value) => setFilters((current) => ({ ...current, category: value }))}
              onSearchChange={setSearchText}
              onToggleSelected={toggleSelected}
              onNotesChange={handleNotesChange}
              onNotesBlur={handleNotesBlur}
              onMenuOpen={(id, trigger) => setMenuState({ id, trigger, rect: trigger.getBoundingClientRect() })}
              onMenuClose={closeTransactionMenu}
              onEdit={(transaction) => { setEditingTransaction(transaction); setMenuState(null) }}
              onDelete={handleDeleteTransaction}
            />
          </main>
        ) : (
          <StatementsWorkspace statements={statements} onViewStatement={handleViewStatement} onDeleteStatement={handleStatementDelete} />
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
              <option value="ignored">Ignored</option>
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
