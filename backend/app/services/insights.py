import calendar
from datetime import date, timedelta
from decimal import Decimal

from app.schemas.insights import MonthStatusRead


def resolve_comparison_period(
    *,
    year: int,
    month: int | None,
    date_from: date | None,
    date_to: date | None,
) -> tuple[tuple[date, date], tuple[date, date]]:
    if date_from is not None or date_to is not None:
        if date_from is None or date_to is None:
            raise ValueError("Custom ranges require both date_from and date_to")
        if date_from > date_to:
            raise ValueError("date_from must be on or before date_to")
        duration = date_to - date_from
        previous_end = date_from - timedelta(days=1)
        previous_start = previous_end - duration
        return (date_from, date_to), (previous_start, previous_end)

    if month is None:
        return (
            (date(year, 1, 1), date(year, 12, 31)),
            (date(year - 1, 1, 1), date(year - 1, 12, 31)),
        )

    current = _month_bounds(year, month)
    previous_month_end = current[0] - timedelta(days=1)
    previous = _month_bounds(previous_month_end.year, previous_month_end.month)
    return current, previous


def calculate_percent_change(
    current: Decimal,
    previous: Decimal,
) -> Decimal | None:
    if previous == 0:
        return None
    return ((current - previous) / previous) * Decimal("100")


def review_reasons_for_transaction(
    *,
    category: str,
    tx_type: str,
    notes: str | None,
    amount_mxn: Decimal,
    category_average: Decimal | None,
    currency_original: str = "MXN",
    amount_original: Decimal | None = None,
    exchange_rate_used: Decimal | None = None,
) -> list[str]:
    reasons: list[str] = []

    has_manual_review_note = bool(notes and "manual review" in notes.lower())
    if (category == "Other" and tx_type == "expense") or has_manual_review_note:
        reasons.append("Unclassified")

    if currency_original.upper() != "MXN" and (
        amount_original is None or exchange_rate_used is None
    ):
        reasons.append("Missing FX")

    if category_average is not None and category_average > 0:
        if amount_mxn >= category_average * Decimal("2"):
            reasons.append("Higher than usual")

    return reasons


def calculate_month_status(
    *,
    income: Decimal,
    expenses: Decimal,
    average_expenses: Decimal | None,
    review_count: int,
    review_amount: Decimal,
) -> MonthStatusRead:
    net = income - expenses
    savings_rate = (net / income) * Decimal("100") if income > 0 else Decimal("0")
    spending_ratio = (
        expenses / average_expenses
        if average_expenses is not None and average_expenses > 0
        else Decimal("1")
    )
    review_risk = review_amount / income if income > 0 else Decimal("0")

    if net < 0:
        label = "Needs Attention"
        explanation = "Month Status needs attention because negative net cash flow needs action."
    elif (
        savings_rate >= 35
        and spending_ratio <= Decimal("1.05")
        and review_risk < Decimal("0.05")
    ):
        label = "Excellent"
        explanation = "Savings, spending, and review risk are all in excellent ranges."
    elif (
        savings_rate >= 25
        and spending_ratio <= Decimal("1.15")
        and review_risk < Decimal("0.10")
    ):
        label = "Healthy"
        explanation = "Savings meet the target and spending and review risk are healthy."
    elif savings_rate >= 0:
        label = "Watch"
        explanation = "Net cash flow is non-negative, but one or more targets need watching."
    else:
        label = "Needs Attention"
        explanation = "Month Status needs attention because savings are negative."

    if review_count > 0:
        explanation = f"{explanation} {review_count} transaction(s) need review."

    return MonthStatusRead(
        label=label,
        explanation=explanation,
        savings_rate=savings_rate,
    )


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)
