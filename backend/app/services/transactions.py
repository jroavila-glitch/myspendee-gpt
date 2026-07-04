from datetime import date, datetime, timedelta
from decimal import Decimal
import re

from sqlalchemy import and_, case, func, or_, select, union_all
from sqlalchemy.sql import Select
from sqlalchemy.orm import Session

from app.models import Statement, Transaction, TransactionAllocation
from app.schemas.common import (
    TRANSACTION_SOURCE_STATUSES,
    BreakdownItem,
    BreakdownResponse,
    SummaryResponse,
    TransactionCreate,
    TransactionUpdate,
)
from app.services.classification import apply_special_description_rules, classify_transaction, normalize_category
from app.services.normalization import normalize_bank_name, resolve_amounts


class SplitTransactionMutationError(ValueError):
    pass


VISIBLE_SOURCE_STATUS_FILTER = Transaction.source_status != "reconciled_pending"
MERCHANT_TOKEN_RE = re.compile(r"[a-z0-9]+")
MERCHANT_STOPWORDS = {
    "com",
    "help",
    "www",
    "the",
    "and",
    "transfer",
    "from",
    "to",
    "payment",
}


def _format_original_amount(amount_original: Decimal | None, currency: str, amount_mxn: Decimal, rate: Decimal | None) -> str | None:
    if currency == "MXN":
        return None
    if amount_original is None and rate:
        amount_original = (amount_mxn / rate).quantize(Decimal("0.01"))
    if amount_original is None:
        return None
    return f"{currency} {amount_original:.2f}"


def _next_month(tx_date: date) -> tuple[int, int]:
    if tx_date.month == 12:
        return 1, tx_date.year + 1
    return tx_date.month + 1, tx_date.year


def suggest_assigned_period(
    tx_date: date,
    category: str,
    tx_type: str,
    amount_original: Decimal | None = None,
    currency_original: str | None = None,
) -> tuple[int, int]:
    is_monthly_rent = amount_original == Decimal("600.00") and currency_original == "EUR"
    if category == "Rent" and tx_type == "expense" and is_monthly_rent:
        if tx_date.day >= 28:
            return _next_month(tx_date)
    return tx_date.month, tx_date.year


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
            "assigned_month",
            "assigned_year",
            "manually_added",
            "source_status",
            "matched_transaction_id",
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


def prepare_transaction_data(data: dict, db: Session | None = None) -> dict:
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
    if db is not None:
        from app.services.user_rules import apply_user_classification_rules

        user_rule_match = apply_user_classification_rules(
            db,
            description=description,
            bank_name=bank_name,
            tx_type=tx_type,
        )
        if user_rule_match:
            tx_type, category = user_rule_match
    notes = data.get("notes") or renamed_notes or normalization_notes or fallback_notes
    assigned_month = data.get("assigned_month")
    assigned_year = data.get("assigned_year")
    if assigned_month is None or assigned_year is None:
        assigned_month, assigned_year = suggest_assigned_period(
            tx_date,
            category,
            tx_type,
            amount_original,
            currency_original,
        )
    source_status = data.get("source_status") or "posted"
    if source_status not in TRANSACTION_SOURCE_STATUSES:
        raise ValueError(f"Invalid transaction source_status: {source_status}")
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
        "assigned_month": int(assigned_month),
        "assigned_year": int(assigned_year),
        "manually_added": bool(data.get("manually_added", False)),
        "source_status": source_status,
        "matched_transaction_id": data.get("matched_transaction_id"),
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
    source_status: str | None = None,
    manually_added: bool | None = None,
) -> Select:
    stmt = stmt.where(VISIBLE_SOURCE_STATUS_FILTER)
    if date_from or date_to:
        if date_from:
            stmt = stmt.where(Transaction.date >= date_from)
        if date_to:
            stmt = stmt.where(Transaction.date <= date_to)
    else:
        assigned_year = func.coalesce(Transaction.assigned_year, Transaction.year)
        assigned_month = func.coalesce(Transaction.assigned_month, Transaction.month)
        stmt = stmt.where(assigned_year == year)
        if month is not None:
            stmt = stmt.where(assigned_month == month)
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
    if source_status:
        stmt = stmt.where(Transaction.source_status == source_status)
    if manually_added is not None:
        stmt = stmt.where(Transaction.manually_added.is_(manually_added))
    return stmt


