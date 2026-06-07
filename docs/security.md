# Security Notes

`Moneo` handles sensitive financial documents and personal transaction data. Security should stay practical, but explicit.

## Minimum Rules

- Never commit API keys, tokens, or live secrets
- Keep production/project credentials in Railway/Vercel, not in repo files
- Treat statement PDFs as sensitive personal data
- Avoid exposing raw statement contents in logs unless strictly needed for debugging
- Prefer least-privilege access for GitHub, Vercel, Railway, and database credentials

## High-Risk Areas

- Uploaded PDF storage and handling
- OpenAI request payloads that include financial statement content
- Production database edits and deletes
- Local workspaces containing multiple unrelated deployed apps

## Security Lead Checklist

When reviewing a meaningful change, check:

1. Does it expose secrets?
2. Does it widen access unnecessarily?
3. Does it increase risk of cross-project deployment mistakes?
4. Does it leak sensitive data in logs, docs, screenshots, or tests?
5. Does it need a safer rollback or audit trail?

## Next Security Upgrades

- Add explicit secret-handling guidance to runbooks
- Add dependency-review hygiene to release flow
- Consider audit logging for destructive production actions
- Add a frontend deploy guard that verifies the expected Vercel project before production deploy
