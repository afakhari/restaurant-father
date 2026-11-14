# SCOPE | ShiftYar (شیفت‌یار)

**Document status:** Assessment scope with a dated change log, revised 2026-11-14. The original scope was recorded on 2026-11-13 before implementation; Git history is the record of its original wording. This revised document makes the acceptance contract clearer and distinguishes subsequent work. **Time accounting (candidate-reported):** approximately **six hours of active, hands-on work in total, spread across multiple sessions**, not six continuous clock hours. Pauses, unattended AI/tool execution and deployment waiting are not counted as active work. This is a personal effort estimate, not something Git commit timestamps can independently prove.

## 1. Product thesis and customer hypothesis

A small Iranian café or table-service restaurant does not primarily need another dashboard. During a shift it needs a dependable answer to four questions: **What did this table order? What is the kitchen doing with each item? Has the guest received it? What can the cashier safely settle?**

The first customer is represented by *fictional demo fixtures*, not by a claimed paid pilot, formal interview study or measured market adoption. The hypothesis is that a shared, Persian-first shift workflow reduces missed second rounds, ambiguous kitchen handoffs and bill discrepancies. Real staff observation is the next validation step, not an accomplishment of this submission.

**Chosen vertical slice:** authenticated waiter → select table → create a session and one or more order rounds → kitchen progresses each item → waiter confirms service → cashier records an external payment and closes the table. A manager reviews events and handles the fully-cancelled exception. This is an operational MVP, **not** a complete POS, ERP, fiscal system or real payment gateway.

## 2. Who it serves and what each role can do

| Role | Primary job | Authority boundary |
| --- | --- | --- |
| Waiter (پیشخدمت) | Select branch/table, build a draft, append rounds, review order progress, mark ready items served | May cancel queued items with reason; cannot settle a bill or modify menu prices |
| Kitchen (آشپزخانه) | View relevant active tickets and notes; move queued → preparing → ready | Does not receive billing/payment fields or mark an item served |
| Cashier (صندوق‌دار) | Review every round, apply a validated discount, confirm money was received outside the app, settle eligible sessions | Cannot declare food ready or close an unfinished normal session |
| Manager (مدیر) | Work across staff views, inspect audit events, handle started-item cancellations and fully-cancelled table release | Exceptional actions require reason and server validation; does not imply refunds |

Accounts are associated with a restaurant on the server. The demo includes two branches of Narenj and a separate Darband restaurant. **Current roles are restaurant-scoped, not restricted to individual branches.** Branch-specific memberships are future work.

## 3. Acceptance contract: a shift that actually works

| ID | Observable acceptance criterion | Verification surface |
| --- | --- | --- |
| A1 | Staff authenticate and see only permitted pages, actions and response fields | src/auth.mjs; server role checks; tests/integration.test.mjs |
| A2 | At most one open session exists per physical table; a later order appends a round without replacing earlier rounds | db/001_initial.sql; src/operations.mjs; integration tests |
| A3 | Two concurrent additions survive; identical request retries do not create duplicates; edited reuse of a key is rejected with 409 | src/operations.mjs; concurrency/idempotency tests |
| A4 | Every item follows explicit state transitions; READY is not SERVED; cancellation needs the proper role and reason | src/core.mjs; src/operations.mjs; tests |
| A5 | Totals use server-snapshotted integer **toman** prices across all rounds; a discount cannot exceed subtotal | src/core.mjs; src/operations.mjs; tests |
| A6 | Normal checkout is blocked until all non-cancelled items are served; a fully-cancelled table can be voided by a manager without inventing payment | src/operations.mjs; audit and negative tests |
| A7 | A staff member from restaurant B cannot access restaurant A's menu, session, item or events through guessed IDs | db/001_initial.sql FORCE RLS; tests/integration.test.mjs |
| A8 | A new employee can start a fictional local demonstration with Docker Compose and complete the four-role workflow | compose.yaml; scripts/seed.mjs; README.md; guided manual check |
| A9 | On a small screen a waiter can move through table → menu → draft, see connection failures and avoid losing an unsent draft by accidental navigation | src/public; browser-evidence workflow; manual device review still needed |

