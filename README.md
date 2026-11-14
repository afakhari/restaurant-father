# ShiftYar | شیفت‌یار

**An operational, Persian-first MVP for Iranian cafés and restaurants.**

ShiftYar connects the floor, kitchen, and cashier around one reliable shift workflow: a waiter can open a table, add multiple order rounds, follow each item's preparation and handoff, and settle the table when service is complete. It is a deliberately focused SaaS foundation, **not** a full restaurant ERP.

## Live demo and evaluator access

**Hosted demo:** https://restaurant-father-demo-xem8.onrender.com  
**Source code:** https://github.com/afakhari/restaurant-father

> **راهنمای دسترسی برای کاربران داخل ایران:** برای مشاهده نسخه آنلاین سایت، ابتدا فیلترشکن را روشن کنید. دسترسی مستقیم به دامنه `onrender.com` ممکن است بسته به اینترنت و اپراتور محدود باشد.  
> **Access from Iran:** Enable a VPN before opening the hosted demo if your network cannot reach Render (`onrender.com`).

The demo is deployed on a **Render Free** web service with a separate **Neon PostgreSQL** database. A free Render instance can sleep while idle; its first request may take longer to respond. The public URL is recorded in the project, but **availability, successful HTTPS login, and a complete hosted browser walkthrough must be checked from the reviewer's network before submission**. A health response alone does not prove the entire application works.

**Demo sign-in:** The accounts below are seeded locally. The **hosted demo uses a separately provisioned password** that must be shared privately with the evaluator; do not assume the local password works online.

**Walkthrough video:** A candidate-recorded, narrated **5–10 minute video is still a submission requirement**. See [the recording plan](WALKTHROUGH.md). The automated CI browser video is technical evidence, **not** a substitute.

## Product scope

| Role | What the employee can do |
| --- | --- |
| **Waiter / پیشخدمت** | Select a branch and table, create and append order rounds, add item-specific notes, confirm service of ready items, cancel queued items with a reason |
| **Kitchen / آشپزخانه** | Move each item from **queued → preparing → ready**, without seeing or changing bill/payment data |
| **Cashier / صندوق‌دار** | Review all rounds on a table, apply a validated discount, attest to an external payment and close a fully served session |
| **Manager / مدیر** | Use the staff views, review audit events, handle exceptional stockout cancellations, and close an entirely cancelled table **without recording a fictitious payment** |

A table has at most one active **table session**. Each later order is an appended **round**; each ordered item has its own state. **Ready** means the kitchen finished preparing an item; **served** means the waiter handed it to the guest. That distinction prevents a cashier from settling a table with undelivered items.

### Designed for Iranian operations

- Right-to-left **Persian UI**, Vazirmatn font, **Asia/Tehran** display time and Persian calendar formatting.
- Prices and totals in **integer toman**, without silently converting rial to toman. Persian, Arabic-Indic and Western digits are handled where appropriate.
- Persian menu search normalizes variants such as `ی/ي` and `ک/ك`. Each item can have its own note, for example «بدون پیاز». Draft lines can be split when only one of two matching drinks needs a special instruction.
- Responsive ordering flow on smaller screens: **tables → menu → order**, with a sticky draft summary and a confirmation before abandoning an unsent draft.
- In-app confirmation for destructive actions, visible connection/error state and server-acknowledged writes. There is **no offline order queue**.

## Quick start: local demo

**Requirements:** Docker Engine with Docker Compose. From the repository root:

```bash
docker compose up --build
```

Open **http://localhost:3000**. The Compose stack starts PostgreSQL 16, applies migrations with an administrative database user, creates the restricted runtime user, and seeds two fictitious restaurants. Data persist in the `shiftyar_pgdata` Docker volume. The local defaults are **for development only**, not internet deployment.

To supply your own local secrets, copy `.env.example` to `.env` and change the relevant values before starting. To **delete all local demo data and start over**:

```bash
docker compose down -v
docker compose up --build
```

### Local-only demo accounts

