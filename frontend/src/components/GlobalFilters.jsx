const DISPLAY_CURRENCIES = ['MXN', 'EUR', 'USD']

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })

const MONTH_OPTIONS = [
  { value: 'ytd', label: 'YTD' },
  { value: 'custom', label: 'Custom range' },
  ...Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    return { value: String(month), label: monthFormatter.format(new Date(2026, month - 1, 1)) }
  }),
]

export default function GlobalFilters({
  period,
  filters,
  banks,
  displayCurrency,
  density,
  onPeriodChange,
  onPeriodUpdate,
  onFilterChange,
  onDisplayCurrencyChange,
  onDensityToggle,
}) {
  return (
    <section className="toolbar panel">
      <div className="toolbar-main">
        <div className="period-pickers">
          <label>
            <span>Period</span>
            <select value={period.month} onChange={(event) => onPeriodChange(event.target.value)}>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Year</span>
            <input className="year-input" type="number" value={period.year} onChange={(event) => onPeriodUpdate({ year: Number(event.target.value) })} />
          </label>
          {period.month === 'custom' ? (
            <>
              <label>
                <span>From</span>
                <input className="date-input" type="date" value={period.dateFrom} onChange={(event) => onPeriodUpdate({ dateFrom: event.target.value })} />
              </label>
              <label>
                <span>To</span>
                <input className="date-input" type="date" value={period.dateTo} onChange={(event) => onPeriodUpdate({ dateTo: event.target.value })} />
              </label>
            </>
          ) : null}
          <label>
            <span>Bank</span>
            <select value={filters.bank_name} onChange={(event) => onFilterChange('bank_name', event.target.value)}>
              <option value="">All banks</option>
              {banks.map((bank) => <option key={bank}>{bank}</option>)}
            </select>
          </label>
          <label>
            <span>Activity type</span>
            <select value={filters.type} onChange={(event) => onFilterChange('type', event.target.value)}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="ignored">Ignored</option>
            </select>
          </label>
        </div>

        <div className="toolbar-quick-actions">
          <label className="display-currency-picker">
            <span>Display</span>
            <select value={displayCurrency} onChange={(event) => onDisplayCurrencyChange(event.target.value)}>
              {DISPLAY_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
            </select>
          </label>
          <button className="ghost-button compact-button" onClick={onDensityToggle}>
            {density === 'compact' ? 'Comfortable view' : 'Compact view'}
          </button>
        </div>
      </div>
    </section>
  )
}
