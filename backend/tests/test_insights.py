from datetime import date
from decimal import Decimal
from unittest import TestCase
from uuid import uuid4

from app.schemas.insights import ReviewItemInsight
from app.services.insights import (
    calculate_month_status,
    calculate_percent_change,
    review_reasons_for_transaction,
    resolve_comparison_period,
)


class InsightsTest(TestCase):
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
        self.assertIn("negative net", status.explanation.lower())
        self.assertIn("-200", status.explanation)
        self.assertIn("-20", status.explanation)

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
        self.assertIn("1.00", status.explanation)
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
        self.assertIn("1.08", status.explanation)
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
