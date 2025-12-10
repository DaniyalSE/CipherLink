"""Crypto lab endpoints."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.crypto import aes_cbc, certificate, dh, dsa, ecc, elgamal, hashing, prg, rc4, rsa
from backend.database import get_db
from backend.key_lifecycle.manager import get_lifecycle_manager
from backend.key_lifecycle.models import KeyEvent
from backend.utils import helpers
from backend.utils.security import get_current_user

router = APIRouter()


class HashRequest(BaseModel):
    algo: str
    message: str


@router.post("/crypto/hash")
def hash_message(payload: HashRequest, user=Depends(get_current_user)) -> dict[str, str]:
    digest = hashing.hash_message(payload.message, payload.algo)
    return {"digest": digest}


class AesEncryptRequest(BaseModel):
    plaintext: str
    key_base64: str = Field(description="Base64-encoded 16/24/32 byte key")
    iv_base64: str | None = None


@router.post("/crypto/aes/encrypt")
def aes_encrypt(payload: AesEncryptRequest, user=Depends(get_current_user)) -> dict[str, Any]:
    key = helpers.b64decode(payload.key_base64)
    iv = helpers.b64decode(payload.iv_base64) if payload.iv_base64 else None
    ciphertext, iv_b64, padded = aes_cbc.encrypt(payload.plaintext, key, iv)
    return {
        "ciphertext_base64": ciphertext,
        "iv_base64": iv_b64,
        "padded": padded,
    }


class AesDecryptRequest(BaseModel):
    ciphertext_base64: str
    key_base64: str
    iv_base64: str


@router.post("/crypto/aes/decrypt")
def aes_decrypt(payload: AesDecryptRequest, user=Depends(get_current_user)) -> dict[str, str]:
    key = helpers.b64decode(payload.key_base64)
    plaintext = aes_cbc.decrypt(payload.ciphertext_base64, key, payload.iv_base64)
    return {"plaintext": plaintext}


class Rc4Request(BaseModel):
    key_hex: str
    plaintext: str


@router.post("/crypto/rc4")
def rc4_encrypt(payload: Rc4Request, user=Depends(get_current_user)) -> dict[str, str]:
    ciphertext_hex, keystream_hex = rc4.encrypt(payload.key_hex, payload.plaintext)
    return {"ciphertext_hex": ciphertext_hex, "keystream_hex": keystream_hex}


class PrgRequest(BaseModel):
    seed: int
    length: int


@router.post("/crypto/prg")
def generate_prg(payload: PrgRequest, user=Depends(get_current_user)) -> dict[str, str]:
    stream_hex = prg.generate(payload.seed, payload.length)
    return {"stream_hex": stream_hex}


class RsaKeygenRequest(BaseModel):
    bits: int = 2048


@router.post("/crypto/rsa/keygen")
def rsa_keygen(payload: RsaKeygenRequest, user=Depends(get_current_user)) -> dict[str, str]:
    keypair = rsa.generate_keypair(bits=payload.bits)
    return {
        "public_pem": keypair["public_pem"],
        "private_pem": keypair["private_pem"],
        "fingerprint": keypair["fingerprint"],
    }


class RsaEncryptRequest(BaseModel):
    public_pem: str
    plaintext: str


@router.post("/crypto/rsa/encrypt")
def rsa_encrypt(payload: RsaEncryptRequest, user=Depends(get_current_user)) -> dict[str, str]:
    ciphertext = rsa.encrypt(payload.public_pem, payload.plaintext)
    return {"ciphertext_base64": ciphertext}


class RsaDecryptRequest(BaseModel):
    private_pem: str
    ciphertext_base64: str


@router.post("/crypto/rsa/decrypt")
def rsa_decrypt(payload: RsaDecryptRequest, user=Depends(get_current_user)) -> dict[str, str]:
    plaintext = rsa.decrypt(payload.private_pem, payload.ciphertext_base64)
    return {"plaintext": plaintext}


class RsaSignRequest(BaseModel):
    private_pem: str
    message: str


@router.post("/crypto/rsa/sign")
def rsa_sign(payload: RsaSignRequest, user=Depends(get_current_user)) -> dict[str, str]:
    signature = rsa.sign(payload.private_pem, payload.message)
    return {"signature_base64": signature}


class RsaVerifyRequest(BaseModel):
    public_pem: str
    message: str
    signature_base64: str


@router.post("/crypto/rsa/verify")
def rsa_verify(payload: RsaVerifyRequest, user=Depends(get_current_user)) -> dict[str, bool]:
    valid = rsa.verify(payload.public_pem, payload.message, payload.signature_base64)
    return {"valid": valid}


@router.post("/crypto/elgamal/keygen")
def elgamal_keygen(user=Depends(get_current_user)) -> dict[str, Dict[str, str]]:
    return elgamal.keygen()


class ElGamalEncryptRequest(BaseModel):
    public: Dict[str, str]
    message: str


@router.post("/crypto/elgamal/encrypt")
def elgamal_encrypt(payload: ElGamalEncryptRequest, user=Depends(get_current_user)) -> dict[str, Dict[str, str]]:
    cipher = elgamal.encrypt(payload.public, payload.message)
    return {"cipher_struct": cipher}


class ElGamalDecryptRequest(BaseModel):
    private: Dict[str, str]
    cipher_struct: Dict[str, str]


@router.post("/crypto/elgamal/decrypt")
def elgamal_decrypt(payload: ElGamalDecryptRequest, user=Depends(get_current_user)) -> dict[str, str]:
    message = elgamal.decrypt(payload.private, payload.cipher_struct)
    return {"message": message}


@router.post("/crypto/ecc/keygen")
def ecc_keygen(user=Depends(get_current_user)) -> dict[str, str]:
    return ecc.keygen()


class EccSignRequest(BaseModel):
    private: str
    message: str


@router.post("/crypto/ecc/sign")
def ecc_sign(payload: EccSignRequest, user=Depends(get_current_user)) -> dict[str, str]:
    signature = ecc.sign(payload.private, payload.message)
    return {"signature": signature}


class EccVerifyRequest(BaseModel):
    public: str
    message: str
    signature: str


@router.post("/crypto/ecc/verify")
def ecc_verify(payload: EccVerifyRequest, user=Depends(get_current_user)) -> dict[str, bool]:
    valid = ecc.verify(payload.public, payload.message, payload.signature)
    return {"valid": valid}


@router.post("/crypto/dh/start")
def dh_start(user=Depends(get_current_user)) -> dict[str, str]:
    return dh.start_exchange()


class DhComputeRequest(BaseModel):
    private: int
    other_public: int


@router.post("/crypto/dh/compute")
def dh_compute(payload: DhComputeRequest, user=Depends(get_current_user)) -> dict[str, str]:
    shared = dh.compute_shared(payload.private, payload.other_public)
    return {"shared_key": shared}


class CertificateRequest(BaseModel):
    subject_info: Dict[str, str]


@router.post("/crypto/certificate/create")
def create_certificate(payload: CertificateRequest, user=Depends(get_current_user)) -> dict[str, str]:
    return certificate.create_self_signed(payload.subject_info)


@router.post("/crypto/dsa/keygen")
def dsa_keypair(user=Depends(get_current_user)) -> dict[str, str]:
    return dsa.keygen()


class DsaSignRequest(BaseModel):
    private: str
    message: str


@router.post("/crypto/dsa/sign")
def dsa_sign(payload: DsaSignRequest, user=Depends(get_current_user)) -> dict[str, str]:
    return {"signature": dsa.sign(payload.private, payload.message)}


class DsaVerifyRequest(BaseModel):
    public: str
    message: str
    signature: str


@router.post("/crypto/dsa/verify")
def dsa_verify(payload: DsaVerifyRequest, user=Depends(get_current_user)) -> dict[str, bool]:
    return {"valid": dsa.verify(payload.public, payload.message, payload.signature)}


@router.get("/crypto/logs")
def crypto_logs(
    limit: int = Query(default=100, ge=1, le=500),
    sources: list[str] | None = Query(default=None, alias="source"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> list[dict[str, Any]]:
    manager = get_lifecycle_manager()
    query = db.query(KeyEvent)
    if sources:
        query = query.filter(KeyEvent.source.in_([source.upper() for source in sources]))
    events = query.order_by(KeyEvent.created_at.desc()).limit(limit).all()
    return manager.serialize_many(events)
