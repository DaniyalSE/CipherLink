"""System-level metrics endpoints."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.kdc.models import KDCSession
from backend.key_lifecycle.models import KeyEvent
from backend.pfs.models import PFSSession
from backend.services.socket_manager import socket_manager
from backend.utils.security import get_current_user

router = APIRouter()
_START_TIME = time.time()


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/system/security-status")
def security_status(db: Session = Depends(get_db), user=Depends(get_current_user)) -> dict[str, int | bool]:
    now = _now()
    active_kdc = (
        db.query(KDCSession)
        .filter(and_(KDCSession.status == "active", KDCSession.expires_at > now))
        .count()
    )
    rotations = (
        db.query(KeyEvent)
        .filter(and_(KeyEvent.event_type == "rotated", KeyEvent.created_at >= now - timedelta(days=1)))
        .count()
    )
    forward_active = (
        db.query(PFSSession)
        .filter(and_(PFSSession.status == "active", PFSSession.expires_at > now))
        .count()
    )
    uptime = int(time.time() - _START_TIME)
    return {
        "activeSessions": len(socket_manager.online_users),
        "activeKDCSessions": active_kdc,
        "recentKeyRotations": rotations,
        "forwardSecrecyActive": forward_active > 0,
        "uptime": uptime,
    }
