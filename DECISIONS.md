# DECISIONS | ShiftYar (شیفت‌یار)

**Decision record, reviewed 2026-11-14.** Decisions are written as **choice → rationale → rejected alternative → cost / reversal trigger**. They describe architectural and product reasoning, not interviews, benchmarks or load tests that did not happen. The candidate reports **about six productive hours total across non-consecutive work sessions**. Dates in the repository describe the sequence of decisions, not continuous engineering time.

## The product bet

The initial brief did not supply screens or a feature list. The essential bet was that a restaurant benefits more from **one consistent shift-to-settlement transaction path** than from a large, partially implemented POS. An employee's most damaging mistakes are losing an added order, giving the kitchen an unclear instruction, closing a table prematurely or seeing another restaurant's data.

Therefore we intentionally built a narrow, Persian-first operational slice: **table → multiple rounds → individual kitchen items → physical handoff → externally received payment recorded by cashier**. Its success is demonstrable with fictional data; any claim of operational improvement needs future field measurement.

## D-01 · One active table session; append-only order rounds
**Choice:** Each table has at most one open session; later orders add rounds, never replace earlier rounds. Items independently track status and notes.

**Why:** Guests often request additional drinks and desserts while an earlier order is being prepared. A mutable all-in-one table JSON would be easy to overwrite during concurrent work.

**Alternative rejected:** A single mutable order document updated with PUT after every edit.

**Cost / revisit:** Extra relational entities and explicit lifecycle transitions. Revisit for non-table services such as takeaway or delivery, not by weakening the table invariant.

## D-02 · Transactional table serialization plus payload-aware idempotency
**Choice:** Serialize writes on a table with a PostgreSQL transaction advisory lock, version-check state-changing operations, and persist a client-generated idempotency key for each added round. A replay must match the table **and canonical item IDs, quantities and preparation notes**; edited reuse returns HTTP 409. The key is checked again after acquiring the table lock.

**Why:** A lost HTTP response must not cause two kitchen tickets or report that a changed retry was recorded when it was not. Concurrent waiters must not overwrite one another.

**Alternative rejected:** Client-side disabling alone, a document overwrite, or replay keyed only by UUID irrespective of content.

**Cost / revisit:** A frequently contested table serializes its writes; retries sometimes require explicit staff review. Benchmark under real peak service before considering narrower locks.

## D-03 · Tenant context at the server and PostgreSQL FORCE RLS
**Choice:** Derive the restaurant from authenticated staff membership, use a restricted runtime DB user, set tenant context per transaction, and enforce FORCE ROW LEVEL SECURITY on restaurant-owned tables.

**Why:** Application-level WHERE clauses are easy to forget when adding a report, search or new endpoint. Database-level rejection adds a second boundary.

**Alternative rejected:** Trusting tenant IDs supplied by the browser; relying exclusively on application filters; a separate database for every tiny restaurant from day one.

**Cost / revisit:** Additional migration/runtime roles and strict transaction discipline. A compromised runtime DB connection that can change tenant context remains a risk; stronger signed context or restricted RPC should be evaluated before production multi-tenancy. RLS is not a claim of immunity to all SQL compromise.

## D-04 · Four task-oriented roles with authorization in *responses and writes*
**Choice:** Waiter, kitchen, cashier and manager receive relevant actions and JSON projections. Kitchen does not get payment or price fields; waiter does not get paid receipt history or management audit; cashier cannot change cooking status. Manager has explicitly bounded exception actions.

**Why:** Hiding a tab is not access control. A legitimate employee can inspect network responses.

**Alternative rejected:** A single dashboard and one rich unrestricted /api/shift JSON object for every login.

**Cost / revisit:** More authorization tests, response-shape maintenance and role switching in the demo. Branch-specific staff membership remains unimplemented and would matter for chains.

## D-05 · Distinguish READY from SERVED
**Choice:** Kitchen marks an item READY; only a waiter/authorized manager marks it SERVED after handoff.

**Why:** Preparation completion is not evidence that the guest received the food. This distinction also underpins settlement checks.

**Alternative rejected:** One “done” state representing both kitchen completion and guest delivery.

**Cost / revisit:** One extra interaction for staff. Reduce friction with better notifications rather than corrupting the meaning of status.

## D-06 · Block ordinary checkout on unserved items **[revisit]**
**Choice:** The cashier records settlement only after all non-cancelled items are served and at least one was served. Payment method denotes **employee attestation of money received outside the app**, not an actual bank transaction.

**Why:** Prevents quiet closure while a plate is still in the kitchen, and keeps a small MVP understandable.

**Alternative rejected:** Any-time close regardless of service state; mock online payment gateway.

**Cost / trigger:** This is **too restrictive** for customers paying early, takeaway and unusual service recovery. Next iteration should support explicit manager-authorized early payment while kitchen tasks continue independently. No real payment, refund or reconciliation exists.

## D-07 · Manager-only cancellation and fully-cancelled release
**Choice:** Waiters may cancel queued items with a reason; managers may exceptionally cancel preparing/ready-but-not-served items. If **every item** is cancelled, only a manager may close the session with a reason and **without payment fields**.

**Why:** A stockout or full cancellation should not leave a permanent occupied table or force fictitious payment data.

**Alternative rejected:** Marking cancelled items as served or creating a fake zero-toman payment.

**Cost / revisit:** An additional audited exception path. Served-item refunds and partial financial adjustments are not included.

## D-08 · Integer toman with server-owned price snapshots
**Choice:** Store money as validated integer **toman** and snapshot menu name/price when an item is committed. Recompute subtotal and discount on the server. A reviewed price that changed before order submission triggers a conflict rather than silent acceptance.