def _merchant_tokens(description: str) -> set[str]:
    return {
        token
        for token in MERCHANT_TOKEN_RE.findall(description.lower())
        if len(token) >= 3 and token not in MERCHANT_STOPWORDS
    }


def _amounts_match(pending: Transaction, posted: Transaction) -> bool:
    if (
        pending.amount_original is not None
        and posted.amount_original is not None
        and pending.currency_original == posted.currency_original
    ):
        return pending.amount_original == posted.amount_original
    return pending.amount_mxn == posted.amount_mxn


def is_likely_pending_match(pending: Transaction, posted: Transaction, *, date_window_days: int = 45) -> bool:
    if not pending.manually_added or pending.source_status != "pending":
        return False
    if posted.source_status != "posted":
        return False
    if pending.type != posted.type:
        return False
    if not _amounts_match(pending, posted):
        return False
    days_apart = (posted.date - pending.date).days
    if days_apart < 0 or days_apart > date_window_days:
        return False
    if pending.bank_name and posted.bank_name and pending.bank_name != posted.bank_name:
        return False
    pending_tokens = _merchant_tokens(pending.description)
    posted_tokens = _merchant_tokens(posted.description)
    return bool(pending_tokens & posted_tokens)


def get_pending_matches(db: Session, *, year: int) -> list[dict]:
    pending_rows = db.scalars(
        select(Transaction)
        .where(Transaction.source_status == "pending")
        .where(Transaction.manually_added.is_(True))
        .where(Transaction.year == year)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    ).all()
    if not pending_rows:
        return []

    min_date = min(transaction.date for transaction in pending_rows)
    max_date = max(transaction.date for transaction in pending_rows) + timedelta(days=45)
    posted_rows = db.scalars(
        select(Transaction)
        .where(Transaction.source_status == "posted")
        .where(Transaction.date >= min_date)
        .where(Transaction.date <= max_date)
        .order_by(Transaction.date.asc(), Transaction.created_at.asc())
    ).all()

    matches = []
    for pending in pending_rows:
        candidates = [
            posted
            for posted in posted_rows
            if is_likely_pending_match(pending, posted)
        ]
        if candidates:
            matches.append({
                "pending_transaction": serialize_transaction(pending),
                "candidates": [serialize_transaction(candidate) for candidate in candidates],
            })
    return matches


def reconcile_pending_with_posted(db: Session, pending: Transaction, posted: Transaction) -> Transaction:
    if pending.source_status != "pending" or not pending.manually_added:
        raise ValueError("Only manual pending transactions can be reconciled")
    if posted.source_status != "posted":
        raise ValueError("Pending transactions can only reconcile with posted statement transactions")
    if not is_likely_pending_match(pending, posted):
        raise ValueError("Transactions are not a likely pending match")
    pending.source_status = "reconciled_pending"
    pending.matched_transaction_id = posted.id
    db.commit()
    db.refresh(pending)
    return pending


def create_transaction(db: Session, tx: TransactionCreate) -> Transaction:
    prepared = prepare_transaction_data(tx.model_dump(), db)
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
    amount_fields = {"amount_mxn", "amount_original", "currency_original", "exchange_rate_used"}
    amount_fields_edited = bool(amount_fields & updated_values.keys())
    raw_data = serialize_transaction(transaction) | updated_values
    prepared = prepare_transaction_data(raw_data, db)
    if not amount_fields_edited:
        for field in amount_fields:
            prepared[field] = getattr(transaction, field)
    else:
        for field in amount_fields & updated_values.keys():
            prepared[field] = updated_values[field]
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
        .where(VISIBLE_SOURCE_STATUS_FILTER)
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
        .where(VISIBLE_SOURCE_STATUS_FILTER)
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
        .where(VISIBLE_SOURCE_STATUS_FILTER)
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
            Transaction.source_status == "posted",
        )
    )
    return db.execute(stmt).first() is not None


def delete_statement(db: Session, statement: Statement) -> None:
    db.delete(statement)
    db.commit()
