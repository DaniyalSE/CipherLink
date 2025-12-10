# CipherLink OS

SecureTerminal is a FastAPI + React stack that simulates a hardened messenger: users sign up with OTP verification, negotiate session keys through a KDC, and exchange AES-encrypted payloads over Socket.IO while every crypto stage is logged for audit.

This doc walks through setup, the WhatsApp-style messaging flow, data persistence expectations, and key troubleshooting tips.

---

## 1. Quick Start

### Prerequisites

- Python 3.11+ with `pip`
- Node.js 18+
- Windows PowerShell (repo assumes `pwsh`)

### Environment

1. Copy `.env.example` to `.env` (already tracked) and confirm:
	 ```ini
	 BACKEND_SECRET=change-me
	 BACKEND_MOCK_MODE=true      # enables mock OTP + disables SMTP
	 DATABASE_URL=sqlite:///./cipherlink.db
	 VITE_API_URL=http://localhost:8000/api
	 VITE_WS_URL=ws://localhost:8000/ws
	 VITE_MOCK_MODE=false
	 ```
2. Install backend deps once: `python -m venv .venv && .\.venv\Scripts\Activate.ps1 && pip install -r backend/requirements.txt`
3. Install frontend deps once: `npm install`

### Run

```powershell
# Terminal 1 – backend
& .\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 – frontend
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) (Vite dev server) in two separate browser profiles to emulate two people.

---

## 2. Auth Flow (fixes "credentials don’t match")

1. **Signup** with any email/password. Because `BACKEND_MOCK_MODE=true`, the `/api/auth/signup` response contains `mock_otp`.
2. **Verify OTP** using the modal or a manual POST to `/api/auth/verify-otp`. No email delivery is required in mock mode.
3. **Login** from both browser profiles. Successful login gives each client a JWT for API + Socket.IO calls.

> If you toggle `BACKEND_MOCK_MODE=false`, configure real SMTP creds or you will never receive OTPs and login will keep failing.

---

## 3. Real-Time Messaging Like WhatsApp

1. Both logged-in clients automatically connect to Socket.IO. We now mount the socket server on **both** `/ws/socket.io` (preferred) and `/socket.io` (compat layer), so even misconfigured clients stay connected.
2. Add a contact (User A adds User B). This provisions an AES-256 session key via `/api/kdc/request-session-key` and mirrors it to both users.
3. Use the terminal composer to send a message. `socket_manager.handle_message` persists it, emits blockchain events, and pushes the payload to both sockets instantly.
4. The `SecurityPanels` + `CryptoLogPanel` surfaces each stage (hashing, AES selection, signature verification, lifecycle events) for transparency.

---

## 4. Persistence & Message History

- All entities (users, contacts, KDCSessions, PFSSessions, lifecycle events, messages) are stored in `cipherlink.db`. Keep that SQLite file and your state survives restarts.
- A new endpoint `GET /api/messages/history` exposes stored conversations with optional `peer_id`, `limit`, and `offset` filters. Sample request:
	```bash
	curl -H "Authorization: Bearer <token>" \
			 "http://localhost:8000/api/messages/history?peer_id=<userId>&limit=50"
	```
- Frontend helper: `fetchMessageHistory(peerId?: string, limit = 100)` in `src/lib/api.ts` for future UI consumption.
- To snapshot runs, copy `cipherlink.db` elsewhere before shutting down.

---

## 5. Security Telemetry Cheat Sheet

- **KDC** — `/api/kdc/request-session-key`, `/api/kdc/session-info/{id}`
- **Lifecycle** — `/api/lifecycle/rotate-session-key`, `/revoke`, `/destroy` + websocket events `lifecycle:*`
- **PFS** — `/api/pfs/start` + `/api/pfs/complete` broadcast `pfs:established`
- **Observability** — `/api/crypto/logs` (filter by `source`), `/api/system/security-status`, new `/api/messages/history`

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Login fails with "Invalid credentials" | Ensure OTP verification succeeded (mock OTP) or real SMTP delivers the code. |
| Socket spam `Expected ASGI message ... but got http.response.start` | Means client is hitting `/socket.io` while backend only served `/ws` – now mitigated by dual mount, but double-check `VITE_WS_URL`. |
| No messages after restart | Verify `cipherlink.db` still exists and `DATABASE_URL` points to it. |
| bcrypt import error on Windows | Already patched in `backend/utils/security.py`. |

---

## 7. Tests

Run backend integration tests:

```powershell
& .\.venv\Scripts\Activate.ps1
python -m pytest backend/tests/test_app.py
```

---

Feel free to extend the docs with architecture diagrams or API references as the system evolves. The current content emphasizes the workflows you asked for: reliable login, WhatsApp-style real-time messaging, and durable history between runs.
# CipherLink
