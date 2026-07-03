import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppHeader from './components/AppHeader'
import DashboardWorkspace from './components/DashboardWorkspace'
import GlobalFilters from './components/GlobalFilters'
import SplitTransactionModal from './components/SplitTransactionModal'
import StatementsWorkspace from './components/StatementsWorkspace'
import TransactionTable from './components/TransactionTable'
import { api } from './lib/api'
import { formatMoney } from './lib/currency'
import {
  buildDisplayAnalytics,
  buildDrilldownFilter,
  buildPeriodComparisonLabel,
  excludeTransactionsById,
  filterTransactionsByDrilldown,
  filterTransactionsForWorkspace,
  getBulkActionState,
  getPendingReminderTransactions,
  getPreviewTransactions,
  joinReviewItems,
  mergeDrilldownFilters,
  replaceDisplayRatesFromFx,
  shouldApplyRequestVersion,
  shouldShowGlobalBulkBar,
} from './lib/dashboard'
import {
  addSplitRow,
  balanceFinalSplitRow,
  buildSplitPayload,
  createSplitModalState,
  isSplitModalSaveValid,
  removeSplitRow,
  updateSplitRowAmount,
  updateSplitRowCategory,
  updateSplitRowNotes,
  updateSplitRowPercent,
} from './lib/splits'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })
const ASSIGNED_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1
  return { value: String(month), label: monthFormatter.format(new Date(2026, month - 1, 1)) }
})

function getCurrentMonthState() {
  const now = new Date()
  return { month: String(now.getMonth() + 1), year: now.getFullYear(), dateFrom: '', dateTo: '' }
}

function dedupeCategories(categories) {
  return Array.from(new Set([...categories.expense, ...categories.income]))
}

function formToDraftTransaction(form) {
  return {
    date: form.date,
    description: form.description || 'Pending transaction',
    amount_mxn: form.amount_mxn === '' ? null : Number(form.amount_mxn),
    amount_original: form.amount_original ? Number(form.amount_original) : null,
    currency_original: form.currency_original || 'MXN',
    category: form.category || 'Other',
    type: form.type || 'expense',
    bank_name: form.bank_name || 'Manual',
    allocations: [],
  }
}

function getManualTransactionExchangeRate(form, displayRates) {
  const currency = String(form.currency_original || 'MXN').toUpperCase()
  if (currency === 'MXN') return null
  if (form.amount_mxn !== '' || !form.amount_original) return null

  const rate = Number(displayRates?.[currency] || 0)
  return rate > 0 ? rate : null
}

function getSplitBasisCurrency(transaction) {
  return transaction.amount_original != null && transaction.amount_original !== '' ? transaction.currency_original || 'MXN' : 'MXN'
}

function getSplitAmountLabel(transaction) {
  if (transaction.amount_original != null && transaction.amount_original !== '') {
    return `Amount (${transaction.currency_original || 'original'})`
  }
  return 'Amount (MXN)'
}

