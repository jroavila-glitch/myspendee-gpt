import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppHeader from './components/AppHeader'
import DashboardWorkspace from './components/DashboardWorkspace'
import GlobalFilters from './components/GlobalFilters'
import StatementsWorkspace from './components/StatementsWorkspace'
import TransactionTable from './components/TransactionTable'
import { api } from './lib/api'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  buildPeriodComparisonLabel,
  filterTransactionsByDrilldown,
  filterTransactionsForWorkspace,
  getPreviewTransactions,
  joinReviewItems,
  mergeDrilldownFilters,
  replaceDisplayRatesFromFx,
  shouldApplyRequestVersion,
  shouldShowGlobalBulkBar,
} from './lib/dashboard'

function getCurrentMonthState() {
  const now = new Date()
  return { month: String(now.getMonth() + 1), year: now.getFullYear(), dateFrom: '', dateTo: '' }
}

function dedupeCategories(categories) {
  return Array.from(new Set([...categories.expense, ...categories.income]))
}

function Modal({ title, children, onClose, className = '' }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) || [])
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex="-1" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h3>{title}</h3>
          <button ref={closeButtonRef} className="ghost-button" onClick={onClose}>Close</button>
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

function BulkBar({ selectedIds, bulkCategory, bulkType, categoryOptions, onCategoryChange, onTypeChange, onApply, onMarkReviewed, onDelete, contained = false }) {
  if (!selectedIds.length) return null

  return (
    <div className={`bulk-bar${contained ? ' bulk-bar-contained' : ''}`}>
      <div className="bulk-summary">
        <strong>{selectedIds.length}</strong>
        <span>selected</span>
      </div>
      <div className="bulk-controls">
        <select value={bulkCategory} onChange={(event) => onCategoryChange(event.target.value)}>
          <option value="">Change category</option>
          {categoryOptions.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={bulkType} onChange={(event) => onTypeChange(event.target.value)}>
          <option value="">Change type</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignored">Ignored</option>
        </select>
        <button className="bulk-apply" onClick={onApply}>Apply</button>
        {onMarkReviewed ? <button className="bulk-reviewed" onClick={onMarkReviewed}>Mark selected reviewed</button> : null}
        {onDelete ? <button className="ghost-button danger" onClick={onDelete}>Delete selected</button> : null}
      </div>
    </div>
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
  const [reviewCategory, setReviewCategory] = useState('')
  const [reviewSearchText, setReviewSearchText] = useState('')
  const [menuState, setMenuState] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [returnToReviewModal, setReturnToReviewModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [privacyMode, setPrivacyMode] = useState(true)
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
  const reviewSearchInputRef = useRef(null)
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
  const visibleReviewItems = useMemo(
    () => filterTransactionsForWorkspace(reviewItems, reviewCategory, reviewSearchText),
    [reviewItems, reviewCategory, reviewSearchText],
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
    const selectableTransactions = tab === 'review' || showReviewModal
      ? visibleReviewItems
      : tab === 'dashboard'
        ? getPreviewTransactions(previewTransactions, Boolean(dashboardDrilldown.category || dashboardDrilldown.type))
        : []
    const selectableIds = new Set(selectableTransactions.map((item) => item.id))
    setSelectedIds((current) => current.filter((id) => selectableIds.has(id)))
  }, [dashboardDrilldown, previewTransactions, showReviewModal, tab, visibleReviewItems])

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
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
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

  function toggleAll(ids) {
    setSelectedIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.includes(id))
      if (allSelected) return current.filter((id) => !ids.includes(id))
      return [...new Set([...current, ...ids])]
    })
  }

  function closeReviewModal() {
    setShowReviewModal(false)
    setSelectedIds([])
    setBulkCategory('')
    setBulkType('')
    setMenuState(null)
  }

  function closeEditModal() {
    setEditingTransaction(null)
    if (returnToReviewModal) setShowReviewModal(true)
    setReturnToReviewModal(false)
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

  async function handleBulkMarkReviewed() {
    await api.bulkUpdate({ ids: selectedIds, reviewed: true })
    setSelectedIds([])
    setBulkCategory('')
    setBulkType('')
    await loadAll()
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} selected transactions? This cannot be undone.`)) return
    await api.bulkDelete({ ids: selectedIds })
    setSelectedIds([])
    setBulkCategory('')
    setBulkType('')
    await loadAll()
  }

  async function handleMarkReviewed(id) {
    await api.updateTransaction(id, { reviewed: true })
    setMenuState(null)
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    await loadAll()
  }

  async function handleDeleteTransaction(id) {
    await api.deleteTransaction(id)
    setMenuState(null)
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
            onOpenReview={() => setShowReviewModal(true)}
            onDrilldown={handleDashboardDrilldown}
            onClearDrilldown={clearDashboardDrilldown}
            privacyMode={privacyMode}
            onPrivacyToggle={() => setPrivacyMode((current) => !current)}
            onEditTransaction={setEditingTransaction}
            transactionTableProps={{
              selectedIds,
              categoryOptions,
              notesDrafts,
              savingNotesIds,
              menuState,
              onToggleSelected: toggleSelected,
              onToggleAll: toggleAll,
              onNotesChange: handleNotesChange,
              onNotesBlur: handleNotesBlur,
              onMenuOpen: (id, target) => setMenuState({ id, rect: target.getBoundingClientRect(), target }),
              onMenuClose: () => setMenuState(null),
              onDelete: handleDeleteTransaction,
            }}
          />
        ) : tab === 'review' ? (
          <main className="workspace-main">
            <TransactionTable
              title="Review Transactions"
              meta={`${visibleReviewItems.length} of ${reviewItems.length} items shown`}
              transactions={visibleReviewItems}
              selectedIds={selectedIds}
              categoryOptions={categoryOptions}
              category={reviewCategory}
              searchText={reviewSearchText}
              searchInputRef={reviewSearchInputRef}
              displayCurrency={workflowDisplayCurrency}
              displayRates={displayRates}
              notesDrafts={notesDrafts}
              savingNotesIds={savingNotesIds}
              menuState={menuState}
              emptyMessage="No transactions need review for the current filters."
              onCategoryChange={setReviewCategory}
              onSearchChange={setReviewSearchText}
              onToggleSelected={toggleSelected}
              onToggleAll={toggleAll}
              onNotesChange={handleNotesChange}
              onNotesBlur={handleNotesBlur}
              onMenuOpen={(id, target) => setMenuState({ id, rect: target.getBoundingClientRect(), target })}
              onMenuClose={() => setMenuState(null)}
              onEdit={(transaction) => {
                setEditingTransaction(transaction)
                setMenuState(null)
              }}
              onMarkReviewed={handleMarkReviewed}
              onDelete={handleDeleteTransaction}
            />
          </main>
        ) : (
          <StatementsWorkspace statements={statements} onViewStatement={handleViewStatement} onDeleteStatement={handleStatementDelete} />
        )}
      </div>

      {shouldShowGlobalBulkBar(tab, selectedIds.length, showReviewModal) ? (
        <BulkBar
          selectedIds={selectedIds}
          bulkCategory={bulkCategory}
          bulkType={bulkType}
          categoryOptions={categoryOptions}
          onCategoryChange={setBulkCategory}
          onTypeChange={setBulkType}
          onApply={handleBulkApply}
          onMarkReviewed={tab === 'review' ? handleBulkMarkReviewed : undefined}
          onDelete={handleBulkDelete}
        />
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

      {showReviewModal ? (
        <Modal title="Review Transactions" className="review-modal-card" onClose={closeReviewModal}>
          <div className="review-modal-content">
            <TransactionTable
              title="Transactions needing review"
              meta={`${visibleReviewItems.length} of ${reviewItems.length} items shown`}
              transactions={visibleReviewItems}
              selectedIds={selectedIds}
              categoryOptions={categoryOptions}
              category={reviewCategory}
              searchText={reviewSearchText}
              searchInputRef={reviewSearchInputRef}
              displayCurrency={workflowDisplayCurrency}
              displayRates={displayRates}
              notesDrafts={notesDrafts}
              savingNotesIds={savingNotesIds}
              menuState={menuState}
              emptyMessage="No transactions need review for the current filters."
              onCategoryChange={setReviewCategory}
              onSearchChange={setReviewSearchText}
              onToggleSelected={toggleSelected}
              onToggleAll={toggleAll}
              onNotesChange={handleNotesChange}
              onNotesBlur={handleNotesBlur}
              onMenuOpen={(id, target) => setMenuState({ id, rect: target.getBoundingClientRect(), target })}
              onMenuClose={() => setMenuState(null)}
              onEdit={(transaction) => {
                setShowReviewModal(false)
                setReturnToReviewModal(true)
                setMenuState(null)
                setEditingTransaction(transaction)
              }}
              onMarkReviewed={handleMarkReviewed}
              onDelete={handleDeleteTransaction}
            />
            <BulkBar
              selectedIds={selectedIds}
              bulkCategory={bulkCategory}
              bulkType={bulkType}
              categoryOptions={categoryOptions}
              onCategoryChange={setBulkCategory}
              onTypeChange={setBulkType}
              onApply={handleBulkApply}
              onMarkReviewed={handleBulkMarkReviewed}
              onDelete={handleBulkDelete}
              contained
            />
          </div>
        </Modal>
      ) : null}

      {editingTransaction ? (
        <Modal title="Edit Transaction" onClose={closeEditModal}>
          <TransactionForm
            categories={categories}
            initialValue={editingTransaction}
            onCancel={closeEditModal}
            onSubmit={async (values) => {
              await api.updateTransaction(editingTransaction.id, values)
              setEditingTransaction(null)
              await loadAll()
              if (returnToReviewModal) setShowReviewModal(true)
              setReturnToReviewModal(false)
            }}
          />
        </Modal>
      ) : null}
    </div>
  )
}

export default App
