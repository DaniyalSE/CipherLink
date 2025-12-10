"""Diffie-Hellman helpers."""

from __future__ import annotations

import secrets

DEFAULT_P = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD", 16
)
DEFAULT_G = 5


def start_exchange(p: int = DEFAULT_P, g: int = DEFAULT_G) -> dict[str, str]:
    private = secrets.randbelow(p - 2) + 1
    public = pow(g, private, p)
    return {
        "private": str(private),
        "public": str(public),
        "p": str(p),
        "g": str(g),
    }


def compute_shared(private: int, other_public: int, p: int = DEFAULT_P) -> str:
    shared = pow(other_public, private, p)
    return hex(shared)
