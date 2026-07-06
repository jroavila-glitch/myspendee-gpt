import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatMoney, getDisplayAmount, getSecondaryAmountLabel } from '../lib/currency'
import { getTransactionReviewReasons } from '../lib/dashboard'
import {
  canSplitTransaction,
  getSplitActionLabel,
  getTransactionCategoryDisplay,
  getTransactionDescriptionLabel,
  getTransactionSourceStatusLabel,
  isSplitTransaction,
} from '../lib/transactions'

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const assignedPeriodFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function formatShortDate(value) {
  return shortDateFormatter.format(new Date(`${value}T00:00:00`))
}

function getAssignedPeriodLabel(transaction) {
  if (!transaction.assigned_month || !transaction.assigned_year) return ''
  const txDate = new Date(`${transaction.date}T00:00:00`)
  const actualMonth = txDate.getUTCMonth() + 1
  const actualYear = txDate.getUTCFullYear()
  if (Number(transaction.assigned_month) === actualMonth && Number(transaction.assigned_year) === actualYear) return ''
  return assignedPeriodFormatter.format(new Date(Date.UTC(Number(transaction.assigned_year), Number(transaction.assigned_month) - 1, 1)))
}

export function getReviewReason(transaction) {
  return getTransactionReviewReasons(transaction)[0] || null
}

function ReviewBadge({ transaction }) {
  const reasons = getTransactionReviewReasons(transaction)
  return reasons.length ? (
    <div className="review-badges" aria-label={`Review reasons: ${reasons.join(', ')}`}>
      {reasons.map((reason) => <span key={reason} className="review-badge">{reason}</span>)}
    </div>
  ) : null
}

function getAllocations(transaction) {
  return Array.isArray(transaction.allocations) ? transaction.allocations : []
}

function getAllocationDisplayTransaction(transaction, allocation) {
  return {
    ...transaction,
    amount_mxn: allocation.amount_mxn ?? 0,
    amount_original: allocation.amount_original ?? null,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function AllocationSummary({ transaction, displayCurrency, displayRates }) {
  const allocations = getAllocations(transaction)
  if (!allocations.length) return null
  return (
    <div className="allocation-summary" aria-label="Split allocation summary">
      {allocations.map((allocation) => (
        <span key={`${allocation.category}-${allocation.amount_mxn ?? allocation.amount_original}`}>
          {allocation.category} {formatMoney(getDisplayAmount(getAllocationDisplayTransaction(transaction, allocation), displayCurrency, displayRates), displayCurrency)}
        </span>
      ))}
    </div>
  )
}

function TransactionMenu({ id, splitLabel, onEdit, onSplit, onDelete, onMarkReviewed, anchorRect, returnFocus, onClose }) {
  const editButtonRef = useRef(null)
  const splitButtonRef = useRef(null)
  const deleteButtonRef = useRef(null)
  const reviewedButtonRef = useRef(null)

  useEffect(() => {
    editButtonRef.current?.focus()
  }, [])

  function closeMenu() {
    onClose()
    requestAnimationFrame(() => returnFocus?.focus())
  }

  if (!anchorRect) return null
  const menuWidth = 184
  const viewportPadding = 12
  const top = anchorRect.bottom + window.scrollY + 8
  const maxLeft = window.scrollX + window.innerWidth - menuWidth - viewportPadding
  const left = clamp(anchorRect.right + window.scrollX - menuWidth, window.scrollX + viewportPadding, maxLeft)

  return createPortal(
    <>
      <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />
      <div
        id={id}
        className="menu-popover"
        role="menu"
        aria-label="Transaction actions"
        style={{ top, left }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
          }
          if (event.key === 'Tab') {
            if (event.shiftKey && document.activeElement === editButtonRef.current) {
              event.preventDefault()
              deleteButtonRef.current?.focus()
            } else if (!event.shiftKey && document.activeElement === deleteButtonRef.current) {
              event.preventDefault()
              editButtonRef.current?.focus()
            }
          }
        }}
      >
        <button ref={editButtonRef} role="menuitem" onClick={onEdit}>Edit</button>
        {onMarkReviewed ? <button ref={reviewedButtonRef} role="menuitem" onClick={onMarkReviewed}>Mark reviewed</button> : null}
        {onSplit ? <button ref={splitButtonRef} role="menuitem" onClick={onSplit}>{splitLabel}</button> : null}
        <button ref={deleteButtonRef} role="menuitem" className="danger-action" onClick={onDelete}>Delete</button>
      </div>
    </>,
    document.body,
  )
}

