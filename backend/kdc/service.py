"""Business logic for Key Distribution Center operations."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.crypto import rsa
from backend.kdc.models import KDCSession
from backend.key_lifecycle.manager import get_lifecycle_manager
from backend.models import ContactLink, User
from backend.utils import helpers
from backend.utils.rate_limit import RateLimiter
from backend.utils.secure_store import encrypt_blob

_lifecycle = get_lifecycle_manager()
_rate_limiter = RateLimiter(max_requests=5, per_seconds=60)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_contact(db: Session, sender: User, receiver: User) -> ContactLink:
    contact = (
        db.query(ContactLink)
        .filter(
            or_(
                and_(ContactLink.user_a_id == sender.id, ContactLink.user_b_id == receiver.id),
                and_(ContactLink.user_a_id == receiver.id, ContactLink.user_b_id == sender.id),
            )
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Users are not linked")
    return contact


def _encrypt_for_user(user: User, key_material_b64: str) -> str:
    if user.public_key_pem:
        return rsa.encrypt(user.public_key_pem, key_material_b64)
    # Fallback to server-side envelope encryption
    return encrypt_blob(key_material_b64.encode("utf-8"))


def _fingerprint(key_bytes: bytes) -> str:
    return hashlib.sha256(key_bytes).hexdigest()


def request_limiter(sender_id: str) -> None:
    if not _rate_limiter.check(str(sender_id)):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="KDC rate limit exceeded")


def issue_session(db: Session, sender: User, receiver: User) -> KDCSession:
    request_limiter(sender.id)
    if sender.id == receiver.id:
        raise HTTPException(status_code=400, detail="Cannot request session key with self")

    contact = _ensure_contact(db, sender, receiver)
    key_bytes = secrets.token_bytes(32)
    key_b64 = helpers.b64encode_bytes(key_bytes)

    session = KDCSession(
        sender_id=sender.id,
        receiver_id=receiver.id,
        encrypted_key_for_sender=_encrypt_for_user(sender, key_b64),
        encrypted_key_for_receiver=_encrypt_for_user(receiver, key_b64),
        key_fingerprint=_fingerprint(key_bytes),
    )
    session.mark_distributed()
    db.add(session)

    contact.session_key_base64 = key_b64
    db.commit()
    db.refresh(session)

    _lifecycle.record_event(
        db,
        source="KDC",
        event_type="generated",
        actor_id=str(sender.id),
        kdc_session_id=session.id,
        payload={
            "receiverId": receiver.id,
            "fingerprint": session.key_fingerprint,
        },
    )
    return session


def rotate_session(db: Session, session: KDCSession, actor: User) -> KDCSession:
    key_bytes = secrets.token_bytes(32)
    key_b64 = helpers.b64encode_bytes(key_bytes)
    session.encrypted_key_for_sender = _encrypt_for_user(session.sender, key_b64)
    session.encrypted_key_for_receiver = _encrypt_for_user(session.receiver, key_b64)
    session.key_fingerprint = _fingerprint(key_bytes)
    session.lifecycle_state = "rotated"
    session.status = "active"
    session.expires_at = _now() + timedelta(minutes=30)

    contact = _ensure_contact(db, session.sender, session.receiver)
    contact.session_key_base64 = key_b64
    db.commit()
    db.refresh(session)

    _lifecycle.record_event(
        db,
        source="LIFECYCLE",
        event_type="rotated",
        actor_id=str(actor.id),
        kdc_session_id=session.id,
        payload={"fingerprint": session.key_fingerprint},
    )
    return session


def revoke_session(db: Session, session: KDCSession, actor: User, state: str) -> KDCSession:
    session.mark_revoked(state)
    db.commit()
    db.refresh(session)
    _lifecycle.record_event(
        db,
        source="LIFECYCLE",
        event_type=state,
        actor_id=str(actor.id),
        kdc_session_id=session.id,
        payload={"status": state},
    )
    return session


def session_payload(session: KDCSession) -> dict[str, Any]:
    lifecycle = {
        "generated": session.generated_at.isoformat() if session.generated_at else None,
        "distributed": session.distributed_at.isoformat() if session.distributed_at else None,
        "expires": session.expires_at.isoformat() if session.expires_at else None,
        "status": session.lifecycle_state,
    }
    return {
        "kdcSessionId": session.id,
        "encryptedKeyForSender": session.encrypted_key_for_sender,
        "encryptedKeyForReceiver": session.encrypted_key_for_receiver,
        "keyFingerprint": session.key_fingerprint,
        "lifecycle": lifecycle,
    }