**Evidence standard:** a test's existence is not proof that the latest commit passed. Check the actual CI run, deployment and browser interaction before marking a criterion verified. The public demo's health response does not establish successful login or checkout.

## 4. Core invariants and failure behavior

- **No silent data loss:** rounds append; writes serialize on a table; stale table/session/item versions return conflicts that the employee must resolve.
- **No duplicate charge on retry:** an idempotency key is tied to the original table and canonical items, quantities and notes, not merely the presence of a UUID.
- **No invented money:** amounts come from server-owned menu snapshots. Checkout is a cashier's *attestation of payment received elsewhere*, never bank verification. Fully cancelled voids create no payment.
- **No cross-tenant trust:** tenant context comes from an authenticated membership; a restricted PostgreSQL runtime role and FORCE RLS provide defense in depth.
- **No unsafe model authority:** text suggestions never select a tenant, change a price, execute a payment, or submit a real order. The employee explicitly confirms the final draft.
- **No false offline success:** polling and visible error states exist, but there is no durable offline write queue. On a failed write, staff must inspect the table before trying again.

These are design guarantees to test, **not** claims of zero bugs, production certification or successful field deployment.

## 5. Iranian operating context

Persian RTL staff screens, Vazirmatn, Persian calendar and Asia/Tehran display time, Persian/Arabic/Latin numeral handling where applicable, explicit **تومان** labeling, and normalization of ی/ي and ک/ك improve day-to-day usability. Item-specific instructions such as «بدون پیاز» remain attached to the correct line. Two identical beverages with different preparation notes can be separated. This is intentional localization, not a generic translated POS.

No tax percentage, fiscal receipt, bank settlement or legal compliance is inferred merely from operating in Iran. Any real banking, invoicing, hosting or AI-provider arrangement requires separate legal and operational verification.

## 6. Deliberately excluded from the first operational slice

Real banking/card-terminal integration, Shaparak settlement, refunds and payment reconciliation; official/e-invoices and tax workflows; inventory purchasing; printer hardware; online customer QR ordering; reservations; delivery; loyalty/customer accounts; split bills; robust offline synchronization; push notifications; comprehensive reporting; branch-limited staff accounts; backups and production incident management.

These omissions are **product choices**, not hidden completed features. A usable, testable end-to-end service flow takes priority over a broad collection of disconnected screens.

## 7. Scope change log, not a rewritten six-hour history

| Stage | Scope treatment |
| --- | --- |
| **2026-11-13: initial assessment baseline** | Four staff roles, table sessions, multiple rounds, item lifecycle, checkout attestation, tenant isolation, Persian UI, seed, tests and handover. Optional bounded note parsing was identified but never allowed to hold up manual ordering. |
| **Subsequent correctness/UX passes** | Manager-only started-item cancellation and all-cancelled void, role-specific API projections, stronger idempotency replay checks, localized inputs, mobile steps and draft-loss guards. These are documented changes, not evidence of field validation. |
| **2026-11-14: follow-on order-intake enhancement** | A table/session-bound Persian text → editable proposal → explicitly approved draft workflow, unresolved phrases, deterministic non-AI menu matching, optional provider-backed inference and price-change conflicts. See docs/AI_ORDER_INTAKE_SPEC.fa.md and docs/AI_ORDER_TECHNICAL_DESIGN.md. |

**Time accounting:** the candidate reports **six total productive hours across non-consecutive sessions** for the work presented. The dated change log separates what was chosen first from what was refined later; chronology does not imply six hours of continuous coding or an overrun. This is a self-reported active-effort figure, not a measured stopwatch or claim that commits were all created in a single sitting.

## 8. Release gate and next learning milestone

Before presenting this as a working hosted demo, confirm latest-main syntax/unit/integration/browser CI; run a real HTTPS login and the complete waiter → kitchen → waiter → cashier journey with the *hosted* credentials; check a second tenant and one rejected unauthorized action; inspect a mobile layout; record the required personally narrated 5–10 minute walkthrough. See SUBMISSION_CHECKLIST.md and WALKTHROUGH.md.

The next product question is not “Can we add more modules?” It is **“Do restaurant employees complete the cycle faster and with fewer handoff errors than their current practice?”** That requires measured observation in a real restaurant, still outstanding.
