# Deploy And Restore Runbook

## Production Surfaces

- Frontend: Vercel
- Backend: Railway
- Database: Railway PostgreSQL

## Before Deploying

1. Confirm the correct workspace/project is being deployed
2. Confirm environment variables are present
3. Run the relevant tests/builds locally
4. Review whether the change affects:
   - parser behavior
   - transaction rules
   - migrations
   - dashboard calculations

## Frontend Deploy Checklist

1. Verify local Vercel linkage is correct
2. Build successfully
3. Deploy
4. Smoke test:
   - dashboard loads
   - statements load
   - upload modal opens
   - filters and review mode work

## Backend Deploy Checklist

1. Run backend tests relevant to the change
2. Confirm parser/rules changes have fixture coverage when possible
3. Deploy to Railway
4. Smoke test:
   - `/health`
   - `/banks`
   - `/categories`
   - one relevant production endpoint for the changed feature

## Restore / Rollback

Code restore:

1. Identify the last known good commit
2. Revert or redeploy that commit
3. Confirm production health

Data restore:

1. Identify whether the problem is:
   - bad code with correct data
   - bad imported data
   - destructive statement deletion
2. If data is wrong due to parser/classification logic:
   - fix logic first
   - delete affected statements
   - re-import from source PDFs
3. If DB-level recovery is needed:
   - use Railway/Postgres backup or snapshot workflow
   - document the restore in the incident log

## Required After Major Fixes

- Update [`CHANGELOG.md`](/Users/roavila/moneo/CHANGELOG.md) when the change is meaningful
- Update [`docs/incidents.md`](/Users/roavila/moneo/docs/incidents.md) for important production failures
- Update [`docs/transaction_rules.md`](/Users/roavila/moneo/docs/transaction_rules.md) when business logic changes
