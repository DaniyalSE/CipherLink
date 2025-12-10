"""Encrypted message ledger for audit and blockchain integration."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover
    from backend.models.block import Block
    from backend.models.user import User


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    ciphertext_base64: Mapped[str] = mapped_column(Text, nullable=False)
    iv_base64: Mapped[str] = mapped_column(String(64), nullable=False)
    signature_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    message_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    blockchain_block_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("blocks.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], back_populates="messages_sent")
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id], back_populates="messages_received")
    block: Mapped["Block | None"] = relationship("Block", back_populates="messages")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"Message(id={self.id}, sender={self.sender_id}, receiver={self.receiver_id})"