**Why:** Different Iranian displays use rial/toman inconsistently. Silent conversion or recomputing historical tickets from new menu prices can damage trust.

**Alternative rejected:** Floating-point client totals, silent rial conversions or calculating an old bill using current catalog prices.

**Cost / revisit:** Fiscal accounting and regulatory invoice rules need a separate deliberate design; none are claimed.

## D-09 · Persian-first task UI rather than generic translated administration
**Choice:** RTL, Vazirmatn, Persian calendar/Tehran time, Persian/Arabic keyboard normalization, item-level instructions, and mobile steps **tables → menu → draft**, with a visible summary and draft-loss confirmation.

**Why:** A waiter working quickly on a phone has different needs from an English desktop back-office user. Distinct notes for two nominally identical drinks must not be merged.

**Alternative rejected:** English-first admin template, giant phone scroll, hidden cart, exact-character-only search.

**Cost / revisit:** More input boundary tests and responsive states; stored drafts remain in browser memory and can be lost on crash. Real iOS/Android assistive-technology testing is outstanding.

## D-10 · Five-second polling instead of WebSocket/SSE **[revisit]**
**Choice:** Refresh the shift snapshot periodically; show connection errors and only declare success after the server acknowledges a write. No offline order queue.

**Why:** It minimizes reconnection and synchronization work within a tightly scoped assessment.

**Alternative rejected:** An immediate multi-node WebSocket event infrastructure.

**Cost / trigger:** Up to roughly five seconds of visibility delay and unnecessary snapshot traffic; not good enough for a very busy kitchen or thousands of active branches. Move to narrow push events, observable reconnect and resynchronization when volume justifies it.

## D-11 · Plain Node.js + PostgreSQL + vanilla browser UI
**Choice:** Node.js 22 HTTP service, PostgreSQL 16 with migrations and a restricted runtime role, and lightweight HTML/CSS/JavaScript UI without a frontend framework or build pipeline. Local startup uses Docker Compose.

**Why:** Minimize framework/deployment overhead while prioritizing the data invariants and complete workflow. This is a deliberate short-horizon choice, not a claim that vanilla JS always scales better.

**Alternative rejected:** A large Next.js monorepo or adopting a full existing POS and reshaping the entire workflow.

**Cost / trigger:** Rendering/state management grows harder with additional teams and modules. Extract components or adopt a framework when changes justify the migration. Use versioned, reversible migrations before production schema evolution.

## D-12 · Narrow AI-assisted order *proposal*, never autonomous order posting
**Choice:** The later text-intake workflow is bound to authenticated tenant/table/session and source revision. It produces editable menu-item proposals with quantities, per-item notes, cited source phrases and unresolved phrases. Staff explicitly **add approved lines to a draft**; a separate normal order action performs the transactional write. An unavailable provider leaves a clearly labeled **rule-based, non-AI matcher** plus manual entry.

**Why:** A phrase such as «دو لاته، یکی کم‌شیر» is not safe to turn into two indistinguishable lines. The model must not invent menu IDs, prices, availability or transaction authority.

**Alternative rejected:** Free-form chatbot directly modifying orders; pretending deterministic search is model inference; silently discarding uncertain phrases.

**Cost / trigger:** Human review is sometimes slower; actual model accuracy, cost, latency, permitted Iranian service access and privacy have not been established. AI is optional, rate-limited and disableable. See AI_USAGE.md and docs/AI_ORDER_TECHNICAL_DESIGN.md.

## D-13 · Demo infrastructure, not production certification
**Choice:** Docker Compose for reproducible local setup, a Render Free web demo and a separate Neon Postgres environment for assessment, with demo-only fictional accounts and private hosted credentials.

**Why:** A reviewer needs source, an understandable local run, and a browsable demonstration without paid infrastructure.

**Alternative rejected:** Requiring purchase of a production server or embedding a public shared demo password in the Git repository.

**Cost / trigger:** Free hosting may sleep, external networks may not reach the site without VPN, and the public demo requires a real hosted-login/complete-flow check. A healthy /api/health does **not** certify the whole workflow.

## D-14 · Verification through invariants, negative tests and explicit evidence limits
**Choice:** Exercise roles, cross-tenant attempts, idempotency, concurrency, item state guards, Persian input, manual fallback and seeded order-to-settlement flow in automated tests. Keep a personally narrated 5–10 minute video separate from CI browser evidence.

**Why:** A polished interface cannot compensate for a lost round, an unauthorized payment or a cross-restaurant leak.

**Alternative rejected:** Screenshots, generated test text or a green health endpoint as sufficient proof.

**Cost / revisit:** Real-device, accessibility, security, stress and provider-backed evaluation remain outstanding. The latest CI result must be checked rather than assumed.

## Decisions intentionally deferred

The first two decisions to reverse with real usage data are **D-06 (early payment exceptions)** and **D-10 (polling)**. After that, prioritize branch-scoped permissions, durable draft recovery, production backup/monitoring, kitchen alerts, inventory availability, hardware integration and payment/fiscal requirements validated against actual Iranian operations.

## Provenance and effort

The original scope was established first; code correctness, UX and editable order proposals were refined later in the repository's chronological history. **Later in calendar time does not mean the candidate worked continuously or necessarily exceeded the six-hour active-work budget.** The candidate reports **roughly six hours of hands-on productive effort total, spread over multiple sessions**; this estimate is self-reported, not inferred from timestamps. ChatGPT/GPT-6 substantially assisted with research, design, implementation, testing and documentation; specific limitations and corrections are disclosed in [AI_USAGE.md](AI_USAGE.md).
