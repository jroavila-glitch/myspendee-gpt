# Handoff Guide

Use this file when moving `Moneo` into a new Codex conversation.

## What This Project Is

`Moneo` is a personal finance and expense-tracking app that:

- imports bank statement PDFs
- extracts and classifies transactions
- stores everything canonically in `MXN`
- allows display in `MXN`, `EUR`, or `USD`
- supports dashboard filtering, manual edits, review flows, notes, and statement management

Backend:

- FastAPI
- PostgreSQL
- parser-first extraction with GPT fallback

Frontend:

- React + Vite

Infra:

- Railway for backend + Postgres
- Vercel for frontend

## Canonical Sources Of Truth

Before making product or logic changes, the next agent should read:

1. [`docs/transaction_rules.md`](/Users/roavila/moneo/docs/transaction_rules.md)
2. [`docs/TEAM.md`](/Users/roavila/moneo/docs/TEAM.md)
3. [`docs/roadmap.md`](/Users/roavila/moneo/docs/roadmap.md)
4. [`docs/security.md`](/Users/roavila/moneo/docs/security.md)
5. [`docs/runbooks/deploy-and-restore.md`](/Users/roavila/moneo/docs/runbooks/deploy-and-restore.md)
6. [`docs/incidents.md`](/Users/roavila/moneo/docs/incidents.md)
7. [`docs/tooling.md`](/Users/roavila/moneo/docs/tooling.md)

## Current High-Value Context

- The app was renamed to `Moneo`
- The repo historically suffered from cross-project contamination with unrelated tennis apps; this repo should remain expense-app-only
- ARQ / DolarApp requires careful deterministic parsing because statement formats change
- The transaction rules document is not optional; new rules must update it
- Regression tests should be added for important parser/rule fixes

## Current Product / Engineering Priorities

1. Continue bank-by-bank QA on real statements
2. Reduce GPT fallback where deterministic parsing is possible
3. Improve review and reconciliation workflows
4. Maintain deploy and data safety

## Required Working Norms

For meaningful changes:

1. update code
2. update docs if rules/product behavior changed
3. add regression tests when practical
4. verify locally and/or in production
5. document meaningful incidents or releases

## New Conversation Starter Prompt

Use the prompt in [`docs/new-conversation-prompt.md`](/Users/roavila/moneo/docs/new-conversation-prompt.md).
