"""Generic message signature helpers (HMAC-style)."""

from __future__ import annotations

import hmac
import secrets
from hashlib import sha256


def sign(message: str, key: str) -> str:
    mac = hmac.new(key.encode("utf-8"), message.encode("utf-8"), sha256)
    return mac.hexdigest()


def verify(message: str, key: str, signature_hex: str) -> bool:
    expected = sign(message, key)
    return hmac.compare_digest(expected, signature_hex)


def issue_key() -> str:
    return secrets.token_hex(32)