**Password for every local seed account:** `Demo-Shift-1405!`

| Account | Role | Tenant |
| --- | --- | --- |
| `waiter@narenj.demo` | Waiter | کافه و رستوران نارنج |
| `kitchen@narenj.demo` | Kitchen | نارنج |
| `cashier@narenj.demo` | Cashier | نارنج |
| `manager@narenj.demo` | Manager | نارنج |
| `manager@darband.demo` | Manager | رستوران دربند |

The seed contains a free **table 8**, an active mixed-state **table 3**, a previously settled table, menu items, two Narenj branches, and a separate Darband restaurant. Demo information is fictional. The public website must use a different, non-public password.

### Five-minute hands-on workflow

1. Sign in as **Narenj waiter**. Select **table 8**, add two «چای زعفرانی» with an item note, and submit the round to the kitchen.
2. Sign in as **Narenj kitchen**. Move the item through **در صف → در حال آماده‌سازی → آماده تحویل**.
3. Return as **waiter**, confirm **تحویل**, then optionally append another round to the same still-open table.
4. Sign in as **cashier**, select table 8, review itemized totals, optionally set a discount, and record settlement **only after every item is served or cancelled**. The table becomes free.
5. Sign in as **Darband manager** and confirm that Narenj tables, menu and orders are not visible. Try an unauthorized transition or premature checkout to see an explicit rejection.

**If you're recording on the public demo:** use the privately shared hosted credentials, not the local password; the database may already contain changes from previous reviewers. Choose an appropriate free table rather than relying on table 8 being untouched.

## Optional AI-assisted Persian ordering

The waiter can describe an order in natural Persian, for example «دو تا لاته، یکی کم‌شیر، و یک چیزکیک». When an external provider is configured, the AI endpoint proposes **menu item IDs, quantities and item notes**. Staff can **review and edit the suggestions before applying them to a draft**; a second explicit order submission is still required.

The model is restricted to the authenticated restaurant's menu. The server validates its output again, selects prices itself, and **never lets the model submit an order, charge a customer or alter a bill**. Ambiguous or unmatched text is exposed rather than silently invented. Provider failure or timeout does not block manual entry.

Set these environment variables to activate the optional feature:

```dotenv
AI_API_URL=https://your-trusted-provider.example/v1/chat/completions
AI_API_KEY=your-private-key
AI_MODEL=your-model
# optional: AI_TIMEOUT_MS=4500
```

The provider must be a trusted HTTPS, OpenAI-compatible chat-completions endpoint. **Without these values, the AI feature is visibly unavailable**, not replaced by a fake local model. Do not place real customer identities or payment details in prompts. See [AI_USAGE.md](AI_USAGE.md) and [AI_PROMPTS.md](AI_PROMPTS.md) for the implementation disclosure.

## Architecture and engineering decisions

```text
Persian RTL browser (vanilla JS; responsive)
            │ HTTPS / cookie session
            ▼
       Node.js 22 API
  validation, RBAC, tenant context
        │               │
        ▼               ▼
 PostgreSQL 16      Optional LLM API
 transactions       bounded suggestions
 FORCE RLS          human confirmation
```

**Why this slice?** The highest-risk failure in a busy café is not missing a dashboard; it is a lost order, an ambiguous kitchen handoff, an incorrect bill, or a cross-restaurant data leak. The MVP prioritizes one complete, testable service cycle.

**Core safeguards:**

- **Multi-tenancy:** Every restaurant-owned table is protected with `FORCE ROW LEVEL SECURITY`; tenant context comes from the authenticated server session, not a client-supplied tenant ID. A restricted `restaurant_runtime` database role is used by the HTTP service.
- **Concurrent writes:** Table-level transaction/advisory locking, version checks, append-only rounds and idempotency keys protect against overwritten or duplicate orders.
- **Permission boundaries:** Both API responses and mutations are role-restricted. Kitchen staff cannot receive pricing/payment data, and the cashier cannot mark dishes ready.
- **Correct settlement:** Server-side immutable item-price snapshots in toman; no trust in browser or AI-calculated totals. Checkout is refused while any item awaits service.
- **Traceability:** Per-item lifecycle and significant exceptions are recorded with an actor and timestamp. Authentication uses hashed passwords and revocable, HttpOnly, SameSite cookies; mutations check the request origin.
- **Failure states:** Visible errors, HTTP 409 for conflicts, a five-second polling snapshot, protection of unsent drafts and no false claim that a write succeeded after a request failure.

