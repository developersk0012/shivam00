# Deployment checklist

## Easiest realistic starting point
1. Put the repository in a **private GitHub repository** while developing.
2. Deploy `frontend/index.html` to Vercel or another static host.
3. For this starter, run `api/` and Docker on the **same dedicated Linux host** with persistent storage. A separate runner host needs a separate authenticated runner-agent service; this sample does not implement that remote protocol.
4. Install Docker on that Linux host. Build the image:
   `docker build -t sk-bot-runner:latest runner/`
5. Set `JWT_SECRET` and persistent `DATA_DIR` / `UPLOAD_DIR` on the API host.
6. If API and frontend use different domains, set `FRONTEND_ORIGIN` to the exact frontend origin and set `API_BASE` in `frontend/index.html`. Do not use wildcard CORS with credentials.
7. Ensure the API can control only the dedicated runner. Never expose the Docker socket or Docker TCP API to the internet.
8. Configure TLS, backups, log rotation, per-user bot quotas, upload scanning, rate limits, alerts, and an abuse-reporting process.

## Before allowing public users
- Do not treat this sample as a safe public code-execution service.
- Use a hardened sandbox such as gVisor/Firecracker, separate runner hosts, and egress firewall rules.
- Block access to cloud metadata endpoints and private/internal networks.
- Set hard limits on number of bots, CPU, RAM, runtime, upload size, and log size.
- Do not let users supply Docker arguments, image names, mount paths, environment variable names, or container names.
- Add email verification, password reset, account deletion, terms, privacy notice, and abuse handling.
- Encrypt any stored bot tokens at rest; never log them or return them to the browser.
- The current starter intentionally does not collect or persist Telegram bot tokens. Add a secure server-side secret vault before adding token fields.
- Public users can still use a bot to send spam or abuse Telegram. Apply policy controls and suspend abuse.

## Free tier reality
Static frontend hosting can often start free. Persistent API storage and always-on runner processes may require a paid server or have sleep/usage restrictions. Check each provider's current plan and limits before deploying.
