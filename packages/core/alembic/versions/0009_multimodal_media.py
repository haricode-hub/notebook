"""Store page-anchored figure embeddings for optional multimodal retrieval."""

import os

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dimension = int(os.getenv("EMBED_DIM", "768"))
    op.create_table(
        "media_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(length=36),
            sa.ForeignKey("sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "notebook_id",
            sa.String(length=36),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("text_anchor", sa.Text(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("bbox", sa.JSON(), nullable=True),
        sa.Column("modality", sa.String(length=16), nullable=False, server_default="image"),
        sa.Column("embedding", Vector(dimension), nullable=False),
    )
    op.create_index("ix_media_items_notebook_source", "media_items", ["notebook_id", "source_id"])
    op.create_index(
        "ix_media_items_embedding_hnsw",
        "media_items",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_media_items_embedding_hnsw", table_name="media_items")
    op.drop_index("ix_media_items_notebook_source", table_name="media_items")
    op.drop_table("media_items")
