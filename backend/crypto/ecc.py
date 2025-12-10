"""ECC (ECDSA) helpers."""

from __future__ import annotations

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from backend.utils import helpers, security


def keygen() -> dict[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
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

    return {
        "public": public_pem,
        "private": private_pem,
        "fingerprint": security.fingerprint_pem(public_pem),
    }


def _load_private(private_pem: str) -> ec.EllipticCurvePrivateKey:
    key = serialization.load_pem_private_key(private_pem.encode("ascii"), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise TypeError("Expected EC private key")
    return key


def _load_public(public_pem: str) -> ec.EllipticCurvePublicKey:
    key = serialization.load_pem_public_key(public_pem.encode("ascii"))
    if not isinstance(key, ec.EllipticCurvePublicKey):
        raise TypeError("Expected EC public key")
    return key


def sign(private_pem: str, message: str) -> str:
    private_key = _load_private(private_pem)
    signature = private_key.sign(message.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    return helpers.b64encode_bytes(signature)


def verify(public_pem: str, message: str, signature_b64: str) -> bool:
    public_key = _load_public(public_pem)
    signature = helpers.b64decode(signature_b64)
    try:
        public_key.verify(signature, message.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False
