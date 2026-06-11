# Tooling Guide

This file documents the external tooling expected for `Moneo`.

## Codex Plugins

The preferred Codex plugins for this project are:

- `Browser`
- `Superpowers`
- `Build Web Apps`
- `Context7`

### Expected Usage

#### Browser

Use for:

- visual QA
- regression checks after frontend changes
- verifying filters, tables, review flows, and upload UX

#### Superpowers

Use for:

- broader product support workflows when available in session
- plugin-assisted productivity features exposed by Codex

#### Build Web Apps

Use for:

- frontend implementation support
- UI/UX iteration
- app-structure and web-product improvements when the plugin is available in the thread

#### Context7

Use for:

- verifying up-to-date library/framework docs
- confirming current APIs before implementing framework/library changes
- reducing drift when working with FastAPI, React, Vite, SQLAlchemy, and similar tools

## Important Session Note

Plugin installation and plugin availability inside a given chat thread are not always the same thing.

If a plugin is installed locally but not exposed in the current thread:

1. close the thread
2. restart Codex if needed
3. open a fresh thread in this project
4. explicitly mention the desired plugin in the first prompt

Recommended first-message phrasing:

- `Use Context7`
- `Use Build Web Apps`
- `Use Superpowers`

## Context7 Setup

Context7 is configured for Codex through MCP.

Verification commands:

```bash
codex mcp list
codex mcp get context7
```

Expected result:

- `context7` appears as an enabled MCP server

## Security Notes

- Treat API keys and MCP credentials as sensitive
- If a key was exposed in chat or logs, rotate it
- Prefer documenting setup steps rather than storing live secrets in repo files

## Statement Import Audits

Use `backend/scripts/audit_statement_imports.py` when a bank statement parser
fix needs to be checked against already-imported production data.

Example:

```bash
curl -s 'https://backend-production-d437.up.railway.app/transactions?year=2026' > /tmp/moneo_transactions_2026.json
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/audit_statement_imports.py \
  --transactions-json /tmp/moneo_transactions_2026.json \
  '/path/to/EUR_ARQ Statement - 2026-03.pdf'
```

Current support:

- ARQ / DolarApp PDFs through the deterministic ARQ parser
- exact matching by bank, transaction date, canonical description, original
  amount, and original currency
- description-mismatch reporting when the same date/amount/currency already
  exists in production under a different canonical description
- ARQ `Almitas Inc Invest` rent normalization, where the statement row shows
  `2,200 EUR` but Moneo stores the actual rent as `600 EUR`

The script exits non-zero when it finds truly missing rows or parser errors,
which makes it suitable for release checks after parser changes.
