from datetime import date, datetime
from decimal import Decimal
from unittest import TestCase

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import app, get_db
from app.models import Transaction, TransactionAllocation
from app.schemas.common import TransactionAllocationInput
from app.services.allocations import remove_allocations, replace_allocations, resolve_allocation_amounts
from app.services.transactions import get_breakdown, get_summary


class TransactionAllocationTest(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
            del connection_record
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def create_transaction(
        self,
        *,
        amount_original: Decimal | None = Decimal("100.00"),
        currency_original: str = "MXN",
        amount_mxn: Decimal = Decimal("100.00"),
        category: str = "Other",
        tx_type: str = "expense",
        reviewed_at: datetime | None = None,
    ) -> Transaction:
        transaction = Transaction(
            date=date(2026, 6, 10),
            description="Split transaction",
            amount_original=amount_original,
            currency_original=currency_original,
            amount_mxn=amount_mxn,
            exchange_rate_used=None,
            category=category,
            type=tx_type,
            bank_name="Manual",
            month=6,
            year=2026,
            manually_added=True,
            reviewed_at=reviewed_at,
        )
        self.db.add(transaction)
        self.db.commit()
        return transaction

    def allocation(
        self,
        category: str,
        *,
        amount_original: str | None = None,
        amount_mxn: str | None = None,
        notes: str | None = None,
    ) -> TransactionAllocationInput:
        return TransactionAllocationInput(
            category=category,
            amount_original=Decimal(amount_original) if amount_original is not None else None,
            amount_mxn=Decimal(amount_mxn) if amount_mxn is not None else None,
            notes=notes,
        )

    def test_transaction_accepts_ordered_allocations_and_delete_cascades(self) -> None:
        transaction = Transaction(
            date=date(2026, 6, 10),
            description="Split expense",
            amount_original=Decimal("100.00"),
            currency_original="MXN",
            amount_mxn=Decimal("100.00"),
            exchange_rate_used=Decimal("1.00"),
            category="Other",
            type="expense",
            bank_name="Manual",
            month=6,
            year=2026,
            manually_added=True,
            allocations=[
                TransactionAllocation(
                    category="Transport",
                    amount_mxn=Decimal("40.00"),
                    position=2,
                ),
                TransactionAllocation(
                    category="Food & Drink",
                    amount_mxn=Decimal("60.00"),
                    position=1,
                ),
            ],
        )
        self.db.add(transaction)
        self.db.commit()

        transaction_id = transaction.id
        self.db.expire_all()
        persisted = self.db.get(Transaction, transaction_id)
        self.assertEqual(
            ["Food & Drink", "Transport"],
            [allocation.category for allocation in persisted.allocations],
        )

        self.db.expire(persisted, ["allocations"])
        self.db.delete(persisted)
        self.db.commit()

        allocations = self.db.scalars(select(TransactionAllocation)).all()
        self.assertEqual([], allocations)

    def test_replace_requires_at_least_two_rows(self) -> None:
        transaction = self.create_transaction()

        with self.assertRaisesRegex(ValueError, "At least two allocations are required"):
            replace_allocations(
                self.db,
                transaction,
                [self.allocation("Food & Drink", amount_original="100.00")],
            )

    def test_replace_rejects_ignored_and_category_type_mismatches(self) -> None:
        ignored = self.create_transaction(category="ignored", tx_type="ignored")
        with self.assertRaisesRegex(ValueError, "Only income or expense transactions can be split"):
            replace_allocations(
                self.db,
                ignored,
                [
                    self.allocation("Other", amount_original="40.00"),
                    self.allocation("Other", amount_original="60.00"),
                ],
            )

        expense = self.create_transaction()
        with self.assertRaisesRegex(ValueError, "Invalid expense allocation category: Tennis Lessons"):
            replace_allocations(
                self.db,
                expense,
                [
                    self.allocation("Tennis Lessons", amount_original="40.00"),
                    self.allocation("Transport", amount_original="60.00"),
                ],
            )

    def test_replace_rejects_zero_negative_and_inappropriate_amount_fields(self) -> None:
        transaction = self.create_transaction()

        for invalid_amount in ["0.00", "-1.00"]:
            with self.subTest(invalid_amount=invalid_amount):
                with self.assertRaisesRegex(ValueError, "Allocation amounts must be positive"):
                    replace_allocations(
                        self.db,
                        transaction,
                        [
                            self.allocation("Food & Drink", amount_original=invalid_amount),
                            self.allocation("Transport", amount_original="100.00"),
                        ],
                    )

        with self.assertRaisesRegex(ValueError, "amount_original is required"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Food & Drink", amount_mxn="40.00"),
                    self.allocation("Transport", amount_mxn="60.00"),
                ],
            )

        canonical_only = self.create_transaction(amount_original=None)
        with self.assertRaisesRegex(ValueError, "amount_mxn is required"):
            replace_allocations(
                self.db,
                canonical_only,
                [
                    self.allocation("Food & Drink", amount_original="40.00"),
                    self.allocation("Transport", amount_original="60.00"),
                ],
            )

    def test_resolve_quantizes_mxn_and_gives_final_row_rounding_remainder(self) -> None:
        transaction = self.create_transaction(
            amount_original=Decimal("3.00"),
            currency_original="EUR",
            amount_mxn=Decimal("100.00"),
        )

        resolved = resolve_allocation_amounts(
            transaction,
            [
                self.allocation("Food & Drink", amount_original="1.00"),
                self.allocation("Transport", amount_original="1.00"),
                self.allocation("Home", amount_original="1.00"),
            ],
        )

        self.assertEqual(
            [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")],
            [row.amount_mxn for row in resolved],
        )
        self.assertEqual(Decimal("100.00"), sum(row.amount_mxn for row in resolved))

    def test_resolve_rejects_allocations_that_round_to_zero_mxn(self) -> None:
        transaction = self.create_transaction(
            amount_original=Decimal("3.00"),
            currency_original="EUR",
            amount_mxn=Decimal("0.01"),
        )

        with self.assertRaisesRegex(ValueError, "Allocation amounts must be positive after MXN conversion"):
            resolve_allocation_amounts(
                transaction,
                [
                    self.allocation("Food & Drink", amount_original="1.00"),
                    self.allocation("Transport", amount_original="1.00"),
                    self.allocation("Home", amount_original="1.00"),
                ],
            )

    def test_replace_requires_original_amounts_to_sum_exactly(self) -> None:
        transaction = self.create_transaction(
            amount_original=Decimal("50.00"),
            currency_original="EUR",
            amount_mxn=Decimal("1000.00"),
        )

        with self.assertRaisesRegex(ValueError, "Allocation original amounts must equal transaction original amount"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Food & Drink", amount_original="20.00"),
                    self.allocation("Transport", amount_original="29.99"),
                ],
            )

    def test_replace_rejects_fractional_cent_original_amounts_before_rounding(self) -> None:
        transaction = self.create_transaction(
            amount_original=Decimal("100.00"),
            currency_original="EUR",
            amount_mxn=Decimal("2000.00"),
        )

        with self.assertRaisesRegex(ValueError, "amount_original must use cents"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Food & Drink", amount_original="50.004"),
                    self.allocation("Transport", amount_original="50.004"),
                ],
            )

    def test_replace_requires_canonical_amounts_to_sum_exactly(self) -> None:
        transaction = self.create_transaction(amount_original=None)

        with self.assertRaisesRegex(ValueError, "Allocation MXN amounts must equal transaction MXN amount"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Food & Drink", amount_mxn="40.00"),
                    self.allocation("Transport", amount_mxn="59.99"),
                ],
            )

    def test_replace_rejects_fractional_cent_mxn_amounts_before_rounding(self) -> None:
        transaction = self.create_transaction(amount_original=None)

        with self.assertRaisesRegex(ValueError, "amount_mxn must use cents"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Food & Drink", amount_mxn="50.004"),
                    self.allocation("Transport", amount_mxn="50.004"),
                ],
            )

    def test_replace_persists_allocations_in_order_and_marks_source_reviewed(self) -> None:
        transaction = self.create_transaction(
            amount_original=Decimal("3.00"),
            currency_original="EUR",
            amount_mxn=Decimal("100.00"),
        )

        replaced = replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="1.00", notes="Lunch"),
                self.allocation("Transport", amount_original="2.00"),
            ],
        )

        self.assertIsNotNone(transaction.reviewed_at)
        self.assertEqual(["Food & Drink", "Transport"], [row.category for row in replaced])
        self.assertEqual([0, 1], [row.position for row in replaced])
        self.assertEqual([Decimal("33.33"), Decimal("66.67")], [row.amount_mxn for row in replaced])
        self.assertEqual("Lunch", replaced[0].notes)

    def test_put_allocations_replaces_split_and_serializes_allocations(self) -> None:
        transaction = self.create_transaction(category="Other")
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Home", amount_original="25.00"),
                self.allocation("Groceries", amount_original="75.00"),
            ],
        )

        response = self.client.put(
            f"/transactions/{transaction.id}/allocations",
            json={
                "expected_amount_mxn": "100.00",
                "expected_type": "expense",
                "allocations": [
                    {"category": "Food & Drink", "amount_original": "40.00", "notes": "Lunch"},
                    {"category": "Transport", "amount_original": "60.00"},
                ],
            },
        )

        self.assertEqual(200, response.status_code, response.text)
        data = response.json()
        self.assertTrue(data["is_split"])
        self.assertEqual(2, data["allocation_count"])
        self.assertEqual(["Food & Drink", "Transport"], [row["category"] for row in data["allocations"]])
        self.assertEqual([0, 1], [row["position"] for row in data["allocations"]])
        self.assertEqual("Lunch", data["allocations"][0]["notes"])
        self.db.expire_all()
        persisted = self.db.get(Transaction, transaction.id)
        self.assertEqual(
            [("Food & Drink", Decimal("40.00")), ("Transport", Decimal("60.00"))],
            [(row.category, row.amount_original) for row in persisted.allocations],
        )
        self.assertEqual(2, len(self.db.scalars(select(TransactionAllocation)).all()))

    def test_put_allocations_rejects_stale_expected_amount_or_type(self) -> None:
        stale_amount = self.create_transaction()
        amount_response = self.client.put(
            f"/transactions/{stale_amount.id}/allocations",
            json={
                "expected_amount_mxn": "99.99",
                "expected_type": "expense",
                "allocations": [
                    {"category": "Food & Drink", "amount_original": "40.00"},
                    {"category": "Transport", "amount_original": "60.00"},
                ],
            },
        )
        self.assertEqual(409, amount_response.status_code, amount_response.text)

        stale_type = self.create_transaction()
        type_response = self.client.put(
            f"/transactions/{stale_type.id}/allocations",
            json={
                "expected_amount_mxn": "100.00",
                "expected_type": "income",
                "allocations": [
                    {"category": "Food & Drink", "amount_original": "40.00"},
                    {"category": "Transport", "amount_original": "60.00"},
                ],
            },
        )
        self.assertEqual(409, type_response.status_code, type_response.text)

    def test_replace_replaces_existing_allocations_atomically(self) -> None:
        transaction = self.create_transaction()
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="40.00"),
                self.allocation("Transport", amount_original="60.00"),
            ],
        )

        replaced = replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Home", amount_original="25.00"),
                self.allocation("Groceries", amount_original="75.00"),
            ],
        )

        self.assertEqual(["Home", "Groceries"], [row.category for row in replaced])
        self.assertEqual(2, len(self.db.scalars(select(TransactionAllocation)).all()))

    def test_invalid_replace_leaves_existing_allocations_unchanged(self) -> None:
        transaction = self.create_transaction()
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="40.00"),
                self.allocation("Transport", amount_original="60.00"),
            ],
        )

        with self.assertRaisesRegex(ValueError, "Allocation original amounts must equal transaction original amount"):
            replace_allocations(
                self.db,
                transaction,
                [
                    self.allocation("Home", amount_original="25.00"),
                    self.allocation("Groceries", amount_original="70.00"),
                ],
            )

        self.db.expire_all()
        persisted = self.db.get(Transaction, transaction.id)
        self.assertEqual(
            [("Food & Drink", Decimal("40.00")), ("Transport", Decimal("60.00"))],
            [(row.category, row.amount_original) for row in persisted.allocations],
        )

    def test_remove_requires_valid_replacement_category(self) -> None:
        transaction = self.create_transaction()

        with self.assertRaisesRegex(ValueError, "Transaction is not split"):
            remove_allocations(self.db, transaction, "Home")

        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="40.00"),
                self.allocation("Transport", amount_original="60.00"),
            ],
        )
        with self.assertRaisesRegex(ValueError, "Invalid expense replacement category: Tennis Lessons"):
            remove_allocations(self.db, transaction, "Tennis Lessons")

    def test_remove_clears_allocations_updates_category_and_preserves_reviewed_state(self) -> None:
        reviewed_at = datetime(2026, 6, 10, 12, 0, 0)
        transaction = self.create_transaction(reviewed_at=reviewed_at)
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="40.00"),
                self.allocation("Transport", amount_original="60.00"),
            ],
        )
        transaction.reviewed_at = reviewed_at
        self.db.commit()

        updated = remove_allocations(self.db, transaction, "Home")

        self.assertEqual("Home", updated.category)
        self.assertEqual([], updated.allocations)
        self.assertEqual(reviewed_at, updated.reviewed_at)
        self.assertEqual([], self.db.scalars(select(TransactionAllocation)).all())

    def test_delete_allocations_returns_unsplit_reviewed_transaction(self) -> None:
        transaction = self.create_transaction(category="Other")
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Food & Drink", amount_original="40.00"),
                self.allocation("Transport", amount_original="60.00"),
            ],
        )

        response = self.client.delete(f"/transactions/{transaction.id}/allocations?category=Home")

        self.assertEqual(200, response.status_code, response.text)
        data = response.json()
        self.assertEqual("Home", data["category"])
        self.assertFalse(data["is_split"])
        self.assertEqual(0, data["allocation_count"])
        self.assertEqual([], data["allocations"])
        self.assertIsNotNone(data["reviewed_at"])

    def test_delete_allocations_rejects_unsplit_transaction_without_recategorizing(self) -> None:
        transaction = self.create_transaction(category="Other")

        response = self.client.delete(f"/transactions/{transaction.id}/allocations?category=Home")

        self.assertEqual(422, response.status_code, response.text)
        self.assertEqual("Transaction is not split", response.json()["detail"])
        self.db.expire_all()
        persisted = self.db.get(Transaction, transaction.id)
        self.assertEqual("Other", persisted.category)

    def test_summary_counts_split_source_once_and_breakdown_uses_allocations(self) -> None:
        transaction = self.create_transaction(category="Other")
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Groceries", amount_original="60.00"),
                self.allocation("Home", amount_original="40.00"),
            ],
        )

        summary = get_summary(self.db, month=6, year=2026)
        breakdown = get_breakdown(self.db, month=6, year=2026)
        groceries_breakdown = get_breakdown(self.db, month=6, year=2026, category="Groceries")

        self.assertEqual(Decimal("100.00"), summary.expenses)
        self.assertEqual(Decimal("100.00"), summary.net * Decimal("-1"))
        self.assertEqual(
            [("Groceries", Decimal("60.00"), 1), ("Home", Decimal("40.00"), 1)],
            [(row.category, row.total, row.count) for row in breakdown.expenses],
        )
        self.assertEqual([], breakdown.income)
        self.assertEqual(
            [("Groceries", Decimal("60.00"), 1)],
            [(row.category, row.total, row.count) for row in groceries_breakdown.expenses],
        )

    def test_category_summary_includes_split_sources_by_allocation_category_once(self) -> None:
        split_with_groceries = self.create_transaction(category="Other", amount_mxn=Decimal("100.00"))
        replace_allocations(
            self.db,
            split_with_groceries,
            [
                self.allocation("Groceries", amount_original="40.00"),
                self.allocation("Groceries", amount_original="60.00"),
            ],
        )
        unsplit_groceries = self.create_transaction(category="Groceries", amount_mxn=Decimal("30.00"))
        split_source_groceries_without_groceries_allocation = self.create_transaction(
            amount_original=Decimal("50.00"),
            amount_mxn=Decimal("50.00"),
            category="Groceries",
        )
        replace_allocations(
            self.db,
            split_source_groceries_without_groceries_allocation,
            [
                self.allocation("Home", amount_original="20.00"),
                self.allocation("Transport", amount_original="30.00"),
            ],
        )
        self.db.commit()

        summary = get_summary(self.db, month=6, year=2026, category="Groceries")

        self.assertEqual(Decimal("130.00"), summary.expenses)
        self.assertEqual(Decimal("-130.00"), summary.net)
        self.assertEqual("Groceries", unsplit_groceries.category)

    def test_category_transaction_list_includes_split_sources_by_allocation_category_once(self) -> None:
        split_with_groceries = self.create_transaction(category="Other", amount_mxn=Decimal("100.00"))
        replace_allocations(
            self.db,
            split_with_groceries,
            [
                self.allocation("Groceries", amount_original="40.00"),
                self.allocation("Groceries", amount_original="60.00"),
            ],
        )
        unsplit_groceries = self.create_transaction(category="Groceries", amount_mxn=Decimal("30.00"))
        split_source_groceries_without_groceries_allocation = self.create_transaction(
            amount_original=Decimal("50.00"),
            amount_mxn=Decimal("50.00"),
            category="Groceries",
        )
        replace_allocations(
            self.db,
            split_source_groceries_without_groceries_allocation,
            [
                self.allocation("Home", amount_original="20.00"),
                self.allocation("Transport", amount_original="30.00"),
            ],
        )
        self.db.commit()

        response = self.client.get("/transactions?month=6&year=2026&category=Groceries")

        self.assertEqual(200, response.status_code, response.text)
        ids = [row["id"] for row in response.json()]
        self.assertEqual(
            [str(unsplit_groceries.id), str(split_with_groceries.id)],
            ids,
        )
        self.assertEqual(len(ids), len(set(ids)))