export default function TransactionTable({
  title = 'Transactions',
  meta,
  transactions,
  selectedIds,
  categoryOptions,
  category,
  searchText,
  searchInputRef,
  displayCurrency,
  displayRates,
  notesDrafts,
  savingNotesIds,
  menuState,
  emptyMessage = 'No transactions match the current filters.',
  onCategoryChange,
  onSearchChange,
  onToggleSelected,
  onToggleAll,
  onNotesChange,
  onNotesBlur,
  onMenuOpen,
  onMenuClose,
  onEdit,
  onSplit,
  onDelete,
  onMarkReviewed,
  pendingMatchesById = {},
  onReconcilePending,
  headerAction = null,
  hideFilters = false,
}) {
  return (
    <section className="panel transaction-panel">
      <div className="panel-header transaction-panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">{meta}</p>
        </div>
        {headerAction}
        <label className="transaction-select-all">
          <input
            type="checkbox"
            checked={transactions.length > 0 && transactions.every((transaction) => selectedIds.includes(transaction.id))}
            onChange={() => onToggleAll(transactions.map((transaction) => transaction.id))}
          />
          <span>Select all shown</span>
        </label>
        {!hideFilters ? <div className="transaction-filters">
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="transaction-search">
            <span>Search</span>
            <input ref={searchInputRef} placeholder="Merchant, note, bank..." value={searchText} onChange={(event) => onSearchChange(event.target.value)} />
          </label>
        </div> : null}
      </div>

      {!hideFilters && (category || searchText.trim()) ? (
        <div className="transaction-filter-chips" aria-label="Transaction filters">
          {category ? <button className="filter-chip" onClick={() => onCategoryChange('')}>{category} ×</button> : null}
          {searchText.trim() ? <button className="filter-chip" onClick={() => onSearchChange('')}>Search: {searchText.trim()} ×</button> : null}
        </div>
      ) : null}

      <div className="transaction-head transaction-grid">
        <span>
          <input
            aria-label={`Select all ${title.toLowerCase()}`}
            type="checkbox"
            checked={transactions.length > 0 && transactions.every((transaction) => selectedIds.includes(transaction.id))}
            onChange={() => onToggleAll(transactions.map((transaction) => transaction.id))}
          />
        </span>
        <span>Transaction</span>
        <span>Category</span>
        <span>Amount</span>
        <span>Notes</span>
        <span></span>
      </div>

      <div className="transaction-list">
        {transactions.map((transaction) => {
          const splitAction = onSplit && canSplitTransaction(transaction)
          const splitLabel = getSplitActionLabel(transaction)
          const assignedPeriodLabel = getAssignedPeriodLabel(transaction)
          const sourceStatusLabel = getTransactionSourceStatusLabel(transaction)
          const categoryDisplay = getTransactionCategoryDisplay(transaction)
          const descriptionLabel = getTransactionDescriptionLabel(transaction)
          const hasDescription = Boolean(String(transaction.description || '').trim())
          const pendingMatch = pendingMatchesById[transaction.id]
          const pendingCandidate = pendingMatch?.candidates?.[0]
          return (
            <div key={transaction.id} className="transaction-row transaction-grid">
            <div className="transaction-check">
              <input aria-label={`Select ${descriptionLabel}`} type="checkbox" checked={selectedIds.includes(transaction.id)} onChange={() => onToggleSelected(transaction.id)} />
            </div>

            <div className="transaction-primary">
              <strong className={hasDescription ? undefined : 'transaction-title-missing'}>{descriptionLabel}</strong>
              <div className="transaction-meta">
                <span>{formatShortDate(transaction.date)}</span>
                <span>{transaction.bank_name}</span>
              </div>
              {assignedPeriodLabel ? <span className="row-meta">Assigned to {assignedPeriodLabel}</span> : null}
              {sourceStatusLabel ? <span className="pending-badge">{sourceStatusLabel}</span> : null}
              <ReviewBadge transaction={transaction} />
              {isSplitTransaction(transaction) ? (
                <span className="split-badge">Split · {getAllocations(transaction).length} categories</span>
              ) : null}
              <AllocationSummary transaction={transaction} displayCurrency={displayCurrency} displayRates={displayRates} />
              {transaction.manually_added ? <span className="row-meta">Manual entry</span> : null}
              {pendingCandidate ? (
                <div className="pending-match-card">
                  <span>Likely statement match</span>
                  <strong>{pendingCandidate.description}</strong>
                  <small>{formatShortDate(pendingCandidate.date)} · {pendingCandidate.bank_name || 'No bank'} · {formatMoney(getDisplayAmount(pendingCandidate, displayCurrency, displayRates), displayCurrency)}</small>
                  {onReconcilePending ? (
                    <button type="button" className="ghost-button" onClick={() => onReconcilePending(transaction.id, pendingCandidate.id)}>
                      Reconcile
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="transaction-category">
              <span className={`pill ${categoryDisplay.tone}`}>{categoryDisplay.label}</span>
              {categoryDisplay.context ? <span className="drilldown-category-context">{categoryDisplay.context}</span> : null}
            </div>

            <div className={`transaction-amount ${transaction.type}`}>
              {transaction.drilldown_amount_mxn != null ? (
                <>
                  <strong className="amount-value">{formatMoney(getDisplayAmount({
                    ...transaction,
                    amount_mxn: transaction.drilldown_amount_mxn,
                    amount_original: transaction.drilldown_amount_original ?? null,
                  }, displayCurrency, displayRates), displayCurrency)}</strong>
                  <span className="sub-amount drilldown-source-amount">
                    Source total {formatMoney(getDisplayAmount({
                      ...transaction,
                      amount_mxn: transaction.source_amount_mxn ?? transaction.amount_mxn,
                      amount_original: transaction.amount_original ?? null,
                    }, displayCurrency, displayRates), displayCurrency)}
                  </span>
                </>
              ) : (
                <>
                  <strong className="amount-value">{formatMoney(getDisplayAmount(transaction, displayCurrency, displayRates), displayCurrency)}</strong>
                  {getSecondaryAmountLabel(transaction, displayCurrency) ? <span className="sub-amount">{getSecondaryAmountLabel(transaction, displayCurrency)}</span> : null}
                </>
              )}
            </div>

            <div className="transaction-notes">
              {transaction.drilldown_category ? (
                <>
                  {transaction.drilldown_notes ? <span className="allocation-note">Allocation note: {transaction.drilldown_notes}</span> : null}
                  <span className="row-meta">Source note editing is available from Edit.</span>
                </>
              ) : (
                <>
                  <input
                    className="notes-input"
                    value={notesDrafts[transaction.id] ?? ''}
                    placeholder="Add a note"
                    onBlur={(event) => onNotesBlur(transaction, event.target.value)}
                    onChange={(event) => onNotesChange(transaction, event.target.value)}
                  />
                  {savingNotesIds.includes(transaction.id) ? <span className="row-meta">Saving…</span> : null}
                </>
              )}
            </div>

            <div className="actions-cell">
              {splitAction ? (
                <button
                  type="button"
                  className="ghost-button row-split-action"
                  onClick={() => onSplit(transaction)}
                >
                  {splitLabel}
                </button>
              ) : null}
              <button
                aria-label={`Actions for ${descriptionLabel}`}
                aria-haspopup="menu"
                aria-expanded={menuState?.id === transaction.id}
                aria-controls={menuState?.id === transaction.id ? `transaction-menu-${transaction.id}` : undefined}
                className="ghost-button icon-button"
                onClick={(event) => onMenuOpen(transaction.id, event.currentTarget)}
              >
                •••
              </button>
              {menuState?.id === transaction.id ? (
                <TransactionMenu
                  id={`transaction-menu-${transaction.id}`}
                  anchorRect={menuState.rect}
                  returnFocus={menuState.target}
                  onClose={onMenuClose}
                  onEdit={() => onEdit(transaction)}
                  splitLabel={splitLabel}
                  onSplit={splitAction ? () => onSplit(transaction) : null}
                  onMarkReviewed={onMarkReviewed ? () => onMarkReviewed(transaction.id) : null}
                  onDelete={() => onDelete(transaction.id)}
                />
              ) : null}
            </div>
          </div>
          )
        })}

        {transactions.length === 0 ? (
          <div className="empty-list">
            <p>{emptyMessage}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
