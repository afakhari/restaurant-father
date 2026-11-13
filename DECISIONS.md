# DECISIONS — ShiftYar

Each decision documents **decision / why / alternative / accepted trade-off**, recorded during implementation. The first two explicitly identify choices we would revisit.

## D-01 — One table session, many order rounds (keep)
- **Decision:** Each physical table has at most one active session; a session can contain any number of appended rounds and individually tracked order items.
- **Why:** In an Iranian full-service restaurant customers commonly add drinks or dessert after the first order. Replacing an entire order on each update can lose concurrent changes.
- **Alternative:** A single mutable order JSON document for each table, overwritten on every edit.
- **Trade-off:** More relational entities and explicit session lifecycle in return for safer updates and accurate final billing.

## D-02 — Table-level serialization and idempotent order creation (keep)
- **Decision:** For each mutation lock the dining table row before its session; add rounds transactionally; use a client-generated idempotency UUID; verify item status on writes.
- **Why:** Two waiters and kitchen/cashier may act on the same table. Network retries can duplicate charges.
- **Alternative:** Optimistic full-document PUT with only a version counter, or a distributed queue.
- **Trade-off:** Hot-table contention and additional round-trip latency. This is acceptable for a small branch and clearly breaks under severe table-specific write contention.

## D-03 — Tenant scoped DB role and FORCE RLS (keep, harden later)
- **Decision:** All business tables use FORCE RLS and a non-superuser runtime role. A transaction-local tenant context is set only after verifying the user's session.
- **Why:** A missing tenant filter in a new query should not leak another restaurant's menu or orders.
- **Alternative:** Application-only `WHERE restaurant_id = ...`; separate database per restaurant; security-definer RPC with signed tenant context.
- **Trade-off:** Operational migrations require an owner role, transaction context must be set consistently, and mutable GUC context is not sufficient against a compromised DB connection/SQL execution. Restrict runtime credential access; consider signed context RPC for production.

## D-04 — Role-specific UI and transition rules (keep)
- **Decision:** Waiter, kitchen, cashier and manager have separate default pages and actions. `READY` and `SERVED` are not the same event.
- **Why:** Restaurant staff need one obvious next step, not a generic admin dashboard. Kitchen readiness does not prove that food reached the guest.
- **Alternative:** One universal employee dashboard with a status dropdown for everyone.
- **Trade-off:** Four demo accounts and navigation are needed; each new step requires testing its role boundary.

## D-05 — Block normal checkout until all items delivered (REVISIT / likely wrong for real restaurants)
- **Decision:** The cashier can close the table only when every non-cancelled item is `SERVED` and at least one item was served.
- **Why:** It prevents accidentally abandoning a plate while closing the bill, a useful MVP invariant.
- **Alternative:** Allow settling before delivery with an explicit managerial exception and an open kitchen handoff after payment.
- **Trade-off:** Guests may pay early, leave while waiting for takeaway, or have legitimate exceptions. The current UX is deliberately strict and may be **wrong** for some real service patterns. Next design: manager-authorized early settlement that does not silently delete kitchen tasks.

## D-06 — Poll every five seconds instead of push delivery (REVISIT / likely wrong for a busy kitchen)
- **Decision:** Shared state is fetched via `/api/shift` every five seconds; the frontend does not maintain a WebSocket.
- **Why:** A simple, observable fallback avoids spending the six-hour window on reconnect edge cases.
- **Alternative:** Server-Sent Events per tenant/branch, realtime broadcasts, or WebSocket hub.
- **Trade-off:** A new ready plate can take five seconds to appear on the waiter's screen and many browsers repeat a relatively large query. This is **wrong** for high-volume service; use change-stream-driven narrow subscriptions once correctness is proven.

## D-07 — Integer toman and price snapshots (keep)
- **Decision:** Store menu/receipt amounts as safe integer toman; every order item snapshots server-side name and price.
- **Why:** Clear Iranian pricing semantics and deterministic bills when prices are changed later.
- **Alternative:** decimal rial accounting ledger or floating point client totals.
- **Trade-off:** Explicit rial conversion and tax/fiscal integration are deferred. No current legal invoicing claim is made.

## D-08 — Bounded AI note-to-item preview (keep, provider conditional)
- **Decision:** An optional LLM suggests only menu item IDs, quantities and item notes; server validates and a staff member must explicitly approve.
- **Why:** Reduces repetitive order entry in Persian, while avoiding incorrect pricing and uncontrollable writes.
- **Alternative:** AI chat waiter, auto-sending recognized orders to kitchen, or AI-driven stock/recommendations.
- **Trade-off:** Requires a paid provider key, incurs small latency and cost, may fail or misinterpret spoken language. Manual ordering remains first-class. Without credentials this capability is honestly unavailable.

## D-09 — Zero-build vanilla browser UI (keep within challenge)
- **Decision:** A small single-page RTL interface in HTML/CSS/JS with accessible buttons, labels, branch switcher and role-aware screens.
- **Why:** Enables focused UX work without build-tool overhead, especially since the repository initially contained only a license file.
- **Alternative:** Next.js app router + component library or a multi-package React monorepo.
- **Trade-off:** Explicit rendering and event delegation grow less maintainable at larger feature count; migrate to components as teams/features expand.

## D-10 — Dedicated migration container and local Docker Compose (keep)
- **Decision:** A one-shot migrator has owner credentials and the runtime only has tenant data privileges; migrations/seed happen before the app starts.
- **Why:** The application should not run with DDL rights or SUPERUSER privileges just to load its tables.
- **Alternative:** One shared Postgres superuser credential for everything.
- **Trade-off:** A service ordering/deployment step and two DB passwords are required. Changing database schema across large environments later needs versioned, reversible migrations rather than just replaying initial setup SQL.
