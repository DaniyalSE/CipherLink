"""OTP generation and validation service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
import secrets
import string

from backend.config import get_settings

settings = get_settings()


@dataclass
class OTPRecord:
    code: str
    email: str
    expires_at: datetime
    last_sent_at: datetime


class OTPService:
    """In-memory OTP issuance with resend cooldown enforcement."""

    def __init__(self) -> None:
        self._records: dict[str, OTPRecord] = {}
        self._lock = Lock()

    def _build_code(self) -> str:
        alphabet = string.digits
        return "".join(secrets.choice(alphabet) for _ in range(settings.otp_length))

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def issue(self, email: str) -> OTPRecord:
        with self._lock:
            code = self._build_code()
            record = OTPRecord(
                code=code,
                email=email.lower(),
                expires_at=self._now() + timedelta(seconds=settings.otp_expiration_seconds),
                last_sent_at=self._now(),
            )
            self._records[email.lower()] = record
            return record

    def verify(self, email: str, code: str) -> bool:
        with self._lock:
            record = self._records.get(email.lower())
            if not record:
                return False
            if self._now() > record.expires_at:
                self._records.pop(email.lower(), None)
                return False
            if secrets.compare_digest(record.code, code):
                self._records.pop(email.lower(), None)
                return True
            return False

    def can_resend(self, email: str) -> tuple[bool, int]:
        with self._lock:
            record = self._records.get(email.lower())
            if not record:
                return True, 0
            elapsed = (self._now() - record.last_sent_at).total_seconds()
            remaining = max(0, settings.otp_resend_cooldown_seconds - int(elapsed))
            return remaining == 0, remaining

    def resend(self, email: str) -> tuple[OTPRecord | None, int]:
        email_key = email.lower()
        with self._lock:
            record = self._records.get(email_key)
            if record:
                elapsed = (self._now() - record.last_sent_at).total_seconds()
                remaining = max(0, settings.otp_resend_cooldown_seconds - int(elapsed))
                if remaining > 0:
                    return None, remaining
            new_record = OTPRecord(
                code=self._build_code(),
                email=email_key,
                expires_at=self._now() + timedelta(seconds=settings.otp_expiration_seconds),
                last_sent_at=self._now(),
            )
            self._records[email_key] = new_record
            return new_record, 0

    def pending_codes(self) -> list[OTPRecord]:
        with self._lock:
            return list(self._records.values())


otp_service = OTPService()
