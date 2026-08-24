"""Normalize legacy NuBank bank names.

Revision ID: 20260824_0009
Revises: 20260702_0008
Create Date: 2026-08-24
"""

from alembic import op


revision = "20260824_0009"
down_revision = "20260702_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE statements SET bank_name = 'Nu' WHERE bank_name = 'NuBank'")
    op.execute("UPDATE transactions SET bank_name = 'Nu' WHERE bank_name = 'NuBank'")
    op.execute("UPDATE user_classification_rules SET bank_name = 'Nu' WHERE bank_name = 'NuBank'")


def downgrade() -> None:
    # Intentionally non-destructive: existing Nu rows include both proper debit
    # and credit history, so they cannot safely be converted back to NuBank.
    pass
