"""RC4 stream cipher replicating SMS teaching implementation."""

from __future__ import annotations

from typing import Tuple


def ksa(key: bytes) -> list[int]:
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    return s


def prga(s: list[int], length: int) -> bytes:
    i = 0
    j = 0
    output = bytearray()
    for _ in range(length):
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        k = s[(s[i] + s[j]) % 256]
        output.append(k)
    return bytes(output)


def encrypt(key_hex: str, plaintext: str) -> Tuple[str, str]:
    key = bytes.fromhex(key_hex)
    s = ksa(key)
    keystream = prga(s, len(plaintext))
    ciphertext = bytes([p ^ k for p, k in zip(plaintext.encode("utf-8"), keystream)])
    return ciphertext.hex(), keystream.hex()
