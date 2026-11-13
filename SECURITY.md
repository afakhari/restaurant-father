# Security review — actual risks, not a generic checklist

## 1. Horizontal cross-restaurant data access

**Threat:** a waiter at restaurant B guesses or obtains a session/item UUID from restaurant A and requests its details or mutates it.

**Controls:** the login cookie is bound to a staff membership; all restaurant domain operations execute under transaction-local `app.tenant_id` derived exclusively from the authenticated server session. Eight business tables enforce `FORCE ROW LEVEL SECURITY`. The runtime account is `NOSUPERUSER NOBYPASSRLS`. Tenant-scoped composite foreign keys prevent connecting order rows to another tenant's branch, table or menu item. API cannot choose a tenant from a JSON payload.

**Evidence:** integration suite logs in to Narenj and Darband, compares their menus, tries checkout and item transition using known foreign IDs (expected 404), and confirms `SELECT count(*)` without tenant context returns zero business rows.

**Residual:** a compromised runtime DB credential or server SQL execution can set the custom `app.tenant_id` variable. Production hardening should use a narrower database RPC boundary and enforce tenant context beyond a mutable app setting. No direct client-to-Postgres credentials are issued.

## 2. Lost updates, duplicate rounds and wrong kitchen state

**Threat:** concurrent waiters overwrite a round, kitchen changes a stale item, or a retry creates two tickets.

**Controls:** per-table advisory transaction locks followed by session row locks across all writer workflows; append-only order rounds; unique `(restaurant_id,created_by,idempotency_key)`; a recheck *under lock* for concurrent retries; mandatory `expectedStatus` for item changes; `expectedVersion` for discount and checkout; legal per-role transition graph. All changes commit in one Postgres transaction or roll back.

**Evidence:** concurrency integration test sends two round requests concurrently and checks both persist, then replays one identical key; transition unit tests reject illegal role/state operations.

**Residual:** a user reading stale state can receive 409 and must refresh. Very high write contention on one table serializes all changes. No offline local write queue exists.

## 3. Incorrect cashier settlement and untrusted AI text

**Threat:** staff falsify prices in browser requests; cashier closes an unserved session; user note manipulates LLM into using outside-tenant menu items.

**Controls:** server-owned menu lookup and integer price snapshot; no client price field accepted; discount bounded by subtotal and guarded by version; cashiers/managers only can settle; checkout requires every noncancelled item served; audit events capture actor/time. AI has limited menu input, timeout/output-token cap, schema-and-allowlist validation and human preview. It does not execute SQL or save orders directly.

**Evidence:** unit tests check client price ignored, math excludes cancelled items and AI may only return permitted menu IDs. End-to-end integration test attempts early checkout, then fully serves and settles with the correct amount.

**Residual:** external payment receipt is only staff attestation, not actual banking verification. AI accuracy against spontaneous Persian speech and prompt injection has not been adversarially tested.

## Operational controls and limitations

- User passwords are salted with scrypt; sessions use random 256-bit tokens stored only as SHA-256 digests, with 12-hour expiry and logout revocation.
- SameSite=Strict, HttpOnly, optional Secure cookies; JSON-only writes and a matching Origin. Set `PUBLIC_ORIGIN` and `COOKIE_SECURE=true` for HTTPS.
- Security headers: no framing, restrictive CSP, no sniffing, no referrer. UI escapes database-controlled text prior to rendering.
- Bounded 64 KiB JSON requests; AI note max 320 chars; no secrets or full food notes in request logs; trace ID on errors.
- **Not implemented:** MFA, credential reset, distributed edge rate limiting, alerting backend, strong branch-specific RBAC, HSTS from reverse proxy, audit export, retention policy, production backups, disaster recovery, stress/load testing, external security assessment. These are requirements for a real customer deployment, not hidden deliverables.

**Login throttling:** the Node process now caps attempts per remote IP and email within a 15-minute window. This is memory-only and is not sufficient for a multi-replica or Internet-exposed service without trusted-edge throttling and monitoring.
