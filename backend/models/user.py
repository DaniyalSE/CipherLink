"""SQLAlchemy model for application users."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base

if TYPE_CHECKING:  # pragma: no cover - typing helpers
    from backend.models.contact import ContactLink
    from backend.models.message import Message


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    public_key_pem: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_key_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    private_key_pem: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    otp_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    messages_sent: Mapped[list["Message"]] = relationship(
        "Message",
        foreign_keys="Message.sender_id",
        back_populates="sender",
        cascade="all,delete",
    )
    messages_received: Mapped[list["Message"]] = relationship(
        "Message",
        foreign_keys="Message.receiver_id",
        back_populates="receiver",
        cascade="all,delete",
    )

    contact_links_a: Mapped[list["ContactLink"]] = relationship(
        "ContactLink",
        foreign_keys="ContactLink.user_a_id",
        back_populates="user_a",
        cascade="all,delete",
    )
    contact_links_b: Mapped[list["ContactLink"]] = relationship(
        "ContactLink",
        foreign_keys="ContactLink.user_b_id",
        back_populates="user_b",
        cascade="all,delete",
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"User(id={self.id}, email={self.email})"
