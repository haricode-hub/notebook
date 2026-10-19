import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import time
from pathlib import Path
from typing import Any, Protocol

from opennotebook_core.config import Settings


class StorageBackend(Protocol):
    async def put(self, key: str, data: bytes) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    async def list_objects(self) -> dict[str, float]: ...
    def url(
        self, key: str, *, user_id: str, source_id: str, expires_at: int, signing_key: str
    ) -> str: ...


def signed_file_url(
    key: str, *, user_id: str, source_id: str, expires_at: int, signing_key: str
) -> str:
    if not signing_key:
        raise ValueError("File URL signing key is required")
    payload = json.dumps(
        {"k": key, "u": user_id, "s": source_id, "e": expires_at}, separators=(",", ":")
    ).encode()
    body = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(signing_key.encode(), body, hashlib.sha256).digest()
    token = body + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")
    return "/files/" + token.decode("ascii")


def verify_file_token(token: str, *, user_id: str, signing_key: str) -> tuple[str, str]:
    try:
        body, signature = token.encode("ascii").split(b".", 1)
        expected = hmac.new(signing_key.encode(), body, hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(signature + b"=" * (-len(signature) % 4))
        if not signing_key or not hmac.compare_digest(actual, expected):
            raise ValueError("Invalid file signature")
        data = json.loads(base64.urlsafe_b64decode(body + b"=" * (-len(body) % 4)))
        if data["u"] != user_id or int(data["e"]) <= time.time():
            raise ValueError("File URL expired or belongs to another user")
        key, source_id = data["k"], data["s"]
        if not isinstance(key, str) or not isinstance(source_id, str):
            raise ValueError("Invalid file URL")
        return key, source_id
    except (binascii.Error, KeyError, TypeError, UnicodeError, ValueError) as exc:
        raise ValueError("Invalid or expired file URL") from exc


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

    async def list_objects(self) -> dict[str, float]:
        if not self.root.exists():
            return {}
        return {
            path.relative_to(self.root).as_posix(): path.stat().st_mtime
            for path in self.root.rglob("*")
            if path.is_file()
        }

    def url(
        self, key: str, *, user_id: str, source_id: str, expires_at: int, signing_key: str
    ) -> str:
        self._path(key)
        return signed_file_url(
            key,
            user_id=user_id,
            source_id=source_id,
            expires_at=expires_at,
            signing_key=signing_key,
        )


class MemoryStorage:
    """Ephemeral storage for tests and local development."""

    def __init__(self) -> None:
        self.items: dict[str, bytes] = {}
        self.created_at: dict[str, float] = {}

    async def put(self, key: str, data: bytes) -> None:
        self.items[key] = data
        self.created_at[key] = time.time()

    async def get(self, key: str) -> bytes:
        return self.items[key]

    async def delete(self, key: str) -> None:
        self.items.pop(key, None)
        self.created_at.pop(key, None)

    async def list_objects(self) -> dict[str, float]:
        return dict(self.created_at)

    def url(
        self, key: str, *, user_id: str, source_id: str, expires_at: int, signing_key: str
    ) -> str:
        return signed_file_url(
            key,
            user_id=user_id,
            source_id=source_id,
            expires_at=expires_at,
            signing_key=signing_key,
        )


class S3Storage:
    """S3-compatible object storage; boto3 I/O runs off the event loop."""

    def __init__(
        self,
        *,
        endpoint_url: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
    ):
        if not bucket or not access_key or not secret_key:
            raise ValueError("S3 bucket and credentials are required")
        import boto3  # type: ignore[import-untyped]

        self.bucket = bucket
        self.client: Any = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    @staticmethod
    def _validate_key(key: str) -> None:
        segments = key.replace("\\", "/").split("/")
        if not key or key.startswith(("/", "\\")) or ".." in segments:
            raise ValueError("invalid storage key")

    async def put(self, key: str, data: bytes) -> None:
        self._validate_key(key)
        await asyncio.to_thread(
            self.client.put_object, Bucket=self.bucket, Key=key, Body=data
        )

    async def get(self, key: str) -> bytes:
        self._validate_key(key)
        result = await asyncio.to_thread(
            self.client.get_object, Bucket=self.bucket, Key=key
        )

        def read_and_close() -> bytes:
            try:
                return bytes(result["Body"].read())
            finally:
                result["Body"].close()

        return await asyncio.to_thread(read_and_close)

    async def delete(self, key: str) -> None:
        self._validate_key(key)
        await asyncio.to_thread(
            self.client.delete_object, Bucket=self.bucket, Key=key
        )

    async def list_objects(self) -> dict[str, float]:
        def list_keys() -> dict[str, float]:
            paginator = self.client.get_paginator("list_objects_v2")
            result: dict[str, float] = {}
            for page in paginator.paginate(Bucket=self.bucket):
                for item in page.get("Contents", []):
                    result[str(item["Key"])] = item["LastModified"].timestamp()
            return result

        return await asyncio.to_thread(list_keys)

    def url(
        self, key: str, *, user_id: str, source_id: str, expires_at: int, signing_key: str
    ) -> str:
        self._validate_key(key)
        return signed_file_url(
            key,
            user_id=user_id,
            source_id=source_id,
            expires_at=expires_at,
            signing_key=signing_key,
        )


def make_storage(settings: Settings) -> StorageBackend:
    if settings.storage_backend == "local":
        return LocalDiskStorage(settings.storage_path)
    if settings.storage_backend == "memory":
        return MemoryStorage()
    if settings.storage_backend == "s3":
        return S3Storage(
            endpoint_url=settings.s3_endpoint_url,
            bucket=settings.s3_bucket,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            region=settings.s3_region,
        )
    raise ValueError(f"unsupported storage backend: {settings.storage_backend}")
