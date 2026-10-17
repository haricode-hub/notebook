from pathlib import Path
from typing import Protocol

from opennotebook_core.config import Settings


class StorageBackend(Protocol):
    async def put(self, key: str, data: bytes) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    def url(self, key: str) -> str: ...


class LocalDiskStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        if not key or Path(key).is_absolute() or ".." in Path(key).parts:
            raise ValueError("invalid storage key")
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("invalid storage key")
        return path

    async def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def url(self, key: str) -> str:
        self._path(key)
        return f"/storage/{key}"


class MemoryStorage:
    """Ephemeral storage for tests and local development."""

    def __init__(self) -> None:
        self.items: dict[str, bytes] = {}

    async def put(self, key: str, data: bytes) -> None:
        self.items[key] = data

    async def get(self, key: str) -> bytes:
        return self.items[key]

    async def delete(self, key: str) -> None:
        self.items.pop(key, None)

    def url(self, key: str) -> str:
        return f"/storage/{key}"


def make_storage(settings: Settings) -> StorageBackend:
    if settings.storage_backend == "local":
        return LocalDiskStorage(settings.storage_path)
    if settings.storage_backend == "memory":
        return MemoryStorage()
    raise ValueError(f"unsupported storage backend: {settings.storage_backend}")
