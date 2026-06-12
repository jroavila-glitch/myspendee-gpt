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


class LoanPapaRead(BaseModel):
    total_amount_mxn: Decimal
    monthly_amount_mxn: Decimal
    installment_count: int
    installments_due: int
    total_due_mxn: Decimal
    paid_mxn: Decimal
    behind_mxn: Decimal
    remaining_balance_mxn: Decimal
    start_date: str
    end_date: str
    baseline_as_of: str


class InsightsResponse(BaseModel):
    income: MetricComparison
    expenses: MetricComparison
    net: MetricComparison
    status: MonthStatusRead
    review_count: int
    review_amount_mxn: Decimal
    review_reasons: list[ReviewReasonSummary]
    review_items: list[ReviewItemInsight]
    loan_papa: LoanPapaRead
