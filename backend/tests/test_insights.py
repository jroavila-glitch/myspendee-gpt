from datetime import date, datetime
from decimal import Decimal
from unittest import TestCase
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Transaction
from app.schemas.common import TransactionAllocationInput
from app.services.allocations import replace_allocations
from app.schemas.insights import ReviewItemInsight
from app.services import insights as insights_service
from app.services.insights import (
    calculate_loan_papa_reconciliation,
    calculate_month_status,
    calculate_percent_change,
    get_insights,
    review_reasons_for_transaction,
    resolve_comparison_period,
)


class InsightsTest(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def add_transaction(
        self,
        *,
        tx_date: date,
        description: str,
        amount_mxn: str,
        category: str,
        tx_type: str,
        bank_name: str = "Primary Bank",
        notes: str | None = None,
        currency_original: str = "MXN",
        amount_original: str | None = None,
        exchange_rate_used: str | None = "1",
    ) -> Transaction:
        transaction = Transaction(
            date=tx_date,
            description=description,
            amount_original=Decimal(amount_original) if amount_original is not None else None,
            currency_original=currency_original,
            amount_mxn=Decimal(amount_mxn),
            exchange_rate_used=Decimal(exchange_rate_used) if exchange_rate_used is not None else None,
            category=category,
            type=tx_type,
            bank_name=bank_name,
            month=tx_date.month,
            year=tx_date.year,
            manually_added=False,
            notes=notes,
        )
        self.db.add(transaction)
        self.db.flush()
        return transaction

    def allocation(
        self,
        category: str,
        amount_mxn: str,
    ) -> TransactionAllocationInput:
        return TransactionAllocationInput(
            category=category,
            amount_mxn=Decimal(amount_mxn),
        )

    def add_split_transaction(
        self,
        *,
        tx_date: date,
        description: str,
        amount_mxn: str = "100.00",
        source_category: str = "Other",
        notes: str | None = None,
    ) -> Transaction:
        transaction = self.add_transaction(
            tx_date=tx_date,
            description=description,
            amount_mxn=amount_mxn,
            category=source_category,
            tx_type="expense",
            notes=notes,
            amount_original=None,
        )
        replace_allocations(
            self.db,
            transaction,
            [
                self.allocation("Groceries", "60.00"),
                self.allocation("Home", "40.00"),
            ],
        )
        return transaction

    def seed_insight_periods(self) -> Transaction:
        for month, income, expenses in [
            (2, "650", "400"),
            (3, "800", "500"),
            (4, "800", "600"),
        ]:
            self.add_transaction(
                tx_date=date(2026, month, 5),
                description=f"Income {month}",
                amount_mxn=income,
                category="Salary",
                tx_type="income",
            )
            self.add_transaction(
                tx_date=date(2026, month, 10),
                description=f"Expense {month}",
                amount_mxn=expenses,
                category="Food & Drink",
                tx_type="expense",
            )

        self.add_transaction(
            tx_date=date(2026, 5, 5),
            description="Income May",
            amount_mxn="1000",
            category="Salary",
            tx_type="income",
        )
        self.add_transaction(
            tx_date=date(2026, 5, 10),
            description="Expense May",
            amount_mxn="530",
            category="Food & Drink",
            tx_type="expense",
        )
        review_transaction = self.add_transaction(
            tx_date=date(2026, 5, 15),
            description="Review May",
            amount_mxn="20",
            category="Other",
            tx_type="expense",
        )
        self.add_transaction(
            tx_date=date(2026, 4, 20),
            description="Old review",
            amount_mxn="10",
            category="Travel",
            tx_type="expense",
            notes="Manual review needed",
        )
        self.add_transaction(
            tx_date=date(2026, 5, 20),
            description="Other bank income",
            amount_mxn="9999",
            category="Salary",
            tx_type="income",
            bank_name="Other Bank",
        )
        self.db.commit()
        return review_transaction

    def test_get_insights_applies_filters_and_builds_comparisons_and_reviews(self) -> None:
        review_transaction = self.seed_insight_periods()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertEqual(Decimal("1000"), response.income.current)
        self.assertEqual(Decimal("800"), response.income.previous)
        self.assertEqual(Decimal("750"), response.income.average)
        self.assertEqual(Decimal("550"), response.expenses.current)
        self.assertEqual(Decimal("610"), response.expenses.previous)
        self.assertEqual(Decimal("503.3333333333333333333333333"), response.expenses.average)
        self.assertEqual("Healthy", response.status.label)
        self.assertEqual(1, response.review_count)
        self.assertEqual(Decimal("20"), response.review_amount_mxn)
        self.assertEqual(["Unclassified"], response.review_items[0].reasons)
        self.assertEqual(review_transaction.id, response.review_items[0].transaction_id)

    def test_get_insights_excludes_reviewed_transactions(self) -> None:
        review_transaction = self.seed_insight_periods()
        review_transaction.reviewed_at = datetime(2026, 5, 16)
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertEqual(0, response.review_count)
        self.assertEqual([], response.review_items)

    def test_get_insights_keys_category_averages_by_category_and_type(self) -> None:
        for month in [2, 3, 4]:
            self.add_transaction(
                tx_date=date(2026, month, 2),
                description=f"Other income baseline {month}",
                amount_mxn="1000",
                category="Other",
                tx_type="income",
            )
            self.add_transaction(
                tx_date=date(2026, month, 3),
                description=f"Other expense baseline {month}",
                amount_mxn="50",
                category="Other",
                tx_type="expense",
            )
        review_transaction = self.add_transaction(
            tx_date=date(2026, 5, 4),
            description="Other expense current",
            amount_mxn="120",
            category="Other",
            tx_type="expense",
        )
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertEqual(1, response.review_count)
        self.assertEqual(review_transaction.id, response.review_items[0].transaction_id)
        self.assertEqual(
            ["Unclassified", "Higher than usual"],
            response.review_items[0].reasons,
        )

    def test_get_insights_uses_split_allocations_for_category_averages_but_source_totals_for_review(self) -> None:
        for month in [2, 3, 4]:
            self.add_split_transaction(
                tx_date=date(2026, month, 2),
                description=f"Split baseline {month}",
            )
        reviewed_split = self.add_split_transaction(
            tx_date=date(2026, 5, 2),
            description="Reviewed split current",
            notes="Manual review needed",
        )
        review_transaction = self.add_transaction(
            tx_date=date(2026, 5, 3),
            description="Groceries spike",
            amount_mxn="130.00",
            category="Groceries",
            tx_type="expense",
        )
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertIsNotNone(reviewed_split.reviewed_at)
        self.assertEqual(Decimal("230.00"), response.expenses.current)
        self.assertEqual(Decimal("130.00"), response.review_amount_mxn)
        self.assertEqual(1, response.review_count)
        self.assertEqual(
            [(review_transaction.id, ["Higher than usual"])],
            [(item.transaction_id, item.reasons) for item in response.review_items],
        )

    def test_get_insights_excludes_reimbursement_neutral_categories_from_totals(self) -> None:
        self.add_transaction(
            tx_date=date(2026, 4, 5),
            description="Baseline income",
            amount_mxn="1000.00",
            category="Tennis Lessons",
            tx_type="income",
        )
        shared_order = self.add_transaction(
            tx_date=date(2026, 5, 4),
            description="Uber Eats shared dinner",
            amount_mxn="1600.00",
            category="Food & Drink",
            tx_type="expense",
            amount_original=None,
        )
        replace_allocations(
            self.db,
            shared_order,
            [
                self.allocation("Food & Drink", "600.00"),
                self.allocation("Reimbursement expected", "1000.00"),
            ],
        )
        self.add_transaction(
            tx_date=date(2026, 5, 6),
            description="Friend repayment",
            amount_mxn="1000.00",
            category="Reimbursement received",
            tx_type="income",
        )
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertEqual(Decimal("0"), response.income.current)
        self.assertEqual(Decimal("600.00"), response.expenses.current)
        self.assertEqual(Decimal("-600.00"), response.net.current)

    def test_get_insights_aggregates_multiple_reasons_with_deterministic_ties(self) -> None:
        for month in [2, 3, 4]:
            self.add_transaction(
                tx_date=date(2026, month, 3),
                description=f"Food baseline {month}",
                amount_mxn="50",
                category="Food & Drink",
                tx_type="expense",
            )
            self.add_transaction(
                tx_date=date(2026, month, 4),
                description=f"Travel baseline {month}",
                amount_mxn="80",
                category="Travel",
                tx_type="expense",
            )
        first = self.add_transaction(
            tx_date=date(2026, 5, 3),
            description="Other missing fx",
            amount_mxn="100",
            category="Other",
            tx_type="expense",
            currency_original="EUR",
            amount_original=None,
            exchange_rate_used=None,
        )
        second = self.add_transaction(
            tx_date=date(2026, 5, 4),
            description="Food spike",
            amount_mxn="100",
            category="Food & Drink",
            tx_type="expense",
        )
        third = self.add_transaction(
            tx_date=date(2026, 5, 5),
            description="Travel manual missing fx spike",
            amount_mxn="160",
            category="Travel",
            tx_type="expense",
            notes="Manual review needed",
            currency_original="EUR",
            amount_original=None,
            exchange_rate_used=None,
        )
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type=None,
        )

        self.assertEqual(3, response.review_count)
        self.assertEqual(
            [
                (first.id, ["Unclassified", "Missing FX"]),
                (second.id, ["Higher than usual"]),
                (third.id, ["Unclassified", "Missing FX", "Higher than usual"]),
            ],
            [(item.transaction_id, item.reasons) for item in response.review_items],
        )
        self.assertEqual(
            [("Higher than usual", 2), ("Missing FX", 2), ("Unclassified", 2)],
            [(item.label, item.count) for item in response.review_reasons],
        )

    def test_period_filter_uses_month_year_for_complete_calendar_month(self) -> None:
        calls: list[dict] = []

        def fake_apply(stmt, **kwargs):
            calls.append(kwargs)
            return stmt

        original = insights_service.apply_transaction_filters
        insights_service.apply_transaction_filters = fake_apply
        try:
            marker = object()
            self.assertIs(
                marker,
                insights_service._apply_period_filter(
                    marker,
                    period=(date(2026, 5, 1), date(2026, 5, 31)),
                    bank_name="Primary Bank",
                    type="income",
                ),
            )
        finally:
            insights_service.apply_transaction_filters = original

        self.assertEqual(
            [
                {
                    "month": 5,
                    "year": 2026,
                    "date_from": None,
                    "date_to": None,
                    "bank_name": "Primary Bank",
                    "type": "income",
                }
            ],
            calls,
        )

    def test_period_filter_keeps_date_bounds_for_custom_ranges(self) -> None:
        calls: list[dict] = []

        def fake_apply(stmt, **kwargs):
            calls.append(kwargs)
            return stmt

        original = insights_service.apply_transaction_filters
        insights_service.apply_transaction_filters = fake_apply
        try:
            insights_service._apply_period_filter(
                object(),
                period=(date(2026, 5, 10), date(2026, 5, 20)),
                bank_name=None,
                type=None,
            )
        finally:
            insights_service.apply_transaction_filters = original

        self.assertEqual(
            [
                {
                    "month": None,
                    "year": 2026,
                    "date_from": date(2026, 5, 10),
                    "date_to": date(2026, 5, 20),
                    "bank_name": None,
                    "type": None,
                }
            ],
            calls,
        )

    def test_get_insights_applies_activity_type_to_all_windows(self) -> None:
        self.seed_insight_periods()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type="income",
            today=date(2026, 6, 12),
        )

        self.assertEqual(Decimal("1000"), response.income.current)
        self.assertEqual(Decimal("800"), response.income.previous)
        self.assertEqual(Decimal("750"), response.income.average)
        self.assertEqual(Decimal("0"), response.expenses.current)
        self.assertEqual(0, response.review_count)

    def test_get_insights_includes_global_loan_papa_reconciliation(self) -> None:
        self.add_transaction(
            tx_date=date(2026, 7, 2),
            description="Transfer to Jose Roberto Avila",
            amount_mxn="5000.00",
            category="Loan Papá",
            tx_type="expense",
            bank_name="ARQ",
        )
        self.add_transaction(
            tx_date=date(2026, 7, 3),
            description="Dinner",
            amount_mxn="500.00",
            category="Food & Drink",
            tx_type="expense",
            bank_name="ARQ",
        )
        self.db.commit()

        response = get_insights(
            self.db,
            month=5,
            year=2026,
            date_from=None,
            date_to=None,
            bank_name="Primary Bank",
            type="income",
            today=date(2026, 6, 12),
        )

        self.assertEqual(Decimal("458221.80"), response.loan_papa.total_amount_mxn)
        self.assertEqual(Decimal("7637.03"), response.loan_papa.monthly_amount_mxn)
        self.assertEqual(60, response.loan_papa.installment_count)
        self.assertEqual(14, response.loan_papa.installments_due)
        self.assertEqual(Decimal("106918.42"), response.loan_papa.total_due_mxn)
        self.assertEqual(Decimal("98707.33"), response.loan_papa.paid_mxn)
        self.assertEqual(Decimal("8211.09"), response.loan_papa.behind_mxn)
        self.assertEqual(Decimal("359514.47"), response.loan_papa.remaining_balance_mxn)

    def test_calculates_loan_papa_reconciliation_from_baseline_and_future_payments(self) -> None:
        reconciliation = calculate_loan_papa_reconciliation(
            extra_paid_mxn=Decimal("0"),
            as_of=date(2026, 6, 12),
        )

        self.assertEqual(Decimal("93707.33"), reconciliation.paid_mxn)
        self.assertEqual(Decimal("13211.09"), reconciliation.behind_mxn)

    def test_previous_month_preserves_full_month_bounds(self) -> None:
        current, previous = resolve_comparison_period(
            year=2026, month=5, date_from=None, date_to=None
        )
        self.assertEqual((date(2026, 5, 1), date(2026, 5, 31)), current)
        self.assertEqual((date(2026, 4, 1), date(2026, 4, 30)), previous)

    def test_january_compares_with_previous_december(self) -> None:
        current, previous = resolve_comparison_period(
            year=2026, month=1, date_from=None, date_to=None
        )
        self.assertEqual((date(2026, 1, 1), date(2026, 1, 31)), current)
        self.assertEqual((date(2025, 12, 1), date(2025, 12, 31)), previous)

    def test_current_year_ytd_compares_through_equivalent_prior_date(self) -> None:
        current, previous = resolve_comparison_period(
            year=2026, month=None, date_from=None, date_to=None, today=date(2026, 6, 8)
        )
        self.assertEqual((date(2026, 1, 1), date(2026, 6, 8)), current)
        self.assertEqual((date(2025, 1, 1), date(2025, 6, 8)), previous)

    def test_current_year_ytd_clamps_prior_leap_day(self) -> None:
        current, previous = resolve_comparison_period(
            year=2024, month=None, date_from=None, date_to=None, today=date(2024, 2, 29)
        )
        self.assertEqual((date(2024, 1, 1), date(2024, 2, 29)), current)
        self.assertEqual((date(2023, 1, 1), date(2023, 2, 28)), previous)

    def test_completed_past_year_compares_with_previous_full_year(self) -> None:
        current, previous = resolve_comparison_period(
            year=2025, month=None, date_from=None, date_to=None, today=date(2026, 6, 8)
        )
        self.assertEqual((date(2025, 1, 1), date(2025, 12, 31)), current)
        self.assertEqual((date(2024, 1, 1), date(2024, 12, 31)), previous)

    def test_custom_range_compares_with_immediately_preceding_equal_range(self) -> None:
        current, previous = resolve_comparison_period(
            year=2026,
            month=None,
            date_from=date(2026, 5, 10),
            date_to=date(2026, 5, 20),
        )
        self.assertEqual((date(2026, 5, 10), date(2026, 5, 20)), current)
        self.assertEqual((date(2026, 4, 29), date(2026, 5, 9)), previous)

    def test_complete_custom_range_ignores_irrelevant_year_and_month(self) -> None:
        current, previous = resolve_comparison_period(
            year=10000,
            month=13,
            date_from=date(2026, 5, 10),
            date_to=date(2026, 5, 20),
            today=date(2026, 6, 8),
        )
        self.assertEqual((date(2026, 5, 10), date(2026, 5, 20)), current)
        self.assertEqual((date(2026, 4, 29), date(2026, 5, 9)), previous)

    def test_custom_range_requires_both_bounds_in_order(self) -> None:
        with self.assertRaises(ValueError):
            resolve_comparison_period(
                year=2026, month=None, date_from=date(2026, 5, 1), date_to=None
            )
        with self.assertRaises(ValueError):
            resolve_comparison_period(
                year=2026,
                month=None,
                date_from=date(2026, 5, 20),
                date_to=date(2026, 5, 10),
            )

    def test_rejects_invalid_month_and_year_with_clear_errors(self) -> None:
        with self.assertRaisesRegex(ValueError, "month must be between 1 and 12"):
            resolve_comparison_period(year=2026, month=13, date_from=None, date_to=None)
        with self.assertRaisesRegex(ValueError, "year must be between 1 and 9999"):
            resolve_comparison_period(year=0, month=None, date_from=None, date_to=None)

    def test_rejects_future_year(self) -> None:
        with self.assertRaisesRegex(ValueError, "future year"):
            resolve_comparison_period(
                year=2027, month=None, date_from=None, date_to=None, today=date(2026, 6, 8)
            )

    def test_rejects_comparison_period_underflow_with_clear_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "comparison period underflow"):
            resolve_comparison_period(
                year=1, month=1, date_from=None, date_to=None, today=date(2026, 6, 8)
            )
        with self.assertRaisesRegex(ValueError, "comparison period underflow"):
            resolve_comparison_period(
                year=1, month=None, date_from=date.min, date_to=date.min, today=date(2026, 6, 8)
            )

    def test_percent_change_handles_zero_baseline(self) -> None:
        self.assertIsNone(calculate_percent_change(Decimal("10"), Decimal("0")))

    def test_percent_change_rejects_negative_baseline(self) -> None:
        self.assertIsNone(calculate_percent_change(Decimal("10"), Decimal("-5")))

    def test_percent_change_calculates_increase_and_decrease(self) -> None:
        self.assertEqual(
            Decimal("25"),
            calculate_percent_change(Decimal("125"), Decimal("100")),
        )
        self.assertEqual(
            Decimal("-25"),
            calculate_percent_change(Decimal("75"), Decimal("100")),
        )

    def test_unclassified_expense_has_explicit_review_reason(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Other",
            tx_type="expense",
            notes="Unclassified expense - manual review needed",
            amount_mxn=Decimal("100"),
            category_average=None,
        )
        self.assertIn("Unclassified", reasons)

    def test_manual_review_note_marks_any_transaction_unclassified(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Travel",
            tx_type="income",
            notes="MANUAL REVIEW needed",
            amount_mxn=Decimal("100"),
            category_average=None,
        )
        self.assertEqual(["Unclassified"], reasons)

    def test_missing_fx_requires_original_amount_and_exchange_rate(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Travel",
            tx_type="expense",
            notes=None,
            amount_mxn=Decimal("100"),
            category_average=None,
            currency_original="EUR",
            amount_original=None,
            exchange_rate_used=Decimal("20"),
        )
        self.assertEqual(["Missing FX"], reasons)

    def test_high_amount_is_at_least_twice_non_zero_category_average(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Travel",
            tx_type="expense",
            notes=None,
            amount_mxn=Decimal("200"),
            category_average=Decimal("100"),
        )
        self.assertEqual(["Higher than usual"], reasons)

    def test_review_reasons_are_returned_in_deterministic_rule_order(self) -> None:
        reasons = review_reasons_for_transaction(
            category="Other",
            tx_type="expense",
            notes=None,
            amount_mxn=Decimal("200"),
            category_average=Decimal("100"),
            currency_original="EUR",
            amount_original=None,
            exchange_rate_used=None,
        )
        self.assertEqual(
            ["Unclassified", "Missing FX", "Higher than usual"],
            reasons,
        )

    def test_status_is_needs_attention_for_negative_net(self) -> None:
        status = calculate_month_status(
            income=Decimal("1000"),
            expenses=Decimal("1200"),
            average_expenses=Decimal("800"),
            review_count=0,
            review_amount=Decimal("0"),
        )
        self.assertEqual("Needs Attention", status.label)
        self.assertIn("spending is above income", status.explanation.lower())
        self.assertIn("200.00", status.explanation)
        self.assertIn("-20", status.explanation)

    def test_status_explanation_formats_no_income_without_raw_ratios(self) -> None:
        status = calculate_month_status(
            income=Decimal("0"),
            expenses=Decimal("335.33"),
            average_expenses=None,
            review_count=0,
            review_amount=Decimal("0"),
        )

        self.assertEqual("Needs Attention", status.label)
        self.assertIn("spending is above income by 335.33", status.explanation)
        self.assertIn("no spending baseline yet", status.explanation)
        self.assertNotIn("87731", status.explanation)
        self.assertNotIn("666666", status.explanation)
        self.assertNotIn("spending ratio", status.explanation.lower())

    def test_status_is_excellent_when_all_thresholds_are_met(self) -> None:
        status = calculate_month_status(
            income=Decimal("1000"),
            expenses=Decimal("600"),
            average_expenses=Decimal("600"),
            review_count=1,
            review_amount=Decimal("40"),
        )
        self.assertEqual("Excellent", status.label)
        self.assertEqual(Decimal("40.0"), status.savings_rate)
        self.assertIn("40", status.explanation)
        self.assertIn("1.0x", status.explanation)
        self.assertIn("4", status.explanation)
        self.assertIn("1 transaction", status.explanation)

    def test_status_is_healthy_when_excellent_threshold_is_missed(self) -> None:
        status = calculate_month_status(
            income=Decimal("1000"),
            expenses=Decimal("700"),
            average_expenses=Decimal("650"),
            review_count=1,
            review_amount=Decimal("60"),
        )
        self.assertEqual("Healthy", status.label)
        self.assertIn("30", status.explanation)
        self.assertIn("1.1x", status.explanation)
        self.assertIn("6", status.explanation)
        self.assertIn("healthy thresholds", status.explanation.lower())

    def test_status_is_watch_for_non_negative_net_below_target(self) -> None:
        status = calculate_month_status(
            income=Decimal("1000"),
            expenses=Decimal("900"),
            average_expenses=None,
            review_count=0,
            review_amount=Decimal("0"),
        )
        self.assertEqual("Watch", status.label)
        self.assertIn("10", status.explanation)
        self.assertIn("no spending baseline", status.explanation.lower())
        self.assertIn("below the 25% target", status.explanation.lower())

    def test_review_item_schema_uses_transaction_id_and_reasons(self) -> None:
        transaction_id = uuid4()
        item = ReviewItemInsight(
            transaction_id=transaction_id,
            reasons=["Missing FX"],
        )
        self.assertEqual(transaction_id, item.transaction_id)
        self.assertEqual(["Missing FX"], item.reasons)
        self.assertIn('"transaction_id"', item.model_dump_json())
