"""User and key management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.crypto import rsa
from backend.database import get_db
from backend.kdc.models import KDCSession
from backend.key_lifecycle.models import KeyEvent
from backend.models import User
from backend.pfs.models import PFSSession
from backend.services.socket_manager import socket_manager
from backend.utils.helpers import as_response_user
from backend.utils.security import get_current_user, verify_password

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


class DeleteAccountRequest(BaseModel):
    password: str
    confirm: bool = False


@router.post("/users/me/delete")
def delete_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Delete the current user's account and all associated data."""
    # Verify password
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account deletion must be confirmed"
        )
    
    user_id = current_user.id
    
    # Delete all KDC sessions where user is sender or receiver
    db.query(KDCSession).filter(
        (KDCSession.sender_id == user_id) | (KDCSession.receiver_id == user_id)
    ).delete()
    
    # Delete all PFS sessions where user is initiator or peer
    db.query(PFSSession).filter(
        (PFSSession.initiator_user_id == user_id) | (PFSSession.peer_user_id == user_id)
    ).delete()
    
    # Delete all key events where user is the actor
    db.query(KeyEvent).filter(KeyEvent.actor_id == user_id).delete()
    
    # Delete the user (cascade will handle messages and contact_links)
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account and all associated data have been deleted successfully"}
