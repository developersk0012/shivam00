# SK Bot Hosting — starter project

A starter architecture for a multi-user Telegram bot hosting panel.

## Important limitations
This is a **development starter**, not a production-safe public arbitrary-code hosting service.
Running user-uploaded Python code is dangerous. Docker limits reduce risk but are not a complete security boundary. Before accepting untrusted users, use a hardened isolated runner (for example gVisor/Firecracker), strict outbound network policy, per-user quotas, abuse reporting, monitoring, and a security review.

The free tiers of common web hosts generally cannot guarantee always-on arbitrary Python worker processes. A typical deployment separates:
- Frontend: Vercel/static hosting
- API: a Node.js service
- Runner: a dedicated Linux host with Docker and hardened isolation

## Structure
- `frontend/` — responsive dashboard UI starter
- `api/` — Express API with registration/login, upload, bot metadata, start/stop/log endpoints
- `runner/` — Docker image for Python bot jobs
- `deploy/` — example environment template and deployment checklist

## Requirements
- Node.js 20+
- Linux server with Docker installed for runner operations
- Set a long random `JWT_SECRET`
- Keep `.env` and bot tokens out of GitHub

## Local development
1. Copy `api/.env.example` to `api/.env` and set secrets.
2. `cd api && npm install`
3. `npm run dev`
4. Open `frontend/index.html` locally or host the frontend separately.
5. The API can manage Docker only when running on a host with Docker installed and permission to access the Docker daemon.

**Do not expose the runner to the public internet until production isolation and network policy are in place.**
