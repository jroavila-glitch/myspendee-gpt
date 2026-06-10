from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260610_0004"
down_revision = "20260610_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_allocations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("amount_mxn", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount_original", sa.Numeric(14, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transaction_allocations_transaction_id",
        "transaction_allocations",
        ["transaction_id"],
        unique=False,
    )
    op.create_index(
        "ix_transaction_allocations_category",
        "transaction_allocations",
        ["category"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_transaction_allocations_category", table_name="transaction_allocations")
    op.drop_index("ix_transaction_allocations_transaction_id", table_name="transaction_allocations")
    op.drop_table("transaction_allocations")
