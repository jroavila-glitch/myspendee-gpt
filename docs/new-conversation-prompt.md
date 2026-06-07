# New Conversation Prompt

Copy and paste this into a fresh Codex thread for `Moneo`.

```text
We are working on Moneo, a personal finance / expense-tracking app in:
/Users/roavila/moneo

Use Context7, Build Web Apps, and Superpowers if they are available in this session.
Adopt the operating model in /Users/roavila/moneo/AGENTS.md and /Users/roavila/moneo/docs/TEAM.md.
Use Browser for visual QA when frontend changes matter.

Before doing any meaningful work, read these files first:
- /Users/roavila/moneo/AGENTS.md
- /Users/roavila/moneo/docs/transaction_rules.md
- /Users/roavila/moneo/docs/TEAM.md
- /Users/roavila/moneo/docs/roadmap.md
- /Users/roavila/moneo/docs/security.md
- /Users/roavila/moneo/docs/runbooks/deploy-and-restore.md
- /Users/roavila/moneo/docs/incidents.md
- /Users/roavila/moneo/docs/tooling.md
- /Users/roavila/moneo/CHANGELOG.md

Important working rules:
- This repo is only for the expense app Moneo. Do not mix it with any tennis or unrelated projects.
- docs/transaction_rules.md is the canonical source of truth for transaction logic.
- Any new transaction rule or parser fix must update docs/transaction_rules.md and add/update regression tests when practical.
- Prefer deterministic parsers for known bank formats before relying on GPT fallback.
- For meaningful product/ops changes, update the relevant docs in /Users/roavila/moneo/docs/.
- Be careful with production deploys and follow the runbook.

Current project summary:
- Backend: FastAPI + PostgreSQL
- Frontend: React + Vite
- Hosting: Railway + Vercel
- PDFs: parser-first extraction with GPT fallback
- Canonical storage currency: MXN
- Display currencies: MXN / EUR / USD

When you start, first summarize:
1. current app state
2. current risks / likely fragile areas
3. the exact next best action

Then continue with the requested work.
```
