from datetime import date
from decimal import Decimal
from unittest import TestCase
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Transaction, TransactionAllocation
from app.main import bulk_delete, bulk_update, edit_transaction, list_transactions
from app.schemas.common import TransactionBulkDelete, TransactionBulkUpdate, TransactionCreate, TransactionUpdate
from app.services.transactions import create_transaction, duplicate_exists, get_summary, prepare_transaction_data, update_transaction


class TransactionReviewTest(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.transaction = Transaction(
            date=date(2026, 6, 1),
            description="Coffee",
            amount_original=Decimal("3"),
            currency_original="EUR",
            amount_mxn=Decimal("60"),
            exchange_rate_used=Decimal("20"),
            category="Other",
            type="expense",
            bank_name="Revolut",
            month=6,
            year=2026,
            manually_added=False,
            notes="Manual review needed",
        )
        self.db.add(self.transaction)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def add_split_allocations(self, transaction: Transaction | None = None) -> Transaction:
        split_transaction = transaction or self.transaction
        split_transaction.allocations = [
            TransactionAllocation(
                category="Food & Drink",
                amount_original=Decimal("1.00"),
                amount_mxn=Decimal("20.00"),
                position=0,
            ),
            TransactionAllocation(
                category="Transport",
                amount_original=Decimal("2.00"),
                amount_mxn=Decimal("40.00"),
                position=1,
            ),
        ]
        self.db.commit()
        self.db.refresh(split_transaction)
        return split_transaction

    def test_manual_edit_marks_transaction_reviewed(self) -> None:
        updated = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(category="Food & Drink"),
        )
        self.assertIsNotNone(updated.reviewed_at)

    def test_metadata_edit_preserves_existing_amount_fields(self) -> None:
        self.transaction.description = "Transfer to GONCALO DE CAMPOS MELO ANDREA MOUTINHO DE ALME"
        self.transaction.amount_original = Decimal("36.67")
        self.transaction.amount_mxn = Decimal("2365.50")
        self.transaction.exchange_rate_used = Decimal("21.500000")
        self.transaction.category = "Rent"
        self.db.commit()
        self.db.refresh(self.transaction)

        updated = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(assigned_month=3, assigned_year=2026),
        )

        self.assertEqual(Decimal("36.67"), updated.amount_original)
        self.assertEqual(Decimal("2365.50"), updated.amount_mxn)
        self.assertEqual(Decimal("21.500000"), updated.exchange_rate_used)

    def test_manual_amount_edit_respects_explicit_amount_fields(self) -> None:
        self.transaction.description = "Transfer to GONCALO DE CAMPOS MELO ANDREA MOUTINHO DE ALME"
        self.transaction.category = "Rent"
        self.db.commit()
        self.db.refresh(self.transaction)

        updated = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(
                amount_original=Decimal("110.02"),
                amount_mxn=Decimal("2365.50"),
                exchange_rate_used=Decimal("21.500000"),
            ),
        )

        self.assertEqual(Decimal("110.02"), updated.amount_original)
        self.assertEqual(Decimal("2365.50"), updated.amount_mxn)
        self.assertEqual(Decimal("21.500000"), updated.exchange_rate_used)

    def test_notes_only_edit_does_not_mark_transaction_reviewed(self) -> None:
        updated = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(notes="Check receipt"),
        )
        self.assertIsNone(updated.reviewed_at)

    def test_unchanged_full_form_save_does_not_mark_transaction_reviewed(self) -> None:
        updated = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(
                date=self.transaction.date,
                description=self.transaction.description,
                amount_original=self.transaction.amount_original,
                currency_original=self.transaction.currency_original,
                amount_mxn=self.transaction.amount_mxn,
                exchange_rate_used=self.transaction.exchange_rate_used,
                category=self.transaction.category,
                type=self.transaction.type,
                bank_name=self.transaction.bank_name,
                notes="Updated note only",
            ),
        )
        self.assertIsNone(updated.reviewed_at)

    def test_review_can_be_explicitly_marked_and_reopened(self) -> None:
        reviewed = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(reviewed=True),
        )
        self.assertIsNotNone(reviewed.reviewed_at)

        reopened = update_transaction(
            self.db,
            self.transaction,
            TransactionUpdate(reviewed=False),
        )
        self.assertIsNone(reopened.reviewed_at)

    def test_pending_manual_transaction_is_created_and_counted(self) -> None:
        pending = create_transaction(
            self.db,
            TransactionCreate(
                date=date(2026, 6, 12),
                description="Pending grocery receipt",
                amount_original=Decimal("42.50"),
                currency_original="EUR",
                amount_mxn=Decimal("913.75"),
                exchange_rate_used=Decimal("21.50"),
                category="Groceries",
                type="expense",
                bank_name="Revolut",
                notes="Split when the statement arrives",
                source_status="pending",
            ),
        )

        self.assertEqual("pending", pending.source_status)
        self.assertIsNone(pending.matched_transaction_id)

        summary = get_summary(self.db, month=6, year=2026)
        self.assertEqual(Decimal("973.75"), summary.expenses)

        rows = list_transactions(year=2026, month=6, date_from=None, date_to=None, db=self.db)
        self.assertIn(pending.id, {row.id for row in rows})

        pending_rows = list_transactions(
            year=2026,
            month=None,
            date_from=date(2026, 1, 1),
            date_to=date(2026, 12, 31),
            source_status="pending",
            manually_added=True,
            db=self.db,
        )
        self.assertEqual([pending.id], [row.id for row in pending_rows])

    def test_reconciled_pending_transaction_is_hidden_from_normal_views(self) -> None:
        self.transaction.source_status = "reconciled_pending"
        self.db.commit()

        summary = get_summary(self.db, month=6, year=2026)
        rows = list_transactions(year=2026, month=6, date_from=None, date_to=None, db=self.db)

        self.assertEqual(Decimal("0.00"), summary.expenses)
        self.assertEqual([], rows)

    def test_pending_transaction_does_not_block_statement_duplicate_check(self) -> None:
        self.transaction.source_status = "pending"
        self.db.commit()

        self.assertFalse(
            duplicate_exists(
                self.db,
                self.transaction.bank_name,
                self.transaction.date,
                self.transaction.amount_mxn,
                self.transaction.description,
            )
        )

    def test_bulk_category_change_marks_transaction_reviewed(self) -> None:
        result = bulk_update(
            TransactionBulkUpdate(ids=[self.transaction.id], category="Food & Drink"),
            self.db,
        )
        self.db.refresh(self.transaction)

        self.assertEqual({"updated": 1}, result)
        self.assertEqual("Food & Drink", self.transaction.category)
        self.assertIsNotNone(self.transaction.reviewed_at)

    def test_bulk_mark_reviewed_resolves_without_other_changes(self) -> None:
        result = bulk_update(
            TransactionBulkUpdate(ids=[self.transaction.id], reviewed=True),
            self.db,
        )
        self.db.refresh(self.transaction)

        self.assertEqual({"updated": 1}, result)
        self.assertIsNotNone(self.transaction.reviewed_at)

    def test_bulk_mark_reviewed_rejects_stale_selection(self) -> None:
        with self.assertRaises(HTTPException) as context:
            bulk_update(
                TransactionBulkUpdate(ids=[self.transaction.id, uuid4()], reviewed=True),
                self.db,
            )

        self.assertEqual(409, context.exception.status_code)
        self.db.refresh(self.transaction)
        self.assertIsNone(self.transaction.reviewed_at)

    def test_noop_bulk_change_does_not_mark_transaction_reviewed(self) -> None:
        result = bulk_update(
            TransactionBulkUpdate(ids=[self.transaction.id], category="Other", type="expense"),
            self.db,
        )
        self.db.refresh(self.transaction)

        self.assertEqual({"updated": 1}, result)
        self.assertIsNone(self.transaction.reviewed_at)

    def test_amount_type_and_currency_edits_reject_split_transactions(self) -> None:
        guarded_payloads = [
            TransactionUpdate(amount_mxn=Decimal("61.00")),
            TransactionUpdate(amount_original=Decimal("4.00")),
            TransactionUpdate(currency_original="USD"),
            TransactionUpdate(type="income"),
        ]

        for payload in guarded_payloads:
            with self.subTest(payload=payload.model_dump(exclude_unset=True)):
                split_transaction = self.add_split_allocations()
                with self.assertRaises(HTTPException) as context:
                    edit_transaction(split_transaction.id, payload, self.db)

                self.assertEqual(409, context.exception.status_code)
                self.db.rollback()

    def test_bulk_category_or_type_change_rejects_selected_split_transactions(self) -> None:
        split_transaction = self.add_split_allocations()

        for payload in [
            TransactionBulkUpdate(ids=[split_transaction.id], category="Food & Drink"),
            TransactionBulkUpdate(ids=[split_transaction.id], type="income"),
        ]:
            with self.subTest(payload=payload.model_dump(exclude_unset=True)):
                with self.assertRaises(HTTPException) as context:
                    bulk_update(payload, self.db)

                self.assertEqual(409, context.exception.status_code)
                self.db.rollback()

    def test_bulk_mark_reviewed_only_allows_selected_split_transactions(self) -> None:
        split_transaction = self.add_split_allocations()

        result = bulk_update(
            TransactionBulkUpdate(ids=[split_transaction.id], reviewed=True),
            self.db,
        )
        self.db.refresh(split_transaction)

        self.assertEqual({"updated": 1}, result)
        self.assertIsNotNone(split_transaction.reviewed_at)

    def test_bulk_delete_removes_selected_transactions(self) -> None:
        result = bulk_delete(
            TransactionBulkDelete(ids=[self.transaction.id]),
            self.db,
        )

        self.assertEqual({"deleted": 1}, result)
        self.assertIsNone(self.db.get(Transaction, self.transaction.id))

    def test_bulk_delete_rejects_stale_partial_selection(self) -> None:
        with self.assertRaises(HTTPException) as context:
            bulk_delete(
                TransactionBulkDelete(ids=[self.transaction.id, uuid4()]),
                self.db,
            )

        self.assertEqual(409, context.exception.status_code)
        self.assertIsNotNone(self.db.get(Transaction, self.transaction.id))

    def test_rent_paid_at_month_end_is_assigned_to_next_month(self) -> None:
        prepared = prepare_transaction_data({
            "date": date(2026, 5, 30),
            "description": "ALMITAS INC INVEST",
            "amount_mxn": Decimal("12900"),
            "amount_original": Decimal("600"),
            "currency_original": "EUR",
            "bank_name": "Revolut",
            "type": "expense",
            "category": "Rent",
        })

        self.assertEqual(5, prepared["month"])
        self.assertEqual(2026, prepared["year"])
        self.assertEqual(6, prepared["assigned_month"])
        self.assertEqual(2026, prepared["assigned_year"])

    def test_non_600_eur_rent_paid_at_month_end_stays_in_current_month(self) -> None:
        prepared = prepare_transaction_data({
            "date": date(2026, 2, 28),
            "description": "Transfer to GONCALO DE CAMPOS MELO ANDREA MOUTINHO DE ALME",
            "amount_mxn": Decimal("2365.50"),
            "amount_original": Decimal("110.02"),
            "currency_original": "EUR",
            "bank_name": "Revolut",
            "type": "expense",
            "category": "Rent",
        })

        self.assertEqual(2, prepared["month"])
        self.assertEqual(2026, prepared["year"])
        self.assertEqual(2, prepared["assigned_month"])
        self.assertEqual(2026, prepared["assigned_year"])

    def test_rent_paid_at_start_of_month_stays_in_current_month(self) -> None:
        prepared = prepare_transaction_data({
            "date": date(2026, 7, 1),
            "description": "ALMITAS INC INVEST",
            "amount_mxn": Decimal("12900"),
            "amount_original": Decimal("600"),
            "currency_original": "EUR",
            "bank_name": "Revolut",
            "type": "expense",
            "category": "Rent",
        })

        self.assertEqual(7, prepared["month"])
        self.assertEqual(2026, prepared["year"])
        self.assertEqual(7, prepared["assigned_month"])
        self.assertEqual(2026, prepared["assigned_year"])

    def test_month_summary_uses_assigned_month_for_rent(self) -> None:
        rent = Transaction(
            date=date(2026, 5, 30),
            description="Rent",
            amount_original=Decimal("600"),
            currency_original="EUR",
            amount_mxn=Decimal("12900"),
            exchange_rate_used=None,
            category="Rent",
            type="expense",
            bank_name="Revolut",
            month=5,
            year=2026,
            assigned_month=6,
            assigned_year=2026,
            manually_added=False,
        )
        self.db.add(rent)
        self.db.commit()

        may = get_summary(self.db, month=5, year=2026)
        june = get_summary(self.db, month=6, year=2026)

        self.assertEqual(Decimal("0.00"), may.expenses)
        self.assertEqual(Decimal("12960.00"), june.expenses)
