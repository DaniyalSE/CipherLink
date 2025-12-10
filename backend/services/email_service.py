"""Email delivery helper with mock inbox fallback."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from smtplib import SMTP, SMTPException
from threading import Lock
from typing import List

from backend.config import get_settings

settings = get_settings()


@dataclass
class MockEmail:
    to: str
    subject: str
    body: str
    sent_at: datetime


class EmailService:
    def __init__(self) -> None:
        self._mock_inbox: list[MockEmail] = []
        self._lock = Lock()

    def _append_mock(self, to: str, subject: str, body: str) -> None:
        with self._lock:
            self._mock_inbox.append(MockEmail(to=to, subject=subject, body=body, sent_at=datetime.now(timezone.utc)))
            if len(self._mock_inbox) > settings.mock_inbox_buffer:
                self._mock_inbox.pop(0)

    def send_email(self, to: str, subject: str, body: str) -> None:
        if settings.backend_mock_mode or not settings.smtp_host:
            self._append_mock(to, subject, body)
            return

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email
        msg["To"] = to
        msg.set_content(body)

        try:
            with SMTP(settings.smtp_host, settings.smtp_port) as smtp:
                smtp.starttls()
                if settings.smtp_user and settings.smtp_password:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        except SMTPException as exc:  # pragma: no cover - network edge cases
            # Fallback to mock inbox to ensure flow is not blocked.
            self._append_mock(to, subject, f"SMTP error ({exc}); body:\n{body}")

    def send_otp_email(self, to: str, code: str) -> None:
        subject = "Your CipherLink verification code"
        body = (
            "Use the OTP below to verify your account.\n\n"
            f"OTP: {code}\n"
            "This code expires in a few minutes."
        )
        self.send_email(to=to, subject=subject, body=body)

    def mock_inbox(self) -> List[MockEmail]:
        with self._lock:
            return list(self._mock_inbox)


email_service = EmailService()
