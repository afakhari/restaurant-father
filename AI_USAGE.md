# AI_USAGE | AI assistance, accountability and verification

**Assessment disclosure — revised 2026-11-14.** This is a **solo AI-builder assessment**: using AI was part of the workflow, not a detail to disguise. The submission openly attributes substantial research, design, code and writing assistance to **OpenAI ChatGPT (GPT-6)** working with GitHub and local/CI tooling. The candidate remains responsible for the chosen product, what is submitted, and explaining every important trade-off.

**Time statement (candidate-reported):** **approximately six hours of productive, hands-on involvement in total, spread over separate sessions**. This is **not** a claim of six continuous hours from first to last commit. Pauses, time waiting for unattended model/tool output, CI execution and deployment wake-up are not treated as active personal work. This estimate is provided by the candidate, not reconstructed from timestamps or independently time-tracked. Chronologically later edits do not imply additional continuous work.

## 1. What AI was used for

| Activity | Nature of assistance | Human / evaluator checkpoint |
| --- | --- | --- |
| Understanding the brief | Interpreted an intentionally underspecified Iranian restaurant problem, compared open-source interaction patterns and identified highest-risk handoffs | Why a narrow shift workflow is preferable to a half-built ERP |
| Product definition | Proposed user journeys, roles, operational invariants, initial SCOPE and exclusions | Candidate chose and must defend scope, exclusions and order of priorities |
| Backend/data | Generated and revised Node.js APIs, PostgreSQL schema/migrations, tenant-context/RLS approach, state transitions, idempotency and server-owned billing | Source inspection, executable tests, security caveats |
| Frontend/UX | Helped author RTL Persian layouts, mobile navigation, error states, confirmations, input normalization and editable proposal interface | Browser interaction, accessibility and responsive checks |
| Quality and delivery | Drafted unit/integration/browser tests, CI setup, Docker/demo guidance, security/decision documents and walkthrough plan | Actual run results, HTTPS verification and candidate narration |
| Runtime order suggestions | Designed optional bounded model request, validation and human-reviewed preview; also a separate deterministic menu matcher | Without real provider configuration, the matcher is **not** an LLM demonstration |

The GitHub connection was used for repository inspection, code changes and commits. Local command-line tools were used for JavaScript syntax/unit checks. GitHub Actions ran database-backed integration and Chromium browser tests where configured. **AI-generated code was not presumed correct merely because it compiled.**

## 2. Product decisions, not just text generation

The product judgment lies in choosing one coherent working path: a table session with append-only order rounds, per-item kitchen status, separate physical handoff, a server-computed bill and role-limited cashier attestation of an **external** payment. Two fictional restaurant tenants give isolation tests something concrete to challenge.

This is not a claim that a customer pilot, owner interview or quantified time-saving study was performed. The customer and operating data in the demo are illustrative. Dated follow-on refinements were prompted by exception and UX review, not by invented real-world observation.

## 3. Where generated proposals were wrong, and how the design changed

The useful part of AI assistance was not the first draft. Important corrected or challenged behaviors include:

1. **PostgreSQL locking privilege:** the initial SELECT ... FOR UPDATE on a restricted table required UPDATE permission the runtime role did not have. The approach changed to transaction-level advisory locking rather than broadening that permission. GitHub CI exposed the issue.
2. **Duplicate retry race:** looking up an idempotency key only before acquiring the table lock allowed two concurrent retries to race. A second lookup under the lock was added.
3. **Idempotency identity:** matching only a request key could silently accept a prior order with a different table, quantity or preparation note. Replays now compare table and canonical contents; mismatches return HTTP 409.
4. **Over-broad table privileges:** initial migration privileges on immutable round/event data were narrowed.
5. **Historical paging:** a general snapshot LIMIT could push open orders out of results after enough history. Open sessions and associated items were preserved, while closed history was bounded separately.
6. **Role leakage:** a hidden cashier tab did not prevent a kitchen user from examining sensitive bill data in the JSON response. Role-specific server projections were introduced.
7. **Cancellation dead end:** an entirely cancelled session could remain blocked or tempt a false zero-value “payment.” A manager-only, reasoned no-payment void was added.
8. **Browser form bug:** a visually hidden required cancellation-reason field blocked a custom checkout confirmation; browser validation exposed it and the flow was corrected.
9. **Responsive rendering/input:** a mobile CSS cascade issue and an operator-precedence syntax error in frontend JavaScript were found and corrected; Persian/Arabic digits, letter variants and separate item notes gained explicit handling.
10. **Natural-language safety:** the early small note parser did not cover table switching, ambiguous phrases or per-unit preparation well enough. The later editable proposal flow keeps unresolved text visible and requires separate human approval and transactional submission.

