import { useEffect, useMemo, useState } from 'react'
import { formatMoney } from '../lib/currency'
import {
  addSplitRow,
  balanceFinalSplitRow,
  createSplitModalState,
  isSplitModalSaveValid,
  isUndoSplitValid,
  removeSplitRow,
  updateSplitRowAmount,
  updateSplitRowCategory,
  updateSplitRowNotes,
  updateSplitRowPercent,
  updateUndoReplacementCategory,
} from '../lib/splits'

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function getOriginalTotalLabel(transaction) {
  const currency = transaction.currency_original || 'MXN'
  if (transaction.amount_original == null || transaction.amount_original === '') return 'Same as MXN total'
  return formatMoney(transaction.amount_original, currency)
}

function getAmountInputLabel(transaction) {
  if (transaction.amount_original != null && transaction.amount_original !== '') {
    return `Amount (${transaction.currency_original || 'original'})`
  }
  return 'Amount (MXN)'
}

function getSplitBasisCurrency(transaction) {
  return transaction.amount_original != null && transaction.amount_original !== '' ? transaction.currency_original || 'MXN' : 'MXN'
}

export default function SplitTransactionModal({ transaction, categories, onCancel, onSave, onUndo, onSubmittingChange }) {
  const [state, setState] = useState(() => createSplitModalState(transaction))
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const typeCategories = useMemo(() => categories[transaction.type] || [], [categories, transaction.type])
  const amountLabel = getAmountInputLabel(transaction)
  const splitCurrency = getSplitBasisCurrency(transaction)
  const canSave = isSplitModalSaveValid(state) && !isSubmitting
  const canUndo = isUndoSplitValid(state) && !isSubmitting

  useEffect(() => {
    setState(createSplitModalState(transaction))
    setSubmitError('')
    setIsSubmitting(false)
    onSubmittingChange?.(false)
  }, [transaction])

  useEffect(() => {
    onSubmittingChange?.(isSubmitting)
  }, [isSubmitting, onSubmittingChange])

  async function handleSave(event) {
    event.preventDefault()
    if (!canSave) return
    setSubmitError('')
    setIsSubmitting(true)
    try {
      await onSave(state.rows)
    } catch (error) {
      setSubmitError(error.message || 'Could not save split. Please try again.')
      setIsSubmitting(false)
    }
  }

  async function handleUndo() {
    if (!canUndo) return
    const replacement = state.replacementCategory
    if (!window.confirm(`Undo this split and recategorize the source transaction as "${replacement}"?`)) return
    setSubmitError('')
    setIsSubmitting(true)
    try {
      await onUndo(replacement)
    } catch (error) {
      setSubmitError(error.message || 'Could not undo split. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <form className="split-modal" onSubmit={handleSave}>
      <section className="split-source-card" aria-label="Source transaction">
        <div>
          <span className="eyebrow">Source transaction</span>
          <h3>{transaction.description}</h3>
          <p>{formatDate(transaction.date)} · {transaction.bank_name || 'Unknown bank'} · {transaction.type}</p>
        </div>
        <div className="split-source-totals">
          <div>
            <span>Original total</span>
            <strong>{getOriginalTotalLabel(transaction)}</strong>
          </div>
          <div>
            <span>MXN total</span>
            <strong>{formatMoney(transaction.amount_mxn, 'MXN')}</strong>
          </div>
        </div>
      </section>

      <section className="split-editor-card" aria-label="Split allocations">
        <div className="split-editor-header">
          <div>
            <span className="eyebrow">Allocations</span>
            <h3>Split into categories</h3>
          </div>
          <div className="split-editor-actions">
            <button type="button" className="ghost-button" disabled={isSubmitting} onClick={() => setState((current) => addSplitRow(current))}>+ Add category</button>
            <button type="button" className="ghost-button" disabled={isSubmitting} onClick={() => setState((current) => balanceFinalSplitRow(current))}>Balance final row</button>
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
          {state.rows.map((row, index) => (
            <div key={index} className="split-grid split-row">
              <label>
                <span>Category</span>
                <select disabled={isSubmitting} value={row.category} onChange={(event) => setState((current) => updateSplitRowCategory(current, index, event.target.value))}>
                  <option value="">Choose category</option>
                  {typeCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>{amountLabel}</span>
                <input disabled={isSubmitting} type="number" min="0" step="0.01" value={row.amount} onChange={(event) => setState((current) => updateSplitRowAmount(current, index, event.target.value))} />
              </label>
              <label>
                <span>Percent</span>
                <input disabled={isSubmitting} type="number" min="0" step="0.01" value={row.percent} onChange={(event) => setState((current) => updateSplitRowPercent(current, index, event.target.value))} />
              </label>
              <label>
                <span>Note</span>
                <input disabled={isSubmitting} value={row.notes} placeholder="Optional" onChange={(event) => setState((current) => updateSplitRowNotes(current, index, event.target.value))} />
              </label>
              <button type="button" className="ghost-button danger" disabled={isSubmitting || state.rows.length <= 2} onClick={() => setState((current) => removeSplitRow(current, index))}>Remove</button>
            </div>
          ))}
        </div>

        <div className="split-totals" aria-live="polite">
          <div>
            <span>Allocated</span>
            <strong>{formatMoney(Number(state.total || 0) - Number(state.validation.remaining || 0), splitCurrency)}</strong>
          </div>
          <div className={state.validation.remaining === 0 ? 'balanced' : 'unbalanced'}>
            <span>Remaining</span>
            <strong>{formatMoney(state.validation.remaining, splitCurrency)}</strong>
          </div>
          <div>
            <span>Percent total</span>
            <strong>{state.rows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2)}%</strong>
          </div>
        </div>

        {state.validation.errors.length ? (
          <div className="split-errors">
            {state.validation.errors.map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : null}
      </section>

      {state.isExistingSplit ? (
        <section className="split-undo-card" aria-label="Undo split">
          <div>
            <span className="eyebrow">Undo Split</span>
            <p>Choose the category that should replace the split allocations on the source transaction.</p>
          </div>
          <label>
            <span>Replacement category</span>
            <select disabled={isSubmitting} value={state.replacementCategory} onChange={(event) => setState((current) => updateUndoReplacementCategory(current, event.target.value))}>
              <option value="">Choose replacement</option>
              {typeCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <button type="button" className="ghost-button danger" disabled={!canUndo} onClick={handleUndo}>{isSubmitting ? 'Working...' : 'Undo Split'}</button>
        </section>
      ) : null}

      {submitError ? <div className="split-submit-error" role="alert">{submitError}</div> : null}

      <div className="form-actions">
        <button type="button" className="ghost-button" disabled={isSubmitting} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={!canSave}>{isSubmitting ? 'Saving...' : 'Save split'}</button>
      </div>
    </form>
  )
}
