# CipherLink OS

CipherLink OS (codename **SecureTerminal**) is an end-to-end encrypted messenger simulator that demonstrates modern key management techniques on top of a FastAPI backend and a Vite/React frontend. Users onboard with OTP verification, negotiate symmetric session keys through a Key Distribution Center (KDC), harden chat sessions with perfect forward secrecy (PFS) handshakes, and exchange AES-encrypted messages over Socket.IO while every cryptographic stage is logged for audit.

This README captures the full project story: architecture, directory layout, setup, workflows, APIs, observability, and troubleshooting tips so you can operate or extend the platform quickly.

---

## Platform Overview

- **Backend:** FastAPI, SQLAlchemy, Socket.IO, cryptography primitives, JWT auth, OTP, email hooks.
- **Frontend:** React + Vite + Tailwind + ShadCN UI, React Query for data fetching, Socket.IO client for realtime flows.
- **Security Services:**
	- Key Distribution Center (KDC) that mints shared AES-256 keys per contact.
	- Key lifecycle manager that rotates, revokes, and destroys session keys.
	- Perfect Forward Secrecy (PFS) ECDH handshake service for disposable keys.
- **Observability:** Real-time debug panels, structured websocket events, crypto log streams, blockchain-style append-only records.

---

## Repository Layout

```text
backend/
	main.py                FastAPI entrypoint
	routes/                REST + websocket endpoints (auth, crypto, system, etc.)
	kdc/, key_lifecycle/, pfs/   Key management services and models
	services/socket_manager.py   Socket.IO orchestration + event fan-out
	utils/                Auth helpers, secure storage, rate limiting
src/ (frontend)
	main.tsx, App.tsx     Vite Bootstrap + layout
	components/           Messaging UI, security dashboards, terminal layout
	hooks/                React Query + socket hooks (KDC, lifecycle, PFS, contacts)
	lib/api.ts            Axios client for REST surface
	lib/socket.ts         Structured websocket manager
```

See `package.json`, `vite.config.ts`, and `backend/requirements.txt` for dependency details.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- PowerShell 7+ (commands assume `pwsh` on Windows)

Optional: SQLite Browser for inspecting `cipherlink.db`.

---

## Environment Configuration

1. Copy `.env.example` to `.env` (backend reads it automatically) and confirm:

	 ```ini
	 BACKEND_SECRET=change-me
	 BACKEND_MOCK_MODE=true        # enables mock OTPs & disables SMTP
	 DATABASE_URL=sqlite:///./cipherlink.db
	 VITE_API_URL=http://localhost:8000/api
	 VITE_WS_URL=ws://localhost:8000/ws
	 VITE_MOCK_MODE=false
	 ```

2. (Optional) configure SMTP creds + `BACKEND_MOCK_MODE=false` for real OTP delivery.
3. Ensure `DATABASE_URL` points to a persistent SQLite path if you want history between runs.

---

## Installation

```powershell
# Backend
python -m venv .venv
& .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# Frontend
npm install
```

> Running `pip install` outside the virtual environment will pollute your global site-packages; always activate `.venv` first.

---

## Running Locally

```powershell
# Terminal 1 – API + websocket server
& .\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 – frontend
npm run dev
```

Visit `http://localhost:8080` (Vite dev server). Open two browser profiles to role-play two operators.

---

## Core Workflows

### 1. Authentication & OTP

1. **Signup:** POST `/api/auth/signup`. In mock mode the response contains `mock_otp`.
2. **Verify:** POST `/api/auth/verify-otp` with the mock OTP or the emailed code.
3. **Login:** POST `/api/auth/login` to receive a JWT used by REST + Socket.IO clients.

> When mock mode is disabled you must configure SMTP or OTP verification will fail.

### 2. Contact Linking & KDC

- Add a contact in the UI; backend checks `ContactLink` relationships.
- Hitting `/api/kdc/request-session-key` mints a 32-byte AES key, fingerprints it, encrypts for both peers, stores it, and emits `kdc:new-session-key` events.
- `/api/kdc/session-info/{id}` returns lifecycle metadata for display in the Debug panel.

### 3. Messaging Pipeline

1. Client composes a message → `socket_manager` encrypts with the negotiated key.
2. Message is persisted (with hashes, signatures, contact references) and broadcast via Socket.IO.
3. Frontend `lib/socket.ts` normalizes the payload, decrypts when possible, and surfaces it in the terminal + crypto logs.
4. A historical ledger is available via `GET /api/messages/history?peer_id=<id>`.

