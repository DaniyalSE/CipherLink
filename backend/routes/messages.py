"""Message history retrieval endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import Message
from backend.utils.security import get_current_user

router = APIRouter()


class MessageRecord(BaseModel):
    id: str
    direction: Literal["inbound", "outbound"]
    peerId: str
    peerDisplay: str | None
    ciphertextBase64: str
    ivBase64: str
    signatureStatus: str | None
    createdAt: str
    meta: dict[str, object] | None


class MessageHistoryResponse(BaseModel):
    count: int
    records: list[MessageRecord]


@router.get("/messages/history", response_model=MessageHistoryResponse)
def list_message_history(
    peer_id: str | None = Query(default=None, description="Optional peer to scope the conversation"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MessageHistoryResponse:
    """Return the authenticated user's stored messages, newest first."""

    query = (
        db.query(Message)
        .options(joinedload(Message.sender), joinedload(Message.receiver))
        .filter(or_(Message.sender_id == current_user.id, Message.receiver_id == current_user.id))
    )

    if peer_id:
        query = query.filter(
            or_(
                and_(Message.sender_id == current_user.id, Message.receiver_id == peer_id),
                and_(Message.sender_id == peer_id, Message.receiver_id == current_user.id),
            )
        )

    total = query.count()
    messages = (
        query.order_by(Message.created_at.desc()).offset(offset).limit(limit).all()
    )

    def serialize(record: Message) -> MessageRecord:
        inbound = record.receiver_id == current_user.id
        peer = record.sender if inbound else record.receiver
        meta_dict: dict[str, object] = dict(record.meta) if isinstance(record.meta, dict) else {}
        audit_section = meta_dict.get("audit")
        audit_dict = audit_section if isinstance(audit_section, dict) else {}
        signature_value = audit_dict.get("signature_status")
        signature_status = signature_value if isinstance(signature_value, str) else None
        return MessageRecord(
            id=record.id,
            direction="inbound" if inbound else "outbound",
            peerId=peer.id if peer else (record.sender_id if inbound else record.receiver_id),
            peerDisplay=peer.display_name if peer else None,
            ciphertextBase64=record.ciphertext_base64,
            ivBase64=record.iv_base64,
            signatureStatus=signature_status,
            createdAt=record.created_at.isoformat(),
            meta=record.meta,
        )

    serialized = [serialize(m) for m in messages]
    return MessageHistoryResponse(count=total, records=list(reversed(serialized)))
