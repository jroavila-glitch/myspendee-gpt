from datetime import date
from decimal import Decimal
from unittest import TestCase

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Transaction, TransactionAllocation


class TransactionAllocationTest(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
            del connection_record
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

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
