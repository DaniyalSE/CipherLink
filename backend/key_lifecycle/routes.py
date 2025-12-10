"""Routes for managing key lifecycle transitions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.kdc import service as kdc_service
from backend.kdc.models import KDCSession
from backend.key_lifecycle.manager import get_lifecycle_manager
from backend.key_lifecycle.models import KeyEvent
from backend.services.socket_manager import socket_manager
from backend.utils.security import get_current_user

router = APIRouter()
_lifecycle = get_lifecycle_manager()


class SessionActionRequest(BaseModel):
    kdcSessionId: str


def _get_session(db: Session, session_id: str) -> KDCSession:
    session = db.query(KDCSession).filter(KDCSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _require_participant(session: KDCSession, user_id: str) -> None:
    if user_id not in {session.sender_id, session.receiver_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for session")


@router.post("/lifecycle/rotate-session-key")
async def rotate_session(
    payload: SessionActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    session = _get_session(db, payload.kdcSessionId)
    _require_participant(session, current_user.id)
    updated = kdc_service.rotate_session(db, session, current_user)
    response = kdc_service.session_payload(updated)
    await socket_manager.emit_to_users(
        "lifecycle:rotated",
        {
            "kdcSessionId": updated.id,
            "fingerprint": updated.key_fingerprint,
            "actorId": current_user.id,
            "lifecycle": response["lifecycle"],
        },
        [updated.sender_id, updated.receiver_id],
    )
    return response


async def _finalize_state(
    state: str,
    payload: SessionActionRequest,
    db: Session,
    current_user,
) -> dict:
    session = _get_session(db, payload.kdcSessionId)
    _require_participant(session, current_user.id)
    updated = kdc_service.revoke_session(db, session, current_user, state)
    event_name = "lifecycle:revoked" if state == "revoked" else "lifecycle:destroyed"
    await socket_manager.emit_to_users(
        event_name,
        {
            "kdcSessionId": updated.id,
            "status": state,
            "actorId": current_user.id,
            "lifecycle": kdc_service.session_payload(updated)["lifecycle"],
        },
        [updated.sender_id, updated.receiver_id],
    )
    if state == "revoked":
        await socket_manager.emit_to_users(
            "kdc:key-revoked",
            {
                "kdcSessionId": updated.id,
                "status": state,
                "actorId": current_user.id,
            },
            [updated.sender_id, updated.receiver_id],
        )
    return kdc_service.session_payload(updated)


@router.post("/lifecycle/revoke-session-key")
async def revoke_session_key(
    payload: SessionActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    return await _finalize_state("revoked", payload, db, current_user)


@router.post("/lifecycle/destroy-session-key")
async def destroy_session_key(
    payload: SessionActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    return await _finalize_state("destroyed", payload, db, current_user)


@router.get("/lifecycle/key-events")
def list_key_events(
    kdcSessionId: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict]:
    query = db.query(KeyEvent)
    if kdcSessionId:
        query = query.filter(KeyEvent.kdc_session_id == kdcSessionId)
    events = query.order_by(KeyEvent.created_at.desc()).limit(limit).all()
    return _lifecycle.serialize_many(events)
