import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppHeader from './components/AppHeader'
import DashboardWorkspace from './components/DashboardWorkspace'
import GlobalFilters from './components/GlobalFilters'
import ReviewWorkspace from './components/ReviewWorkspace'
import StatementsWorkspace from './components/StatementsWorkspace'
import { api } from './lib/api'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  buildPeriodComparisonLabel,
  filterTransactionsByDrilldown,
  joinReviewItems,
  mergeDrilldownFilters,
  replaceDisplayRatesFromFx,
  shouldApplyRequestVersion,
} from './lib/dashboard'

function getCurrentMonthState() {
  const now = new Date()
  return { month: String(now.getMonth() + 1), year: now.getFullYear(), dateFrom: '', dateTo: '' }
}

function dedupeCategories(categories) {
  return Array.from(new Set([...categories.expense, ...categories.income]))
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
  const [filters, setFilters] = useState({ bank_name: '', type: '' })
  const [dashboardDrilldown, setDashboardDrilldown] = useState({ category: '', type: '' })
  const [displayCurrency, setDisplayCurrency] = useState('MXN')
  const [displayRates, setDisplayRates] = useState({ MXN: 1 })
  const [transactions, setTransactions] = useState([])
  const [insights, setInsights] = useState(null)
  const [statements, setStatements] = useState([])
  const [banks, setBanks] = useState([])
  const [categories, setCategories] = useState({ income: ['Other'], expense: ['Other'] })
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkType, setBulkType] = useState('')
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dashboardError, setDashboardError] = useState('')
  const [notesDrafts, setNotesDrafts] = useState({})
  const [savingNotesIds, setSavingNotesIds] = useState([])
  const [density, setDensity] = useState('comfortable')
  const notesTimers = useRef({})
  const notesSaveChains = useRef({})
  const notesSaveVersions = useRef({})
  const notesRequestedValues = useRef({})
  const notesPersistedValues = useRef({})
  const notesLatestDrafts = useRef({})
  const uploadInputRef = useRef(null)
  const loadVersionRef = useRef(0)
  const mountedRef = useRef(true)

  const queryParams = useMemo(() => {
    const params = {
      year: String(period.year),
      ...(filters.bank_name ? { bank_name: filters.bank_name } : {}),
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

  const insightsQueryParams = useMemo(() => {
    const params = {
      year: String(period.year),
      ...(filters.bank_name ? { bank_name: filters.bank_name } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    }

    if (period.month === 'custom') {
      if (period.dateFrom) params.date_from = period.dateFrom
      if (period.dateTo) params.date_to = period.dateTo
    } else if (period.month !== 'ytd') {
      params.month = period.month
    }

    return params
  }, [period, filters.bank_name, filters.type])

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories])
  const reviewItems = useMemo(
    () => joinReviewItems(transactions, insights?.review_items || []),
    [transactions, insights],
  )
  const analytics = useMemo(
    () => buildDisplayAnalytics(transactions, displayCurrency, displayRates),
    [transactions, displayCurrency, displayRates],
  )

  const previewTransactions = useMemo(
    () => filterTransactionsByDrilldown(transactions, dashboardDrilldown),
    [transactions, dashboardDrilldown],
  )
  const previousPeriodLabel = useMemo(() => buildPeriodComparisonLabel(period), [period])
  const workflowDisplayCurrency = displayCurrency === 'MXN' || Number(displayRates[displayCurrency]) > 0
    ? displayCurrency
    : 'MXN'


  async function loadAll() {
    const requestVersion = loadVersionRef.current + 1
    loadVersionRef.current = requestVersion
    const canApply = () => shouldApplyRequestVersion(requestVersion, loadVersionRef.current, mountedRef.current)
    if (canApply()) {
      setError('')
      setDashboardError('')
    }

    const metadataPromise = Promise.allSettled([
      api.statements(),
      api.banks(),
      api.categories(),
      api.fxRates(),
    ])

    try {
      const [transactionsRes, insightsRes] = await Promise.all([
        api.listTransactions(queryParams),
        api.insights(insightsQueryParams),
      ])
      if (!canApply()) return
      setTransactions(transactionsRes)
      setInsights(insightsRes)
    } catch (err) {
      if (!canApply()) return
      setTransactions([])
      setInsights(null)
      setDashboardError(err.message)
    }

    const metadataResults = await metadataPromise
    if (!canApply()) return
    const [statementsResult, banksResult, categoriesResult, fxRatesResult] = metadataResults
    const nonfatalErrors = []
    if (statementsResult.status === 'fulfilled') setStatements(statementsResult.value)
    else nonfatalErrors.push(`Statements: ${statementsResult.reason.message}`)
    if (banksResult.status === 'fulfilled') setBanks(banksResult.value)
    else nonfatalErrors.push(`Banks: ${banksResult.reason.message}`)
    if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value)
    else nonfatalErrors.push(`Categories: ${categoriesResult.reason.message}`)
    if (fxRatesResult.status === 'fulfilled') {
      setDisplayRates(replaceDisplayRatesFromFx(fxRatesResult.value))
    } else {
      setDisplayRates(replaceDisplayRatesFromFx(null))
      nonfatalErrors.push(`Exchange rates: ${fxRatesResult.reason.message}`)
    }
    setError(nonfatalErrors.join(' · '))
  }

  useEffect(() => {
    loadAll()
  }, [queryParams, insightsQueryParams])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loadVersionRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (tab !== 'review') return
    const reviewIds = new Set(reviewItems.map((item) => item.id))
    setSelectedIds((current) => current.filter((id) => reviewIds.has(id)))
  }, [reviewItems, tab])

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
    function handleShortcuts(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
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

  function handleDashboardDrilldown(drilldown) {
    setDashboardDrilldown((current) => mergeDrilldownFilters(current, buildDrilldownFilter(drilldown)))
  }

  function clearDashboardDrilldown() {
    setDashboardDrilldown(buildDrilldownFilter({}))
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
          <DashboardWorkspace
            insights={insights}
            analytics={analytics}
            drilldown={dashboardDrilldown}
            previousPeriodLabel={previousPeriodLabel}
            loadError={dashboardError}
            displayCurrency={displayCurrency}
            displayRates={displayRates}
            visibleTransactions={previewTransactions}
            onRetry={loadAll}
            onOpenReview={() => setTab('review')}
            onDrilldown={handleDashboardDrilldown}
            onClearDrilldown={clearDashboardDrilldown}
          />
        ) : tab === 'review' ? (
          <ReviewWorkspace
            transactions={reviewItems}
            selectedIds={selectedIds}
            displayCurrency={workflowDisplayCurrency}
            displayRates={displayRates}
            notesDrafts={notesDrafts}
            savingNotesIds={savingNotesIds}
            onToggleSelected={toggleSelected}
            onEdit={setEditingTransaction}
            onNotesChange={handleNotesChange}
            onNotesBlur={handleNotesBlur}
          />
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
