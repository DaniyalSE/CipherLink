"""Contact management endpoints."""

from __future__ import annotations

# pyright: reportGeneralTypeIssues=false

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ContactLink, User
from backend.services.socket_manager import socket_manager
from backend.utils import helpers
from backend.utils.security import get_current_user, sha256_hex

logger = logging.getLogger(__name__)
router = APIRouter()


def _pair_ids(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _contact_payload(link: ContactLink, current_user_id: str) -> dict[str, object]:
    peer = link.user_b if link.user_a_id == current_user_id else link.user_a
    if not peer:
        raise HTTPException(status_code=500, detail="Contact link missing peer")
    fingerprint = sha256_hex(link.session_key_base64)[:32]
    online = peer.id in socket_manager.online_users
    created_at = link.created_at or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {
        "linkId": link.id,
        "peer": helpers.as_response_user(peer),
        "status": link.status,
        "createdAt": created_at.isoformat(),
        "sessionKeyBase64": link.session_key_base64,
        "sessionKeyFingerprint": fingerprint,
        "online": online,
    }


class ContactCreateRequest(BaseModel):
    email: EmailStr


@router.get("/contacts")
def list_contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict[str, object]]:
    links = (
        db.query(ContactLink)
        .filter(or_(ContactLink.user_a_id == current_user.id, ContactLink.user_b_id == current_user.id))
        .all()
    )
    return [_contact_payload(link, current_user.id) for link in links]


@router.post("/contacts")
async def add_contact(
    payload: ContactCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    email = helpers.normalize_email(payload.email)
    target = db.query(User).filter(User.email == email).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    user_a_id, user_b_id = _pair_ids(current_user.id, target.id)
    link = (
        db.query(ContactLink)
        .filter(ContactLink.user_a_id == user_a_id, ContactLink.user_b_id == user_b_id)
        .first()
    )

    created = False
    if not link:
        session_key = helpers.b64encode_bytes(os.urandom(32))
        link = ContactLink(
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            session_key_base64=session_key,
            status="accepted",
        )
        db.add(link)
        db.commit()
        db.refresh(link)
        created = True
    elif link.status != "accepted":
        link.status = "accepted"
        db.commit()
        db.refresh(link)

    current_payload = _contact_payload(link, current_user.id)
    target_payload = _contact_payload(link, target.id)

    logger.info(
        "contact_link.%s",
        "created" if created else "synced",
        extra={
            "link_id": link.id,
            "initiator": current_user.id,
            "peer": target.id,
            "status": link.status,
        },
    )

    await socket_manager.emit_contact_update(current_user.id, current_payload)
    await socket_manager.emit_contact_update(target.id, target_payload)

    return current_payload