"""Utility for XORing data with a repeating key."""

from __future__ import annotations


def xor_bytes(data: bytes, key: bytes) -> bytes:
    if not key:
        raise ValueError("Key cannot be empty")
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def xor_hex(plaintext: str, key: str) -> str:
    return xor_bytes(plaintext.encode("utf-8"), key.encode("utf-8")).hex()