function PendingSplitEditor({ transaction, categories, splitState, onSplitStateChange }) {
  if (!splitState) return null
  const typeCategories = categories[transaction.type] || []
  const amountLabel = getSplitAmountLabel(transaction)
  const splitCurrency = getSplitBasisCurrency(transaction)

  return (
    <section className="pending-split-editor full" aria-label="Pending transaction split">
      <div className="split-editor-header">
        <div>
          <span className="eyebrow">Pending split</span>
          <h3>Split this before saving</h3>
          <p>The app will save one pending transaction, then attach these category allocations immediately.</p>
        </div>
        <div className="split-editor-actions">
          <button type="button" className="ghost-button" onClick={() => onSplitStateChange((current) => addSplitRow(current))}>+ Add category</button>
          <button type="button" className="ghost-button" onClick={() => onSplitStateChange((current) => balanceFinalSplitRow(current))}>Balance final row</button>
        </div>
      </div>

      <div className="split-grid split-grid-head">
        <span>Category</span>
        <span>{amountLabel}</span>
        <span>Percent</span>
        <span>Note</span>
        <span></span>
      </div>

      <div className="split-row-list">
        {splitState.rows.map((row, index) => (
          <div key={index} className="split-grid split-row">
            <label>
              <span>Category</span>
              <select value={row.category} onChange={(event) => onSplitStateChange((current) => updateSplitRowCategory(current, index, event.target.value))}>
                <option value="">Choose category</option>
                {typeCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span>{amountLabel}</span>
              <input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => onSplitStateChange((current) => updateSplitRowAmount(current, index, event.target.value))} />
            </label>
            <label>
              <span>Percent</span>
              <input type="number" min="0" step="0.01" value={row.percent} onChange={(event) => onSplitStateChange((current) => updateSplitRowPercent(current, index, event.target.value))} />
            </label>
            <label>
              <span>Note</span>
              <input value={row.notes} placeholder="Optional" onChange={(event) => onSplitStateChange((current) => updateSplitRowNotes(current, index, event.target.value))} />
            </label>
            <button type="button" className="ghost-button danger" disabled={splitState.rows.length <= 2} onClick={() => onSplitStateChange((current) => removeSplitRow(current, index))}>Remove</button>
          </div>
        ))}
      </div>

      <div className="split-totals" aria-live="polite">
        <div>
          <span>Allocated</span>
          <strong>{formatMoney(Number(splitState.total || 0) - Number(splitState.validation.remaining || 0), splitCurrency)}</strong>
        </div>
        <div className={splitState.validation.remaining === 0 ? 'balanced' : 'unbalanced'}>
          <span>Remaining</span>
          <strong>{formatMoney(splitState.validation.remaining, splitCurrency)}</strong>
        </div>
        <div>
          <span>Percent total</span>
          <strong>{splitState.rows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2)}%</strong>
        </div>
      </div>

      {splitState.validation.errors.length ? (
        <div className="split-errors">
          {splitState.validation.errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
    </section>
  )
}

function Modal({ title, children, onClose, className = '', closeDisabled = false }) {
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
        if (closeDisabled) return
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
  }, [closeDisabled])

  return createPortal(
    <div className="modal-backdrop" onClick={closeDisabled ? undefined : onClose}>
      <div ref={dialogRef} className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex="-1" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h3>{title}</h3>
          <button ref={closeButtonRef} className="ghost-button" disabled={closeDisabled} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function TransactionForm({ categories, initialValue, onSubmit, onCancel, secondaryAction, displayRates = { MXN: 1 } }) {
  const categoryOptions = dedupeCategories(categories)
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
      assigned_month: '',
      assigned_year: '',
      source_status: 'posted',
      notes: '',
    },
  )
  const isCreatingTransaction = !initialValue
  const canMarkPending = !initialValue?.statement_id
  const canSplitPending = isCreatingTransaction && canMarkPending && form.source_status === 'pending' && (form.type === 'expense' || form.type === 'income')
  const draftTransaction = useMemo(() => formToDraftTransaction(form), [
    form.amount_mxn,
    form.amount_original,
    form.bank_name,
    form.category,
    form.currency_original,
    form.date,
    form.description,
    form.type,
  ])
  const splitResetKey = [
    draftTransaction.amount_mxn,
    draftTransaction.amount_original ?? '',
    draftTransaction.currency_original,
    draftTransaction.category,
    draftTransaction.type,
  ].join('|')
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [pendingSplitState, setPendingSplitState] = useState(null)
  const [rememberRule, setRememberRule] = useState(false)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canRememberRule = Boolean(initialValue) && (form.type === 'expense' || form.type === 'income')
  const pendingSplitValid = !splitEnabled || Boolean(pendingSplitState && isSplitModalSaveValid(pendingSplitState))
  const splitSaveErrors = splitEnabled && pendingSplitState?.validation?.errors?.length
    ? pendingSplitState.validation.errors
    : []

  useEffect(() => {
    if (!canSplitPending) {
      setSplitEnabled(false)
      setPendingSplitState(null)
      return
    }
    if (splitEnabled) {
      setPendingSplitState(createSplitModalState(draftTransaction))
    }
  }, [canSplitPending, splitEnabled, splitResetKey])

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setSubmitError('')
  }

  function startPendingSplit() {
    setSplitEnabled(true)
    setPendingSplitState(createSplitModalState(draftTransaction))
    setSubmitError('')
  }

  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaveAttempted(true)
        setSubmitError('')
        if (!pendingSplitValid) {
          setSubmitError('Complete the split before saving.')
          return
        }
        const values = {
          ...form,
          amount_mxn: form.amount_mxn === '' ? null : Number(form.amount_mxn),
          amount_original: form.amount_original ? Number(form.amount_original) : null,
          exchange_rate_used: getManualTransactionExchangeRate(form, displayRates),
          assigned_month: form.assigned_month ? Number(form.assigned_month) : null,
          assigned_year: form.assigned_year ? Number(form.assigned_year) : null,
          source_status: form.source_status === 'pending' ? 'pending' : 'posted',
          manually_added: true,
        }
        setSubmitting(true)
        try {
          await onSubmit(values, splitEnabled ? pendingSplitState.rows : null, { rememberRule: canRememberRule && rememberRule })
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : 'Could not save this transaction.')
        } finally {
          setSubmitting(false)
        }
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
          {categoryOptions.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label><span>Type</span>
        <select value={form.type} onChange={(e) => updateField('type', e.target.value)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignored">Ignored</option>
        </select>
      </label>
      <label><span>Assigned month</span>
        <select value={form.assigned_month ?? ''} onChange={(e) => updateField('assigned_month', e.target.value)}>
          <option value="">Auto</option>
          {ASSIGNED_MONTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label><span>Assigned year</span><input type="number" placeholder="Auto" value={form.assigned_year ?? ''} onChange={(e) => updateField('assigned_year', e.target.value)} /></label>
      <label><span>Bank</span><input value={form.bank_name} onChange={(e) => updateField('bank_name', e.target.value)} /></label>
      {canMarkPending ? (
        <label className="pending-field full">
          <input
            type="checkbox"
            checked={form.source_status === 'pending'}
            onChange={(e) => updateField('source_status', e.target.checked ? 'pending' : 'posted')}
          />
          <span>
            <strong>Pending / waiting for statement</strong>
            <small>Use this for fresh receipts you want to split or categorize before the bank statement arrives.</small>
          </span>
        </label>
      ) : null}
      {canSplitPending ? (
        splitEnabled ? (
          <>
            <PendingSplitEditor
              transaction={draftTransaction}
              categories={categories}
              splitState={pendingSplitState}
              onSplitStateChange={setPendingSplitState}
            />
            <div className="pending-split-actions full">
              <button type="button" className="ghost-button" onClick={() => {
                setSplitEnabled(false)
                setPendingSplitState(null)
                setSubmitError('')
              }}>Do not split now</button>
            </div>
          </>
        ) : (
          <div className="pending-split-prompt full">
            <div>
              <strong>Need to split this receipt?</strong>
              <span>Add the categories now, before the statement arrives.</span>
            </div>
            <button type="button" className="ghost-button" onClick={startPendingSplit}>Split now</button>
          </div>
        )
      ) : null}
      {canRememberRule ? (
        <label className="remember-rule-field full">
          <input
            type="checkbox"
            checked={rememberRule}
            onChange={(e) => setRememberRule(e.target.checked)}
          />
          <span>
            <strong>Remember this selection for similar future transactions</strong>
            <small>Moneo will use this merchant, bank, type, and category for future imports. It will not change old transactions automatically.</small>
          </span>
        </label>
      ) : null}
      <label className="full"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} /></label>
      {submitError ? (
        <div className={`form-submit-message full${pendingSplitValid ? ' danger' : ''}`} role="alert">
          <strong>{submitError}</strong>
          {!pendingSplitValid && saveAttempted && splitSaveErrors.length ? (
            <ul>
              {splitSaveErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="form-actions full">
        {secondaryAction ? <button type="button" className="ghost-button" onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
        <button type="button" className="ghost-button" disabled={submitting} onClick={onCancel}>Cancel</button>
        <button type="submit" className={!pendingSplitValid ? 'needs-attention' : ''} disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function BulkBar({ selectedIds, bulkCategory, bulkType, categoryOptions, onCategoryChange, onTypeChange, onApply, onMarkReviewed, onDelete, pendingAction = '', contained = false }) {
  if (!selectedIds.length) return null
  const bulkActionState = getBulkActionState(pendingAction)

  return (
    <div className={`bulk-bar${contained ? ' bulk-bar-contained' : ''}`} aria-busy={bulkActionState.disabled}>
      <div className="bulk-summary">
        <strong>{selectedIds.length}</strong>
        <span>selected</span>
      </div>
      <div className="bulk-controls">
        <select value={bulkCategory} onChange={(event) => onCategoryChange(event.target.value)} disabled={bulkActionState.disabled}>
          <option value="">Change category</option>
          {categoryOptions.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={bulkType} onChange={(event) => onTypeChange(event.target.value)} disabled={bulkActionState.disabled}>
          <option value="">Change type</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignored">Ignored</option>
        </select>
        <button className="bulk-apply" onClick={onApply} disabled={bulkActionState.disabled}>{bulkActionState.applyLabel}</button>
        {onMarkReviewed ? <button className="bulk-reviewed" onClick={onMarkReviewed} disabled={bulkActionState.disabled}>{bulkActionState.reviewedLabel}</button> : null}
        {onDelete ? <button className="ghost-button danger" onClick={onDelete} disabled={bulkActionState.disabled}>{bulkActionState.deleteLabel}</button> : null}
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
  const [pendingReminderTransactions, setPendingReminderTransactions] = useState([])
  const [insights, setInsights] = useState(null)
  const [statements, setStatements] = useState([])
  const [banks, setBanks] = useState([])
  const [categories, setCategories] = useState({ income: ['Other'], expense: ['Other'] })
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkType, setBulkType] = useState('')
  const [bulkActionPending, setBulkActionPending] = useState('')
  const [reviewCategory, setReviewCategory] = useState('')
  const [reviewSearchText, setReviewSearchText] = useState('')
  const [menuState, setMenuState] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [splittingTransaction, setSplittingTransaction] = useState(null)
  const [splitSubmitPending, setSplitSubmitPending] = useState(false)
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
  const bulkActionPendingRef = useRef('')

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
  const visibleDashboardTransactions = useMemo(
    () => excludeTransactionsById(previewTransactions, pendingReminderTransactions),
    [previewTransactions, pendingReminderTransactions],
  )
  const allVisibleEditableTransactions = useMemo(() => {
    const byId = new Map()
    for (const transaction of [...transactions, ...pendingReminderTransactions]) {
      byId.set(transaction.id, transaction)
    }
    return [...byId.values()]
  }, [transactions, pendingReminderTransactions])
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

    const pendingReminderPromise = api.listTransactions({
      year: String(period.year),
      date_from: `${period.year}-01-01`,
      date_to: `${period.year}-12-31`,
      source_status: 'pending',
      manually_added: 'true',
    })

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
      setPendingReminderTransactions([])
      setInsights(null)
      setDashboardError(err.message)
    }

    try {
      const yearTransactionsRes = await pendingReminderPromise
      if (!canApply()) return
      setPendingReminderTransactions(getPendingReminderTransactions(yearTransactionsRes))
    } catch {
      if (!canApply()) return
      setPendingReminderTransactions([])
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
        ? [
          ...pendingReminderTransactions,
          ...getPreviewTransactions(visibleDashboardTransactions, Boolean(dashboardDrilldown.category || dashboardDrilldown.type)),
        ]
        : []
    const selectableIds = new Set(selectableTransactions.map((item) => item.id))
    setSelectedIds((current) => current.filter((id) => selectableIds.has(id)))
  }, [dashboardDrilldown, pendingReminderTransactions, showReviewModal, tab, visibleDashboardTransactions, visibleReviewItems])

  useEffect(() => {
    setNotesDrafts(Object.fromEntries(allVisibleEditableTransactions.map((transaction) => {
      const persistedNotes = transaction.notes || ''
      notesPersistedValues.current[transaction.id] = persistedNotes
      return [transaction.id, notesLatestDrafts.current[transaction.id] ?? persistedNotes]
    })))
  }, [allVisibleEditableTransactions])

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

  function closeSplitModal() {
    if (splitSubmitPending) return
    setSplittingTransaction(null)
    if (returnToReviewModal) setShowReviewModal(true)
    setReturnToReviewModal(false)
  }

  function openSplitModal(transaction, { fromReviewModal = false } = {}) {
    setMenuState(null)
    setEditingTransaction(null)
    if (fromReviewModal) {
      setShowReviewModal(false)
      setReturnToReviewModal(true)
    }
    setSplitSubmitPending(false)
    setSplittingTransaction(transaction)
  }

  function openEditFlow(transaction, { fromReviewModal = false } = {}) {
    if (transaction.is_split) {
      openSplitModal(transaction, { fromReviewModal })
      return
    }
    setMenuState(null)
    if (fromReviewModal) {
      setShowReviewModal(false)
      setReturnToReviewModal(true)
    }
    setEditingTransaction(transaction)
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
    if (bulkActionPendingRef.current || !selectedIds.length) return
    bulkActionPendingRef.current = 'apply'
    setBulkActionPending('apply')
    try {
      await api.bulkUpdate({ ids: selectedIds, category: bulkCategory || null, type: bulkType || null })
      setSelectedIds([])
      setBulkCategory('')
      setBulkType('')
      await loadAll()
    } finally {
      bulkActionPendingRef.current = ''
      setBulkActionPending('')
    }
  }

  async function handleBulkMarkReviewed() {
    if (bulkActionPendingRef.current || !selectedIds.length) return
    bulkActionPendingRef.current = 'reviewed'
    setBulkActionPending('reviewed')
    try {
      await api.bulkUpdate({ ids: selectedIds, reviewed: true })
      setSelectedIds([])
      setBulkCategory('')
      setBulkType('')
      await loadAll()
    } finally {
      bulkActionPendingRef.current = ''
      setBulkActionPending('')
    }
  }

  async function handleBulkDelete() {
    if (bulkActionPendingRef.current || !selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} selected transactions? This cannot be undone.`)) return
    bulkActionPendingRef.current = 'delete'
    setBulkActionPending('delete')
    try {
      await api.bulkDelete({ ids: selectedIds })
      setSelectedIds([])
      setBulkCategory('')
      setBulkType('')
      await loadAll()
    } finally {
      bulkActionPendingRef.current = ''
      setBulkActionPending('')
    }
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
            visibleTransactions={visibleDashboardTransactions}
            pendingReminderTransactions={pendingReminderTransactions}
            onRetry={loadAll}
            onOpenReview={() => setShowReviewModal(true)}
            onDrilldown={handleDashboardDrilldown}
            onClearDrilldown={clearDashboardDrilldown}
            privacyMode={privacyMode}
            onPrivacyToggle={() => setPrivacyMode((current) => !current)}
            onEditTransaction={openEditFlow}
            onSplitTransaction={openSplitModal}
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
              onEdit={openEditFlow}
              onSplit={openSplitModal}
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
          pendingAction={bulkActionPending}
        />
      ) : null}

      {showCreateModal ? (
        <Modal title="Add Transaction" className="create-transaction-modal-card" onClose={() => setShowCreateModal(false)}>
          <TransactionForm
            categories={categories}
            displayRates={displayRates}
            onCancel={() => setShowCreateModal(false)}
            onSubmit={async (values, pendingSplitRows) => {
              const created = await api.addTransaction(values)
              if (pendingSplitRows?.length) {
                const payload = buildSplitPayload({ transaction: created, rows: pendingSplitRows })
                await api.setAllocations(created.id, created, payload.allocations)
              }
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
              onEdit={(transaction) => openEditFlow(transaction, { fromReviewModal: true })}
              onSplit={(transaction) => openSplitModal(transaction, { fromReviewModal: true })}
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
              pendingAction={bulkActionPending}
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
            secondaryAction={
              editingTransaction.type === 'income' || editingTransaction.type === 'expense'
                ? {
                  label: editingTransaction.is_split ? 'Edit split' : 'Split transaction',
                  onClick: () => openSplitModal(editingTransaction),
                }
                : null
            }
            onSubmit={async (values, _splitRows, options = {}) => {
              const updated = await api.updateTransaction(editingTransaction.id, values)
              if (options.rememberRule) {
                await api.createClassificationRule(updated.id, { scope: 'bank' })
              }
              setEditingTransaction(null)
              await loadAll()
              if (returnToReviewModal) setShowReviewModal(true)
              setReturnToReviewModal(false)
            }}
          />
        </Modal>
      ) : null}

      {splittingTransaction ? (
        <Modal title={splittingTransaction.is_split ? 'Edit Split' : 'Split Transaction'} className="split-modal-card" onClose={closeSplitModal} closeDisabled={splitSubmitPending}>
          <SplitTransactionModal
            transaction={splittingTransaction}
            categories={categories}
            onCancel={closeSplitModal}
            onSubmittingChange={setSplitSubmitPending}
            onSave={async (rows) => {
              const payload = buildSplitPayload({ transaction: splittingTransaction, rows })
              await api.setAllocations(splittingTransaction.id, splittingTransaction, payload.allocations)
              setSplittingTransaction(null)
              await loadAll()
              if (returnToReviewModal) setShowReviewModal(true)
              setReturnToReviewModal(false)
            }}
            onUndo={async (replacementCategory) => {
              await api.clearAllocations(splittingTransaction.id, replacementCategory)
              setSplittingTransaction(null)
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
