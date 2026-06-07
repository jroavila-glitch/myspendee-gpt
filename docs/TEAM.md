# Team Model

This file defines the recommended working model for `Moneo`.

The goal is not to create bureaucracy. The goal is to reduce context loss, make ownership clear, and keep product quality high as the app grows.

## Core Roles

### CEO / Product Owner

Owner: `Jose Rodrigo Avila`

Responsibilities:

- Sets priorities and approves tradeoffs
- Defines what "good" looks like
- Decides what matters now vs. later

### Project Manager

Responsibilities:

- Maintains the roadmap and release priorities
- Turns feature ideas into scoped tasks
- Ensures major changes update docs, tests, and rules
- Keeps the team aligned on what is in progress, blocked, or done

### Tech Lead

Responsibilities:

- Owns architecture and integration decisions
- Reviews cross-cutting backend/frontend changes
- Ensures code quality and maintainability
- Decides when a fix needs tests, docs, or rollback planning

### Frontend / UX Lead

Responsibilities:

- Owns layout, visual design, interaction quality, and responsive behavior
- Maintains consistency across dashboard, review flows, uploads, and tables
- Runs visual QA and keeps the UI polished and calm

### Backend / Data Lead

Responsibilities:

- Owns APIs, database behavior, migrations, and data integrity
- Maintains transaction normalization, rules, and duplicate detection
- Protects correctness of summaries, breakdowns, and filters

### AI / Extraction Lead

Responsibilities:

- Owns bank-specific parsers and GPT fallback prompts
- Decides when to use deterministic parsing vs. model extraction
- Adds fixtures and regression tests for new statement formats

### QA / Release Lead

Responsibilities:

- Owns regression testing and smoke testing
- Confirms fixes in production, not just locally
- Tracks known issues and verifies releases before they are considered done

### Platform / Ops Lead

Responsibilities:

- Owns Vercel, Railway, domains, environment variables, and deploy safety
- Maintains backup/restore procedures
- Handles rollback planning for production incidents

### Security Lead

Responsibilities:

- Reviews risks around personal financial data, PDFs, API keys, and production access
- Defines minimum secure handling rules for secrets and uploads
- Pushes for dependency hygiene, least-privilege access, and auditability

This does not need to be a separate full-time person right now. It should still be an explicit responsibility.

## How We Work

For any meaningful feature or fix:

1. Product intent is clarified
2. Rules/spec are updated if business logic changes
3. Code changes are implemented
4. Regression tests are added when behavior matters
5. Production verification happens
6. Changelog / incident / roadmap docs are updated when relevant

## Agent Mapping

If using multiple agents, they should map to responsibilities, not random tasks.

- `PM agent`: backlog, specs, release notes, task breakdown
- `Frontend agent`: UI/UX implementation and polish
- `Backend agent`: API and data changes
- `Extraction agent`: parser and bank-rule work
- `QA agent`: regression review and verification
- `Security agent`: secrets, access, privacy, and risk review

## Non-Negotiables

- Canonical rules live in [`docs/transaction_rules.md`](/Users/roavila/Documents/New%20project/docs/transaction_rules.md)
- Major product/ops changes should be documented
- Production bugs should leave behind a written trace
- Live fixes should add protection against regressions when practical
