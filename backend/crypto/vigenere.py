"""Vigenere cipher compatible with SMS lab steps."""

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _normalize_key(key: str) -> str:
    cleaned = "".join(ch for ch in key.upper() if ch in ALPHABET)
    if not cleaned:
        raise ValueError("Key must contain letters")
    return cleaned


def encrypt(plaintext: str, key: str) -> str:
    normalized = _normalize_key(key)
    cipher_chars = []
    key_index = 0
    for ch in plaintext:
        if ch.upper() not in ALPHABET:
            cipher_chars.append(ch)
            continue
        plain_idx = ALPHABET.index(ch.upper())
        shift = ALPHABET.index(normalized[key_index % len(normalized)])
        cipher = ALPHABET[(plain_idx + shift) % len(ALPHABET)]
        cipher_chars.append(cipher if ch.isupper() else cipher.lower())
        key_index += 1
    return "".join(cipher_chars)


def decrypt(ciphertext: str, key: str) -> str:
    normalized = _normalize_key(key)
    plain_chars = []
    key_index = 0
    for ch in ciphertext:
        if ch.upper() not in ALPHABET:
            plain_chars.append(ch)
            continue
        cipher_idx = ALPHABET.index(ch.upper())
        shift = ALPHABET.index(normalized[key_index % len(normalized)])
        plain = ALPHABET[(cipher_idx - shift) % len(ALPHABET)]
        plain_chars.append(plain if ch.isupper() else plain.lower())
        key_index += 1
    return "".join(plain_chars)
