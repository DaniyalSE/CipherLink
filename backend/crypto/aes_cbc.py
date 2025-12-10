"""AES-CBC helpers using the cryptography library."""

from __future__ import annotations

import os
from typing import Tuple

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from backend.utils import helpers

BLOCK_SIZE = 128  # bits


def _get_cipher(key: bytes, iv: bytes) -> Cipher:
    return Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())


def encrypt(plaintext: str, key: bytes, iv: bytes | None = None) -> Tuple[str, str, bool]:
    iv = iv or os.urandom(16)
    padder = padding.PKCS7(BLOCK_SIZE).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    encryptor = _get_cipher(key, iv).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return helpers.b64encode_bytes(ciphertext), helpers.b64encode_bytes(iv), True


def decrypt(ciphertext_b64: str, key: bytes, iv_b64: str) -> str:
    ciphertext = helpers.b64decode(ciphertext_b64)
    iv = helpers.b64decode(iv_b64)
    decryptor = _get_cipher(key, iv).decryptor()
    padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = padding.PKCS7(BLOCK_SIZE).unpadder()
    plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()
    return plaintext.decode("utf-8")
