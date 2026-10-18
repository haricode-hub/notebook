"""Source ingestion tables and search indexes.

Revision ID: 0003
Revises: 0002
"""

import os

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import TSVECTOR

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("stage", sa.Text()))
    op.add_column("jobs", sa.Column("progress", sa.Integer(), nullable=False, server_default="0"))
    dim = int(os.environ.get("EMBED_DIM", "768"))
    if dim not in {128, 256, 512, 768}:
        raise ValueError("unsupported EMBED_DIM")
    op.create_table(
        "sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "notebook_id",
            sa.String(36),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("mime_type", sa.Text()),
        sa.Column("url", sa.Text()),
        sa.Column("storage_key", sa.Text()),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("extracted_text", sa.Text()),
        sa.Column("page_count", sa.Integer()),
        sa.Column("embedding_model", sa.Text()),
        sa.Column("embedding_dim", sa.Integer()),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sources_notebook_id_status", "sources", ["notebook_id", "status"])
    op.create_index("ix_sources_user_id", "sources", ["user_id"])
    op.create_table(
        "chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(36),
            sa.ForeignKey("sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "notebook_id",
            sa.String(36),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("page_start", sa.Integer()),
        sa.Column("page_end", sa.Integer()),
        sa.Column("char_start", sa.Integer(), nullable=False),
        sa.Column("char_end", sa.Integer(), nullable=False),
        sa.Column("heading_path", sa.JSON(), nullable=False),
        sa.Column("embedding", Vector(dim), nullable=False),
        sa.Column("tsv", TSVECTOR()),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_chunks_source_ordinal", "chunks", ["source_id", "ordinal"], unique=True)
    op.create_index("ix_chunks_notebook_id", "chunks", ["notebook_id"])
    op.create_index(
        "ix_chunks_embedding_hnsw",
        "chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.create_index("ix_chunks_tsv_gin", "chunks", ["tsv"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_table("chunks")
    op.drop_table("sources")
    op.drop_column("jobs", "progress")
    op.drop_column("jobs", "stage")
