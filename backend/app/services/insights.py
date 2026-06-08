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
    today: date | None = None,
) -> tuple[tuple[date, date], tuple[date, date]]:
    today = today or date.today()
    if not 1 <= year <= 9999:
        raise ValueError("year must be between 1 and 9999")
    if year > today.year:
        raise ValueError("future year is not allowed")
    if month is not None and not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")

    if date_from is not None or date_to is not None:
        if date_from is None or date_to is None:
            raise ValueError("Custom ranges require both date_from and date_to")
        if date_from > date_to:
            raise ValueError("date_from must be on or before date_to")
        duration = date_to - date_from
        try:
            previous_end = date_from - timedelta(days=1)
            previous_start = previous_end - duration
        except OverflowError as error:
            raise ValueError("comparison period underflow") from error
        return (date_from, date_to), (previous_start, previous_end)

    if month is None:
        try:
            if year == today.year:
                current = (date(year, 1, 1), today)
                previous_end = _clamped_date(year - 1, today.month, today.day)
                previous = (date(year - 1, 1, 1), previous_end)
            else:
                current = (date(year, 1, 1), date(year, 12, 31))
                previous = (date(year - 1, 1, 1), date(year - 1, 12, 31))
        except (OverflowError, ValueError) as error:
            raise ValueError("comparison period underflow") from error
        return current, previous

    current = _month_bounds(year, month)
    try:
        previous_month_end = current[0] - timedelta(days=1)
    except OverflowError as error:
        raise ValueError("comparison period underflow") from error
    previous = _month_bounds(previous_month_end.year, previous_month_end.month)
    return current, previous


def calculate_percent_change(
    current: Decimal,
    previous: Decimal,
) -> Decimal | None:
    if previous <= 0:
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
    has_spending_baseline = average_expenses is not None and average_expenses > 0
    spending_ratio = expenses / average_expenses if has_spending_baseline else Decimal("1")
    review_risk = review_amount / income if income > 0 else Decimal("0")

    values = _status_values(
        savings_rate=savings_rate,
        spending_ratio=spending_ratio,
        average_expenses=average_expenses if has_spending_baseline else None,
        review_risk=review_risk,
        review_count=review_count,
        review_amount=review_amount,
    )

    if net < 0:
        label = "Needs Attention"
        reason = f"negative net cash flow {net}"
    elif (
        savings_rate >= 35
        and spending_ratio <= Decimal("1.05")
        and review_risk < Decimal("0.05")
    ):
        label = "Excellent"
        reason = "all excellent thresholds are met"
    elif (
        savings_rate >= 25
        and spending_ratio <= Decimal("1.15")
        and review_risk < Decimal("0.10")
    ):
        label = "Healthy"
        reason = "all healthy thresholds are met"
    elif savings_rate >= 0:
        label = "Watch"
        watch_reasons: list[str] = []
        if savings_rate < 25:
            watch_reasons.append("savings rate is below the 25% target")
        if spending_ratio > Decimal("1.15"):
            watch_reasons.append("spending ratio is above the 1.15 healthy limit")
        if review_risk >= Decimal("0.10"):
            watch_reasons.append("review risk is at or above the 10% healthy limit")
        reason = "; ".join(watch_reasons)
    else:
        label = "Needs Attention"
        reason = "savings rate is negative"

    return MonthStatusRead(
        label=label,
        explanation=f"{label} because {reason}. {values}",
        savings_rate=savings_rate,
    )


def _status_values(
    *,
    savings_rate: Decimal,
    spending_ratio: Decimal,
    average_expenses: Decimal | None,
    review_risk: Decimal,
    review_count: int,
    review_amount: Decimal,
) -> str:
    if average_expenses is None:
        spending = f"no spending baseline; spending ratio defaults to {spending_ratio:.2f}"
    else:
        spending = f"spending ratio {spending_ratio:.2f} against baseline {average_expenses}"
    transaction_label = "transaction" if review_count == 1 else "transactions"
    return (
        f"Savings rate {savings_rate:.1f}%; {spending}; "
        f"review risk {(review_risk * Decimal("100")):.1f}% from "
        f"{review_count} {transaction_label} totaling {review_amount}."
    )


def _clamped_date(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)
