"""FastAPI application factory and main entrypoint."""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend import database
from backend.config import get_settings
from backend.kdc import routes as kdc_routes
from backend.key_lifecycle import routes as lifecycle_routes
from backend.pfs import routes as pfs_routes
from backend.routes import auth, blockchain, contacts, crypto, messages, system, users
from backend.services.email_service import email_service
from backend.services.socket_manager import socket_manager
from backend.websocket import chat  # noqa: F401 - register socket events

logger = logging.getLogger(__name__)
settings = get_settings()

database.Base.metadata.create_all(bind=database.engine)
logger.info(f"Database initialized. Environment: {settings.environment}")
logger.info(f"SMTP configured: {settings.smtp_host is not None}")
logger.info(f"Mock mode: {settings.backend_mock_mode}")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

cors_config = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

if settings.allowed_origin_regex:
    cors_config["allow_origin_regex"] = settings.allowed_origin_regex
else:
    cors_config["allow_origins"] = settings.cors_origins

app.add_middleware(CORSMiddleware, **cors_config)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(contacts.router, prefix="/api", tags=["contacts"])
app.include_router(crypto.router, prefix="/api", tags=["crypto"])
app.include_router(messages.router, prefix="/api", tags=["messages"])
app.include_router(blockchain.router, prefix="/api", tags=["blockchain"])
app.include_router(system.router, prefix="/api", tags=["system"])
app.include_router(kdc_routes.router, prefix="/api", tags=["kdc"])
app.include_router(lifecycle_routes.router, prefix="/api", tags=["lifecycle"])
app.include_router(pfs_routes.router, prefix="/api", tags=["pfs"])

socket_mount_path = settings.websocket_path or "/ws"
if not socket_mount_path.startswith("/"):
    socket_mount_path = f"/{socket_mount_path}"
socket_mount_path = socket_mount_path.rstrip("/") or "/"
primary_socketio_path = f"{socket_mount_path}/socket.io" if socket_mount_path != "/" else "/socket.io"

app.mount(socket_mount_path, socket_manager.app(socketio_path=primary_socketio_path))
# Provide a compatibility mount so legacy clients hitting /socket.io still connect.
if socket_mount_path != "/socket.io":
    app.mount("/socket.io", socket_manager.app(socketio_path="/socket.io"))


@app.get("/health", tags=["system"])
def healthcheck() -> dict[str, str]:
    """Simple health endpoint for uptime checks."""
    return {"status": "ok", "environment": settings.environment}


@app.get("/mock/inbox", tags=["mock"])
def mock_inbox() -> list[dict[str, str]]:
    """Expose captured OTP emails when mock mode is enabled."""
    if not settings.backend_mock_mode:
        raise HTTPException(status_code=404, detail="Mock mode disabled")
    return [
        {
            "to": item.to,
            "subject": item.subject,
            "body": item.body,
            "sent_at": item.sent_at.isoformat(),
        }
        for item in email_service.mock_inbox()
    ]
