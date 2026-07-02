import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text
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
    audit_warnings: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="statement",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_month_year_type", "month", "year", "type"),
        Index("ix_transactions_assigned_month_year_type", "assigned_month", "assigned_year", "type"),
        Index("ix_transactions_bank_name", "bank_name"),
        Index("ix_transactions_category", "category"),
        Index("ix_transactions_source_status", "source_status"),
        Index("ix_transactions_matched_transaction_id", "matched_transaction_id"),
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
    assigned_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manually_added: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_status: Mapped[str] = mapped_column(String(24), default="posted", nullable=False)
    matched_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    statement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("statements.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    statement: Mapped[Statement | None] = relationship(back_populates="transactions")
    allocations: Mapped[list["TransactionAllocation"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TransactionAllocation.position",
    )


class TransactionAllocation(Base):
    __tablename__ = "transaction_allocations"
    __table_args__ = (
        Index("ix_transaction_allocations_transaction_id", "transaction_id"),
        Index("ix_transaction_allocations_category", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    amount_mxn: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_original: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    transaction: Mapped[Transaction] = relationship(back_populates="allocations")


class UserClassificationRule(Base):
    __tablename__ = "user_classification_rules"
    __table_args__ = (
        Index("ix_user_classification_rules_enabled", "enabled"),
        Index("ix_user_classification_rules_description_pattern", "description_pattern"),
        Index("ix_user_classification_rules_bank_name", "bank_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description_pattern: Mapped[str] = mapped_column(String(120), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    match_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_category: Mapped[str] = mapped_column(String(80), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
