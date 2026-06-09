import { useMemo } from 'react'
import {
  buildReviewBannerSummary,
  buildSavingsRateComparison,
  calculateSavingsRate,
  convertInsightMetric,
  getPreviewTransactions,
} from '../lib/dashboard'
import { formatMoney } from '../lib/currency'
import TransactionTable from './TransactionTable'

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatConvertedMoney(value, currency) {
  return value === null ? 'Conversion unavailable' : formatMoney(value, currency)
}

function movementFor(change, favorableWhenUp = true, comparisonLabel) {
  const numericChange = Number(change)
  if (!Number.isFinite(numericChange) || numericChange === 0) {
    return {
      symbol: '→',
      label: numericChange === 0 ? `No change compared with ${comparisonLabel}` : `Compared with ${comparisonLabel}: unavailable`,
      tone: 'neutral',
    }
  }
  const isUp = numericChange > 0
  return {
    symbol: isUp ? '↑' : '↓',
    label: `${Math.abs(numericChange).toFixed(1)}% compared with ${comparisonLabel}`,
    tone: isUp === favorableWhenUp ? 'favorable' : 'unfavorable',
  }
}

function ComparisonLine({ metric, displayCurrency, previousPeriodLabel, masked = false }) {
  if (!metric) return <p className="comparison-line unavailable">Comparison unavailable</p>
  if (masked) return <p className="comparison-line">Comparison amounts hidden for privacy.</p>
  return (
    <p className="comparison-line">
      Compared with {previousPeriodLabel}: {formatConvertedMoney(metric.previous, displayCurrency)}
      <span aria-hidden="true"> · </span>
      Recent 3-month average: {formatConvertedMoney(metric.average, displayCurrency)}
    </p>
  )
}

function Movement({ change, favorableWhenUp = true, label, comparisonLabel }) {
  const movement = movementFor(change, favorableWhenUp, comparisonLabel)
  return (
    <span className={`movement ${movement.tone}`} aria-label={`${label}: ${movement.label}`}>
      <span aria-hidden="true">{movement.symbol}</span> {movement.label}
    </span>
  )
}

function KpiCard({ label, value, currentAvailable, displayCurrency, metric, previousPeriodLabel, favorableWhenUp, onClick }) {
  return (
    <button className="dashboard-kpi" type="button" onClick={onClick}>
      <span className="dashboard-kpi-label">{label}</span>
      <strong>{currentAvailable ? formatMoney(value, displayCurrency) : 'Conversion unavailable'}</strong>
      <Movement change={metric?.previous_change_percent} favorableWhenUp={favorableWhenUp} label={`${label} comparison`} comparisonLabel={previousPeriodLabel} />
      <ComparisonLine metric={metric} displayCurrency={displayCurrency} previousPeriodLabel={previousPeriodLabel} />
    </button>
  )
}

function SavingsKpi({ savingsRate, comparison, previousPeriodLabel, currentAvailable }) {
  const pointChange = comparison.previousPointChange
  const hasPointChange = pointChange !== null
  const tone = !hasPointChange ? 'neutral' : pointChange >= 0 ? 'favorable' : 'unfavorable'
  const symbol = !hasPointChange ? '→' : pointChange >= 0 ? '↑' : '↓'
  return (
    <div className="dashboard-kpi">
      <span className="dashboard-kpi-label">Savings rate</span>
      <strong>{currentAvailable ? formatPercent(savingsRate) : 'Unavailable'}</strong>
      <span className={`movement ${tone}`}>
        <span aria-hidden="true">{symbol}</span> {hasPointChange ? `${Math.abs(pointChange).toFixed(1)} pts compared with ${previousPeriodLabel}` : `Compared with ${previousPeriodLabel}: unavailable`}
      </span>
      <p className="comparison-line">Recent 3-month average: {comparison.averageRate === null ? 'Unavailable' : formatPercent(comparison.averageRate)}</p>
    </div>
  )
}

