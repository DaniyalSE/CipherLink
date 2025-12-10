"""Socket.IO manager that coordinates chat sessions."""

from __future__ import annotations

from typing import Any, Dict, List

import logging

import socketio
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.blockchain import BlockchainEngine
from backend.blockchain.block import BlockPayload
from backend.crypto import rsa
from backend.config import get_settings
from backend.database import SessionLocal
from backend.key_lifecycle.manager import get_lifecycle_manager
from backend.models import ContactLink, Message, User
from backend.utils import security

logger = logging.getLogger(__name__)

settings = get_settings()
_crypto_logger = get_lifecycle_manager()


def create_socket_server() -> socketio.AsyncServer:
    return socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
    )


class SocketManager:
    def __init__(self) -> None:
        self.sio = create_socket_server()
        self.blockchain = BlockchainEngine()
        self.online_users: dict[str, str] = {}
        self.sid_to_user: dict[str, str] = {}

    def app(self, socketio_path: str = "socket.io") -> socketio.ASGIApp:
        normalized = socketio_path.strip("/") or "socket.io"
        return socketio.ASGIApp(self.sio, socketio_path=normalized)

    async def register(self, user: User, sid: str) -> None:
        self.online_users[user.id] = sid
        self.sid_to_user[sid] = user.id
        logger.info("socket.register sid=%s user=%s", sid, user.id)
        await self._auto_join_user_rooms(user, sid)
        await self.broadcast_presence(user, True)

    async def emit_to_users(self, event: str, payload: dict[str, Any], user_ids: List[str]) -> None:
        seen: set[str] = set()
        for user_id in user_ids:
            if not user_id or user_id in seen:
                continue
            seen.add(user_id)
            sid = self.online_users.get(user_id)
            if sid:
                await self.sio.emit(event, payload, room=sid)

    async def unregister(self, sid: str) -> None:
        user_id = self.sid_to_user.pop(sid, None)
        if not user_id:
            return
        self.online_users.pop(user_id, None)
        logger.info("socket.unregister sid=%s user=%s", sid, user_id)
        user = self._get_user_by_id(user_id)
        if user:
            await self.broadcast_presence(user, False)

    def _record_crypto_event(self, source: str, event_type: str, payload: Dict[str, Any], actor_id: str | None = None) -> None:
        db = SessionLocal()
        try:
            _crypto_logger.record_event(
                db,
                source=source,
                event_type=event_type,
                actor_id=actor_id,
                payload=payload,
            )
        finally:
            db.close()

    async def emit_crypto_stage(
        self,
        stage: str,
        payload: Dict[str, Any],
        user_ids: List[str] | None,
        *,
        source: str,
    ) -> None:
        actor = user_ids[0] if user_ids else None
        self._record_crypto_event(source, stage, payload, actor_id=actor)
        if user_ids:
            await self.emit_to_users(stage, payload, user_ids)
        else:
            await self.sio.emit(stage, payload)

    async def broadcast_presence(self, user: User, online: bool) -> None:
        payload = {
            "userId": user.id,
            "displayName": user.display_name,
            "online": online,
        }
        await self.sio.emit("presence", payload)

    async def emit_system(self, message: str, room: str | None = None) -> None:
        payload = {"message": message}
        await self.sio.emit("system", payload, room=room)

    async def emit_contact_update(self, user_id: str, payload: dict[str, Any]) -> None:
        sid = self.online_users.get(user_id)
        if sid:
            await self.sio.emit("contact", payload, room=sid)

    def _get_user_by_id(self, user_id: str) -> User | None:
        db = SessionLocal()
        try:
            return db.query(User).filter(User.id == user_id).first()
        finally:
            db.close()

    async def _auto_join_user_rooms(self, user: User, sid: str) -> None:
        """Ensure the user immediately receives DM broadcasts for all contacts."""
        namespace = "/"
        if not self.sio.manager.is_connected(sid, namespace):
            logger.warning(
                "socket.rooms skip sid=%s user=%s reason=not-connected",
                sid,
                user.id,
            )
            return

        await self.sio.enter_room(sid, "global")
        contacts = self._get_user_contacts(user.id)
        for contact in contacts:
            await self.sio.enter_room(sid, contact.id)
        logger.info(
            "socket.rooms hydrated sid=%s user=%s rooms=%s",
            sid,
            user.id,
            ["global", *[contact.id for contact in contacts]],
        )

    def _get_user_contacts(self, user_id: str) -> list[ContactLink]:
        db = SessionLocal()
        try:
            return (
                db.query(ContactLink)
                .filter(or_(ContactLink.user_a_id == user_id, ContactLink.user_b_id == user_id))
                .all()
            )
        finally:
            db.close()

    def _persist_message(
        self,
        db: Session,
        sender: User,
        receiver: User | None,
        payload: Dict[str, Any],
    ) -> Message:
        ciphertext = payload["ciphertext_base64"]
        iv = payload["iv_base64"]
        signature = payload.get("signature_base64")
        meta = dict(payload.get("meta") or {})
        message_hash = security.sha256_hex(ciphertext + iv)

        signature_valid: str | None = None
        signature = payload.get("signature_base64")
        signed_value = meta.get("signed_value") or ciphertext
        if signature:
            if sender.public_key_pem:
                signature_valid = "valid" if rsa.verify(sender.public_key_pem, signed_value, signature) else "invalid"
            else:
                signature_valid = "unsigned"
        meta.setdefault("audit", {})
        meta["audit"].update(
            {
                "hash": message_hash,
                "signature_status": signature_valid or "missing",
            }
        )

        message = Message(
            sender_id=sender.id,
            receiver_id=receiver.id if receiver else sender.id,
            ciphertext_base64=ciphertext,
            iv_base64=iv,
            signature_base64=signature,
            meta=meta,
            message_hash=message_hash,
        )
        db.add(message)
        db.commit()
        db.refresh(message)

        block_payload = BlockPayload(sender_id=sender.id, receiver_id=receiver.id if receiver else "broadcast", meta=meta)
        block = self.blockchain.mine_block(db, message_hash, block_payload)
        message.blockchain_block_id = block.id
        db.commit()
        return message

    async def handle_message(self, sender: User, data: Dict[str, Any]) -> None:
        to = data.get("to", "all")
        ciphertext = data.get("ciphertext_base64")
        iv = data.get("iv_base64")
        if not ciphertext or not iv:
            await self.emit_system("Missing ciphertext or IV", room=self.online_users.get(sender.id))
            return

        message_hash = security.sha256_hex(f"{ciphertext}{iv}")
        receiver: User | None = None
        contact_link: ContactLink | None = None
        db = SessionLocal()
        try:
            if to != "all":
                receiver = db.query(User).filter(User.id == to).first()
                if not receiver:
                    receiver = db.query(User).filter(User.display_name == to).first()
                if not receiver:
                    await self.emit_system(f"Recipient {to} not found", room=self.online_users.get(sender.id))
                    return
                contact_link = (
                    db.query(ContactLink)
                    .filter(
                        or_(
                            and_(ContactLink.user_a_id == sender.id, ContactLink.user_b_id == receiver.id),
                            and_(ContactLink.user_a_id == receiver.id, ContactLink.user_b_id == sender.id),
                        )
                    )
                    .first()
                )
                if not contact_link:
                    await self.emit_system("Recipient is not in your contacts", room=self.online_users.get(sender.id))
                    return
            message = self._persist_message(db, sender, receiver, data)
        finally:
            db.close()

        audience = [sender.id]
        if receiver:
            audience.append(receiver.id)

        await self.emit_crypto_stage(
            "hash_generated",
            {"messageHash": message_hash, "senderId": sender.id},
            audience,
            source="AES",
        )

        if contact_link:
            await self.emit_crypto_stage(
                "aes_key_selected",
                {
                    "contactLinkId": contact_link.id,
                    "sessionKeyFingerprint": security.sha256_hex(contact_link.session_key_base64)[:32],
                },
                audience,
                source="AES",
            )

        await self.emit_crypto_stage(
            "rc4_or_stream_cipher_generated",
            {"enabled": False, "reason": "AES-256 session enforced"},
            audience,
            source="AES",
        )

        signature = data.get("signature_base64")
        await self.emit_crypto_stage(
            "signature_created",
            {"provided": bool(signature), "senderId": sender.id},
            audience,
            source="RSA",
        )

        meta_dict: dict[str, Any] = dict(message.meta) if message.meta else {}
        audit_section = meta_dict.get("audit")
        signature_status: str | None = None
        if isinstance(audit_section, dict):
            raw_status = audit_section.get("signature_status")
            if isinstance(raw_status, str):
                signature_status = raw_status

        payload = {
            "id": message.id,
            "from": sender.display_name,
            "from_id": sender.id,
            "to": receiver.display_name if receiver else to,
            "to_id": receiver.id if receiver else None,
            "ciphertext_base64": message.ciphertext_base64,
            "iv_base64": message.iv_base64,
            "signature_base64": message.signature_base64,
            "meta": message.meta,
            "message_hash": message.message_hash,
            "timestamp": message.created_at.isoformat(),
            "signature_status": signature_status,
            "contact_link_id": contact_link.id if contact_link else None,
            "session_key_peer_id": sender.id if receiver else None,
            "session_key_fingerprint": security.sha256_hex(contact_link.session_key_base64)[:32]
            if contact_link
            else None,
        }

        room_id = data.get("contact_id") or (contact_link.id if contact_link else "global")
        await self.sio.emit("message", payload, room=room_id)
        logger.info(
            "socket.broadcast message=%s room=%s sender=%s receiver=%s",
            message.id,
            room_id,
            sender.id,
            receiver.id if receiver else "broadcast",
        )

        await self.emit_crypto_stage(
            "ciphertext_generated",
            {"messageId": message.id, "length": len(ciphertext)},
            audience,
            source="AES",
        )

        await self.emit_crypto_stage(
            "signature_verified",
            {"status": payload.get("signature_status"), "messageId": message.id},
            audience,
            source="RSA",
        )

        await self.emit_crypto_stage(
            "message_sent",
            {"messageId": message.id, "to": payload.get("to")},
            [sender.id],
            source="AES",
        )

        if receiver:
            await self.emit_crypto_stage(
                "message_received",
                {"messageId": message.id, "from": sender.display_name},
                [receiver.id],
                source="AES",
            )

        await self.emit_crypto_stage(
            "decrypted_message",
            {"messageId": message.id, "status": "client_pending"},
            audience,
            source="AES",
        )

        await self.emit_system(
            f"Stored message {payload['id']} (hash {payload['message_hash'][:10]}...) and mined block.",
        )


socket_manager = SocketManager()
