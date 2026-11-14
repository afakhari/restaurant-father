# AI_USAGE — Assessment disclosure

This project was produced with assistance from **OpenAI ChatGPT (GPT-6)** and the connected **GitHub tool**, together with local command-line tools. This is a disclosure of assisted work, not a claim that every line was manually typed or that all suggested output was correct.

## Tools used and for what

- **ChatGPT / GPT-6:** compared existing open-source restaurant products, proposed product scope, mapped Iranian UX/service workflow, drafted the database schema, HTTP API, RTL UI, seed, test scenarios, security review and documentation. It generated a substantial share of implementation code. Human review before submission is still needed.
- **GitHub connector:** searched source repositories, inspected representative order/kitchen/cashier code, verified target repository permissions, created a feature branch and committed `SCOPE.md` **before implementation**, and prepared product changes as a reviewable PR.
- **Local Node.js:** executed `node --check` and the initial six pure unit tests, later extended to nine, in `node --test`; outputs were examined.
- **Automated PostgreSQL tests:** GitHub Actions provisioned PostgreSQL 16 and ran migration, seed and the original six unit/five integration tests **successfully** on `main` (run `43479468638`); a subsequent review expanded the suite to nine unit and eleven integration tests (PR #7 CI run `43498681600`). The tests were not locally executed with PostgreSQL in the authoring environment, which lacks a Docker daemon.

## What AI genuinely accelerated

Discovery of existing interaction patterns (table sessions, per-item KDS transitions, cashier running bills), first-pass documentation, repeated API validators, unit test cases and a consistent Persian UI. The largest saved cost was avoiding a huge POS/ERP scope and choosing one independently defensible workflow.

## What AI initially got wrong or underspecified

1. The first CI run exposed a missing UPDATE privilege for a `SELECT ... FOR UPDATE` lock on `dining_tables`. The lock was replaced with an advisory transaction lock keyed by table UUID, preserving serialization without broadening write privileges on the table.
2. The early idempotency fast path also needed to verify that a replay key belongs to the *same table*, not just the same actor. The wrong-table replay now returns 409 and the integration suite covers it.
3. The first order insertion draft checked the idempotency key before locking the table, but not *after* the lock. Two simultaneous retries could have raced to the database unique constraint and returned a 500. This was corrected by adding a second lookup under the table row lock.
4. The initial migration granted UPDATE privileges on immutable order rounds and events. Those were reduced to SELECT/INSERT only for the runtime DB role.
5. The proposed checkout rule is too strict for guests paying early. The current limitation is documented rather than represented as universal restaurant behavior.
6. A successful in-memory UX prototype must not be misrepresented as a production-tested deployed app. A live HTTPS endpoint, real LLM provider and video are explicitly outstanding unless separately confirmed.

## One recommendation intentionally rejected

**Rejected:** Forking a large existing POS (Krudex, PlateOS, or a near-identical earlier assessment project) and renaming it. These systems have unrelated flows, deployment dependencies, unclear reuse permissions in several cases, and too much surface area for a six-hour assessment. We extracted learnings from inspected UI/architecture rather than copying their code.

**Also rejected:** Automatically posting AI-extracted Persian food orders to the kitchen. Human approval is required because item-specific notes such as «یکی بدون پیاز» can be assigned to the wrong dish.

## How generated code was checked

- Verified JSON body parsing, UUID/quantity bounds, price snapshot trust boundary, state transitions, discounts, checkout guards, cookie flags, origin checks and tenant scoping in source.
- Ran local JS syntax checks and unit tests for domain rules, including no client price trust, legal/illegal item transitions, bill totals and AI menu ID validation. Current local unit tests: **9/9 passed in the authoring environment**.
- Wrote a DB integration suite and CI workflow for independent tenant data, direct RLS no-context checks, concurrent round submissions, duplicate retry, role isolation, full order-to-checkout and CSRF. **GitHub Actions confirmed 11/11 integration and 9/9 unit tests passing** on the review branch (run `43498681600`). The original main branch passed 5/5 integration and 6/6 unit tests (run `43479468638`); the additions have not yet been deployed to a public host.
- No hand-run multi-device test, provider-side injection red-team, real banking test, external penetration test or full load test was completed. Those limitations are not hidden.

## Architecture decisions that came from our product reasoning

The central table-session model, append-only rounds, distinction between kitchen readiness and physical service, explicit cashier refusal before handoff, employee-specific screens, narrow note parsing, two tenant demo fixtures and the six-hour scope boundary were chosen as a product strategy. The code implementation was AI-assisted, and all choices should be evaluated rather than accepted solely on AI authority.

## Prompt history relevant to submitted work

This repository was produced in a longer Persian-language discussion, including these **user requests** (verbatim or with omission of the long quoted assessment):

- «بررسی ات را روی همین مواردی که پیدا کردی و شرح تسک و نیاز من بیشتر کن و امکان سنجی کن»
- «صرفا فرایند هایی که طی می شود و امکاناتی که دارند و خلاقیت هایی که به خرج دادن و فرایند هایی که طراحی کردن و ux ای که ارائه کردن را به دقت بررسی کن»
- «بله همین کار را به طور کامل انجام بده»
- «بر اساس تسک و یافته هایت اقدامات لازم را به طور کامل در گیت هاب انجام بده و پیش برو.»

A subsequent user request, «تمامی اقدامات لازم را انجام بده», authorized continuing the release work. The earlier implementation request also contained the full English **Senior Full-Stack Engineer — Solo AI Builder Assessment** and specified the target repository `https://github.com/afakhari/restaurant-father`. The task was not given to AI as an empty, standalone feature checklist; product choices were discussed first. No fictional prompt history or hidden tests are claimed.

## AI API failure/cost/prompt-injection posture

Provider call is optional and server-side, with an HTTPS endpoint, timeout, low temperature, at most 300 output tokens and an explicitly bounded menu subset. User notes are untrusted content; the prompt instructs the provider to return JSON only, but prompt text is **not the security boundary**. A second server-side parser discards unknown menu IDs, invalid counts and extraneous properties. A cashier or kitchen action is never delegated to AI. Provider errors fail visibly and allow manual ordering. This bounded design controls the common hallucination/cost/latency risks but has not been independently adversarially evaluated.

An export of the actual user instructions and the runtime AI system prompt for the ATS prompt field is in [AI_PROMPTS.md](AI_PROMPTS.md). Browser recordings, if generated in CI, are explicitly labeled automated and do not imply candidate-narrated video.

## Follow-up verification and corrections

A subsequent source review identified that the initial `/api/shift` global LIMIT clauses could omit active orders after sufficient history. The query was changed to always include open sessions and their associated rounds/items, while bounding closed history separately. A single-instance login throttle was added with explicit limits. Additional automated integration tests exercise AI being unavailable and a local simulated provider; these do not claim a real AI API has been used. Actual time spent and any overrun of the challenge cap must be disclosed by the candidate.


## Additional UX/code-review pass (2026-11-13)

The product UI was reviewed against real Chromium acceptance screenshots, then redesigned for legibility and task completion on smaller screens. ChatGPT assisted with CSS, browser tests, accessibility labels, and documentation. The authoring environment separately ran a **mock-backed Chromium layout review** at 320, 390, 768, 1024 and 1440px; this only verifies visual layout under representative sample data, not PostgreSQL integrity. The GitHub Actions browser job is responsible for verifying the actual seeded Node/PostgreSQL workflow.

Corrections introduced during this pass included fixing a CSS cascade conflict that initially displayed the order pane in the mobile tables stage, and fixing a JavaScript operator-precedence syntax error in the AI note handler before committing. Both were caught by actual browser rendering or `node --check`, not assumed safe because a model generated the snippet. The new UI uses an app dialog for cashier receipt confirmation and cancellation, a draft-loss guard, connection status and a server-side AI configuration flag. Browser automation must still pass on the latest commit.

**Scope/time honesty:** these additional UX improvements were requested after the initial MVP. The repository's timestamps do not establish the candidate's personal working time; the applicant must disclose a true elapsed work total and any overrun against the initial six-hour cap.

**Browser CI regression found and corrected:** the first browser run with the new custom checkout dialog timed out because the cancellation-reason textarea was still HTML-required while visually hidden. Browser constraint validation prevented the checkout form from submitting, so no payment POST occurred. The code now disables that input for cashier confirmation, and the browser test waits for an actual successful checkout HTTP response before accepting the UI result. This is further evidence that AI-written UI must be exercised end to end.


## Further verification and model-assisted corrections

A later real-shift review revealed two previously under-addressed issues: (1) API responses exposed prices/payment metadata to kitchen users even though their screen hid those values; (2) an all-cancelled table could never be released without an incorrect paid receipt. The response projection and manager-only void endpoint were added with negative-role and audit tests. UI localization was supplemented with pure Persian/Arabic digit and keyboard normalization tests. These are engineering interventions driven by exception analysis, not evidence of live banking or real provider-backed AI inference.


## Latest edge-case correction and provenance

A subsequent review found that reusing an idempotency key on the *same table* with **different item quantities or notes** could return a replay success for the old order, silently discarding an edited retry after a network failure. The server now compares canonical item/quantity/note contents and returns HTTP 409 on a mismatch. The client retains the draft and tells staff to inspect the table before submitting a new round. This was checked with a new PostgreSQL negative test.

The same review tightened role-specific JSON responses, added manager-only fully cancelled table release (with no fake payment), and introduced tests for localized Persian/Arabic discount digits. These decisions were informed by AI-assisted analysis and then checked with local unit tests and GitHub Actions, not through direct observation of a real restaurant shift.


## Later feature: editable order suggestions (2026-11-14)

At the user's request after the original assessment, GPT-6 assisted with the product/UX threat review and implementation of a table/session-bound \`/api/ai/order-suggestions\` endpoint, a Persian editable proposal UI, explicit handling of unresolved phrases, a **clearly labeled non-AI rule-based fallback**, optional model integration, and price-snapshot conflict handling. Human approval remains separate from final order creation. Unit tests, PostgreSQL integration and Chromium browser tests were added and must be checked against their specific CI runs before making release claims.

A provider-backed model was not activated as part of this work, and no authentic model accuracy or latency results are claimed. Iran-market eligibility and user-data handling must be reviewed with a real provider before enabling paid inference. The original six-hour task has not been retroactively expanded; this is follow-on work requested later.