function RankedList({ title, items, type, displayCurrency, conversionAvailable, onDrilldown }) {
  const max = Number(items[0]?.total || 0)
  return (
    <section className="panel ranked-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">Select a category to explain the total.</p>
        </div>
      </div>
      {!conversionAvailable ? (
        <div className="empty-panel"><p>Display-currency conversion unavailable.</p></div>
      ) : items.length ? (
        <div className="ranked-list">
          {items.slice(0, 8).map((item, index) => (
            <button key={`${type}-${item.category}`} className="ranked-row" type="button" onClick={() => onDrilldown({ category: item.category, type })}>
              <span className="ranked-position">{index + 1}</span>
              <span className="ranked-copy">
                <span className="ranked-name">{item.category}</span>
                <span className="ranked-track"><span style={{ width: `${max ? Math.max((item.total / max) * 100, 4) : 0}%` }} /></span>
              </span>
              <strong>{formatMoney(item.total, displayCurrency)}</strong>
            </button>
          ))}
        </div>
      ) : <div className="empty-panel"><p>No {type} activity in this view.</p></div>}
    </section>
  )
}

function RecentTransactionsPreview({
  transactions,
  displayCurrency,
  displayRates,
  showAll,
  selectedIds,
  categoryOptions,
  notesDrafts,
  savingNotesIds,
  menuState,
  onToggleSelected,
  onToggleAll,
  onNotesChange,
  onNotesBlur,
  onMenuOpen,
  onMenuClose,
  onEdit,
  onDelete,
}) {
  const shownTransactions = getPreviewTransactions(transactions, showAll)
  return (
    <TransactionTable
      title={showAll ? 'Matching transactions' : 'Recent transactions'}
      meta={`${shownTransactions.length} of ${transactions.length} shown · select rows for bulk actions`}
      transactions={shownTransactions}
      selectedIds={selectedIds}
      categoryOptions={categoryOptions}
      category=""
      searchText=""
      displayCurrency={displayCurrency}
      displayRates={displayRates}
      notesDrafts={notesDrafts}
      savingNotesIds={savingNotesIds}
      menuState={menuState}
      emptyMessage="No transactions match this explanation."
      onCategoryChange={() => {}}
      onSearchChange={() => {}}
      onToggleSelected={onToggleSelected}
      onToggleAll={onToggleAll}
      onNotesChange={onNotesChange}
      onNotesBlur={onNotesBlur}
      onMenuOpen={onMenuOpen}
      onMenuClose={onMenuClose}
      onEdit={onEdit}
      onDelete={onDelete}
      hideFilters
    />
  )
}

