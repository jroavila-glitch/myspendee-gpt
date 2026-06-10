from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select, union_all
from sqlalchemy.sql import Select
from sqlalchemy.orm import Session

from app.models import Statement, Transaction, TransactionAllocation
from app.schemas.common import BreakdownItem, BreakdownResponse, SummaryResponse, TransactionCreate, TransactionUpdate
from app.services.classification import apply_special_description_rules, classify_transaction, normalize_category
from app.services.normalization import normalize_bank_name, resolve_amounts


class SplitTransactionMutationError(ValueError):
    pass


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
            "reviewed_at",
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
    allocations = sorted(transaction.allocations, key=lambda allocation: allocation.position)
    payload["allocations"] = [
        {
            "id": allocation.id,
            "category": allocation.category,
            "amount_original": allocation.amount_original,
            "amount_mxn": allocation.amount_mxn,
            "notes": allocation.notes,
            "position": allocation.position,
        }
        for allocation in allocations
    ]
    payload["allocation_count"] = len(allocations)
    payload["is_split"] = bool(allocations)
    return payload


def prepare_transaction_data(data: dict) -> dict:
    tx_date: date = data["date"]
    bank_name = normalize_bank_name(data["bank_name"])
    raw_amount_mxn = Decimal(str(data["amount_mxn"])) if data.get("amount_mxn") is not None else None
    raw_amount_original = Decimal(str(data["amount_original"])) if data.get("amount_original") is not None else None
    raw_exchange_rate = Decimal(str(data["exchange_rate_used"])) if data.get("exchange_rate_used") is not None else None
    currency_original = data.get("currency_original") or "MXN"
    amount_original, amount_mxn, exchange_rate_used, normalization_notes = resolve_amounts(
        tx_date=tx_date,
        bank_name=bank_name,
        description=data["description"],
        currency_original=currency_original,
        amount_original=raw_amount_original,
        amount_mxn=raw_amount_mxn,
        exchange_rate_used=raw_exchange_rate,
        local_mxn=Decimal(str(data["local_mxn"])) if data.get("local_mxn") is not None else None,
    )
    description, renamed_notes = apply_special_description_rules(data["description"], amount_mxn, bank_name)
    tx_type, category, fallback_notes = classify_transaction(
        description=description,
        amount_mxn=amount_mxn,
        bank_name=bank_name,
        amount_original=amount_original,
        currency_original=currency_original,
        notes=data.get("notes"),
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
        "bank_name": bank_name,
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
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
) -> Select:
    if date_from or date_to:
        if date_from:
            stmt = stmt.where(Transaction.date >= date_from)
        if date_to:
            stmt = stmt.where(Transaction.date <= date_to)
    else:
        stmt = stmt.where(Transaction.year == year)
        if month is not None:
            stmt = stmt.where(Transaction.month == month)
    if bank_name:
        stmt = stmt.where(Transaction.bank_name == bank_name)
    if category:
        stmt = stmt.where(
            or_(
                and_(~Transaction.allocations.any(), Transaction.category == category),
                Transaction.allocations.any(TransactionAllocation.category == category),
            )
        )
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
    guarded_fields = {"amount_mxn", "amount_original", "currency_original", "type"}
    changed_guarded_fields = [
        field
        for field in guarded_fields
        if field in updated_values and getattr(transaction, field) != updated_values[field]
    ]
    if transaction.allocations and changed_guarded_fields:
        raise SplitTransactionMutationError("Split transactions cannot change total, type, currency, or original amount")

    reviewed = updated_values.pop("reviewed", None)
    has_meaningful_edit = any(
        key != "notes" and getattr(transaction, key) != value
        for key, value in updated_values.items()
    )
    raw_data = serialize_transaction(transaction) | updated_values
    prepared = prepare_transaction_data(raw_data)
    # Edits from the dashboard are intentional overrides. The normalization
    # pipeline may still recompute amounts/dates, but it should not reclassify
    # a category/type the user explicitly selected in the edit modal.
    if "type" in updated_values and updated_values["type"] is not None:
        prepared["type"] = updated_values["type"]
    if "category" in updated_values and updated_values["category"] is not None:
        prepared["category"] = updated_values["category"]
    if "category" in updated_values or "type" in updated_values:
        prepared["category"] = normalize_category(prepared["category"], prepared["type"])
    for key, value in prepared.items():
        setattr(transaction, key, value)
    if reviewed is not None:
        transaction.reviewed_at = datetime.utcnow() if reviewed else None
    elif has_meaningful_edit:
        transaction.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(transaction)
    return transaction


def get_summary(
    db: Session,
    month: int | None,
    year: int,
    date_from: date | None = None,
    date_to: date | None = None,
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
    stmt = apply_transaction_filters(
        stmt,
        month=month,
        year=year,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=category,
        type=type,
    )
    income, expenses = db.execute(stmt).one()
    return SummaryResponse(income=income, expenses=expenses, net=income - expenses)


def get_breakdown(
    db: Session,
    month: int | None,
    year: int,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
    type: str | None = None,
) -> BreakdownResponse:
    unsplit_stmt = (
        select(
            Transaction.category.label("category"),
            Transaction.type.label("type"),
            Transaction.amount_mxn.label("amount_mxn"),
            Transaction.id.label("source_id"),
        )
        .where(Transaction.type != "ignored")
        .where(~Transaction.allocations.any())
    )
    unsplit_stmt = apply_transaction_filters(
        unsplit_stmt,
        month=month,
        year=year,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=None,
        type=type,
    )
    if category:
        unsplit_stmt = unsplit_stmt.where(Transaction.category == category)

    split_stmt = (
        select(
            TransactionAllocation.category.label("category"),
            Transaction.type.label("type"),
            TransactionAllocation.amount_mxn.label("amount_mxn"),
            Transaction.id.label("source_id"),
        )
        .join(TransactionAllocation, TransactionAllocation.transaction_id == Transaction.id)
        .where(Transaction.type != "ignored")
    )
    split_stmt = apply_transaction_filters(
        split_stmt,
        month=month,
        year=year,
        date_from=date_from,
        date_to=date_to,
        bank_name=bank_name,
        category=None,
        type=type,
    )
    if category:
        split_stmt = split_stmt.where(TransactionAllocation.category == category)

    breakdown_rows = union_all(unsplit_stmt, split_stmt).subquery()
    stmt = (
        select(
            breakdown_rows.c.category,
            breakdown_rows.c.type,
            func.coalesce(func.sum(breakdown_rows.c.amount_mxn), 0).label("total"),
            func.count(func.distinct(breakdown_rows.c.source_id)).label("count"),
        )
        .group_by(breakdown_rows.c.category, breakdown_rows.c.type)
        .order_by(breakdown_rows.c.type, func.sum(breakdown_rows.c.amount_mxn).desc())
    )
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
