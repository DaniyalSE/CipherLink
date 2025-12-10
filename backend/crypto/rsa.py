"""RSA helpers built with cryptography primitives."""

from __future__ import annotations

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from backend.utils import helpers, security


def generate_keypair(bits: int) -> dict[str, str]:
    if bits < 2048:
        raise ValueError("Key size must be at least 2048 bits")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
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
        "private_pem": private_pem,
        "public_pem": public_pem,
        "fingerprint": security.fingerprint_pem(public_pem),
    }


def _load_public(public_pem: str) -> rsa.RSAPublicKey:
    key = serialization.load_pem_public_key(public_pem.encode("ascii"))
    if not isinstance(key, rsa.RSAPublicKey):
        raise TypeError("Expected RSA public key")
    return key


def _load_private(private_pem: str) -> rsa.RSAPrivateKey:
    key = serialization.load_pem_private_key(private_pem.encode("ascii"), password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise TypeError("Expected RSA private key")
    return key


def encrypt(public_pem: str, plaintext: str) -> str:
    public_key = _load_public(public_pem)
    ciphertext = public_key.encrypt(
        plaintext.encode("utf-8"),
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )
    return helpers.b64encode_bytes(ciphertext)


def decrypt(private_pem: str, ciphertext_b64: str) -> str:
    private_key = _load_private(private_pem)
    ciphertext = helpers.b64decode(ciphertext_b64)
    plaintext = private_key.decrypt(
        ciphertext,
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )
    return plaintext.decode("utf-8")


def sign(private_pem: str, message: str) -> str:
    private_key = _load_private(private_pem)
    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
        hashes.SHA256(),
    )
    return helpers.b64encode_bytes(signature)


def verify(public_pem: str, message: str, signature_b64: str) -> bool:
    public_key = _load_public(public_pem)
    signature = helpers.b64decode(signature_b64)
    try:
        public_key.verify(
            signature,
            message.encode("utf-8"),
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False
