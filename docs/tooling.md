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
