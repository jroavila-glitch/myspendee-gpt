# myspendee-gpt

Separate greenfield version of the expense tracking dashboard using FastAPI, React, PostgreSQL, Railway, Vercel, and the OpenAI API (`gpt-4o`) for PDF statement extraction.

## Structure

- `backend/`: FastAPI API, PostgreSQL models, upload pipeline, summary/breakdown endpoints
- `frontend/`: React dashboard with filters, charts, transaction editing, bulk updates, notes, and statements tab

## Local setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment variables

Backend:

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `FRONTEND_URL`

Frontend:

- `VITE_API_URL`

## Deployment targets

### Railway

- Create a new project named `myspendee-gpt`
- Add PostgreSQL in that project only
- Point the backend service root to `backend/`
- Set `OPENAI_API_KEY`, `DATABASE_URL`, and `FRONTEND_URL`
- `backend/nixpacks.toml` installs `poppler_utils` for `pdf2image`

### Vercel

- Create a new project from the new repo
- Set the project root to `frontend/`
- Set `VITE_API_URL` to the Railway backend URL

## API surface

- `POST /upload`
- `GET /transactions`
- `GET /summary`
- `GET /breakdown`
- `POST /transactions`
- `PUT /transactions/{id}`
- `DELETE /transactions/{id}`
- `POST /transactions/bulk-update`
- `GET /statements`
- `DELETE /statements/{id}`
- `GET /banks`
- `GET /categories`

## Notes

- All dashboard values are stored/displayed in MXN.
- Original currency values are retained and shown as subtitles in the UI when available.
- Duplicate detection uses `bank_name + date + amount_mxn + description`.
- The extraction/classification pipeline is intentionally rule-aware, but you should still validate against real statement samples before production rollout because statement layouts vary heavily by bank.

## What Still Needs Real Inputs

- A GitHub repo at `jroavila-glitch/myspendee-gpt` so this local repo can be pushed and connected cleanly to Vercel.
- A valid `OPENAI_API_KEY` in Railway for live PDF extraction.
- Real sample PDFs from each bank you care about, ideally 1-2 per institution, so bank-specific parsing and classification can be validated.
- Railway environment variables on the `backend` service:
  - `OPENAI_API_KEY`
  - `DATABASE_URL`
  - `FRONTEND_URL`
- Vercel environment variable on the frontend project:
  - `VITE_API_URL`
