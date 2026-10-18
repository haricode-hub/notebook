"""Selected sources and persisted grounded chat messages.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sources",
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "notebook_id",
            sa.String(36),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations_json", sa.JSON(), nullable=False),
        sa.Column("model_name", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_chat_messages_notebook_user_created",
        "chat_messages",
        ["notebook_id", "user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_column("sources", "selected")
