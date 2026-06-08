import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, getDisplayAmount, getSecondaryAmountLabel } from '../lib/currency'
import { getNextReviewItemId, groupReviewReasons, isReviewShortcutTarget, reviewAffectedValue } from '../lib/review'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function formatDate(value) {
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

export default function ReviewWorkspace({
  transactions,
  selectedIds,
  displayCurrency,
  displayRates,
  notesDrafts,
  savingNotesIds,
  onToggleSelected,
  onEdit,
  onNotesChange,
  onNotesBlur,
}) {
  const [activeId, setActiveId] = useState(transactions[0]?.id || null)
  const [expandedId, setExpandedId] = useState(null)
  const rowRefs = useRef(new Map())
  const reasons = useMemo(() => groupReviewReasons(transactions), [transactions])

  useEffect(() => {
    if (activeId && transactions.some((item) => item.id === activeId)) return
    setActiveId(getNextReviewItemId(transactions, activeId, activeId))
  }, [transactions, activeId])

  useEffect(() => {
    function handleKeyDown(event) {
      if (!isReviewShortcutTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const currentIndex = Math.max(0, transactions.findIndex((item) => item.id === activeId))
      let nextId = null
      if (event.key.toLowerCase() === 'j') nextId = transactions[Math.min(currentIndex + 1, transactions.length - 1)]?.id
      if (event.key.toLowerCase() === 'k') nextId = transactions[Math.max(currentIndex - 1, 0)]?.id
      if (nextId) {
        event.preventDefault()
        setActiveId(nextId)
        rowRefs.current.get(nextId)?.focus()
      }
      const active = transactions.find((item) => item.id === activeId)
      if (event.key.toLowerCase() === 'e' && active) {
        event.preventDefault()
        onEdit(active)
      }
      if (event.key.toLowerCase() === 'x' && active) {
        event.preventDefault()
        onToggleSelected(active.id)
      }
      if (event.key === 'Escape' && expandedId) {
        event.preventDefault()
        setExpandedId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeId, expandedId, onEdit, onToggleSelected, transactions])

  if (!transactions.length) {
    return (
      <main className="workspace-main">
        <section className="panel review-complete">
          <span className="review-complete-mark" aria-hidden="true">✓</span>
          <div>
            <p className="eyebrow">Review complete</p>
            <h2>Review complete. Dashboard categories are trusted for this period.</h2>
            <p>There are no unresolved review checks in the current filters.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="workspace-main review-workspace">
      <section className="panel review-overview">
        <div>
          <p className="eyebrow">Trust workspace</p>
          <h2>{transactions.length} transactions need review</h2>
          <p>Resolve the items that can change your financial story. Use J/K to move, E to edit, and X to select.</p>
        </div>
        <div className="review-overview-stats">
          <div><span>Affected value</span><strong>{formatMoney(reviewAffectedValue(transactions), 'MXN')}</strong></div>
          <div><span>Checks</span><strong>{reasons.map((item) => `${item.label} ${item.count}`).join(' · ')}</strong></div>
        </div>
      </section>

      <section className="review-queue" aria-label="Transactions needing review">
        {transactions.map((transaction) => {
          const expanded = expandedId === transaction.id
          const active = activeId === transaction.id
          const secondaryAmount = getSecondaryAmountLabel(transaction, displayCurrency)
          return (
            <article
              key={transaction.id}
              ref={(node) => node ? rowRefs.current.set(transaction.id, node) : rowRefs.current.delete(transaction.id)}
              className={`panel review-row${active ? ' active' : ''}`}
              tabIndex="0"
              aria-current={active ? 'true' : undefined}
              onFocus={() => setActiveId(transaction.id)}
            >
              <div className="review-row-main">
                <input
                  aria-label={`Select ${transaction.description}`}
                  type="checkbox"
                  checked={selectedIds.includes(transaction.id)}
                  onChange={() => onToggleSelected(transaction.id)}
                />
                <div className="review-row-copy">
                  <div className="review-badges" aria-label={`Review reasons: ${transaction.review_reasons.join(', ')}`}>
                    {transaction.review_reasons.map((reason) => <span key={reason} className="review-badge">{reason}</span>)}
                  </div>
                  <strong>{transaction.description}</strong>
                  <span>{formatDate(transaction.date)} · {transaction.bank_name}</span>
                </div>
                <span className={`pill ${transaction.type}`}>{transaction.category}</span>
                <div className={`review-row-amount ${transaction.type}`}>
                  <strong>{formatMoney(getDisplayAmount(transaction, displayCurrency, displayRates), displayCurrency)}</strong>
                  {secondaryAmount ? <span>{secondaryAmount}</span> : null}
                </div>
                <div className="review-row-actions">
                  <button className="ghost-button" onClick={() => setExpandedId(expanded ? null : transaction.id)} aria-expanded={expanded}>
                    {expanded ? 'Hide context' : 'View context'}
                  </button>
                  <button onClick={() => onEdit(transaction)}>Quick edit</button>
                </div>
              </div>

              {expanded ? (
                <dl className="review-context">
                  <div><dt>Statement source</dt><dd>{transaction.statement_id || 'Manual entry / unavailable'}</dd></div>
                  <div><dt>Original amount</dt><dd>{transaction.amount_original ?? 'Unavailable'} {transaction.currency_original}</dd></div>
                  <div><dt>MXN amount</dt><dd>{formatMoney(transaction.amount_mxn, 'MXN')}</dd></div>
                  <div><dt>Exchange rate</dt><dd>{transaction.exchange_rate_used || 'Unavailable'}</dd></div>
                  <div><dt>Current automatic result</dt><dd>{transaction.type} · {transaction.category}</dd></div>
                  <div><dt>All review reasons</dt><dd>{transaction.review_reasons.join(' · ')}</dd></div>
                  <div className="review-context-wide">
                    <dt>Notes</dt>
                    <dd>
                      <textarea
                        rows="2"
                        value={notesDrafts[transaction.id] ?? ''}
                        placeholder="Add a note"
                        onBlur={(event) => onNotesBlur(transaction, event.target.value)}
                        onChange={(event) => onNotesChange(transaction, event.target.value)}
                      />
                      {savingNotesIds.includes(transaction.id) ? <span className="row-meta">Saving…</span> : null}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </article>
          )
        })}
      </section>
    </main>
  )
}
