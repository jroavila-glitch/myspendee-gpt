from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260702_0008"
down_revision = "20260613_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_classification_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("description_pattern", sa.String(length=120), nullable=False),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("match_type", sa.String(length=20), nullable=True),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_category", sa.String(length=80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_classification_rules_enabled", "user_classification_rules", ["enabled"], unique=False)
    op.create_index(
        "ix_user_classification_rules_description_pattern",
        "user_classification_rules",
        ["description_pattern"],
        unique=False,
    )
    op.create_index(
        "ix_user_classification_rules_bank_name",
        "user_classification_rules",
        ["bank_name"],
        unique=False,
    )
    op.alter_column("user_classification_rules", "enabled", server_default=None)
    op.alter_column("user_classification_rules", "created_at", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_user_classification_rules_bank_name", table_name="user_classification_rules")
    op.drop_index("ix_user_classification_rules_description_pattern", table_name="user_classification_rules")
    op.drop_index("ix_user_classification_rules_enabled", table_name="user_classification_rules")
    op.drop_table("user_classification_rules")
