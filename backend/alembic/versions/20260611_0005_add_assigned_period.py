from alembic import op
import sqlalchemy as sa


revision = "20260611_0005"
down_revision = "20260610_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("assigned_month", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("assigned_year", sa.Integer(), nullable=True))
    op.execute("UPDATE transactions SET assigned_month = month, assigned_year = year")
    op.create_index(
        "ix_transactions_assigned_month_year_type",
        "transactions",
        ["assigned_month", "assigned_year", "type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_assigned_month_year_type", table_name="transactions")
    op.drop_column("transactions", "assigned_year")
    op.drop_column("transactions", "assigned_month")
