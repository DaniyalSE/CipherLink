"""Models that capture lifecycle events for cryptographic material."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover
    from backend.kdc.models import KDCSession


def _now() -> datetime:
    return datetime.now(timezone.utc)


class KeyEvent(Base):
    __tablename__ = "key_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    kdc_session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("kdc_sessions.id"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    session: Mapped["KDCSession | None"] = relationship("KDCSession", backref="events")
