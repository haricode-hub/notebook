import asyncio
import time
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from opennotebook_core.config import Settings

ALGORITHMS = ["EdDSA", "ES256", "RS256", "PS256"]
bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    role: str = "user"


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )


class JWKSVerifier:
    def __init__(self, settings: Settings, ttl_seconds: int = 300):
        self.settings = settings
        self.ttl_seconds = ttl_seconds
        self._keys: dict[str, dict[str, Any]] = {}
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def _download(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(self.settings.jwks_url)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            return payload

    async def _refresh(self, force: bool = False) -> None:
        async with self._lock:
            if not force and self._keys and time.monotonic() < self._expires_at:
                return
            payload = await self._download()
            keys = payload.get("keys")
            if not isinstance(keys, list):
                raise ValueError("Invalid JWKS")
            parsed = {
                key["kid"]: key
                for key in keys
                if isinstance(key, dict) and isinstance(key.get("kid"), str)
            }
            self._keys = parsed
            self._expires_at = time.monotonic() + self.ttl_seconds

    async def verify(self, token: str) -> CurrentUser:
        try:
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            alg = header.get("alg")
            if not isinstance(kid, str) or alg not in ALGORITHMS:
                raise ValueError("Unsupported token header")
            await self._refresh()
            if kid not in self._keys:
                await self._refresh(force=True)
            jwk = self._keys.get(kid)
            if jwk is None or jwk.get("alg", alg) != alg:
                raise ValueError("Unknown signing key")
            key = jwt.PyJWK.from_dict(jwk, algorithm=alg).key
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience=self.settings.jwt_audience,
                issuer=self.settings.jwt_issuer,
                leeway=10,
                options={"require": ["sub", "exp", "iss", "aud"]},
            )
            sub = claims.get("sub")
            if not isinstance(sub, str) or not sub:
                raise ValueError("Missing subject")
            role = claims.get("role")
            return CurrentUser(id=sub, role=role if isinstance(role, str) else "user")
        except (httpx.HTTPError, jwt.PyJWTError, ValueError, KeyError, TypeError) as exc:
            raise unauthorized() from exc


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    verifier: JWKSVerifier = request.app.state.jwks_verifier
    return await verifier.verify(credentials.credentials)
