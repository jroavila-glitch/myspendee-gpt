import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatMoney, getDisplayAmount, getSecondaryAmountLabel } from '../lib/currency'
import { getTransactionReviewReasons } from '../lib/dashboard'

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function formatShortDate(value) {
  return shortDateFormatter.format(new Date(`${value}T00:00:00`))
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

function TransactionMenu({ id, onEdit, onDelete, onMarkReviewed, anchorRect, returnFocus, onClose }) {
  const editButtonRef = useRef(null)
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
  const top = anchorRect.bottom + window.scrollY + 8
  const left = anchorRect.right + window.scrollX - 184

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
  onNotesChange,
  onNotesBlur,
  onMenuOpen,
  onMenuClose,
  onEdit,
  onDelete,
  onMarkReviewed,
}) {
  return (
    <section className="panel transaction-panel">
      <div className="panel-header transaction-panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">{meta}</p>
        </div>
        <div className="transaction-filters">
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
        </div>
      </div>

      {category || searchText.trim() ? (
        <div className="transaction-filter-chips" aria-label="Transaction filters">
          {category ? <button className="filter-chip" onClick={() => onCategoryChange('')}>{category} ×</button> : null}
          {searchText.trim() ? <button className="filter-chip" onClick={() => onSearchChange('')}>Search: {searchText.trim()} ×</button> : null}
        </div>
      ) : null}

      <div className="transaction-head transaction-grid">
        <span></span>
        <span>Transaction</span>
        <span>Category</span>
        <span>Amount</span>
        <span>Notes</span>
        <span></span>
      </div>

      <div className="transaction-list">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="transaction-row transaction-grid">
            <div className="transaction-check">
              <input aria-label={`Select ${transaction.description}`} type="checkbox" checked={selectedIds.includes(transaction.id)} onChange={() => onToggleSelected(transaction.id)} />
            </div>

            <div className="transaction-primary">
              <strong>{transaction.description}</strong>
              <div className="transaction-meta">
                <span>{formatShortDate(transaction.date)}</span>
                <span>{transaction.bank_name}</span>
              </div>
              <ReviewBadge transaction={transaction} />
              {transaction.manually_added ? <span className="row-meta">Manual entry</span> : null}
            </div>

            <div className="transaction-category">
              <span className={`pill ${transaction.type}`}>{transaction.category}</span>
            </div>

            <div className={`transaction-amount ${transaction.type}`}>
              <strong className="amount-value">{formatMoney(getDisplayAmount(transaction, displayCurrency, displayRates), displayCurrency)}</strong>
              {getSecondaryAmountLabel(transaction, displayCurrency) ? <span className="sub-amount">{getSecondaryAmountLabel(transaction, displayCurrency)}</span> : null}
            </div>

            <div className="transaction-notes">
              <input
                className="notes-input"
                value={notesDrafts[transaction.id] ?? ''}
                placeholder="Add a note"
                onBlur={(event) => onNotesBlur(transaction, event.target.value)}
                onChange={(event) => onNotesChange(transaction, event.target.value)}
              />
              {savingNotesIds.includes(transaction.id) ? <span className="row-meta">Saving…</span> : null}
            </div>

            <div className="actions-cell">
              <button
                aria-label={`Actions for ${transaction.description}`}
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
                  onMarkReviewed={onMarkReviewed ? () => onMarkReviewed(transaction.id) : null}
                  onDelete={() => onDelete(transaction.id)}
                />
              ) : null}
            </div>
          </div>
        ))}

        {transactions.length === 0 ? (
          <div className="empty-list">
            <p>{emptyMessage}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
