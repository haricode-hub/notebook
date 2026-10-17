from pathlib import Path

import pytest
from opennotebook_core.storage import LocalDiskStorage


@pytest.mark.asyncio
async def test_put_get_delete(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path)
    await storage.put("user/file.txt", b"hello")
    assert await storage.get("user/file.txt") == b"hello"
    assert storage.url("user/file.txt") == "/storage/user/file.txt"
    await storage.delete("user/file.txt")
    with pytest.raises(FileNotFoundError):
        await storage.get("user/file.txt")


@pytest.mark.asyncio
async def test_delete_missing_is_idempotent(tmp_path: Path) -> None:
    await LocalDiskStorage(tmp_path).delete("missing")


@pytest.mark.parametrize("key", ["../secret", "/absolute", "", "nested/../../secret"])
def test_rejects_unsafe_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValueError):
        LocalDiskStorage(tmp_path).url(key)
