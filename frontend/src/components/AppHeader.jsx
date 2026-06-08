export default function AppHeader({
  tab,
  uploading,
  uploadInputRef,
  onTabChange,
  onCreateTransaction,
  onUpload,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">MO</span>
        <div>
          <h1>Moneo</h1>
          <p>Expense dashboard with flexible display currency</p>
        </div>
      </div>

      <div className="topbar-actions">
        <nav className="tabs" aria-label="Workspaces">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => onTabChange('dashboard')}>Dashboard</button>
          <button className={tab === 'review' ? 'active' : ''} onClick={() => onTabChange('review')}>Review</button>
          <button className={tab === 'statements' ? 'active' : ''} onClick={() => onTabChange('statements')}>Statements</button>
        </nav>
        <button className="accent-button secondary-action" onClick={onCreateTransaction}>New Transaction</button>
        <label className="upload-button quiet-action">
          {uploading ? 'Uploading...' : 'Upload PDFs'}
          <input ref={uploadInputRef} type="file" accept="application/pdf" multiple onChange={onUpload} />
        </label>
      </div>
    </header>
  )
}
