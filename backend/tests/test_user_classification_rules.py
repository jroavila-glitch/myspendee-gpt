from datetime import date
from decimal import Decimal
from unittest import TestCase

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.main import create_classification_rule_from_transaction
from app.models import Transaction, UserClassificationRule
from app.schemas.common import UserClassificationRuleCreate
from app.services.transactions import create_transaction
from app.services.user_rules import apply_user_classification_rules, infer_pattern_from_description
from app.schemas.common import TransactionCreate


class UserClassificationRulesTest(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.transaction = Transaction(
            date=date(2026, 7, 2),
            description="WWW.OBSIDIAN.MD CARD",
            amount_original=Decimal("8.00"),
            currency_original="USD",
            amount_mxn=Decimal("160.00"),
            exchange_rate_used=Decimal("20.000000"),
            category="IG Ro Project",
            type="expense",
            bank_name="Oro Banamex",
            month=7,
            year=2026,
            manually_added=False,
        )
        self.db.add(self.transaction)
        self.db.commit()
        self.db.refresh(self.transaction)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_infers_readable_pattern_from_description(self) -> None:
        self.assertEqual("OBSIDIAN", infer_pattern_from_description("WWW.OBSIDIAN.MD CARD"))

    def test_creates_rule_from_edited_transaction(self) -> None:
        rule = create_classification_rule_from_transaction(
            self.transaction.id,
            UserClassificationRuleCreate(scope="bank"),
            self.db,
        )

        self.assertEqual("OBSIDIAN", rule.description_pattern)
        self.assertEqual("Oro Banamex", rule.bank_name)
        self.assertEqual("expense", rule.match_type)
        self.assertEqual("expense", rule.target_type)
        self.assertEqual("IG Ro Project", rule.target_category)

    def test_user_rule_is_applied_to_future_transaction_creation(self) -> None:
        self.db.add(
            UserClassificationRule(
                description_pattern="JOSESCOFFEE",
                bank_name="Revolut",
                match_type="expense",
                target_type="expense",
                target_category="Food & Drink",
            )
        )
        self.db.commit()

        created = create_transaction(
            self.db,
            TransactionCreate(
                date=date(2026, 7, 10),
                description="JOSESCOFFEE LISBOA",
                amount_original=Decimal("10.00"),
                currency_original="EUR",
                amount_mxn=Decimal("215.00"),
                exchange_rate_used=Decimal("21.500000"),
                category="Other",
                type="expense",
                bank_name="Revolut",
            ),
        )

        self.assertEqual("Food & Drink", created.category)
        self.assertEqual("expense", created.type)

    def test_disabled_rules_are_not_applied(self) -> None:
        self.db.add(
            UserClassificationRule(
                description_pattern="OBSIDIAN",
                bank_name="Oro Banamex",
                match_type="expense",
                target_type="expense",
                target_category="IG Ro Project",
                enabled=False,
            )
        )
        self.db.commit()

        result = apply_user_classification_rules(
            self.db,
            description="OBSIDIAN SYNC",
            bank_name="Oro Banamex",
            tx_type="expense",
        )

        self.assertIsNone(result)
