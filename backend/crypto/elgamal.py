"""ElGamal implementation compatible with SMS style labs."""

from __future__ import annotations

import secrets

DEFAULT_P = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD", 16
)
DEFAULT_G = 2


def _message_to_int(message: str) -> int:
    data = message.encode("utf-8")
    return int.from_bytes(data, "big")


def _int_to_message(value: int) -> str:
    length = (value.bit_length() + 7) // 8
    data = value.to_bytes(length or 1, "big")
    return data.decode("utf-8", errors="ignore")


def keygen(p: int = DEFAULT_P, g: int = DEFAULT_G) -> dict[str, dict[str, str]]:
    x = secrets.randbelow(p - 2) + 1  # private
    y = pow(g, x, p)
    return {
        "public": {"p": str(p), "g": str(g), "y": str(y)},
        "private": {"p": str(p), "g": str(g), "x": str(x)},
    }


def encrypt(public: dict[str, str], message: str) -> dict[str, str]:
    p = int(public["p"])
    g = int(public["g"])
    y = int(public["y"])

    m_int = _message_to_int(message)
    if m_int >= p:
        raise ValueError("Message too large for selected prime")

    k = secrets.randbelow(p - 2) + 1
    c1 = pow(g, k, p)
    s = pow(y, k, p)
    c2 = (m_int * s) % p
    return {"c1": hex(c1), "c2": hex(c2)}


def decrypt(private: dict[str, str], cipher_struct: dict[str, str]) -> str:
    p = int(private["p"])
    x = int(private["x"])
    c1 = int(cipher_struct["c1"], 16)
    c2 = int(cipher_struct["c2"], 16)

    s = pow(c1, x, p)
    s_inv = pow(s, -1, p)
    m = (c2 * s_inv) % p
    return _int_to_message(m)
