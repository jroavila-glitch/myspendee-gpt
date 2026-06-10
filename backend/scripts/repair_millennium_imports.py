import argparse
import json
from datetime import date, datetime
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Statement, Transaction
from app.services.millennium_parser import parse_millennium_pdf
from app.services.transactions import prepare_transaction_data


def _json_value(value):
    if isinstance(value, (date, datetime, Decimal)):
        return str(value)
    return value


def _normalize_description(value: str) -> str:
    return " ".join(value.upper().replace(".", " ").replace("/", " ").split())


def _match_score(existing: Transaction, replacement: dict) -> float:
    description_score = SequenceMatcher(
        None,
        _normalize_description(existing.description),
        _normalize_description(replacement["description"]),
    ).ratio()
    days_apart = abs((existing.date - replacement["date"]).days)
    date_score = max(0, 1 - (days_apart / 7))
    amount_score = float(existing.amount_original or 0) == float(replacement["amount_original"] or 0)
    type_score = existing.type == replacement["type"]
    return description_score * 0.55 + date_score * 0.20 + amount_score * 0.20 + type_score * 0.05


def match_transactions(existing: list[Transaction], replacements: list[dict]) -> list[tuple[Transaction, int, float]]:
    candidates: list[tuple[float, int, int]] = []
    for existing_index, transaction in enumerate(existing):
        for replacement_index, replacement in enumerate(replacements):
            score = _match_score(transaction, replacement)
            if score >= 0.68:
                candidates.append((score, existing_index, replacement_index))

    matched_existing: set[int] = set()
    matched_replacements: set[int] = set()
    matches: list[tuple[Transaction, int, float]] = []
    for score, existing_index, replacement_index in sorted(candidates, reverse=True):
        if existing_index in matched_existing or replacement_index in matched_replacements:
            continue
        matched_existing.add(existing_index)
        matched_replacements.add(replacement_index)
        matches.append((existing[existing_index], replacement_index, score))
    return matches


def _prepared_rows(pdf_path: Path, statement_id) -> list[dict]:
    parsed = parse_millennium_pdf(pdf_path.read_bytes())
    if not parsed:
        raise ValueError(f"{pdf_path.name} was not recognized as a Millennium statement")
    return [
        prepare_transaction_data(
            {
                "date": date.fromisoformat(row["date"]),
                "description": row["description"],
                "amount_original": row["amount_original"],
                "currency_original": row["currency_original"],
                "amount_mxn": None,
                "local_mxn": row["local_mxn"],
                "exchange_rate_used": row["exchange_rate"],
                "category": row["category"],
                "type": row["type"],
                "bank_name": "Millennium",
                "notes": row["notes"] or None,
                "statement_id": statement_id,
                "manually_added": False,
            }
        )
        for row in parsed["transactions"]
    ]


def _snapshot(statements: list[Statement], output_path: Path) -> None:
    fields = [column.name for column in Statement.__table__.columns]
    transaction_fields = [column.name for column in Transaction.__table__.columns]
    output_path.write_text(
        json.dumps(
            {
                "created_at": datetime.utcnow().isoformat(),
                "statements": [
                    {
                        **{field: _json_value(getattr(statement, field)) for field in fields},
                        "transactions": [
                            {field: _json_value(getattr(transaction, field)) for field in transaction_fields}
                            for transaction in statement.transactions
                        ],
                    }
                    for statement in statements
                ],
            },
            indent=2,
            default=str,
        )
    )


def repair(source_dir: Path, apply: bool, snapshot_path: Path) -> None:
    with SessionLocal() as db:
        statements = db.scalars(
            select(Statement).where(Statement.bank_name == "Millennium").order_by(Statement.period_start)
        ).all()
        if len(statements) != 5:
            raise ValueError(f"Expected exactly 5 Millennium statements, found {len(statements)}")
        _snapshot(statements, snapshot_path)

        total_inserted = total_deleted = total_preserved = 0
        for statement in statements:
            pdf_path = source_dir / statement.filename
            replacements = _prepared_rows(pdf_path, statement.id)
            existing = list(statement.transactions)
            matches = match_transactions(existing, replacements)
            matched_existing_ids = {transaction.id for transaction, _, _ in matches}
            matched_replacement_indexes = {replacement_index for _, replacement_index, _ in matches}
            unmatched_existing = [transaction for transaction in existing if transaction.id not in matched_existing_ids]
            unmatched_replacements = [
                replacement for index, replacement in enumerate(replacements) if index not in matched_replacement_indexes
            ]
            preserved = sum(bool(transaction.reviewed_at or transaction.notes) for transaction, _, _ in matches)
            total_inserted += len(unmatched_replacements)
            total_deleted += len(unmatched_existing)
            total_preserved += preserved
            print(
                f"{statement.filename}: existing={len(existing)} replacement={len(replacements)} "
                f"matched={len(matches)} insert={len(unmatched_replacements)} delete={len(unmatched_existing)} "
                f"preserve_user_work={preserved}"
            )
            for transaction in unmatched_existing:
                print(f"  DELETE unmatched: {transaction.date} {transaction.amount_original} {transaction.description}")
            for transaction, replacement_index, score in matches:
                if transaction.reviewed_at or transaction.notes:
                    replacement = replacements[replacement_index]
                    print(
                        f"  PRESERVE score={score:.2f}: {transaction.date} {transaction.amount_original} "
                        f"{transaction.description} -> {replacement['date']} {replacement['amount_original']} "
                        f"{replacement['description']}"
                    )

            if not apply:
                continue

            for transaction, replacement_index, _score in matches:
                replacement = replacements[replacement_index]
                preserve_user_work = bool(transaction.reviewed_at or transaction.notes)
                preserved_values = {
                    "category": transaction.category,
                    "type": transaction.type,
                    "notes": transaction.notes,
                    "reviewed_at": transaction.reviewed_at,
                }
                for key, value in replacement.items():
                    setattr(transaction, key, value)
                if preserve_user_work:
                    for key, value in preserved_values.items():
                        setattr(transaction, key, value)

            for transaction in unmatched_existing:
                db.delete(transaction)
            for replacement in unmatched_replacements:
                db.add(Transaction(**replacement))

            statement.transaction_count = len(replacements)
            statement.ignored_count = sum(replacement["type"] == "ignored" for replacement in replacements)

        print(
            f"TOTAL: insert={total_inserted} delete={total_deleted} preserve_user_work={total_preserved} "
            f"snapshot={snapshot_path}"
        )
        if apply:
            db.commit()
            print("Applied Millennium repair.")
        else:
            db.rollback()
            print("Dry run only; no production data changed.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, default=Path("/tmp/moneo_millennium_db_snapshot.json"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    repair(args.source_dir, args.apply, args.snapshot)


if __name__ == "__main__":
    main()
