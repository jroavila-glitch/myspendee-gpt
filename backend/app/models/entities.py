import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Statement(Base):
    __tablename__ = "statements"
    __table_args__ = (
        Index("ix_statements_uploaded_at", "uploaded_at"),
        Index("ix_statements_bank_name", "bank_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ignored_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="statement",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("bank_name", "date", "amount_mxn", "description", name="uq_transaction_bank_date_amount_desc"),
        Index("ix_transactions_month_year_type", "month", "year", "type"),
        Index("ix_transactions_bank_name", "bank_name"),
        Index("ix_transactions_category", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount_original: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency_original: Mapped[str] = mapped_column(String(8), default="MXN", nullable=False)
    amount_mxn: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    exchange_rate_used: Mapped[Decimal | None] = mapped_column(Numeric(14, 6), nullable=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    manually_added: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    statement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("statements.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    statement: Mapped[Statement | None] = relationship(back_populates="transactions")
