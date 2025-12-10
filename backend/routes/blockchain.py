"""Blockchain API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.blockchain import BlockchainEngine
from backend.blockchain.block import BlockPayload
from backend.database import get_db
from backend.models import Message, User
from backend.utils.security import get_current_user

router = APIRouter()
engine = BlockchainEngine()


class AddBlockRequest(BaseModel):
    sender_id: str
    receiver_id: str
    message_hash: str


@router.post("/blockchain/add-block")
def add_block(payload: AddBlockRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    payload_obj = BlockPayload(sender_id=payload.sender_id, receiver_id=payload.receiver_id)
    block = engine.mine_block(db, payload.message_hash, payload_obj)
    valid, details = engine.validate_chain(db)
    return {"block": {
        "id": block.id,
        "height": block.height,
        "hash": block.hash,
        "previous_hash": block.previous_hash,
        "message_hash": block.message_hash,
        "nonce": block.nonce,
        "difficulty": block.difficulty,
        "created_at": block.created_at.isoformat(),
    }, "valid": valid, "details": details}


@router.get("/blockchain/validate")
def validate_chain(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    valid, details = engine.validate_chain(db)
    return {"valid": valid, "details": details}


@router.get("/blockchain/get-chain")
def get_chain(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    return {"chain_array": engine.chain_as_dict(db)}
