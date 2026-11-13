# شیفت‌یار / ShiftYar

**A narrow, operational MVP for Iranian café and restaurant shifts.** It connects waiter order entry, kitchen preparation, waiter handoff, and cashier settlement across multiple rounds on the same table. The emphasis is on *not losing work when several staff act at the same time*, rather than building every part of an ERP.

> **Submission status:** a working code implementation with Docker Compose, migrations, demo seed, role-restricted HTTP API, RTL web UI, optional LLM capability, and tests. **There is no verified public deployment URL or candidate-recorded 5–10 minute video yet.** See [DEPLOY.md](DEPLOY.md). Do not confuse a GitHub repository with a running restaurant service.

## Quick start: one command

Requires Docker Engine with Docker Compose. From repository root:

```bash
docker compose up --build
```

Open **http://localhost:3000**. The first boot creates a PostgreSQL database, provisions the non-superuser application role, applies the schema, and seeds two realistic demo restaurants. Subsequent starts preserve data in the `shiftyar_pgdata` volume and do not duplicate the demo seed. Docker Compose's default passwords are **local development defaults**, never deploy them publicly. To override, copy `.env.example` to `.env` and set unique secrets before launch.

For a clean demo reset (deletes the local database): `docker compose down -v && docker compose up --build`.

### Demo identities (local development only)

Password for all seeded demo accounts: **`Demo-Shift-1405!`**. The login page provides shortcuts, but does not impersonate a role without authenticating.

| Identity | Role | Restaurant | Typical task |
|---|---|---|---|
| `waiter@narenj.demo` | Waiter | کافه و رستوران نارنج | Create new order rounds, cancel queued item with reason, mark ready item served |
| `kitchen@narenj.demo` | Kitchen | نارنج | Move queued → preparing → ready |
| `cashier@narenj.demo` | Cashier | نارنج | Review all rounds, apply discount, record received payment |
| `manager@narenj.demo` | Manager | نارنج | All staff views, shift events |
| `manager@darband.demo` | Manager | رستوران دربند | **Negative cross-tenant isolation demo** |

The Narenj fixture has a central branch, a second branch, menu items in integer **toman**, tables including **table 3** with an active mixed-status order, and a previously paid receipt for table 2. Darband contains different dishes, staff and tables. Data are invented but operationally plausible.

## Main workflow (3–5 minutes)

1. Log in as **waiter**; select **table 8** (free) and add two `چای زعفرانی` with an item note. Click **ثبت نوبت و ارسال به آشپزخانه**.
2. Log out, log in as **kitchen**; move that item **در صف → در حال آماده‌سازی → آماده تحویل**. Status changes are per item, not wholesale replacement of the whole order.
3. Log in as **waiter** and **تأیید تحویل**. While the same session is still open, a second order round can be added without overwriting the first.
4. Log in as **cashier**, select table 8, inspect the running bill, optionally set a discount, choose the external payment method and record **تسویه**.
5. The session closes and the table becomes free. Try checkout *before* delivery to see the guarded error.
6. Log in as the **Darband manager**; Nar anj menu and orders must never appear, even with known Nar anj record IDs.

## Architecture

```
RTL browser (vanilla JS, zero frontend build step)
                  |
       Node.js 22 HTTP server
       auth sessions / origin check
       strict JSON request validation
       tenant + role verified server-side
          /                 \
 Postgres 16, RLS       Optional LLM API
 transaction & locks   (bounded menu IDs,
 audit and seed         human confirmation)
```

**Why vanilla JS?** The six-hour constraint rewards a single well-finished workflow. The UI is a small, dependency-light three-role interface; it does not need a component framework for an app of this size. The real complexity lies in the transactional domain model, not rendering.

### Domain model

- `restaurants` and `branches`: restaurant-level isolation, optional second branch under same tenant.
- `users`, `staff_memberships`, `auth_sessions`: email + scrypt password hash, revocable 12h token stored as a SHA-256 digest, HttpOnly SameSite=Strict cookie.
- `dining_tables` and `table_sessions`: one active session per table via a partial unique index. `version` changes on all meaningful actions.
- `order_rounds`: each new round is appended; unique `(restaurant_id, created_by, idempotency_key)` prevents duplicate retries.
- `order_items`: independent statuses (`queued`, `preparing`, `ready`, `served`, `cancelled`), immutable server-chosen name/price snapshots per round.
- `order_events`: timestamped actor and action audit trail, with no customer personal information.

### Transaction and security choices

- The runtime DB user `restaurant_runtime` is explicitly **non-superuser, NO BYPASSRLS**, separate from the one-time migrator role.
- Every restaurant-domain table uses **FORCE ROW LEVEL SECURITY**; without a transaction-local `app.tenant_id`, queries return zero rows. The value comes from the authenticated server session, not from request body.
- The server serializes writes **using a transaction-scoped advisory lock keyed by table UUID, followed by an active-session row lock**. Two simultaneous new rounds both persist. Two retries with the same idempotency key resolve to the same round. Locking is consistent across order creation, item status, discount and checkout.
- Explicit role and state-transition validation deny kitchen price changes, waiter payments, cancellation after cooking begins, and closing a session with undelivered food.
- All receipt totals are calculated in the server from integer toman snapshots, not from browser totals or LLM output.
- Writes require JSON and a matching `Origin`; cookie is `HttpOnly`, `SameSite=Strict`, optionally `Secure`. Secrets are environment variables; they are not committed.

