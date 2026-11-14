# DECISIONS — ShiftYar

Each decision documents **decision / why / alternative / accepted trade-off**, recorded during implementation. The first two explicitly identify choices we would revisit.

## D-01 — One table session, many order rounds (keep)
- **Decision:** Each physical table has at most one active session; a session can contain any number of appended rounds and individually tracked order items.
- **Why:** In an Iranian full-service restaurant customers commonly add drinks or dessert after the first order. Replacing an entire order on each update can lose concurrent changes.
- **Alternative:** A single mutable order JSON document for each table, overwritten on every edit.
- **Trade-off:** More relational entities and explicit session lifecycle in return for safer updates and accurate final billing.

## D-02 — Table-scoped serialization and idempotent order creation (keep)
- **Decision:** For each mutation take a transaction-scoped advisory lock keyed by table UUID before locking its session row; add rounds transactionally; use a client-generated idempotency UUID; verify item status on writes.
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


## D-11 — Small-screen step-by-step ordering (keep)
- **Decision:** Keep the three-pane desktop workplace, but use explicit Tables → Menu → Order steps and a fixed draft summary under 1000px.
- **Why:** A phone-sized employee interface used to place the cart after a long list of tables and dishes. A busy waiter must be able to inspect the cart without retracing the whole page.
- **Alternative:** One continuously scrolling vertical page or a slide-over cart with nested gestures.
- **Trade-off:** One extra tap when switching between menus and table context; clearer navigation and fewer accidental actions.

## D-12 — Guard navigation and provide native accessible dialog (keep, revisit)
- **Decision:** Ask for confirmation before clearing a draft during table/branch/logout switches, and use a styled in-app dialog for cancellation and cashier receipt confirmation.
- **Why:** Draft loss costs a real order, and irreversible money-related actions merit explicit language.
- **Alternative:** Persist every draft server-side and support resumption across devices, or a keyboard-only native browser confirmation.
- **Trade-off:** In-memory draft is still lost on a hard crash or session expiry. Persistent cross-device drafts and a full accessibility audit remain future work.


## D-11 — Manager-only cancellation of started tickets and zero-payment void (scope refinement)
- **Decision:** Allow manager cancellation of PREPARING/READY-but-not-SERVED items with a recorded reason; add a guarded, version-checked close operation only for sessions whose *every* item is cancelled. Payment fields remain NULL.
- **Why:** A stockout after cooking begins or a fully cancelled order would otherwise leave the table permanently blocked or force staff to fabricate service/payment. This is a correction discovered through live-shift exception review, not an added POS module.
- **Alternative:** Staff manually mark cancelled food served and invent a zero-toman transaction, or allow all roles to cancel at any stage.
- **Trade-off:** More state transitions, an explicit extra endpoint and regression tests. The original `SCOPE.md` remains the pre-build agreement; this deviation is explicitly recorded here. Served-item refunds are still excluded.

## D-12 — Role-specific API projection, not just navigation (security correction)
- **Decision:** Kitchen responses omit prices, discounts, payment and event history; waiter responses omit historical receipts and manager audit; cashier receives current/closed billing information without the editable menu feed. Manager retains cross-workflow events.
- **Why:** Hiding checkout tabs in the browser is not data authorization. A kitchen employee can inspect a JSON response even when the UI does not show a receipt.
- **Alternative:** Return one rich `/api/shift` payload to everyone and hide fields using CSS/JavaScript.
- **Trade-off:** The shared snapshot endpoint now applies explicit response projections; future roles need carefully tested privacy contracts, ideally separate read endpoints.

## D-13 — Locale normalization only at presentation/input boundary
- **Decision:** Accept Persian/Arabic/Latin digits and grouping for cashier discount, normalize Persian/Arabic keyboard variants for menu search, and allow distinct notes for identical food items. Server APIs still require validated integer toman, not strings or rial.
- **Why:** Iranian staff may use heterogeneous mobile keyboards; manual correction is costly during a shift.
- **Alternative:** Require ASCII digits and exact Persian spelling everywhere.
- **Trade-off:** Dedicated input parsing and tests; no automatic currency inference or fractional money is permitted.


## D-14 — Reject edited retries rather than silently reuse a prior round
- **Decision:** Idempotency replay verifies the original item IDs, quantities and notes in a canonical order; changed payloads return 409 and require the waiter to review the table and submit a fresh round.
- **Why:** The server may commit an order while its network response is lost. A subsequent edited retry must not report success for an older, different order.
- **Alternative:** Deduplicate solely by actor-provided idempotency key, regardless of content.
- **Trade-off:** One small indexed lookup of original order lines on replay; bounded to twelve lines per round.


## D-15 — Editable natural-language order proposals with truthful non-AI fallback (later enhancement)

- **Decision:** Suggestions belong to a verified restaurant/table/session and a particular source-text revision. Unmatched and invalid entries remain visible. Staff edit menu items, quantities and per-unit notes, then explicitly add to the draft; final submission is a separate server transaction. A limited deterministic fallback is labeled non-AI.
- **Why:** Ambiguous Persian restaurant utterances, different preparation requirements and in-flight table switching make auto-submission unsafe. Price snapshot expectations reject silent price changes between review and kitchen submission.
- **Alternative:** Unvalidated LLM JSON inserts, auto-posted orders and paid provider dependency for every waiter action.
- **Trade-off:** Ambiguity still needs human decisions, and a shared distributed limiter/cost budget and legally available provider are needed before scaling. This work was requested after the original six-hour MVP.

