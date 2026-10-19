from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from typing import Any

import boto3
import pytest
from opennotebook_core.config import Settings
from opennotebook_core.storage import S3Storage, make_storage


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, float]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes) -> None:
        self.objects[Key] = (Body, datetime.now(UTC).timestamp())

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:
        return {"Body": BytesIO(self.objects[Key][0])}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.objects.pop(Key, None)

    def get_paginator(self, operation: str) -> FakeS3Client:
        assert operation == "list_objects_v2"
        return self

    def paginate(self, *, Bucket: str) -> list[dict[str, Any]]:
        return [
            {
                "Contents": [
                    {"Key": key, "LastModified": datetime.fromtimestamp(ts, UTC)}
                    for key, (_, ts) in self.objects.items()
                ]
            }
        ]


@pytest.mark.asyncio
async def test_s3_storage_object_lifecycle_and_signed_url(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeS3Client()
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: client)
    storage = S3Storage(
        endpoint_url="http://minio:9000",
        bucket="test",
        access_key="access",
        secret_key="secret",
    )
    await storage.put("sources/u1/s1.pdf", b"pdf-bytes")
    assert await storage.get("sources/u1/s1.pdf") == b"pdf-bytes"
    assert "sources/u1/s1.pdf" in await storage.list_objects()
    assert storage.url(
        "sources/u1/s1.pdf", user_id="u1", source_id="s1", expires_at=2_000_000_000,
        signing_key="signing-secret",
    ).startswith("/files/")
    await storage.delete("sources/u1/s1.pdf")
    assert await storage.list_objects() == {}


def test_s3_storage_rejects_traversal_and_factory_uses_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeS3Client()
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: client)
    storage = make_storage(
        Settings(
            storage_backend="s3",
            s3_bucket="test",
            s3_access_key="access",
            s3_secret_key="secret",
        )
    )
    assert isinstance(storage, S3Storage)
    with pytest.raises(ValueError, match="invalid storage key"):
        storage.url(
            "../escape",
            user_id="u",
            source_id="s",
            expires_at=2_000_000_000,
            signing_key="x",
        )
