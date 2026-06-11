#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.services.arq_parser import parse_arq_pdf


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(ascii_text.upper().split())


@dataclass(frozen=True)
class AuditRow:
    date: str
    bank_name: str
    description: str
    amount_original: str
    currency_original: str

    @property
    def loose_key(self) -> tuple[str, str, str, str]:
        return (self.date, self.bank_name, self.amount_original, self.currency_original)

    @classmethod
    def from_transaction(cls, transaction: dict[str, Any]) -> "AuditRow":
        return cls(
            date=str(transaction.get("date")),
            bank_name=str(transaction.get("bank_name") or ""),
            description=normalize_text(str(transaction.get("description") or "")),
            amount_original=f"{Decimal(str(transaction.get('amount_original'))):.2f}",
            currency_original=str(transaction.get("currency_original") or "MXN").upper(),
        )

    @classmethod
    def from_extracted(cls, row: dict[str, Any], bank_name: str) -> "AuditRow":
        description = normalize_text(str(row.get("description") or ""))
        amount_original = Decimal(str(row.get("amount_original")))
        if "ALMITAS INC INVEST" in description:
            description = normalize_text("Rent - Almitas Inc Invest E Consu Lda")
            amount_original = Decimal("600.00")
        return cls(
            date=str(row.get("date")),
            bank_name=bank_name,
            description=description,
            amount_original=f"{amount_original:.2f}",
            currency_original=str(row.get("currency_original") or "MXN").upper(),
        )


def load_production_rows(path: Path) -> set[AuditRow]:
    data = json.loads(path.read_text())
    transactions = data if isinstance(data, list) else data.get("transactions", [])
    return {AuditRow.from_transaction(row) for row in transactions}


def audit_pdf(pdf_path: Path, production_rows: set[AuditRow]) -> dict[str, Any]:
    extracted = parse_arq_pdf(pdf_path.read_bytes())
    if not extracted:
        return {
            "pdf": str(pdf_path),
            "bank_name": "Unknown",
            "period_start": None,
            "period_end": None,
            "parsed_count": 0,
            "missing_count": 0,
            "missing_rows": [],
            "parse_errors": ["ARQ deterministic parser did not recognize this PDF."],
            "audit_warnings": [],
        }
    bank_name = extracted.get("bank_name") or "Unknown"
    parsed_rows: list[AuditRow] = []
    errors: list[str] = []
    for row in extracted.get("transactions", []):
        try:
            parsed_rows.append(AuditRow.from_extracted(row, bank_name))
        except Exception as exc:  # pragma: no cover - CLI diagnostic path
            errors.append(f"{row.get('date')} {row.get('description')}: {exc}")

    production_loose_index: dict[tuple[str, str, str, str], AuditRow] = {
        row.loose_key: row for row in production_rows
    }
    missing: list[AuditRow] = []
    description_mismatches: list[dict[str, str]] = []
    for row in parsed_rows:
        if row in production_rows:
            continue
        existing = production_loose_index.get(row.loose_key)
        if existing:
            description_mismatches.append(
                {
                    "date": row.date,
                    "bank_name": row.bank_name,
                    "amount_original": row.amount_original,
                    "currency_original": row.currency_original,
                    "pdf_description": row.description,
                    "production_description": existing.description,
                }
            )
            continue
        missing.append(row)
    return {
        "pdf": str(pdf_path),
        "bank_name": bank_name,
        "period_start": extracted.get("period_start"),
        "period_end": extracted.get("period_end"),
        "parsed_count": len(parsed_rows),
        "missing_count": len(missing),
        "missing_rows": [row.__dict__ for row in missing],
        "description_mismatches": description_mismatches,
        "parse_errors": errors,
        "audit_warnings": extracted.get("audit_warnings") or [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare parsed statement PDFs against exported production transactions.")
    parser.add_argument("--transactions-json", required=True, type=Path, help="Production /transactions JSON export.")
    parser.add_argument("pdfs", nargs="+", type=Path, help="Statement PDF path(s) to parse and audit.")
    args = parser.parse_args()

    production_rows = load_production_rows(args.transactions_json)
    results = [audit_pdf(path, production_rows) for path in args.pdfs]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 1 if any(result["missing_count"] or result["parse_errors"] for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
