from datetime import datetime
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import Base, engine, get_db
from app.models import Statement, Transaction
from app.schemas.common import (
    BreakdownResponse,
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    StatementRead,
    SummaryResponse,
    TransactionBulkUpdate,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    UploadResult,
)
from app.services.transactions import create_transaction, delete_statement, get_breakdown, get_summary, serialize_transaction, update_transaction
from app.services.upload import process_uploaded_statement

settings = get_settings()
app = FastAPI(title=settings.app_name)


def _allowed_origins() -> list[str]:
    raw = settings.frontend_url or ""
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    origins.append("http://localhost:5173")
    return list(dict.fromkeys(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "timestamp": datetime.utcnow().isoformat()}


@app.post("/upload", response_model=UploadResult)
async def upload_statements(files: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> UploadResult:
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")

    statements = []
    inserted_transactions = 0
    skipped_duplicates = 0
    for file in files:
        if file.content_type not in {"application/pdf", "application/x-pdf"}:
            raise HTTPException(status_code=400, detail=f"{file.filename} is not a PDF")
        content = await file.read()
        try:
            statement, inserted, skipped = process_uploaded_statement(db, file.filename, content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        statements.append(statement)
        inserted_transactions += inserted
        skipped_duplicates += skipped
    return UploadResult(
        statements=[StatementRead.model_validate(s) for s in statements],
        inserted_transactions=inserted_transactions,
        skipped_duplicates=skipped_duplicates,
    )


@app.get("/transactions", response_model=list[TransactionRead])
def list_transactions(
    month: int = Query(...),
    year: int = Query(...),
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> list[TransactionRead]:
    stmt = select(Transaction).where(Transaction.month == month, Transaction.year == year)
    if bank_name:
        stmt = stmt.where(Transaction.bank_name == bank_name)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if type:
        stmt = stmt.where(Transaction.type == type)
    stmt = stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc())
    transactions = db.scalars(stmt).all()
    return [TransactionRead.model_validate(serialize_transaction(tx)) for tx in transactions]


@app.get("/summary", response_model=SummaryResponse)
def summary(month: int = Query(...), year: int = Query(...), db: Session = Depends(get_db)) -> SummaryResponse:
    return get_summary(db, month, year)


@app.get("/breakdown", response_model=BreakdownResponse)
def breakdown(month: int = Query(...), year: int = Query(...), db: Session = Depends(get_db)) -> BreakdownResponse:
    return get_breakdown(db, month, year)


@app.post("/transactions", response_model=TransactionRead)
def add_transaction(payload: TransactionCreate, db: Session = Depends(get_db)) -> TransactionRead:
    try:
        transaction = create_transaction(db, payload)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate transaction") from exc
    return TransactionRead.model_validate(serialize_transaction(transaction))


@app.put("/transactions/{transaction_id}", response_model=TransactionRead)
def edit_transaction(transaction_id: UUID, payload: TransactionUpdate, db: Session = Depends(get_db)) -> TransactionRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    try:
        transaction = update_transaction(db, transaction, payload)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate transaction after update") from exc
    return TransactionRead.model_validate(serialize_transaction(transaction))


@app.delete("/transactions/{transaction_id}")
def remove_transaction(transaction_id: UUID, db: Session = Depends(get_db)) -> dict:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(transaction)
    db.commit()
    return {"ok": True}


@app.post("/transactions/bulk-update")
def bulk_update(payload: TransactionBulkUpdate, db: Session = Depends(get_db)) -> dict:
    if not payload.ids:
        raise HTTPException(status_code=400, detail="No transactions selected")
    transactions = db.scalars(select(Transaction).where(Transaction.id.in_(payload.ids))).all()
    for tx in transactions:
        if payload.category:
            tx.category = payload.category
        if payload.type:
            tx.type = payload.type
    db.commit()
    return {"updated": len(transactions)}


@app.get("/statements", response_model=list[StatementRead])
def list_statements(db: Session = Depends(get_db)) -> list[StatementRead]:
    statements = db.scalars(select(Statement).order_by(Statement.uploaded_at.desc())).all()
    return [StatementRead.model_validate(item) for item in statements]


@app.delete("/statements/{statement_id}")
def remove_statement(statement_id: UUID, db: Session = Depends(get_db)) -> dict:
    statement = db.get(Statement, statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    delete_statement(db, statement)
    return {"ok": True}


@app.get("/banks", response_model=list[str])
def banks(db: Session = Depends(get_db)) -> list[str]:
    rows = db.execute(select(distinct(Transaction.bank_name)).order_by(Transaction.bank_name.asc())).all()
    return [row[0] for row in rows if row[0]]


@app.get("/categories", response_model=dict[str, list[str]])
def categories() -> dict[str, list[str]]:
    return {"income": INCOME_CATEGORIES, "expense": EXPENSE_CATEGORIES}
