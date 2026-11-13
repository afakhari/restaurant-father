# Recorded walkthrough outline (7–8 minutes, operator to record)

**This file is a recording plan, not a claim that a video exists.** At least half the runtime should explain *why* decisions were made, not only show screens.

| Time | What to show | Why / decision to explain |
|---|---|---|
| 0:00–1:15 | `SCOPE.md` and the challenge | The problem is lost work and ambiguous handoff, not missing dashboard widgets; why we excluded online payments, inventory and customer QR |
| 1:15–2:20 | Logged-in waiter, table 3 with mixed-status rounds | Why table session, order round, individual item are separate domain entities; repeat orders during the same guest visit |
| 2:20–3:05 | Add a drink; log in as kitchen, advance a ticket | Why READY is distinct from SERVED; one next action per role |
| 3:05–3:45 | Log in as waiter and mark served; cashier totals/discount | Why checkout cannot close unfinished service, and why prices are snapshotted on the server |
| 3:45–4:40 | Source: `operations.mjs`, `db/001_initial.sql` | Show table locks, idempotency, tenant RLS, the runtime non-superuser role, fail-closed errors |
| 4:40–5:15 | Switch to Darband manager | The separate restaurant cannot inspect Narenj menus or order UUIDs |
| 5:15–6:05 | Tests and CI results (only if passing) | Show concurrent requests, tenant negative test, complete workflow; honestly mention any failing/unrun case |
| 6:05–6:45 | Optional AI parse with real provider (only if configured) | Human preview, bounded menu IDs, manual fallback; otherwise acknowledge provider not configured |
| 6:45–7:45 | `DECISIONS.md`, `HANDOVER.md`, `AI_USAGE.md` | What went wrong, which two decisions we'd change, where 1k/100k scale fails, full AI assistance disclosure |

Do not claim deployed HTTPS, real AI output, passing integration tests or running video unless independently confirmed. The operator should capture screen and voice from a real running instance, and put a verifiable URL in the final submission.

## Browser evidence as a visual aid, not candidate narration

If the `Browser UX walkthrough and evidence` CI workflow passes, download its `real-app-browser-evidence` artifact from the run. Screenshots and `automated-browser-tour.webm` show genuine web UI interactions against a seeded ephemeral PostgreSQL instance. You may use the frames while recording your own narrated 5–10 minute presentation, but you must genuinely explain product decisions and disclose AI assistance. The automated video is **shorter than the required walkthrough** and contains no personal explanation.


## Updated interaction sequence for recording

On a **phone**, demonstrate the three ordering steps (table → menu → order), the sticky draft summary, note editing, and the confirmation warning when changing tables with an unsubmitted draft. Show a cashier checkout confirmation in the application's own dialog. State clearly that the "connection status" label reflects the last server snapshot and is not a durable offline order queue. The latest UX acceptance matrix and limits are in [docs/UX_AUDIT.fa.md](docs/UX_AUDIT.fa.md).

در نمای مدیر، نشان دهید که **بستن میز کاملاً لغوشده** پرداخت صفرِ ساختگی تولید نمی‌کند؛ علت ثبت می‌شود و صندوق‌دار این مجوز را ندارد. در صندوق، تخفیف «۵۰٬۰۰۰» با رقم فارسی و در سالن، «تفکیک قلم» برای دو نوشیدنی متفاوت را می‌توان به‌عنوان دو مثال مشخص از بومی‌سازی نشان داد.
