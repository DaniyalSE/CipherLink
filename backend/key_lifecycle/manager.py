"""Helper utilities for recording key lifecycle events."""

from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy.orm import Session

from backend.key_lifecycle.models import KeyEvent


class KeyLifecycleManager:
    def record_event(
        self,
        db: Session,
        *,
        source: str,
        event_type: str,
        actor_id: str | None = None,
        kdc_session_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> KeyEvent:
        event = KeyEvent(
            source=source.upper(),
            event_type=event_type,
            actor_id=actor_id,
            kdc_session_id=kdc_session_id,
            payload=payload or {},
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    def serialize(self, event: KeyEvent) -> dict[str, Any]:
        return {
            "id": event.id,
            "source": event.source,
            "eventType": event.event_type,
            "kdcSessionId": event.kdc_session_id,
            "actorId": event.actor_id,
            "payload": event.payload or {},
            "createdAt": event.created_at.isoformat(),
        }

    def serialize_many(self, events: Iterable[KeyEvent]) -> list[dict[str, Any]]:
        return [self.serialize(event) for event in events]


def get_lifecycle_manager() -> KeyLifecycleManager:
    return key_lifecycle_manager


key_lifecycle_manager = KeyLifecycleManager()
