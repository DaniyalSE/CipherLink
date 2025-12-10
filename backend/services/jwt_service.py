"""JWT helper utilities."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

from backend.config import get_settings

settings = get_settings()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(subject: str, expires_minutes: int | None = None, extra_claims: Dict[str, Any] | None = None) -> str:
    payload: Dict[str, Any] = {
        "sub": subject,
        "iat": int(_now().timestamp()),
    }
    expires_in = expires_minutes or settings.access_token_exp_minutes
    payload["exp"] = int((_now() + timedelta(minutes=expires_in)).timestamp())
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.backend_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.backend_secret, algorithms=[settings.jwt_algorithm])