**Known security limitation:** RLS with application-set custom GUCs assumes the trusted server is the only user of the runtime database credential. Compromise of that credential or SQL execution inside the server can bypass the request-level tenant context. A dedicated, narrowly scoped RPC or stronger database-level context verification is the next hardening step; do not expose runtime database credentials to clients.

### HTTP API

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Anonymous | Authenticate and set session cookie |
| POST | `/api/auth/logout` | Any authenticated | Revoke session |
| GET | `/api/me` | Any authenticated | Current user, role and tenant |
| GET | `/api/shift` | Any authenticated | Tenant-scoped tables, menu, active/historical rounds and event summary |
| POST | `/api/rounds` | Waiter, manager | Append a round, idempotent |
| POST | `/api/items/:id/transition` | Role depends on transition | Guarded per-item state transition |
| POST | `/api/sessions/:id/discount` | Cashier, manager | Set integer discount using expected version |
| POST | `/api/sessions/:id/checkout` | Cashier, manager | Validate full handoff, register counter payment, close table |
| POST | `/api/ai/parse` | Waiter, manager | Optional constrained Persian note parsing, no writes |
| GET | `/api/health` | Public | DB liveness only, no tenant data |

All write endpoints require `Content-Type: application/json` and an `Origin` matching `PUBLIC_ORIGIN`. Errors return JSON `{error:{code,message,traceId}}`; conflicts use HTTP 409. UI refreshes every five seconds and displays errors rather than implying a write succeeded.

## AI usage and failure mode

The optional **Persian order note parser** only converts a free-form note into menu item IDs, quantities, and per-item notes. It cannot set prices, perform writes, or auto-approve a round. The server provides only current tenant menu IDs/names to an OpenAI-compatible chat endpoint, constrains output and checks IDs against the menu again. Staff review and edit the result before adding it to the draft. Provider timeout/failure returns a visible message; manual selection continues.

To activate: set `AI_API_URL` (a trusted HTTPS `/chat/completions` endpoint), `AI_API_KEY` and `AI_MODEL` in `.env`, then restart. The UI intentionally does **not** mislabel rule-based keyword matching as AI. No key means this optional capability is disabled. Do not store customer identity or payment data in AI prompts.

## Verification

```bash
npm install
npm run check           # JS syntax checks
npm test                # pure, dependency-free unit tests
# with PostgreSQL running and ADMIN_DATABASE_URL / DATABASE_URL / DB_APP_PASSWORD set:
npm run migrate
SEED_DEMO=true DEMO_PASSWORD='Demo-Shift-1405!' npm run seed
npm run test:integration
```

Integration tests include a complete waiter → kitchen → waiter → cashier sequence; concurrent rounds; retry idempotency; role boundaries; RLS without tenant context; cross-tenant known-ID requests; and CSRF origin mismatch. The GitHub Actions workflow provisions Postgres 16 to run these checks. **Local limitation of the authoring environment:** no Docker daemon or npm registry access, so unit tests and syntax checks were run locally; real DB integration must be confirmed by CI. A passing CI status is required before calling this production-tested.

## Production deployment

Read [DEPLOY.md](DEPLOY.md) before putting this behind HTTPS. Do not deploy with demo passwords or a seeded public trial on the same database as real customers. A live HTTPS URL, real demo credentials, and a recorded walkthrough remain external submission requirements; they are **not fabricated by this repo**.

## Handover and review

- [docs/UX_BLUEPRINT.fa.md](docs/UX_BLUEPRINT.fa.md): Persian user journey, cross-role service blueprint, screen rationale and UX failure states
- [SCOPE.md](SCOPE.md): committed *before* implementation
- [DECISIONS.md](DECISIONS.md): choices, alternatives, accepted costs, and two choices to revisit
- [AI_USAGE.md](AI_USAGE.md): tools, trade-offs, validation, and rejected AI ideas
- [HANDOVER.md](HANDOVER.md): owner-friendly Persian operations guide and known limitations
- [SECURITY.md](SECURITY.md): concrete threat model and evidence
- [WALKTHROUGH.md](WALKTHROUGH.md): honest 7-minute video outline
- [DEPLOY.md](DEPLOY.md): HTTPS and environment checklist

Licensed under the repository's existing MIT LICENSE.

## Browser UX evidence (real app, automated)

On pull requests affecting the actual UI, the [Browser UX workflow](.github/workflows/browser-evidence.yml) starts a real PostgreSQL 16 instance and Node HTTP application, then uses Chromium/Playwright to exercise the flow via **actual employee screens**, saving screenshots and an automatic browser video to the GitHub Actions artifact `real-app-browser-evidence`. It covers waiter (two rounds on table 8), kitchen start/ready, waiter served, cashier discount and checkout, independent tenant and a 390px mobile viewport. The video is **automated acceptance evidence, not the recorded candidate explanation** requested by ShiftYar.

For the final handover form and exact prompt disclosure, see [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) and [AI_PROMPTS.md](AI_PROMPTS.md). Do not submit without a verified live site, credentials, and narrated walkthrough.

## Snapshot consistency and public-login protection

The shift snapshot now reads **every open table session** and all its rounds/items; only closed history is limited to 20 latest sessions. This prevents a busy restaurant from losing an older active ticket due to a global newest-N limit. The demo login endpoint has a small in-memory IP+account throttle (8 attempts per account+IP, 100 per IP per 15 minutes); hosting still needs distributed edge limits and monitoring. The integration suite covers absent-provider and stub-provider AI paths; a simulated provider **does not** prove that a paid/production model is configured or accurate.