These are concrete corrections evident in code/tests and repository history. They are **not** claims of an external security audit or proof that every edge case has been eliminated.

## 4. Verification actually represented

**Executable artifacts in the repository:** package.json includes syntax checking and unit tests; tests/integration.test.mjs exercises database-dependent scenarios; GitHub Actions workflows use PostgreSQL 16 and browser automation. Earlier documented successful runs include main run **43479468638** (initial six unit and five integration tests) and review-branch run **43498681600** (nine unit and eleven integration tests). These historical runs support those **specific revisions only**; counts and status must be rechecked for the **latest** commit using [GitHub Actions](https://github.com/afakhari/restaurant-father/actions).

The tests cover, in the versions documented, tenant isolation, role boundaries, full order-to-settlement, concurrent rounds, retry protection, invalid transitions, cancellation, UI/browser flows and localized input. Tests using a **simulated provider** validate API contracts and failure handling, **not** authentic model capability. A mock-backed browser layout review at 320, 390, 768, 1024 and 1440 pixels is useful visual evidence, but not a real-phone or end-to-end PostgreSQL acceptance test by itself.

**Not independently established as production-ready:** iOS/Safari and assistive-technology coverage; a sustained load test; full penetration testing; operational backups/restore; real payments; legal invoicing; deployed user acceptance from an Iranian network; actual model correctness and contractual availability for Iran. The public Render demo has a recorded URL, but a health response alone does not prove that login, cookies, every role and the full hosted scenario work. The candidate-recorded narrated 5–10 minute video is a separate required submission artifact; a CI video cannot replace it.

## 5. Runtime AI feature: what is and is not AI

**Actual workflow:** a waiter/manager chooses a table and writes a Persian description; the server checks authenticated restaurant/table/session context; the interface offers menu-linked candidate rows, quantities, preparation notes, source phrases and unresolved text. Staff can correct, split, replace, explicitly dismiss uncertain text and add only approved lines to a **local draft**. The final **send to kitchen** is a distinct, server-validated transaction.

**Without a configured external model:** the system can do restricted **rule-based menu matching**, clearly labeled «تطبیق ساده با منو». It **does not** constitute a live LLM, semantic intelligence benchmark or paid inference.

**With an authorized configured model:** requests are server-side and bounded by menu context, timeouts, quantity/schema limits and rate limits. Model output is untrusted and must pass server checks; no model can set a price, act as a different tenant, authorize settlement, or directly create an order. Misheard or ambiguous Persian clauses require user review; the server rejects changed price expectations. Manual ordering works when inference is unavailable. Provider access, terms for serving Iran, data retention, true Persian accuracy and billed cost remain to be confirmed before production activation.

The provider kill switch and per-instance quotas are **not** distributed fleet-wide cost guarantees. Provider output may still be wrong; prompt instructions are not a security perimeter. The note input is untrusted and should not contain customer identity, phone or payment-card information.

## 6. Explicitly rejected AI-assisted shortcuts

- **Copying or rebranding an existing full POS:** research into open-source products informed observable workflows, but wholesale reuse introduces irrelevant modules, licensing and integration risk and undermines a focused assessment. No claim is made that public repositories were authored here.
- **Letting an LLM submit orders autonomously:** it could assign «بدون پیاز» to the wrong meal, invent nonexistent dishes or wrongly charge a customer. An editable human-approved proposal is safer.
- **Calling deterministic matching “AI”:** it can produce a usable demo but misleads an evaluator about real inference.
- **Claiming an unobserved green build, deployed browser journey or recorded speech:** those must be linked to actual evidence.

## 7. Prompt provenance and historical scope

[AI_PROMPTS.md](AI_PROMPTS.md) contains user-provided Persian requests and distinguishes the older /api/ai/parse system prompt from the newer /api/ai/order-suggestions flow. The code in **src/server.mjs** and **src/ai-order.mjs** is the source of truth for runtime behavior; this document is not a fabricated transcript of model internals or unseen human conversations.

The initial SCOPE was recorded first; source changes, stronger role projection, failure fixes, mobile UX and the editable text-intake feature were added in later passes. **“Later” describes the sequence of work, not an additional block of uninterrupted time.** The candidate's stated effort remains **approximately six productive hours aggregated across sessions**. If asked in an interview, explain which work was done directly, where ChatGPT generated implementation, what failed and what was rerun rather than presenting AI-assisted output as unaided typing.

## 8. What I would check before accepting the handover

Start from a clean local database, run documented checks, inspect current CI, test the full waiter → kitchen → served → cashier cycle with actual credentials on the hosted domain, try a cross-tenant ID and an unauthorized action, force a stale retry and network failure, confirm a phone-width draft flow, then record a **genuine candidate narration** focused on decisions and limitations. A failure is a useful finding, not something to hide.
