# SCOPE — ShiftYar (شیفت‌یار)

**Agreement date:** 2026-11-13. **Status:** written before product implementation. **Time cap:** 6 hours active engineering work. **Customer:** one Iranian full-service café/restaurant. **Product type:** future multi-tenant SaaS with branches.

## Customer problem and chosen slice
During a live shift, a waiter adds a drink to a table, the kitchen starts preparing a dish, another waiter adds a second round and a cashier needs a correct bill. Paper notes and disconnected apps create lost additions, ambiguous handoffs, and accidental checkout. We choose **table-session → multi-round order → per-item kitchen progress → waiter handoff → internally recorded checkout** as one vertical workflow. A restaurant owner can use the seeded demo to experience an actual shift, not a dashboard of fictional KPIs.

## Users and responsibilities
- **Waiter:** see tables and menu, open/add a round, check status, mark READY items SERVED, cancel only QUEUED items with a reason.
- **Kitchen:** see queued/preparing items, mark QUEUED → PREPARING → READY; cannot change price or bill.
- **Cashier:** see running bill, apply bounded discount, record **offline/counter payment** and close a fully served session.
- **Manager:** perform all staff actions, review audit history. No customer PII is needed for the chosen slice.
- Login identities and restaurant memberships are server-verified; a restaurant never chooses its tenant in a request payload.

## User journey and acceptance criteria
1. Waiter logs in and chooses an occupied/free table. An open table has at most one active session.
2. Waiter selects menu items, quantities, Persian notes and posts a round. Prices are looked up by the server and snapshotted. A repeated submission with the same idempotency key creates no duplicate.
3. Two simultaneous additional rounds to the same table both survive; kitchen updates cannot overwrite additions; individual items change status under explicit transition rules.
4. Kitchen progresses each item. READY is distinct from SERVED: waiter confirms actual handoff to customer.
5. Cashier sees the sum across every round, applies discount without exceeding subtotal, and records a payment method. Closing an unsettled/in-progress table is denied.
6. Restaurant A's API and DB queries cannot reveal or mutate restaurant B's tables, menu, items, sessions or events. Evidence: independent tenants seeded and automated negative tests.
7. Each role has realistic seeded credentials, branch/table/menu data, an active busy shift and history (a previously closed shift).
8. AI offers **optional Persian note-to-menu extraction**, anchored to the current restaurant's menu, with human review before submission. No AI output can set prices or write directly to the DB; error/timeout must not block manual ordering.

## Domain and product boundaries
**In:** Persian RTL; toman stored as integer; branches within a restaurant; staff RBAC; table session; multiple order rounds; independently tracked item status; append-only actor/timestamp audit events; short-lived authenticated session; transactional server writes; tenant isolation with PostgreSQL RLS; validation and meaningful errors; four handover artifacts, tests, seeded demo, local one-command boot where possible.

**Out:** regulatory/fiscal invoices, bank/card terminal integration, real online payments, inventory purchasing, table reservations, fiscal tax claims, refunds, customer accounts, loyalty, printer setup, full offline-first synchronization, splitting bills among customers, food delivery, advanced analytics, production call-center support. Recorded payment means **cashier states the money was received outside this application**, not proof of funds transfer.

## Research and Iran-specific decisions
- RTL Persian for staff at a noisy restaurant; table numbers prominent; zero-ambiguity READY vs SERVED.
- **Integer toman** for local menu and bill, with clearly labeled units; no silent toman/rial conversion.
- Notes such as «بدون پیاز» must remain attached to the correct item. No invented prices, AI menu names, tax percentages or official receipts.
- A first branch and a second branch belong to one restaurant; another restaurant exists as a negative-isolation fixture.
- A customer may order repeatedly without closing the table. Cashier cannot accidentally close a table while food is being prepared.

## Delivery approach and evidence
- PostgreSQL migrations and seed, runtime non-superuser with FORCE RLS on business tables, per-request scoped transaction.
- Server-side role checks and input validation; no trusting client-provided totals.
- Tests covering **two concurrent rounds**, **idempotency**, **tenant separation**, **invalid state transition**, and **end-to-end order-to-settlement**. Document tests not run.
- HTTPS deployment and reachable demo credentials **only if deployment credentials/integration are available**; do not pretend a local Docker build is live.
- README, DECISIONS.md, AI_USAGE.md, HANDOVER.md, and video walkthrough instructions.

## Risk register
1. Cross-tenant leak: tenant context derived only from verified staff membership; RLS deny-by-default; try cross-tenant ID requests.
2. Lost/double order: database transactions, row locks, monotonic version, client request idempotency.
3. Wrong bill/unauthorized checkout: server-snapshot prices and guarded checkout; explicit cashier role; audit.
4. AI hallucinates/slow: strict item ID/quantity schema, fallback to manual, time budget and bounded model inputs.

## Success / explicitly accepted trade-offs
This is a **narrow operational service MVP**, not a full ERP. Use polling over advanced event streaming; prefer usable and correct cross-role updates to decorative real-time effects. Artificially seeded demonstration data is marked as such. The screen layout is a prototype until connected to working persistence and tested backend. If a live deployment is unavailable, say so in the handover instead of fabricating a URL.

## Scope-control rule
Finish and test the single round-trip workflow before adding optional AI refinements or new screens. Any extra feature must justify removing something from the six-hour cap.
