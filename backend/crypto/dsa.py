"""DSA helpers."""

from __future__ import annotations

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import dsa

from backend.utils import helpers


def keygen(key_size: int = 2048) -> dict[str, str]:
    private_key = dsa.generate_private_key(key_size=key_size)
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return {"private": private_pem, "public": public_pem}


def sign(private_pem: str, message: str) -> str:
    private_key = serialization.load_pem_private_key(private_pem.encode("ascii"), password=None)
    signature = private_key.sign(message.encode("utf-8"), hashes.SHA256())
    return helpers.b64encode_bytes(signature)


def verify(public_pem: str, message: str, signature_b64: str) -> bool:
    public_key = serialization.load_pem_public_key(public_pem.encode("ascii"))
    signature = helpers.b64decode(signature_b64)
    try:
        public_key.verify(signature, message.encode("utf-8"), hashes.SHA256())
        return True
    except Exception:
        return False
