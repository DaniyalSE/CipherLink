"""HTTP endpoints for KDC session management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.kdc import service as kdc_service
from backend.kdc.models import KDCSession
from backend.models import User
from backend.services.socket_manager import socket_manager
from backend.utils.security import get_current_user

router = APIRouter()


class SessionKeyRequest(BaseModel):
    receiverId: str


@router.post("/kdc/request-session-key")
async def request_session_key(
    payload: SessionKeyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    receiver = db.query(User).filter(User.id == payload.receiverId).first()
    if not receiver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receiver not found")

    session = kdc_service.issue_session(db, current_user, receiver)
    response = kdc_service.session_payload(session)

    await socket_manager.emit_to_users(
        "kdc:new-session-key",
        {
            "kdcSessionId": session.id,
            "fingerprint": session.key_fingerprint,
            "initiatorId": current_user.id,
            "peerId": receiver.id,
            "lifecycle": response["lifecycle"],
            "issuedAt": session.generated_at.isoformat() if session.generated_at else None,
        },
        [session.sender_id, session.receiver_id],
    )
    return response


@router.get("/kdc/session-info/{session_id}")
def fetch_session_info(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    session = db.query(KDCSession).filter(KDCSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if current_user.id not in {session.sender_id, session.receiver_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return kdc_service.session_payload(session)
