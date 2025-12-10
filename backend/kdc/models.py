"""Database models for KDC sessions."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover
    from backend.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


class KDCSession(Base):
    __tablename__ = "kdc_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    encrypted_key_for_sender: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_key_for_receiver: Mapped[str] = mapped_column(Text, nullable=False)
    key_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    lifecycle_state: Mapped[str] = mapped_column(String(32), default="generated", nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    distributed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: _now() + timedelta(minutes=30), nullable=False)
    destroyed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id])
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id])

    def mark_distributed(self) -> None:
        self.lifecycle_state = "distributed"
        self.distributed_at = self.distributed_at or _now()

    def mark_revoked(self, state: str) -> None:
        self.lifecycle_state = state
        self.status = state
        if state in {"revoked", "destroyed"}:
            self.destroyed_at = self.destroyed_at or _now()
