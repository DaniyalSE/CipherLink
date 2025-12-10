"""Generic helper utilities reused across routers/services."""

from __future__ import annotations

import base64
import secrets
import string
from typing import Any


def normalize_email(email: str) -> str:
    return email.strip().lower()


def username_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0]
    filtered = "".join(ch for ch in local_part if ch.isalnum() or ch in ("-", "_"))
    return filtered or f"user_{secrets.token_hex(3)}"


def secure_token(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def b64encode_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64decode(data: str) -> bytes:
    try:
        return base64.b64decode(data.encode("ascii"), validate=True)
    except Exception as exc:  # pragma: no cover - defensive guard
        raise ValueError("Invalid base64 payload") from exc


def ensure_hex(data: str) -> str:
    try:
        int(data, 16)
    except ValueError as exc:
        raise ValueError("Expected hexadecimal input") from exc
    return data.lower()


def as_response_user(user: Any) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "displayName": user.display_name,
    }
