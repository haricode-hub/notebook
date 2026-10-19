"""Add timestamp anchors and sharing support."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chunks", sa.Column("time_start", sa.Float(), nullable=True))
    op.add_column("chunks", sa.Column("time_end", sa.Float(), nullable=True))
    op.create_table(
        "notebook_shares",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "notebook_id",
            sa.String(length=36),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_notebook_shares_notebook_user", "notebook_shares", ["notebook_id", "user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_notebook_shares_notebook_user", table_name="notebook_shares")
    op.drop_table("notebook_shares")
    op.drop_column("chunks", "time_end")
    op.drop_column("chunks", "time_start")
