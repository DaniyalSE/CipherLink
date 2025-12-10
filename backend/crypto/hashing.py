"""Hashing utilities."""

from __future__ import annotations

import hashlib

SUPPORTED = {
    "md5": hashlib.md5,
    "sha1": hashlib.sha1,
    "sha256": hashlib.sha256,
    "sha512": hashlib.sha512,
}


def hash_message(message: str, algo: str) -> str:
    algo = algo.lower()
    if algo not in SUPPORTED:
        raise ValueError("Unsupported hashing algorithm")
    digest = SUPPORTED[algo]()
    digest.update(message.encode("utf-8"))
    return digest.hexdigest()
