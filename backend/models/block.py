"""Blockchain block table for proof-of-work validation."""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover
    from backend.models.message import Message


class Block(Base):
    __tablename__ = "blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    height: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    nonce: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)
    previous_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    hash: Mapped[str] = mapped_column(String(128), nullable=False)
    message_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    merkle_root: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    messages: Mapped[list["Message"]] = relationship("Message", back_populates="block")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"Block(height={self.height}, hash={self.hash[:12]})"
