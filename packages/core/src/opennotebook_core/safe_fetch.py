"""Bounded public HTTP fetching with DNS pinning and redirect validation."""

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import aiohttp
from aiohttp.abc import AbstractResolver, ResolveResult


class UnsafeURL(ValueError):
    pass


def validate_url(url: str) -> str:
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise UnsafeURL("Only public HTTP or HTTPS URLs are allowed")
    try:
        port = parsed.port
    except ValueError as exc:
        raise UnsafeURL("Invalid URL port") from exc
    if port not in {None, 80, 443}:
        raise UnsafeURL("Only standard HTTP and HTTPS ports are allowed")
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".localhost"):
        raise UnsafeURL("Private or local addresses are not allowed")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return url
    if not address.is_global:
        raise UnsafeURL("Private or local addresses are not allowed")
    return url


class PublicResolver(AbstractResolver):
    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list[ResolveResult]:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not infos:
            raise UnsafeURL("URL host could not be resolved")
        results: list[ResolveResult] = []
        for resolved_family, _, proto, _, sockaddr in infos:
            address = str(sockaddr[0])
            if not ipaddress.ip_address(address).is_global:
                raise UnsafeURL("URL resolves to a private or local address")
            results.append(
                {
                    "hostname": host,
                    "host": address,
                    "port": port,
                    "family": resolved_family,
                    "proto": proto,
                    "flags": 0,
                }
            )
        return results

    async def close(self) -> None:
        return None


async def fetch_public_url(
    url: str, *, max_bytes: int = 5 * 1024 * 1024, timeout_seconds: float = 20
) -> bytes:
    timeout = aiohttp.ClientTimeout(
        total=timeout_seconds, connect=min(5, timeout_seconds), sock_read=min(10, timeout_seconds)
    )
    connector = aiohttp.TCPConnector(resolver=PublicResolver(), use_dns_cache=False, ssl=True)
    async with aiohttp.ClientSession(
        connector=connector, timeout=timeout, trust_env=False
    ) as session:
        for _ in range(6):
            validate_url(url)
            async with session.get(
                url, allow_redirects=False, headers={"Accept": "text/html, text/plain;q=0.9"}
            ) as response:
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    if not location:
                        raise ValueError("Website redirect has no destination")
                    url = urljoin(url, location)
                    continue
                response.raise_for_status()
                if response.content_length and response.content_length > max_bytes:
                    raise ValueError("Website response exceeds the size limit")
                pieces: list[bytes] = []
                total = 0
                async for piece in response.content.iter_chunked(65536):
                    total += len(piece)
                    if total > max_bytes:
                        raise ValueError("Website response exceeds the size limit")
                    pieces.append(piece)
                return b"".join(pieces)
    raise UnsafeURL("Website redirected too many times")
