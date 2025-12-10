"""Ephemeral ECDH helpers for establishing forward secrecy."""

from __future__ import annotations

import hashlib
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.key_lifecycle.manager import get_lifecycle_manager
from backend.models import ContactLink, User
from backend.pfs.models import PFSSession
from backend.utils import helpers
from backend.utils.rate_limit import RateLimiter

_lifecycle = get_lifecycle_manager()
_rate_limiter = RateLimiter(max_requests=5, per_seconds=60)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EphemeralECDHService:
    def __init__(self) -> None:
        self._pending: Dict[str, Tuple[ec.EllipticCurvePrivateKey, float]] = {}
        self._lock = threading.Lock()
        self._ttl_seconds = 120.0

    def _clean(self) -> None:
        now = time.time()
        for session_id, (_, expires) in list(self._pending.items()):
            if now > expires:
                self._pending.pop(session_id, None)

    def start(self, db: Session, initiator: User, peer: User) -> PFSSession:
        if not _rate_limiter.check(str(initiator.id)):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="PFS rate limit exceeded")
        contact = ensure_contact_link(db, initiator, peer)
        if not contact:
            raise HTTPException(status_code=400, detail="No contact link for users")

        private_key = ec.generate_private_key(ec.SECP256R1())
        public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("ascii")

        session = PFSSession(
            initiator_user_id=initiator.id,
            peer_user_id=peer.id,
            server_public_key_pem=public_key,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        with self._lock:
            self._pending[str(session.id)] = (private_key, time.time() + self._ttl_seconds)
            self._clean()

        _lifecycle.record_event(
            db,
            source="PFS",
            event_type="start",
            actor_id=str(initiator.id),
            payload={"peerId": peer.id, "pfsSessionId": session.id},
        )
        return session

    def complete(self, db: Session, session: PFSSession, actor: User, client_public_pem: str) -> dict[str, str]:
        with self._lock:
            pending = self._pending.pop(str(session.id), None)
        if not pending:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="PFS session expired")

        private_key, _ = pending
        client_public_key = serialization.load_pem_public_key(client_public_pem.encode("ascii"))
        if not isinstance(client_public_key, ec.EllipticCurvePublicKey):
            raise HTTPException(status_code=400, detail="Invalid client public key")
        shared_secret = private_key.exchange(ec.ECDH(), client_public_key)
        derived_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"cipherlink-pfs",
        ).derive(shared_secret)

        key_b64 = helpers.b64encode_bytes(derived_key)
        session.shared_key_fingerprint = hashlib.sha256(derived_key).hexdigest()
        session.status = "active"
        session.expires_at = _now() + timedelta(minutes=10)

        link = ensure_contact_link(db, session.initiator, session.peer)
        if not link:
            raise HTTPException(status_code=400, detail="Contact link missing for PFS completion")
        link.session_key_base64 = key_b64

        db.commit()
        db.refresh(session)

        _lifecycle.record_event(
            db,
            source="PFS",
            event_type="established",
            actor_id=str(actor.id),
            payload={"pfsSessionId": session.id, "peerId": session.peer_user_id},
        )

        return {"sessionKeyBase64": key_b64, "pfsSessionId": str(session.id)}


def get_ecdh_service() -> EphemeralECDHService:
    return _ecdh_service


def ensure_contact_link(db: Session, a: User, b: User) -> ContactLink | None:
    return (
        db.query(ContactLink)
        .filter(
            or_(
                and_(ContactLink.user_a_id == a.id, ContactLink.user_b_id == b.id),
                and_(ContactLink.user_a_id == b.id, ContactLink.user_b_id == a.id),
            )
        )
        .first()
    )


_ecdh_service = EphemeralECDHService()
