"""Security helpers for hashing and cryptographic fingerprints."""

from __future__ import annotations

import hashlib
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from passlib.context import CryptContext

try:  # Ensure passlib sees a version attribute even if wheel omits __about__
    import bcrypt as _bcrypt  # type: ignore

    if not hasattr(_bcrypt, "__about__"):
        class _BcryptAbout:  # pragma: no cover - best-effort compatibility shim
            __version__ = getattr(_bcrypt, "__version__", "0")

        _bcrypt.__about__ = _BcryptAbout()  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - bcrypt import issues will surface later
    _bcrypt = None

from backend.database import get_db
from backend.models import User
from backend.services.jwt_service import decode_token
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def fingerprint_pem(pem: str) -> str:
    """Return SSH-style SHA256 fingerprint for a PEM block."""
    lines = [line for line in pem.splitlines() if not line.startswith("---")]
    raw = "".join(lines)
    digest = hashlib.sha256(raw.encode("ascii")).digest()
    return "SHA256:" + digest.hex()

def _extract_bearer(authorization: Optional[str]) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> User:
    token = _extract_bearer(authorization)
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
