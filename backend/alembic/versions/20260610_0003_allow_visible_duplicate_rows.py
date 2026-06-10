from alembic import op


revision = "20260610_0003"
down_revision = "20260609_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_transaction_bank_date_amount_desc", "transactions", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_transaction_bank_date_amount_desc",
        "transactions",
        ["bank_name", "date", "amount_mxn", "description"],
    )
