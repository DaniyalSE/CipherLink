"""Contact link model storing symmetric session keys."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover - typing helper
    from backend.models.user import User


class ContactLink(Base):
    __tablename__ = "contact_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_a_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    user_b_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    session_key_base64: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="accepted", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user_a: Mapped["User"] = relationship("User", foreign_keys=[user_a_id], back_populates="contact_links_a")
    user_b: Mapped["User"] = relationship("User", foreign_keys=[user_b_id], back_populates="contact_links_b")

    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", name="uq_contact_pair"),)

    def participants(self) -> tuple[str, str]:  # pragma: no cover - helper
        return (self.user_a_id, self.user_b_id)
