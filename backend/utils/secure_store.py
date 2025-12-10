"""Utility helpers for encrypting sensitive blobs at rest."""

from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Final

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.config import get_settings

_settings = get_settings()
_KEY: Final[bytes] = hashlib.sha256(_settings.backend_secret.encode("utf-8")).digest()

def _cipher() -> AESGCM:
    return AESGCM(_KEY)

def encrypt_blob(data: bytes) -> str:
    nonce = secrets.token_bytes(12)
    cipher = _cipher()
    ciphertext = cipher.encrypt(nonce, data, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")

def decrypt_blob(token: str) -> bytes:
    raw = base64.b64decode(token.encode("ascii"))
    nonce, ciphertext = raw[:12], raw[12:]
    return _cipher().decrypt(nonce, ciphertext, None)
