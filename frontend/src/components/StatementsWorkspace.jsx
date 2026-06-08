const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function formatStatementPeriod(statement) {
  if (!statement.period_start && !statement.period_end) return 'Unknown period'
  if (!statement.period_start || !statement.period_end) return statement.period_start || statement.period_end
  return `${statement.period_start} - ${statement.period_end}`
}

export default function StatementsWorkspace({ statements, onViewStatement, onDeleteStatement }) {
  return (
    <main className="panel statements-panel">
      <div className="panel-header">
        <div>
          <h3>Uploaded Statements</h3>
          <p className="section-meta">{statements.length} statements available</p>
        </div>
      </div>

      <div className="statement-list">
        {statements.map((statement) => (
          <article key={statement.id} className="statement-card">
            <div className="statement-main">
              <strong>{statement.filename}</strong>
              <span>{statement.bank_name}</span>
              <span>{formatStatementPeriod(statement)}</span>
            </div>
            <div className="statement-metrics">
              <div>
                <span>Transactions</span>
                <strong>{statement.transaction_count}</strong>
              </div>
              <div>
                <span>Ignored</span>
                <strong>{statement.ignored_count}</strong>
              </div>
              <div>
                <span>Uploaded</span>
                <strong>{dateTimeFormatter.format(new Date(statement.uploaded_at))}</strong>
              </div>
            </div>
            <div className="statement-actions">
              <button className="ghost-button compact-button" onClick={() => onViewStatement(statement)}>View period</button>
              <button className="ghost-button danger" onClick={() => onDeleteStatement(statement.id)}>Delete</button>
            </div>
          </article>
        ))}

        {statements.length === 0 ? (
          <div className="empty-panel">
            <p>No statements uploaded yet.</p>
          </div>
        ) : null}
      </div>
    </main>
  )
}
