# Roadmap

This roadmap should stay short and decision-oriented.

## Current Priorities

### 1. Statement Accuracy

- Finish bank-by-bank QA on real statements
- Reduce GPT fallback dependence where deterministic parsing is possible
- Expand parser coverage for ARQ, HSBC, Millennium, Rappi, and future banks

### 2. Product Trust

- Improve review workflows for unclassified or ignored transactions
- Keep classification rules explicit and test-backed
- Strengthen bulk editing, statement visibility, and date-range behavior

### 3. Ops Safety

- Add safer migration/startup flow
- Document restore/rollback procedures
- Keep Vercel/Railway deployment boundaries clean

### 4. Premium UX

- Continue polishing dashboard density and clarity
- Tighten transaction review and table ergonomics
- Improve `Rent & Roommates` into a real reconciliation experience

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
