from datetime import date
from unittest import TestCase
from unittest.mock import patch
import uuid

from app.services.upload import process_uploaded_statement


class FakeSession:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self.rolled_back = False

    def add(self, obj) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for obj in self.added:
            if hasattr(obj, "filename") and hasattr(obj, "bank_name") and getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj) -> None:
        return None

    def rollback(self) -> None:
        self.rolled_back = True


class UploadRulesTest(TestCase):
    def test_skips_duplicate_rows_within_same_upload_batch(self) -> None:
        fake_db = FakeSession()
        extracted = {
            "bank_name": "ARQ",
            "period_start": "2026-03-01",
            "period_end": "2026-03-31",
            "transactions": [
                {
                    "date": "2026-03-19",
                    "description": "Venta EURc - Jose Rodrigo Avila Neira",
                    "amount_original": 113.22,
                    "currency_original": "EUR",
                    "local_mxn": None,
                    "exchange_rate": 21.5,
                    "category": "ignored",
                    "type": "ignored",
                    "notes": "Jose Rodrigo Avila Neira",
                },
                {
                    "date": "2026-03-19",
                    "description": "Venta EURc - Jose Rodrigo Avila Neira",
                    "amount_original": 113.22,
                    "currency_original": "EUR",
                    "local_mxn": None,
                    "exchange_rate": 21.5,
                    "category": "ignored",
                    "type": "ignored",
                    "notes": "Jose Rodrigo Avila Neira",
                },
            ],
        }

        with (
            patch("app.services.upload.extract_transactions_from_pdf", return_value=extracted),
            patch("app.services.upload.duplicate_exists", return_value=False),
        ):
            statement, inserted, skipped = process_uploaded_statement(fake_db, "EUR_ARQ Statement - 2026-03.pdf", b"pdf")

        self.assertEqual(1, inserted)
        self.assertEqual(1, skipped)
        self.assertEqual(1, statement.transaction_count)
        self.assertEqual(1, statement.ignored_count)
        self.assertTrue(fake_db.committed)
        self.assertFalse(fake_db.rolled_back)
