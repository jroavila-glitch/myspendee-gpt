from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class MetricComparison(BaseModel):
    current: Decimal
    previous: Decimal
    average: Decimal | None
    previous_change_percent: Decimal | None


class MonthStatusRead(BaseModel):
    label: Literal["Excellent", "Healthy", "Watch", "Needs Attention"]
    explanation: str
    savings_rate: Decimal
    target_savings_rate: Decimal = Decimal("25")


class ReviewReasonSummary(BaseModel):
    label: str
    count: int


class ReviewItemInsight(BaseModel):
    transaction_id: UUID
    reasons: list[str]


class InsightsResponse(BaseModel):
    income: MetricComparison
    expenses: MetricComparison
    net: MetricComparison
    status: MonthStatusRead
    review_count: int
    review_amount_mxn: Decimal
    review_reasons: list[ReviewReasonSummary]
    review_items: list[ReviewItemInsight]
