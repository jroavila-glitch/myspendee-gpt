from alembic import op
import sqlalchemy as sa


revision = "20260611_0006"
down_revision = "20260611_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "statements",
        sa.Column(
            "audit_warnings",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.alter_column("statements", "audit_warnings", server_default=None)


def downgrade() -> None:
    op.drop_column("statements", "audit_warnings")
