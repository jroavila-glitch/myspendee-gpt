from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260323_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "statements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("bank_name", sa.String(length=120), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("transaction_count", sa.Integer(), nullable=False),
        sa.Column("ignored_count", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_statements_uploaded_at", "statements", ["uploaded_at"], unique=False)
    op.create_index("ix_statements_bank_name", "statements", ["bank_name"], unique=False)

    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount_original", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency_original", sa.String(length=8), nullable=False),
        sa.Column("amount_mxn", sa.Numeric(14, 2), nullable=False),
        sa.Column("exchange_rate_used", sa.Numeric(14, 6), nullable=True),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("bank_name", sa.String(length=120), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("manually_added", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("statement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["statement_id"], ["statements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bank_name", "date", "amount_mxn", "description", name="uq_transaction_bank_date_amount_desc"),
    )
    op.create_index("ix_transactions_month_year_type", "transactions", ["month", "year", "type"], unique=False)
    op.create_index("ix_transactions_bank_name", "transactions", ["bank_name"], unique=False)
    op.create_index("ix_transactions_category", "transactions", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_transactions_category", table_name="transactions")
    op.drop_index("ix_transactions_bank_name", table_name="transactions")
    op.drop_index("ix_transactions_month_year_type", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_statements_bank_name", table_name="statements")
    op.drop_index("ix_statements_uploaded_at", table_name="statements")
    op.drop_table("statements")
