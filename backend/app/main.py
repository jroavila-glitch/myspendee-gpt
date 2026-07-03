from datetime import date, datetime
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy import distinct, select, update as sql_update
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
    TransactionBulkDelete,
    TransactionCreate,
    TransactionAllocationsUpdate,
    TransactionRead,
    TransactionUpdate,
    UserClassificationRuleCreate,
    UserClassificationRuleRead,
    UploadResult,
)
from app.schemas.insights import InsightsResponse
from app.services.allocations import remove_allocations, replace_allocations
from app.services.transactions import (
    SplitTransactionMutationError,
    create_transaction,
    delete_statement,
    get_breakdown,
    get_summary,
    serialize_transaction,
    update_transaction,
)
from app.services.transactions import apply_transaction_filters
from app.services.fx_rates import get_display_rates
from app.services.insights import get_insights
from app.services.upload import process_uploaded_statement
from app.services.user_rules import create_rule_from_transaction

settings = get_settings()
app = FastAPI(title=settings.app_name)


def _allowed_origins() -> list[str]:
    raw = settings.frontend_url or ""
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    origins.append("http://localhost:5173")
    origins.append("http://127.0.0.1:5173")
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
    month: int | None = Query(default=None),
    year: int = Query(...),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
    source_status: str | None = None,
    manually_added: bool | None = None,
    db: Session = Depends(get_db),
) -> list[TransactionRead]:
    stmt = select(Transaction)
    stmt = apply_transaction_filters(
        stmt,
        month=month,
        year=year,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=category,
        type=type,
        source_status=source_status,
        manually_added=manually_added,
    )
    stmt = stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc())
    transactions = db.scalars(stmt).all()
    return [TransactionRead.model_validate(serialize_transaction(tx)) for tx in transactions]


@app.get("/summary", response_model=SummaryResponse)
def summary(
    month: int | None = Query(default=None),
    year: int = Query(...),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> SummaryResponse:
    return get_summary(db, month, year, date_from=date_from, date_to=date_to, bank_name=bank_name, category=category, type=type)


@app.get("/breakdown", response_model=BreakdownResponse)
def breakdown(
    month: int | None = Query(default=None),
    year: int = Query(...),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> BreakdownResponse:
    return get_breakdown(db, month, year, date_from=date_from, date_to=date_to, bank_name=bank_name, category=category, type=type)


@app.get("/insights", response_model=InsightsResponse)
def insights(
    month: int | None = Query(default=None),
    year: int = Query(...),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    bank_name: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
) -> InsightsResponse:
    try:
        return get_insights(
            db,
            month=month,
            year=year,
            date_from=date_from,
            date_to=date_to,
            bank_name=bank_name,
            type=type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/transactions", response_model=TransactionRead)
def add_transaction(payload: TransactionCreate, db: Session = Depends(get_db)) -> TransactionRead:
    try:
        transaction = create_transaction(db, payload)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
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
    except SplitTransactionMutationError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate transaction after update") from exc
    return TransactionRead.model_validate(serialize_transaction(transaction))


@app.post("/transactions/{transaction_id}/classification-rules", response_model=UserClassificationRuleRead)
def create_classification_rule_from_transaction(
    transaction_id: UUID,
    payload: UserClassificationRuleCreate,
    db: Session = Depends(get_db),
) -> UserClassificationRuleRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    try:
        rule = create_rule_from_transaction(
            db,
            transaction,
            description_pattern=payload.description_pattern,
            bank_name=payload.bank_name,
            match_type=payload.match_type,
            target_type=payload.target_type,
            target_category=payload.target_category,
            scope=payload.scope,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return UserClassificationRuleRead.model_validate(rule)


@app.put("/transactions/{transaction_id}/allocations", response_model=TransactionRead)
def put_transaction_allocations(
    transaction_id: UUID,
    payload: TransactionAllocationsUpdate,
    db: Session = Depends(get_db),
) -> TransactionRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if (
        transaction.amount_mxn != payload.expected_amount_mxn
        or transaction.amount_original != payload.expected_amount_original
        or transaction.currency_original != payload.expected_currency_original
        or transaction.type != payload.expected_type
    ):
        raise HTTPException(status_code=409, detail="Transaction changed since split editor opened")
    try:
        replace_allocations(db, transaction, payload.allocations)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TransactionRead.model_validate(serialize_transaction(transaction))


@app.delete("/transactions/{transaction_id}/allocations", response_model=TransactionRead)
def delete_transaction_allocations(
    transaction_id: UUID,
    category: str = Query(...),
    db: Session = Depends(get_db),
) -> TransactionRead:
    transaction = db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    try:
        transaction = remove_allocations(db, transaction, category)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
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
    if payload.reviewed is not None and payload.category is None and payload.type is None:
        reviewed_at = datetime.utcnow() if payload.reviewed else None
        result = db.execute(
            sql_update(Transaction)
            .where(Transaction.id.in_(payload.ids))
            .values(reviewed_at=reviewed_at)
        )
        if result.rowcount != len(set(payload.ids)):
            db.rollback()
            raise HTTPException(status_code=409, detail="Some selected transactions no longer exist")
        db.commit()
        return {"updated": result.rowcount}

    transactions = db.scalars(select(Transaction).where(Transaction.id.in_(payload.ids))).all()
    if len(transactions) != len(set(payload.ids)):
        raise HTTPException(status_code=409, detail="Some selected transactions no longer exist")
    split_update_conflict = any(
        tx.allocations
        and (
            (payload.category is not None and tx.category != payload.category)
            or (payload.type is not None and tx.type != payload.type)
        )
        for tx in transactions
    )
    if split_update_conflict:
        raise HTTPException(status_code=409, detail="Split transactions cannot receive bulk category or type changes")
    for tx in transactions:
        has_meaningful_edit = False
        if payload.category:
            has_meaningful_edit = has_meaningful_edit or tx.category != payload.category
            tx.category = payload.category
        if payload.type:
            has_meaningful_edit = has_meaningful_edit or tx.type != payload.type
            tx.type = payload.type
        if payload.reviewed is not None:
            tx.reviewed_at = datetime.utcnow() if payload.reviewed else None
        elif has_meaningful_edit:
            tx.reviewed_at = datetime.utcnow()
    db.commit()
    return {"updated": len(transactions)}


@app.post("/transactions/bulk-delete")
def bulk_delete(payload: TransactionBulkDelete, db: Session = Depends(get_db)) -> dict:
    if not payload.ids:
        raise HTTPException(status_code=400, detail="No transactions selected")
    transactions = db.scalars(select(Transaction).where(Transaction.id.in_(payload.ids))).all()
    if len(transactions) != len(set(payload.ids)):
        raise HTTPException(status_code=409, detail="Some selected transactions no longer exist")
    for transaction in transactions:
        db.delete(transaction)
    db.commit()
    return {"deleted": len(transactions)}


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


@app.get("/fx-rates")
def fx_rates(target_date: date | None = Query(default=None)) -> dict[str, str]:
    rates = get_display_rates(target_date)
    return {currency: f"{rate:.6f}" for currency, rate in rates.items()}
