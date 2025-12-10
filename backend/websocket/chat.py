"""Socket.IO chat event handlers."""

from __future__ import annotations

import logging
from urllib.parse import parse_qs

from backend.database import SessionLocal
from backend.models import ContactLink, User
from backend.services.jwt_service import decode_token
from backend.services.socket_manager import socket_manager

logger = logging.getLogger(__name__)


def _fetch_user(user_id: str) -> User | None:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id).first()
    finally:
        db.close()


def _fetch_contact(contact_id: str) -> ContactLink | None:
    db = SessionLocal()
    try:
        return db.query(ContactLink).filter(ContactLink.id == contact_id).first()
    finally:
        db.close()


@socket_manager.sio.event
async def connect(sid, environ, auth):  # type: ignore[no-untyped-def]
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        query = parse_qs(environ.get("QUERY_STRING", ""))
        token = query.get("token", [None])[0]
    if not token:
        raise ConnectionRefusedError("missing token")
    try:
        payload = decode_token(token)
    except Exception as exc:  # pragma: no cover - handshake guard
        raise ConnectionRefusedError("invalid token") from exc

    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise ConnectionRefusedError("user not found")
    user = _fetch_user(user_id)
    if not user:
        raise ConnectionRefusedError("user not found")

    await socket_manager.register(user, sid)
    await socket_manager.emit_system(f"{user.display_name} connected", room=sid)
    logger.info("socket.event.connect sid=%s user=%s", sid, user.id)


@socket_manager.sio.event
async def disconnect(sid):  # type: ignore[no-untyped-def]
    await socket_manager.unregister(sid)
    logger.info("socket.event.disconnect sid=%s", sid)


@socket_manager.sio.event
async def message(sid, data):  # type: ignore[no-untyped-def]
    user_id = socket_manager.sid_to_user.get(sid)
    if not user_id:
        return
    user = _fetch_user(user_id)
    if not user:
        return
    await socket_manager.handle_message(user, data)


@socket_manager.sio.event
async def join(sid, data):  # type: ignore[no-untyped-def]
    user_id = socket_manager.sid_to_user.get(sid)
    if not user_id:
        return
    contact_id = (data or {}).get("contact_id")
    if not contact_id:
        return
    if contact_id != "global":
        contact = _fetch_contact(contact_id)
        if not contact or user_id not in (contact.user_a_id, contact.user_b_id):
            logger.warning("socket.event.join denied sid=%s user=%s room=%s", sid, user_id, contact_id)
            return
    await socket_manager.sio.enter_room(sid, contact_id)
    logger.info("socket.event.join sid=%s user=%s room=%s", sid, user_id, contact_id)