export default function DashboardWorkspace({
  insights,
  analytics,
  drilldown,
  previousPeriodLabel,
  loadError,
  displayCurrency,
  displayRates,
  visibleTransactions,
  onOpenReview,
  onRetry,
  onDrilldown,
  onClearDrilldown,
  privacyMode,
  onPrivacyToggle,
  onEditTransaction,
  transactionTableProps,
}) {
  const convertedInsights = useMemo(() => {
    if (!insights) return null
    return Object.fromEntries(['income', 'expenses', 'net'].map((key) => [key, {
      ...insights[key],
      previous: convertInsightMetric(insights[key]?.previous, displayCurrency, displayRates),
      average: insights[key]?.average == null ? null : convertInsightMetric(insights[key].average, displayCurrency, displayRates),
    }]))
  }, [insights, displayCurrency, displayRates])
  const review = useMemo(
    () => buildReviewBannerSummary(insights, displayCurrency, displayRates),
    [insights, displayCurrency, displayRates],
  )
  const savingsRate = calculateSavingsRate(analytics.summary)
  const savingsComparison = useMemo(() => buildSavingsRateComparison(insights), [insights])
  const savingsTarget = Number(insights?.status?.target_savings_rate || 25)
  const hasInsights = Boolean(insights)
  const hasDrilldown = Boolean(drilldown.category || drilldown.type)
  const drilldownLabel = [drilldown.type, drilldown.category].filter(Boolean).join(' · ')
  const currentAvailable = analytics.conversionAvailable

  if (loadError) {
    return (
      <main className="dashboard-layout guided-dashboard">
        <section className="dashboard-error-state" role="alert">
          <span className="eyebrow">Dashboard unavailable</span>
          <h2>Financial story could not be loaded</h2>
          <p>{loadError}</p>
          <button type="button" onClick={onRetry}>Retry</button>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-layout guided-dashboard">
      <div className="main-grid">
        <section className={`review-banner ${hasInsights && review.count === 0 ? 'review-clear' : ''}`} aria-label="Review summary">
          <div className="review-banner-count" aria-hidden="true">{hasInsights ? review.count : '!'}</div>
          <div className="review-banner-copy">
            <span className="eyebrow">{hasInsights && review.count === 0 ? 'Review clear' : 'Review before relying on the totals'}</span>
            <h2>{hasInsights ? (review.count ? `${review.count} transactions need a closer look` : 'No review items for this period') : 'Financial insights unavailable'}</h2>
            <p>
              {!hasInsights
                ? 'Review count, affected value, and Month Status will appear when insights load.'
                : review.count
                ? `${review.conversionAvailable ? `${formatMoney(review.affectedValue, displayCurrency)} affected` : 'Affected value conversion unavailable'}${review.reasons ? ` · ${review.reasons}` : ''}`
                : 'Current categories are clear of deterministic review flags.'}
            </p>
          </div>
          <button type="button" className="review-action" onClick={onOpenReview}>Open Review</button>
        </section>

        <section className="cashflow-hero">
          <div className="cashflow-copy">
            <div className="cashflow-title-row">
              <span className="eyebrow">Net cash flow</span>
              <button type="button" className="privacy-toggle" onClick={onPrivacyToggle} aria-pressed={!privacyMode}>
                {privacyMode ? 'Reveal amount' : 'Hide amount'}
              </button>
            </div>
            <strong className={`${analytics.summary.net >= 0 ? 'positive' : 'negative'}${privacyMode ? ' private-value' : ''}`}>
              {privacyMode ? '••••••' : currentAvailable ? formatMoney(analytics.summary.net, displayCurrency) : 'Conversion unavailable'}
            </strong>
            <Movement change={insights?.net?.previous_change_percent} favorableWhenUp label="Net cash flow comparison" comparisonLabel={previousPeriodLabel} />
            <ComparisonLine metric={convertedInsights?.net} displayCurrency={displayCurrency} previousPeriodLabel={previousPeriodLabel} masked={privacyMode} />
          </div>
          <div className={`month-status status-${(insights?.status?.label || 'unavailable').toLowerCase().replaceAll(' ', '-')}`}>
            <span className="eyebrow">Month Status</span>
            <h2>{insights?.status?.label || 'Unavailable'}</h2>
            <p>{insights?.status?.explanation || 'Status will appear when financial insights are available.'}</p>
            <span className="status-target">Savings target {formatPercent(savingsTarget)}</span>
          </div>
        </section>

        <section className="dashboard-kpi-grid" aria-label="Key financial metrics">
          <KpiCard label="Income" value={analytics.summary.income} currentAvailable={currentAvailable} displayCurrency={displayCurrency} metric={convertedInsights?.income} previousPeriodLabel={previousPeriodLabel} favorableWhenUp onClick={() => onDrilldown({ category: '', type: 'income' })} />
          <KpiCard label="Expenses" value={analytics.summary.expenses} currentAvailable={currentAvailable} displayCurrency={displayCurrency} metric={convertedInsights?.expenses} previousPeriodLabel={previousPeriodLabel} favorableWhenUp={false} onClick={() => onDrilldown({ category: '', type: 'expense' })} />
          <SavingsKpi savingsRate={savingsRate} comparison={savingsComparison} previousPeriodLabel={previousPeriodLabel} currentAvailable={currentAvailable} />
        </section>

        <section className="ranked-grid">
          <RankedList title="Top spending" items={analytics.breakdown.expenses} type="expense" displayCurrency={displayCurrency} conversionAvailable={currentAvailable} onDrilldown={onDrilldown} />
          <RankedList title="Top income" items={analytics.breakdown.income} type="income" displayCurrency={displayCurrency} conversionAvailable={currentAvailable} onDrilldown={onDrilldown} />
        </section>

        {hasDrilldown ? (
          <section className="applied-drilldown" aria-label="Applied drill-down">
            <span>Explaining</span>
            <button type="button" className="filter-chip" onClick={onClearDrilldown}>{drilldownLabel} ×</button>
            <p>Period, display currency, and bank stay unchanged.</p>
          </section>
        ) : null}

        <RecentTransactionsPreview
          transactions={visibleTransactions}
          displayCurrency={displayCurrency}
          displayRates={displayRates}
          showAll={hasDrilldown}
          onEdit={onEditTransaction}
          {...transactionTableProps}
        />
      </div>
    </main>
  )
}
