"""Block dataclass separate from ORM for hashing operations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class BlockPayload:
    sender_id: str
    receiver_id: str
    meta: dict | None = None


@dataclass
class BlockData:
    height: int
    previous_hash: str | None
    nonce: int
    difficulty: int
    message_hash: str
    payload: BlockPayload | None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def header_string(self) -> str:
        payload_repr = "" if not self.payload else f"{self.payload.sender_id}:{self.payload.receiver_id}"
        prev = self.previous_hash or "GENESIS"
        return f"{self.height}|{prev}|{self.nonce}|{self.difficulty}|{self.message_hash}|{payload_repr}|{int(self.timestamp.timestamp())}"