### 4. PFS Handshake

- `/api/pfs/start` generates a server ephemeral ECDH key, caches the private key, and emits `pfs:initiated`.
- `/api/pfs/complete` consumes the client ephemeral public key, derives a shared secret with HKDF, stores fingerprint + expiry, and emits `pfs:established` to both parties.
- Frontend `usePFS` hook surfaces pending session IDs, last negotiated key, and stats in the Forward Secrecy panel.

### 5. Key Lifecycle Management

- `/api/lifecycle/rotate-session-key`: rotates AES material, extends expiry, emits `lifecycle:rotated` + `kdc:new-session-key` follow-up.
- `/api/lifecycle/revoke-session-key` / `destroy-session-key`: updates lifecycle state, optionally emits `kdc:key-revoked`.
- Lifecycle events are written to `KeyEvent` rows and indexed by `CryptoLogPanel`.

---

## Frontend Debug Panels

- **KDC Panel:** shows total issued/revoked keys, last fingerprint, recent session snapshots, and a real-time event feed.
- **PFS Panel:** tracks initiated vs established handshakes, pending sessions, and the latest derived key material.
- **Lifecycle Panel:** aggregates rotations/revocations/destructions and renders a timeline sourced from `/api/lifecycle/key-events`.
- All panels reuse `CryptoLogPanel` for historical context and refresh automatically via React Query.

---

## API Highlights

| Area | Endpoint | Notes |
| --- | --- | --- |
| Auth | `POST /api/auth/signup`, `/verify-otp`, `/login` | OTP flow with mock or SMTP delivery |
| Contacts | `GET/POST /api/contacts` | Manages contact links required for KDC issuance |
| Messaging | `GET /api/messages/history` | Historical ledger with pagination |
| KDC | `POST /api/kdc/request-session-key`, `GET /api/kdc/session-info/{id}` | Issues + inspects session keys |
| Lifecycle | `POST /api/lifecycle/rotate-session-key`, `/revoke`, `/destroy`, `GET /api/lifecycle/key-events` | Full lifecycle transitions |
| PFS | `POST /api/pfs/start`, `/pfs/complete` | Ephemeral ECDH handshake |
| Crypto Logs | `GET /api/crypto/logs?source=KDC` | Filterable audit events |
| System | `GET /api/system/security-status` | Active sessions, rotations, forward secrecy flag |

All REST routes live under `/api` (set in `backend/main.py`). Socket.IO namespaces emit structured event names described above.

---

## Data Persistence

- SQLite database `cipherlink.db` (or your configured database) stores users, contacts, KDC sessions, lifecycle events, PFS sessions, blockchain-style message blocks, etc.
- To preserve state between runs, keep the DB file and reuse the same `.env`.
- For quick backups: copy `cipherlink.db` before shutting down the backend.

---

## Testing

```powershell
& .\.venv\Scripts\Activate.ps1
python -m pytest backend/tests/test_app.py
```

Add more suites under `backend/tests/` as you extend modules.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| "Invalid credentials" during login | OTP never verified | Complete `/api/auth/verify-otp` (mock OTP in response) or configure SMTP in production mode |
| Socket errors `Expected ASGI message ...` | Client hitting `/socket.io` when server only exposed `/ws` | Ensure `VITE_WS_URL=ws://localhost:8000/ws`; backend already mirrors `/socket.io` for compatibility |
| No chat history after restart | Database recreated | Point `DATABASE_URL` to a persistent path and do not delete `cipherlink.db` |
| bcrypt import failure on Windows | Old binaries cached | Reinstall requirements after cleaning `.venv` (already mitigated via vendor patch) |
| OTP emails never arrive | Mock mode disabled without SMTP | Re-enable mock mode or configure SMTP credentials |

---

## Next Steps

- Document WebSocket payload schemas in an ADR-style doc if you need strict external integrations.
- Add Cypress/Playwright specs for end-to-end registration + messaging flows.
- Consider Dockerizing backend/frontend for reproducible deployments.

CipherLink OS now ships with a complete story: onboarding, encrypted chats, live telemetry, and persistent audit trails. Feel free to iterate, extend, or rebrand as needed.
