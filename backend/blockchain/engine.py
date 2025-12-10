"""Proof-of-work blockchain engine."""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.blockchain.block import BlockData, BlockPayload
from backend.config import get_settings
from backend.models import Block

settings = get_settings()


class BlockchainEngine:
    def __init__(self, difficulty: int | None = None) -> None:
        self.difficulty = difficulty or settings.pow_difficulty

    def _get_last_block(self, db: Session) -> Block | None:
        return db.query(Block).order_by(Block.height.desc()).first()

    def _compute_hash(self, data: BlockData) -> str:
        return hashlib.sha256(data.header_string().encode("utf-8")).hexdigest()

    def mine_block(
        self,
        db: Session,
        message_hash: str,
        payload: BlockPayload | None = None,
    ) -> Block:
        last_block = self._get_last_block(db)
        height = 0 if not last_block else last_block.height + 1
        previous_hash = None if not last_block else last_block.hash

        nonce = 0
        timestamp = datetime.now(timezone.utc)
        block_hash = ""
        while True:
            candidate = BlockData(
                height=height,
                previous_hash=previous_hash,
                nonce=nonce,
                difficulty=self.difficulty,
                message_hash=message_hash,
                payload=payload,
                timestamp=timestamp,
            )
            block_hash = self._compute_hash(candidate)
            if block_hash.startswith("0" * self.difficulty):
                break
            nonce += 1

        created_at = timestamp
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        block = Block(
            height=height,
            nonce=nonce,
            difficulty=self.difficulty,
            previous_hash=previous_hash,
            hash=block_hash,
            message_hash=message_hash,
            merkle_root=message_hash,
            payload=json.dumps(payload.__dict__, default=str) if payload else None,
            created_at=created_at.replace(tzinfo=None),
        )

        db.add(block)
        db.commit()
        db.refresh(block)
        return block

    def validate_chain(self, db: Session) -> tuple[bool, list[str]]:
        issues: list[str] = []
        blocks = db.query(Block).order_by(Block.height.asc()).all()
        prev_hash = None
        for block in blocks:
            payload_obj = None
            if block.payload:
                payload_dict = json.loads(block.payload)
                payload_obj = BlockPayload(**payload_dict)
            timestamp = block.created_at or datetime.now(timezone.utc)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            data = BlockData(
                height=block.height,
                previous_hash=block.previous_hash,
                nonce=block.nonce,
                difficulty=block.difficulty,
                message_hash=block.message_hash,
                payload=payload_obj,
                timestamp=timestamp,
            )
            computed = self._compute_hash(data)
            if computed != block.hash:
                issues.append(f"Hash mismatch at height {block.height}")
            if prev_hash != block.previous_hash:
                if block.height != 0:
                    issues.append(f"Broken previous hash at height {block.height}")
            if not block.hash.startswith("0" * block.difficulty):
                issues.append(f"Difficulty violation at height {block.height}")
            prev_hash = block.hash
        return len(issues) == 0, issues

    def chain_as_dict(self, db: Session) -> list[dict[str, int | str | None]]:
        blocks = db.query(Block).order_by(Block.height.asc()).all()
        return [
            {
                "height": block.height,
                "hash": block.hash,
                "previous_hash": block.previous_hash,
                "message_hash": block.message_hash,
                "nonce": block.nonce,
                "difficulty": block.difficulty,
                "created_at": block.created_at.isoformat(),
                "payload": block.payload,
            }
            for block in blocks
        ]
