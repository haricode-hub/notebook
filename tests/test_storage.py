from pathlib import Path
from time import time

import pytest
from opennotebook_core.storage import LocalDiskStorage, verify_file_token


@pytest.mark.asyncio
async def test_put_get_delete(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path)
    await storage.put("user/file.txt", b"hello")
    assert await storage.get("user/file.txt") == b"hello"
    signed = storage.url(
        "user/file.txt",
        user_id="user",
        source_id="source",
        expires_at=int(time()) + 60,
        signing_key="secret",
    )
    assert verify_file_token(
        signed.removeprefix("/files/"), user_id="user", signing_key="secret"
    ) == ("user/file.txt", "source")
    await storage.delete("user/file.txt")
    with pytest.raises(FileNotFoundError):
        await storage.get("user/file.txt")


@pytest.mark.asyncio
async def test_delete_missing_is_idempotent(tmp_path: Path) -> None:
    await LocalDiskStorage(tmp_path).delete("missing")


@pytest.mark.parametrize("key", ["../secret", "/absolute", "", "nested/../../secret"])
def test_rejects_unsafe_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValueError):
        LocalDiskStorage(tmp_path).url(
            key,
            user_id="user",
            source_id="source",
            expires_at=int(time()) + 60,
            signing_key="secret",
        )
