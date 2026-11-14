# Deployment and HTTPS checklist

**Status (2026-11-14):** A Render Free demo URL is recorded in the repository: **https://restaurant-father-demo-xem8.onrender.com**. Render/Neon provisioning and a healthy service were reported during deployment, but an independent external HTTPS login and complete hosted browser acceptance walkthrough are **not yet verified**. This file remains the reproducible deployment and security checklist. Visitors accessing Render from Iran may need to enable a VPN.

## Free-tier reviewer demo (recommended)

Use the root [render.yaml](render.yaml) for a **free Render web service** and a **separate Neon free-tier PostgreSQL database**. See [docs/FREE_DEMO_DEPLOY.fa.md](docs/FREE_DEMO_DEPLOY.fa.md) for the complete, ordered procedure, GitHub Actions bootstrap and HTTPS verification.

The web service receives only `DATABASE_URL` for the unprivileged `restaurant_runtime` role; `ADMIN_DATABASE_URL`, `DB_APP_PASSWORD` and `DEMO_PASSWORD` must not be stored in Render runtime environment variables. `PUBLIC_ORIGIN` is wired to the Render-generated HTTPS URL, and secure cookies are enabled. The current demo URL is https://restaurant-father-demo-xem8.onrender.com. Confirm authentication, authorization and the full operational workflow from an external browser before submission; a deployed service alone is not acceptance evidence.

## Local reproducible environment

Run `docker compose up --build`. The migration container uses `ADMIN_DATABASE_URL`; the running app uses `DATABASE_URL` for the restricted `restaurant_runtime` role. The demo seeder is explicitly enabled only in the local compose recipe.

## Recommended hosted deployment (operator steps)

1. Provision a Linux host or managed container platform and **managed PostgreSQL 16** with backups. Place both behind a private network; never expose port 5432 publicly.
2. Generate unique strong `DB_ADMIN_PASSWORD`, `DB_APP_PASSWORD`, admin and app connection strings. Restrict the migrator's DB owner credential to deployment only. Never give it to the HTTP runtime.
3. Apply migration with `ADMIN_DATABASE_URL=... DB_APP_PASSWORD=... npm run migrate`. Do **not** run `SEED_DEMO=true` against real customer data. Create legitimate staff accounts with controlled onboarding before production use.
4. Run `node src/server.mjs` with `DATABASE_URL`, `NODE_ENV=production`, `COOKIE_SECURE=true`, `PUBLIC_ORIGIN=https://your-domain.example`, `PORT=3000` and optional AI environment variables. Keep secrets in host secret management, not GitHub files.
5. Put **Caddy / Nginx / a platform TLS proxy** in front of the HTTP process and install a valid certificate. Redirect HTTP to HTTPS, configure HSTS after verifying HTTPS and restrict proxy request size.
6. Verify `/api/health`, same-origin login/logout, branch switching, a complete order→kitchen→serve→cashier flow, cross-tenant tests, mobile layouts, network interruptions and load on the target infrastructure.
7. Configure database backups/restore drills, request/DB error alerting, rate limits (especially login), role/account lifecycle and operational incident response. Record actual demo URL and one-time demo credentials only after the host is ready.

## AI endpoint

For a trusted OpenAI-compatible API set `AI_API_URL` (HTTPS full chat-completions URL), `AI_API_KEY`, `AI_MODEL`, optional `AI_TIMEOUT_MS`. Do not expose the key in frontend code. Limit billing/rate externally and test Persian menu ambiguity. AI remains disabled if settings are absent.

### Order-intake deployment and consumption limits

The human-reviewed `/api/ai/order-suggestions` endpoint is available in deterministic, clearly labeled rule-based mode without any provider key or inference charges. Actual model inference requires `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` and independent confirmation that the provider permits service to the intended Iranian market. Do not interpret Render hosting outside Iran as a substitute for provider eligibility.

Optional security/operations settings: `AI_ORDER_ENABLED=false` immediately disables all suggestion endpoints while leaving manual ordering working; `AI_ALLOWED_HOSTS` constrains outbound provider hostnames; `AI_DAILY_REQUEST_LIMIT` defaults to 200 requests per tenant per UTC day. Per employee, a five-minute window permits 20 requests and at most two concurrent model requests. These limits are local to one Node process. For multi-instance production, use a shared quota/limiter and a provider-side billing cap.

Order text containing recognizable phone/card numbers is rejected before provider transmission, but this is not comprehensive data-loss prevention. Keep customer identities, numbers and payment information out of prompts. The server does not log the raw order text. Verify the actual model response quality, privacy retention, and provider costs with synthetic Persian orders before enabling inference. Rule-based test success must never be reported as real-provider AI validation.

## Important caveats

- `compose.yaml` includes **local demo credentials** and must not be deployed unchanged on the public internet.
- No bank/payment gateway is integrated. The `checkout` endpoint records cashier attestation of an outside payment only.
- Default application session and local seed policies need production hardening, including staff provisioning and rate limiting.
- The current app uses polling, not WebSocket push, and does not implement offline durability.
- Release should be gated on passing database integration CI and a manual multi-device walkthrough.

## Railway deployment (November 2026, **requires connected hosting account**)

Railway's current configuration model is Infrastructure as Code (`.railway/railway.ts`) or the live project dashboard; **do not create a new `railway.json`** because Railway now deprecates Config as Code and disallows it for new services. Official: https://docs.railway.com/infrastructure-as-code and https://docs.railway.com/databases/postgresql.

1. In the Railway account, create a project, add a PostgreSQL service (private networking only) and connect the GitHub repo `afakhari/restaurant-father` to a Node web service using the committed Dockerfile. **This step cannot be performed unless the Railway account is connected and can incur hosting charges.**
2. Run `npm run migrate` in a **separate one-off migration context** with the admin connection string (`ADMIN_DATABASE_URL`) and freshly generated `DB_APP_PASSWORD`; this role must have `CREATEROLE` or sufficient privileges to create `restaurant_runtime`. If a managed host denies role creation, this deployment procedure needs an operator-admin bootstrap rather than silently switching the HTTP runtime to a privileged connection. Do not save the admin secret in the live Node process.
3. For a **demo-only** database, run the seed script once from the separate migration context with `SEED_DEMO=true` and a fresh private `DEMO_PASSWORD`. Never enable demo seeding against customer data.
4. In the actual app service, set a `DATABASE_URL` with username `restaurant_runtime` and the runtime-only password, `NODE_ENV=production`, `COOKIE_SECURE=true`, actual public `PUBLIC_ORIGIN=https://<generated-domain>`, and `PORT` (Railway provides it). The runtime must never receive `ADMIN_DATABASE_URL`.
5. Set health path `/api/health`, generate a Railway public domain and check valid HTTPS. Copy that **actual** domain into the submission checklist, run browser smoke tests with authentic seeded demo credentials, and optionally set `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`. Keep secrets in Railway variables.
6. Test whether the login demo shortcuts **do not publish the local Docker password** on the public hostname and confirm that correct private seeded login works. Run RLS/cross-tenant and two-client concurrency tests.

The authoring environment has no connected Railway account or hosting credentials. None of these remote resources has been created, and no web URL is claimed.
