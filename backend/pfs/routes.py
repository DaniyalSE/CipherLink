"""PFS handshake endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.pfs.ecdh_service import get_ecdh_service
from backend.pfs.models import PFSSession
from backend.services.socket_manager import socket_manager
from backend.utils.security import get_current_user

router = APIRouter()
_service = get_ecdh_service()


class PfsStartRequest(BaseModel):
    receiverId: str


class PfsCompleteRequest(BaseModel):
    pfsSessionId: str
    clientEphemeralPublicKey: str


@router.post("/pfs/start")
async def start_pfs(
    payload: PfsStartRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    peer = db.query(User).filter(User.id == payload.receiverId).first()
    if not peer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peer not found")
    session = _service.start(db, current_user, peer)
    await socket_manager.emit_to_users(
        "pfs:initiated",
        {
            "pfsSessionId": session.id,
            "initiatorId": current_user.id,
            "peerId": peer.id,
            "serverEphemeralPublicKey": session.server_public_key_pem,
        },
        [current_user.id, peer.id],
    )
    return {
        "pfsSessionId": session.id,
        "serverEphemeralPublicKey": session.server_public_key_pem,
    }


@router.post("/pfs/complete")
async def complete_pfs(
    payload: PfsCompleteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    session = db.query(PFSSession).filter(PFSSession.id == payload.pfsSessionId).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PFS session not found")
    if current_user.id not in {session.initiator_user_id, session.peer_user_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for PFS session")

    result = _service.complete(db, session, current_user, payload.clientEphemeralPublicKey)
    await socket_manager.emit_to_users(
        "pfs:established",
        {
            "pfsSessionId": session.id,
            "fingerprint": session.shared_key_fingerprint,
            "initiatorId": session.initiator_user_id,
            "peerId": session.peer_user_id,
            "expiresAt": session.expires_at.isoformat() if session.expires_at else None,
        },
        [session.initiator_user_id, session.peer_user_id],
    )
    return result
