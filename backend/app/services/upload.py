from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Statement, Transaction
from app.services.openai_extraction import extract_transactions_from_pdf
from app.services.normalization import normalize_bank_name
from app.services.transactions import duplicate_exists, prepare_transaction_data


def process_uploaded_statement(db: Session, filename: str, pdf_bytes: bytes) -> tuple[Statement, int, int]:
    if not pdf_bytes:
        raise ValueError("Uploaded file is empty")

    extracted = extract_transactions_from_pdf(pdf_bytes)
    normalized_bank_name = normalize_bank_name(extracted.get("bank_name") or "Unknown")
    statement = Statement(
        filename=filename,
        bank_name=normalized_bank_name,
        period_start=date.fromisoformat(extracted["period_start"]) if extracted.get("period_start") else None,
        period_end=date.fromisoformat(extracted["period_end"]) if extracted.get("period_end") else None,
        transaction_count=0,
        ignored_count=0,
    )
    db.add(statement)
    db.flush()

    inserted = 0
    skipped = 0
    ignored = 0
    try:
        for row in extracted.get("transactions", []):
            raw_date = row.get("date")
            if not raw_date or not row.get("description"):
                continue
            tx_payload = {
                "date": date.fromisoformat(raw_date),
                "description": row.get("description", "").strip(),
                "amount_original": row.get("amount_original"),
                "currency_original": row.get("currency_original") or "MXN",
                "amount_mxn": None,
                "local_mxn": row.get("local_mxn"),
                "exchange_rate_used": row.get("exchange_rate"),
                "category": row.get("category") or "Other",
                "type": row.get("type") or ("income" if row.get("direction") == "in" else "expense"),
                "bank_name": normalized_bank_name,
                "notes": row.get("notes") or None,
                "statement_id": statement.id,
                "manually_added": False,
            }
            prepared = prepare_transaction_data(tx_payload)
            if duplicate_exists(db, prepared["bank_name"], prepared["date"], Decimal(prepared["amount_mxn"]), prepared["description"]):
                skipped += 1
                continue
            transaction = Transaction(**prepared)
            db.add(transaction)
            inserted += 1
            if prepared["type"] == "ignored":
                ignored += 1

        statement.transaction_count = inserted
        statement.ignored_count = ignored
        db.commit()
        db.refresh(statement)
        return statement, inserted, skipped
    except (ValueError, IntegrityError):
        db.rollback()
        raise
