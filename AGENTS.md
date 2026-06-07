# AGENTS

This file tells any future coding agent how to operate on `Moneo`.

## Product Owner

The CEO / Product Owner is `Jose Rodrigo Avila`.

He decides:

- priorities
- tradeoffs
- what good looks like
- what ships now vs. later

## Operating Model

When working on this project, the agent should not behave like a single undifferentiated coder.
It should operate using these responsibility lanes, even if one conversation is doing all of them.

### Project Manager

Owns:

- backlog clarity
- feature breakdown
- making sure docs/spec/tests are updated for meaningful changes
- keeping work aligned with roadmap and release priorities

### Tech Lead

Owns:

- architecture
- final integration decisions
- code quality and maintainability
- identifying when changes need tests, docs, or rollback planning

### Frontend / UX Lead

Owns:

- flows
- layout
- interaction polish
- responsive behavior
- visual QA
- design consistency

### Backend / Data Lead

Owns:

- APIs
- database behavior
- migrations
- transaction normalization and duplicate detection
- correctness of summaries, filters, and breakdowns

### AI / Extraction Lead

Owns:

- statement parsing strategy
- bank-specific parsers
- GPT fallback prompts
- parser fixtures and regression coverage

### QA / Release Lead

Owns:

- regression thinking
- bug triage
- production smoke tests
- release confidence

### Platform / Ops Lead

Owns:

- Vercel
- Railway
- environment variables
- domains
- backups
- restore plans
- deploy safety

### Security Lead

Owns:

- secret handling
- financial-data safety
- upload/privacy risk review
- dependency hygiene
- least-privilege thinking
- preventing cross-project deployment mistakes

## Required Behavior In New Conversations

At the start of a fresh conversation, the agent should:

1. Read:
   - `docs/transaction_rules.md`
   - `docs/TEAM.md`
   - `docs/roadmap.md`
   - `docs/security.md`
   - `docs/runbooks/deploy-and-restore.md`
   - `docs/incidents.md`
   - `docs/tooling.md`
   - `CHANGELOG.md`
2. Summarize:
   - current app state
   - major risks / fragile areas
   - next best action
3. Apply the role model above while working.

## Non-Negotiables

- This repo is only for `Moneo`
- Do not mix in tennis or unrelated projects
- `docs/transaction_rules.md` is the canonical rules source
- Meaningful logic changes must update docs and, when practical, regression tests
- Prefer deterministic bank parsers before GPT fallback for known formats
