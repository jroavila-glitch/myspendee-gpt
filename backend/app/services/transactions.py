from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.sql import Select
from sqlalchemy.orm import Session

from app.models import Statement, Transaction
from app.schemas.common import BreakdownItem, BreakdownResponse, SummaryResponse, TransactionCreate, TransactionUpdate
from app.services.classification import apply_special_description_rules, classify_transaction
from app.services.normalization import resolve_amounts


def _format_original_amount(amount_original: Decimal | None, currency: str, amount_mxn: Decimal, rate: Decimal | None) -> str | None:
    if currency == "MXN":
        return None
    if amount_original is None and rate:
        amount_original = (amount_mxn / rate).quantize(Decimal("0.01"))
    if amount_original is None:
        return None
    return f"{currency} {amount_original:.2f}"


def serialize_transaction(transaction: Transaction) -> dict:
    payload = {
        field: getattr(transaction, field)
        for field in [
            "id",
            "date",
            "description",
            "amount_original",
            "currency_original",
            "amount_mxn",
            "exchange_rate_used",
            "category",
            "type",
            "bank_name",
            "month",
            "year",
            "manually_added",
            "notes",
            "statement_id",
            "created_at",
        ]
    }
    payload["original_amount_display"] = _format_original_amount(
        transaction.amount_original,
        transaction.currency_original,
        transaction.amount_mxn,
        transaction.exchange_rate_used,
    )
    return payload


def prepare_transaction_data(data: dict) -> dict:
    tx_date: date = data["date"]
    raw_amount_mxn = Decimal(str(data["amount_mxn"])) if data.get("amount_mxn") is not None else None
    raw_amount_original = Decimal(str(data["amount_original"])) if data.get("amount_original") is not None else None
    raw_exchange_rate = Decimal(str(data["exchange_rate_used"])) if data.get("exchange_rate_used") is not None else None
    currency_original = data.get("currency_original") or "MXN"
    amount_original, amount_mxn, exchange_rate_used, normalization_notes = resolve_amounts(
        bank_name=data["bank_name"],
        description=data["description"],
        currency_original=currency_original,
        amount_original=raw_amount_original,
        amount_mxn=raw_amount_mxn,
        exchange_rate_used=raw_exchange_rate,
        local_mxn=Decimal(str(data["local_mxn"])) if data.get("local_mxn") is not None else None,
    )
    description, renamed_notes = apply_special_description_rules(data["description"], amount_mxn, data["bank_name"])
    tx_type, category, fallback_notes = classify_transaction(
        description=description,
        amount_mxn=amount_mxn,
        bank_name=data["bank_name"],
        amount_original=amount_original,
        currency_original=currency_original,
        current_type=data.get("type"),
        current_category=data.get("category"),
    )
    notes = data.get("notes") or renamed_notes or normalization_notes or fallback_notes
    return {
        "date": tx_date,
        "description": description,
        "amount_original": amount_original,
        "currency_original": currency_original,
        "amount_mxn": amount_mxn,
        "exchange_rate_used": exchange_rate_used,
        "category": category,
        "type": tx_type,
        "bank_name": data["bank_name"],
        "month": tx_date.month,
        "year": tx_date.year,
        "manually_added": bool(data.get("manually_added", False)),
        "notes": notes,
        "statement_id": data.get("statement_id"),
    }


def apply_transaction_filters(
    stmt: Select,
    *,
    month: int | None,
    year: int,
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
) -> Select:
    stmt = stmt.where(Transaction.year == year)
    if month is not None:
        stmt = stmt.where(Transaction.month == month)
    if bank_name:
        stmt = stmt.where(Transaction.bank_name == bank_name)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if type:
        stmt = stmt.where(Transaction.type == type)
    return stmt


def create_transaction(db: Session, tx: TransactionCreate) -> Transaction:
    prepared = prepare_transaction_data(tx.model_dump())
    transaction = Transaction(**prepared)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def update_transaction(db: Session, transaction: Transaction, payload: TransactionUpdate) -> Transaction:
    updated_values = payload.model_dump(exclude_unset=True)
    raw_data = serialize_transaction(transaction) | updated_values
    prepared = prepare_transaction_data(raw_data)
    for key, value in prepared.items():
        setattr(transaction, key, value)
    db.commit()
    db.refresh(transaction)
    return transaction


def get_summary(
    db: Session,
    month: int | None,
    year: int,
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
) -> SummaryResponse:
    stmt = (
        select(
            func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount_mxn), else_=0)), 0),
            func.coalesce(func.sum(case((Transaction.type == "expense", Transaction.amount_mxn), else_=0)), 0),
        )
        .where(Transaction.type != "ignored")
    )
    stmt = apply_transaction_filters(stmt, month=month, year=year, bank_name=bank_name, category=category, type=type)
    income, expenses = db.execute(stmt).one()
    return SummaryResponse(income=income, expenses=expenses, net=income - expenses)


def get_breakdown(
    db: Session,
    month: int | None,
    year: int,
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
) -> BreakdownResponse:
    stmt = (
        select(
            Transaction.category,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount_mxn), 0).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.type != "ignored")
        .group_by(Transaction.category, Transaction.type)
        .order_by(Transaction.type, func.sum(Transaction.amount_mxn).desc())
    )
    stmt = apply_transaction_filters(stmt, month=month, year=year, bank_name=bank_name, category=category, type=type)
    rows = db.execute(stmt).all()
    income = [BreakdownItem(category=r.category, type=r.type, total=r.total, count=r.count) for r in rows if r.type == "income"]
    expenses = [BreakdownItem(category=r.category, type=r.type, total=r.total, count=r.count) for r in rows if r.type == "expense"]
    return BreakdownResponse(income=income, expenses=expenses)


def duplicate_exists(db: Session, bank_name: str, tx_date: date, amount_mxn: Decimal, description: str) -> bool:
    stmt = select(Transaction.id).where(
        and_(
            Transaction.bank_name == bank_name,
            Transaction.date == tx_date,
            Transaction.amount_mxn == amount_mxn,
            Transaction.description == description,
        )
    )
    return db.execute(stmt).first() is not None


def delete_statement(db: Session, statement: Statement) -> None:
    db.delete(statement)
    db.commit()
