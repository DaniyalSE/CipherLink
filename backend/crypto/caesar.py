"""Caesar cipher helper matching the SMS repository logic."""

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _shift_char(ch: str, shift: int) -> str:
    if ch.upper() not in ALPHABET:
        return ch
    idx = ALPHABET.index(ch.upper())
    shifted = ALPHABET[(idx + shift) % len(ALPHABET)]
    return shifted if ch.isupper() else shifted.lower()


def encrypt(plaintext: str, shift: int) -> str:
    shift = shift % len(ALPHABET)
    return "".join(_shift_char(ch, shift) for ch in plaintext)


def decrypt(ciphertext: str, shift: int) -> str:
    return encrypt(ciphertext, -shift)
