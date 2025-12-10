"""User and key management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.crypto import rsa
from backend.database import get_db
from backend.models import User
from backend.services.socket_manager import socket_manager
from backend.utils.helpers import as_response_user
from backend.utils.security import get_current_user

router = APIRouter()


@router.get("/users")
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict[str, object]]:
    users = db.query(User).all()
    online_ids = set(socket_manager.online_users.keys())
    payload = []
    for user in users:
        item = as_response_user(user)
        item["online"] = user.id in online_ids
        payload.append(item)
    return payload


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, object | None]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = as_response_user(user)
    payload["publicKeyFingerprint"] = user.public_key_fingerprint
    return payload


@router.get("/keypair")
def ensure_keypair(
    regenerate: bool = Query(default=False, description="Force a new keypair"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if regenerate or not current_user.public_key_pem:
        keypair = rsa.generate_keypair(bits=2048)
        current_user.public_key_pem = keypair["public_pem"]
        current_user.public_key_fingerprint = keypair["fingerprint"]
        current_user.private_key_pem = keypair["private_pem"]
        db.commit()
        db.refresh(current_user)
    if not current_user.public_key_pem or not current_user.public_key_fingerprint:
        raise HTTPException(status_code=500, detail="User keypair is unavailable")
    return {
        "publicKeyFingerprint": current_user.public_key_fingerprint,
        "publicKeyPEM": current_user.public_key_pem,
    }
