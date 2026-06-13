from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260613_0007"
down_revision = "20260611_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("source_status", sa.String(length=24), nullable=False, server_default="posted"),
    )
    op.add_column(
        "transactions",
        sa.Column("matched_transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_matched_transaction_id",
        "transactions",
        "transactions",
        ["matched_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_transactions_source_status", "transactions", ["source_status"], unique=False)
    op.create_index(
        "ix_transactions_matched_transaction_id",
        "transactions",
        ["matched_transaction_id"],
        unique=False,
    )
    op.alter_column("transactions", "source_status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_transactions_matched_transaction_id", table_name="transactions")
    op.drop_index("ix_transactions_source_status", table_name="transactions")
    op.drop_constraint("fk_transactions_matched_transaction_id", "transactions", type_="foreignkey")
    op.drop_column("transactions", "matched_transaction_id")
    op.drop_column("transactions", "source_status")
