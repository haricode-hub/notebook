"""Persist flashcard scheduling and quiz attempts.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "flashcard_progress",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "artifact_id",
            sa.String(36),
            sa.ForeignKey("artifacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("card_index", sa.Integer(), nullable=False),
        sa.Column("box", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("due_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_result", sa.String(16)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "artifact_id", "user_id", "card_index", name="uq_flashcard_progress_card"
        ),
    )
    op.create_index(
        "ix_flashcard_progress_user_artifact", "flashcard_progress", ["user_id", "artifact_id"]
    )
    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "artifact_id",
            sa.String(36),
            sa.ForeignKey("artifacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("answers_json", sa.JSON(), nullable=False),
        sa.Column("wrong_indices", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_quiz_attempts_user_artifact", "quiz_attempts", ["user_id", "artifact_id"])


def downgrade() -> None:
    op.drop_table("quiz_attempts")
    op.drop_table("flashcard_progress")
