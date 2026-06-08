# Roadmap

This roadmap should stay short and decision-oriented.

## Current Priorities

### 1. Statement Accuracy

- Finish bank-by-bank QA on real statements
- Reduce GPT fallback dependence where deterministic parsing is possible
- Expand parser coverage for ARQ, HSBC, Millennium, Rappi, and future banks

### 2. Product Trust

- Expand deterministic review checks as reliable audit data becomes available
- Keep classification rules explicit and test-backed
- Strengthen statement visibility and date-range behavior

### 3. Ops Safety

- Add safer migration/startup flow
- Document restore/rollback procedures
- Keep Vercel/Railway deployment boundaries clean

### 4. Premium UX

- Continue polishing the delivered financial-clarity Dashboard
- Refine the delivered dedicated Review workspace from real usage
- Improve `Rent & Roommates` into a real reconciliation experience

## Recently Delivered

- Guided financial-clarity Dashboard with review-first hierarchy, Month Status,
  prior-period comparisons, recent averages, savings-rate context, and
  click-to-explain transaction previews
- Dedicated Review workspace with deterministic reasons, expandable trust
  context, keyboard triage, bulk actions, quick edit, and trusted-period empty
  state
- Shared responsive workspace header and global filters for Dashboard and Review

## Near-Term Items

- Add more parser fixtures from real statements
- Improve ARQ and Revolut income/expense confidence
- Add production-safe DB migrations
- Add safer deployment guardrails for the frontend project

## Later

- Better audit/history for manual edits
- Export/reporting workflows
- Richer roommate/rent reconciliation views
- Stronger observability around import failures
