from pathlib import Path

import pytest
from opennotebook_core.config import Settings
from opennotebook_core.embeddings import FakeEmbedding, HttpEmbeddingProvider, make_embedding
from opennotebook_core.storage import LocalDiskStorage, MemoryStorage, make_storage
from pydantic import ValidationError


def test_defaults() -> None:
    settings = Settings()
    assert settings.embed_dim == 768
    assert settings.llm_provider == "openrouter"


def test_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBED_DIM", "256")
    monkeypatch.setenv("EMBED_BACKEND", "fake")
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    settings = Settings()
    assert settings.embed_dim == 256
    assert isinstance(make_embedding(settings), FakeEmbedding)
    assert isinstance(make_storage(settings), MemoryStorage)


def test_backend_selection(tmp_path: Path) -> None:
    local = Settings(storage_path=tmp_path, storage_backend="local", embed_backend="gemma2")
    assert isinstance(make_storage(local), LocalDiskStorage)
    assert isinstance(make_embedding(local), HttpEmbeddingProvider)
    assert isinstance(make_storage(Settings(storage_backend="memory")), MemoryStorage)


def test_invalid_dimension() -> None:
    with pytest.raises(ValidationError):
        Settings(embed_dim=42)
