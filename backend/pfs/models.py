"""Models for tracking Perfect Forward Secrecy sessions."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover - typing aid
    from backend.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PFSSession(Base):
    __tablename__ = "pfs_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    initiator_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    peer_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    server_public_key_pem: Mapped[str] = mapped_column(Text, nullable=False)
    shared_key_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: _now() + timedelta(minutes=10), nullable=False)

    initiator: Mapped["User"] = relationship("User", foreign_keys=[initiator_user_id])
    peer: Mapped["User"] = relationship("User", foreign_keys=[peer_user_id])
