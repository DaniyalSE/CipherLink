"""Integration tests for key backend flows."""

import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_cipherlink.db")
os.environ.setdefault("BACKEND_MOCK_MODE", "true")

from backend.config import get_settings

get_settings.cache_clear()

from fastapi.testclient import TestClient
import pytest

from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend.models import User
from backend.services.socket_manager import socket_manager

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def anyio_backend():
    return "asyncio"


def _create_user(client: TestClient):
    email = f"tester_{uuid.uuid4().hex[:6]}@cipherlink.io"
    password = "Sup3rSecure!23"

    signup = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert signup.status_code == 200
    otp = signup.json()["mock_otp"]

    verify = client.post("/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert verify.status_code == 200

    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["token"]
    user = login.json()["user"]
    return token, user, email


def test_auth_flow(client: TestClient):
    token, user, email = _create_user(client)
    assert token
    assert user["email"] == email


def test_crypto_hash_endpoint(client: TestClient):
    token, _, _ = _create_user(client)
    response = client.post(
        "/api/crypto/hash",
        headers={"Authorization": f"Bearer {token}"},
        json={"algo": "sha256", "message": "hello"},
    )
    assert response.status_code == 200
    assert response.json()["digest"] == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"


def test_blockchain_add_and_validate(client: TestClient):
    token, user, _ = _create_user(client)
    response = client.post(
        "/api/blockchain/add-block",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "sender_id": user["id"],
            "receiver_id": user["id"],
            "message_hash": "deadbeef",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True

    validate = client.get(
        "/api/blockchain/validate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert validate.status_code == 200
    assert validate.json()["valid"] is True


def test_contacts_link_flow(client: TestClient):
    token_a, _, _ = _create_user(client)
    token_b, user_b, email_b = _create_user(client)

    create = client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"email": email_b},
    )
    assert create.status_code == 200
    payload = create.json()
    assert payload["peer"]["id"] == user_b["id"]
    assert payload["sessionKeyBase64"]
    assert payload["sessionKeyFingerprint"]

    listing = client.get(
        "/api/contacts",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert listing.status_code == 200
    links = listing.json()
    assert links
    assert any(link["linkId"] == payload["linkId"] for link in links)

    second = client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"email": email_b},
    )
    assert second.status_code == 200
    assert second.json()["linkId"] == payload["linkId"]


@pytest.mark.anyio("asyncio")
async def test_websocket_register_mock():
    db = SessionLocal()
    user = User(
        email="ws_user@cipherlink.local",
        display_name="ws_user",
        hashed_password="stub",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    await socket_manager.register(user, "test-sid")
    assert user.id in socket_manager.online_users
    await socket_manager.unregister("test-sid")

    assert user.id not in socket_manager.online_users