**Trade-offs:** Vanilla JavaScript and polling keep this narrow MVP simpler to operate. It does not implement payment processing, regulatory invoices, refunds, split bills, inventory purchasing, reservations, delivery, customer accounts, durable offline operation, or full production observability. An application credential compromise remains an important security boundary despite RLS; see [SECURITY.md](SECURITY.md).

## Verification

```bash
npm install
npm run check
npm test
npm run audit:release
# The following need a running PostgreSQL and configured DB credentials:
npm run migrate
SEED_DEMO=true npm run seed
npm run test:integration
# Hosted smoke check requires the correct configured demo secrets:
npm run verify:demo
```

- **Unit tests:** Persian input normalization, locale behavior and core validation.
- **PostgreSQL integration tests:** Full waiter → kitchen → waiter → cashier flow, concurrent order rounds, idempotency, permissions, tenant isolation/RLS, cancellation/void, version conflicts and origin protection.
- **GitHub Actions:** Database-backed tests and a [real-browser UX workflow](.github/workflows/browser-evidence.yml) using Chromium/Playwright, including mobile-width scenarios. Its `real-app-browser-evidence` artifact contains screenshots and an **automated** browser recording, which does not replace the narrated candidate video.
- **Evidence boundary:** Check the latest [Actions runs](https://github.com/afakhari/restaurant-father/actions) before handing over. Browser CI is not proof of Safari/iOS coverage or a production-grade accessibility certification. A public Render health check alone does not verify complete authenticated UX.

## Deployment and security

The [Render Blueprint](render.yaml) deploys the Node application on a free web service; the persistent database is hosted separately on Neon. The deployed application should receive only the **unprivileged runtime `DATABASE_URL`** and production settings such as `COOKIE_SECURE=true` and the correct `PUBLIC_ORIGIN`. Migration/seed database-owner credentials and hosted demo login passwords must never be committed or injected into the public app process.

Read the [free demo guide (Persian)](docs/FREE_DEMO_DEPLOY.fa.md) and [DEPLOY.md](DEPLOY.md) for environment provisioning, secret handling and HTTPS verification. The hosted demo is **for assessment with fictional data**, not for real customer or payment information.

## Assessment handover

| Resource | What it contains |
| --- | --- |
| [SCOPE.md](SCOPE.md) | Initially committed product scope, user journeys and accepted exclusions |
| [DECISIONS.md](DECISIONS.md) | Engineering/product decisions, alternatives and costs |
| [AI_USAGE.md](AI_USAGE.md) / [AI_PROMPTS.md](AI_PROMPTS.md) | AI assistance disclosure, prompts, limits and verification |
| [HANDOVER.md](HANDOVER.md) | Persian operator guide and limitations |
| [WALKTHROUGH.md](WALKTHROUGH.md) | **5–10 minute human-narrated** recording structure |
| [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) | Final reviewer links, credentials and evidence checklist |
| [docs/UX_BLUEPRINT.fa.md](docs/UX_BLUEPRINT.fa.md) / [docs/UX_AUDIT.fa.md](docs/UX_AUDIT.fa.md) | Iranian workflow blueprint and responsive UX audit |
| [SECURITY.md](SECURITY.md) | Threat model and security boundaries |

**Submission readiness:** source and documentation are available; confirm the public website and credentials with a real browser, recheck CI, record the personal narrated video and include its URL in the final submission. Do not claim tests or integrations that have not been observed.

MIT License.
