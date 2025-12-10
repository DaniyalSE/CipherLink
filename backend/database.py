"""Database session management utilities."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.config import get_settings

settings = get_settings()

connect_args: dict[str, object] = {}
if settings.database_url.startswith("sqlite"):
    # SQLite needs check_same_thread disabled for FastAPI's threaded worker model.
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)
Base = declarative_base()


def get_db() -> Generator:
    """FastAPI dependency that provides a transactional DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
