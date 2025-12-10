"""Application settings loaded from environment variables.
Use pydantic-settings so overrides via .env or real env vars are simple.
"""

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration object for the backend service."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="CipherLink OS Backend")
    environment: str = Field(default="development")

    database_url: str = Field(default="sqlite:///./cipherlink.db", alias="DATABASE_URL")
    alembic_config: str = Field(default="alembic.ini")

    backend_secret: str = Field(default="change-me-in-prod", alias="BACKEND_SECRET")
    jwt_algorithm: str = Field(default="HS256")
    access_token_exp_minutes: int = Field(default=60)
    refresh_token_exp_minutes: int = Field(default=60 * 24 * 7)

    otp_length: int = Field(default=6)
    otp_expiration_seconds: int = Field(default=10 * 60)
    otp_resend_cooldown_seconds: int = Field(default=60)

    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASS")
    smtp_from_email: str = Field(default="noreply@cipherlink.local")

    backend_mock_mode: bool = Field(default=False, alias="BACKEND_MOCK_MODE")
    mock_inbox_buffer: int = Field(default=50)

    vite_mock_mode: bool = Field(default=False, alias="VITE_MOCK_MODE")

    allowed_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")
    allowed_origin_regex: str | None = Field(
        default=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+)(:\d+)?$",
        alias="ALLOWED_ORIGIN_REGEX",
        description="Optional regex used to match request origins. Overrides allowed_origins when set.",
    )

    pow_difficulty: int = Field(default=4, description="Leading zero count for PoW hashes")
    websocket_path: str = Field(default="/ws")

    system_log_stream: bool = Field(default=True)

    @property
    def cors_origins(self) -> List[str]:
        """Return parsed CORS origins list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Provide a cached settings object."""
    return Settings()
