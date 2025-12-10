"""Affine cipher operations."""

from math import gcd

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _validate_a(a: int) -> int:
    if gcd(a, len(ALPHABET)) != 1:
        raise ValueError("Coefficient 'a' must be coprime with alphabet length")
    return a


def encrypt(plaintext: str, a: int, b: int) -> str:
    a = _validate_a(a)
    result = []
    for ch in plaintext:
        if ch.upper() not in ALPHABET:
            result.append(ch)
            continue
        idx = ALPHABET.index(ch.upper())
        cipher_idx = (a * idx + b) % len(ALPHABET)
        cipher = ALPHABET[cipher_idx]
        result.append(cipher if ch.isupper() else cipher.lower())
    return "".join(result)


def decrypt(ciphertext: str, a: int, b: int) -> str:
    a = _validate_a(a)
    result = []
    inv_a = pow(a, -1, len(ALPHABET))
    for ch in ciphertext:
        if ch.upper() not in ALPHABET:
            result.append(ch)
            continue
        idx = ALPHABET.index(ch.upper())
        plain_idx = (inv_a * (idx - b)) % len(ALPHABET)
        plain = ALPHABET[plain_idx]
        result.append(plain if ch.isupper() else plain.lower())
    return "".join(result)
