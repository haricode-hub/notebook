"""Add recoverable notebook soft deletion."""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notebooks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_notebooks_deleted_at", "notebooks", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_notebooks_deleted_at", table_name="notebooks")
    op.drop_column("notebooks", "deleted_at")
