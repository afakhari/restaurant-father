# ShiftYar release submission checklist (do not submit incomplete)

## Repository
https://github.com/afakhari/restaurant-father

## Live Demo URL
Deployment recipe: [docs/FREE_DEMO_DEPLOY.fa.md](docs/FREE_DEMO_DEPLOY.fa.md) plus [render.yaml](render.yaml) and the manual GitHub Actions bootstrap workflow. This recipe does not substitute for the real URL.

**Live Render URL:** https://restaurant-father-demo-xem8.onrender.com

Provisioned on Render Free (Frankfurt) using Docker/Node 22, with PostgreSQL 16 on Neon Free. Render reports deploy status **live** and HTTP 200 for /api/health. Neon has two seeded demo tenants and five users; restricted role + RLS verified in database tests. **The externally initiated HTTPS login and browser acceptance test remains pending.**

## Demo Login Credentials
The local seeded accounts are listed in README. **Do not expose the local Docker default password on the public demonstration instance.** Generate a unique `DEMO_PASSWORD` and provision a dedicated demo database; report the real website credentials securely to the reviewer *only after it is deployed and tested*.

## README — Setup & Architecture
[README.md](README.md)

## Project Documentation
- [SCOPE.md](SCOPE.md) — committed first, before implementation
- [DECISIONS.md](DECISIONS.md)
- [AI_USAGE.md](AI_USAGE.md)
- [HANDOVER.md](HANDOVER.md)
- Optional attachments: [SECURITY.md](SECURITY.md), [UX Blueprint](docs/UX_BLUEPRINT.fa.md), [DEPLOY.md](DEPLOY.md)

## Recorded project walkthrough (5–10 minutes)
**PENDING actual narrated candidate walkthrough.** [WALKTHROUGH.md](WALKTHROUGH.md) contains a 7–8 minute, decision-first script. The automated Chromium screen-recording artifact produced by CI is **not** a replacement for the candidate explaining their own judgment.

## AI Prompts Used to Generate Submitted Work
[AI_PROMPTS.md](AI_PROMPTS.md); use with [AI_USAGE.md](AI_USAGE.md). Both disclose how ChatGPT was used, where it made mistakes, and what was independently verified.

## Final pre-submit acceptance checks

- [x] Actual GitHub repository contains product, migration, seed and all four required docs.
- [x] PostgreSQL integration tests: tenant isolation, role checks, concurrent rounds, replay and full waiter-to-cashier flow; GitHub Actions passing on the latest verified main commit (recheck before submission).
- [ ] Public **HTTPS** website opens and authenticates seeded accounts.
- [x] Production/demo password differs from local Docker password; no secrets in repository.
- [ ] AI provider configured, tested on Persian note, with clear failure fallback. If provider isn't available, disclose it, as an implemented but inactive capability.
- [ ] Browser/mobile walkthrough on hosted environment with realistic multi-staff concurrency.
- [ ] Actual 5–10 minute recorded walkthrough showing the running application and **more than half explaining why**; video uploaded or linked in the submission form.
- [ ] Correct and accessible README/documents upload format in the submission form.
- [ ] Timebox truthful: 6 hours is the cap; if exceeded, disclose actual overrun and reason rather than fabricating a six-hour log.
- [ ] Submit only after the three required public artifacts (URL, credentials, video) are real and verifiable.
