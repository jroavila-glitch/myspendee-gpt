import { useMemo } from 'react'
import TransactionTable from './TransactionTable'
import {
  buildReviewBannerSummary,
  calculateSavingsRate,
  convertInsightMetric,
} from '../lib/dashboard'
import { formatMoney } from '../lib/currency'

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatConvertedMoney(value, currency) {
  return value === null ? 'Conversion unavailable' : formatMoney(value, currency)
}

function movementFor(change, favorableWhenUp = true) {
  const numericChange = Number(change)
  if (!Number.isFinite(numericChange) || numericChange === 0) {
    return { symbol: '→', label: numericChange === 0 ? 'No change' : 'No previous comparison', tone: 'neutral' }
  }
  const isUp = numericChange > 0
  return {
    symbol: isUp ? '↑' : '↓',
    label: `${Math.abs(numericChange).toFixed(1)}% vs previous`,
    tone: isUp === favorableWhenUp ? 'favorable' : 'unfavorable',
  }
}

function ComparisonLine({ metric, displayCurrency }) {
  if (!metric) return <p className="comparison-line unavailable">Comparison unavailable</p>
  return (
    <p className="comparison-line">
      Previous {formatConvertedMoney(metric.previous, displayCurrency)}
      <span aria-hidden="true"> · </span>
      3-month avg {formatConvertedMoney(metric.average, displayCurrency)}
    </p>
  )
}

function Movement({ change, favorableWhenUp = true, label }) {
  const movement = movementFor(change, favorableWhenUp)
  return (
    <span className={`movement ${movement.tone}`} aria-label={`${label}: ${movement.label}`}>
      <span aria-hidden="true">{movement.symbol}</span> {movement.label}
    </span>
  )
}

function KpiCard({ label, value, displayCurrency, metric, favorableWhenUp, onClick }) {
  return (
    <button className="dashboard-kpi" type="button" onClick={onClick}>
      <span className="dashboard-kpi-label">{label}</span>
      <strong>{formatMoney(value, displayCurrency)}</strong>
      <Movement change={metric?.previous_change_percent} favorableWhenUp={favorableWhenUp} label={`${label} comparison`} />
      <ComparisonLine metric={metric} displayCurrency={displayCurrency} />
    </button>
  )
}

function SavingsKpi({ savingsRate, target }) {
  const targetDifference = savingsRate - target
  const tone = targetDifference >= 0 ? 'favorable' : 'unfavorable'
  const symbol = targetDifference >= 0 ? '↑' : '↓'
  const direction = targetDifference >= 0 ? 'above' : 'below'
  return (
    <div className="dashboard-kpi">
      <span className="dashboard-kpi-label">Savings rate</span>
      <strong>{formatPercent(savingsRate)}</strong>
      <span className={`movement ${tone}`}>
        <span aria-hidden="true">{symbol}</span> {Math.abs(targetDifference).toFixed(1)} pts {direction} target
      </span>
      <p className="comparison-line">Target {formatPercent(target)}</p>
    </div>
  )
}

function RankedList({ title, items, type, displayCurrency, onDrilldown }) {
  const max = Number(items[0]?.total || 0)
  return (
    <section className="panel ranked-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="section-meta">Select a category to explain the total.</p>
        </div>
      </div>
      {items.length ? (
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

export default function DashboardWorkspace({
  insights,
  analytics,
  filters,
  displayCurrency,
  displayRates,
  visibleTransactions,
  onOpenReview,
  onDrilldown,
  onClearDrilldown,
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
  const savingsTarget = Number(insights?.status?.target_savings_rate || 25)
  const hasInsights = Boolean(insights)
  const hasDrilldown = Boolean(filters.category || filters.type)
  const drilldownLabel = [filters.type, filters.category].filter(Boolean).join(' · ')

  return (
    <main className="dashboard-layout guided-dashboard">
      <div className="main-grid">
        <section className="review-banner" aria-label="Review summary">
          <div className="review-banner-count" aria-hidden="true">{hasInsights ? review.count : '!'}</div>
          <div className="review-banner-copy">
            <span className="eyebrow">Review before relying on the totals</span>
            <h2>{hasInsights ? (review.count ? `${review.count} transactions need a closer look` : 'No transactions need review') : 'Financial insights unavailable'}</h2>
            <p>
              {!hasInsights
                ? 'Review count, affected value, and Month Status will appear when insights load.'
                : review.count
                ? `${review.conversionAvailable ? `${formatMoney(review.affectedValue, displayCurrency)} affected` : 'Affected value conversion unavailable'}${review.reasons ? ` · ${review.reasons}` : ''}`
                : 'The current period has no flagged transactions.'}
            </p>
          </div>
          <button type="button" className="review-action" onClick={onOpenReview}>Open Review</button>
        </section>

        <section className="cashflow-hero">
          <div className="cashflow-copy">
            <span className="eyebrow">Net cash flow</span>
            <strong className={analytics.summary.net >= 0 ? 'positive' : 'negative'}>{formatMoney(analytics.summary.net, displayCurrency)}</strong>
            <Movement change={insights?.net?.previous_change_percent} favorableWhenUp label="Net cash flow comparison" />
            <ComparisonLine metric={convertedInsights?.net} displayCurrency={displayCurrency} />
          </div>
          <div className={`month-status status-${(insights?.status?.label || 'unavailable').toLowerCase().replaceAll(' ', '-')}`}>
            <span className="eyebrow">Month Status</span>
            <h2>{insights?.status?.label || 'Unavailable'}</h2>
            <p>{insights?.status?.explanation || 'Status will appear when financial insights are available.'}</p>
            <span className="status-target">Savings target {formatPercent(savingsTarget)}</span>
          </div>
        </section>

        <section className="dashboard-kpi-grid" aria-label="Key financial metrics">
          <KpiCard label="Income" value={analytics.summary.income} displayCurrency={displayCurrency} metric={convertedInsights?.income} favorableWhenUp onClick={() => onDrilldown({ category: '', type: 'income' })} />
          <KpiCard label="Expenses" value={analytics.summary.expenses} displayCurrency={displayCurrency} metric={convertedInsights?.expenses} favorableWhenUp={false} onClick={() => onDrilldown({ category: '', type: 'expense' })} />
          <SavingsKpi savingsRate={savingsRate} target={savingsTarget} />
        </section>

        <section className="ranked-grid">
          <RankedList title="Top spending" items={analytics.breakdown.expenses} type="expense" displayCurrency={displayCurrency} onDrilldown={onDrilldown} />
          <RankedList title="Top income" items={analytics.breakdown.income} type="income" displayCurrency={displayCurrency} onDrilldown={onDrilldown} />
        </section>

        {hasDrilldown ? (
          <section className="applied-drilldown" aria-label="Applied drill-down">
            <span>Explaining</span>
            <button type="button" className="filter-chip" onClick={onClearDrilldown}>{drilldownLabel} ×</button>
            <p>Period, display currency, and bank stay unchanged.</p>
          </section>
        ) : null}

        <div className="recent-transactions-preview">
          <TransactionTable
            {...transactionTableProps}
            title="Recent transactions"
            meta={`${Math.min(visibleTransactions.length, 8)} of ${visibleTransactions.length} shown`}
            transactions={visibleTransactions.slice(0, 8)}
          />
        </div>
      </div>
    </main>
  )
}
