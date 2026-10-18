"""Add Level 1 notebooks and encrypted user settings.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notebooks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("persona", sa.Text()),
        sa.Column("response_length", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notebooks_user_id", "notebooks", ["user_id"])
    op.create_index("ix_notebooks_user_id_created_at", "notebooks", ["user_id", "created_at"])
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Text(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("chat_model", sa.Text(), nullable=False),
        sa.Column("cheap_model", sa.Text(), nullable=False),
        sa.Column("fallback_model", sa.Text(), nullable=False),
        sa.Column("encrypted_keys", sa.Text()),
        sa.Column("ollama_base_url", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_index("ix_notebooks_user_id_created_at", table_name="notebooks")
    op.drop_index("ix_notebooks_user_id", table_name="notebooks")
    op.drop_table("notebooks")
