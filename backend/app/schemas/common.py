from __future__ import annotations

from datetime import date as date_type, datetime as datetime_type
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic.config import ConfigDict


INCOME_CATEGORIES = [
    "Tennis Lessons",
    "Perenniam Agency",
    "Ro IG Tennis",
    "Tennis Smash & Social",
    "PlaticArte",
    "Credit Cards Cashback",
    "Azulik",
    "Investments",
    "Gifts",
    "Other",
]

EXPENSE_CATEGORIES = [
    "Rent",
    "Home",
    "Groceries",
    "Food & Drink",
    "Tennis",
    "Car",
    "Transport",
    "IG Ro Project",
    "Healthcare",
    "Gym",
    "Phone/Tech",
    "Books",
    "Travel",
    "Personal Dev",
    "Gifts",
    "Entertainment",
    "Visa Portugal",
    "Bills/Fees",
    "Clothing",
    "Perenniam Agency",
    "Beauty",
    "Investments",
    "Loan Papá",
    "Other",
]


class TransactionBase(BaseModel):
    date: date_type
    description: str
    amount_original: Decimal | None = None
    currency_original: str = "MXN"
    amount_mxn: Decimal
    exchange_rate_used: Decimal | None = None
    category: str
    type: str
    bank_name: str
    notes: str | None = None


class TransactionCreate(TransactionBase):
    manually_added: bool = True
    statement_id: UUID | None = None


class TransactionUpdate(BaseModel):
    date: date_type | None = None
    description: str | None = None
    amount_original: Decimal | None = None
    currency_original: str | None = None
    amount_mxn: Decimal | None = None
    exchange_rate_used: Decimal | None = None
    category: str | None = None
    type: str | None = None
    bank_name: str | None = None
    notes: str | None = None


class TransactionBulkUpdate(BaseModel):
    ids: list[UUID]
    category: str | None = None
    type: str | None = None


class TransactionRead(TransactionBase):
    id: UUID
    month: int
    year: int
    manually_added: bool
    statement_id: UUID | None
    created_at: datetime_type
    original_amount_display: str | None = None

    model_config = ConfigDict(from_attributes=True)


class StatementRead(BaseModel):
    id: UUID
    filename: str
    bank_name: str
    period_start: date_type | None
    period_end: date_type | None
    transaction_count: int
    ignored_count: int
    uploaded_at: datetime_type

    model_config = ConfigDict(from_attributes=True)


class SummaryResponse(BaseModel):
    income: Decimal = Field(default=0)
    expenses: Decimal = Field(default=0)
    net: Decimal = Field(default=0)


class BreakdownItem(BaseModel):
    category: str
    total: Decimal
    count: int
    type: str


class BreakdownResponse(BaseModel):
    income: list[BreakdownItem]
    expenses: list[BreakdownItem]


class UploadResult(BaseModel):
    statements: list[StatementRead]
    inserted_transactions: int
    skipped_duplicates: int
