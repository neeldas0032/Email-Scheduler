# Submission checklist

## 1. Push to a private repo
```bash
cd reachinbox-email-scheduler
git init
git add .
git commit -m "Email job scheduler: BullMQ + Redis + Postgres + Next.js dashboard"
git branch -M main
git remote add origin git@github.com:<you>/reachinbox-email-scheduler.git
git push -u origin main
```
Then: **Settings → Collaborators → add `Mitrajit` and `Yadav036`.**

Confirm `.env` and `.env.local` are NOT in the commit (`git ls-files | grep env` should only show the `.example` files).

## 2. Demo video (max 5 min)
1. Google login → dashboard with your name, email and avatar. *(20s)*
2. Compose: subject, body, upload a CSV of ~20 leads, show the detected count, set start time + delay + hourly limit, Schedule. *(60s)*
3. Scheduled tab fills; open `/admin/queues` and show the delayed jobs in Redis. *(30s)*
4. Wait for a few sends, switch to Sent tab, open an Ethereal preview link. *(40s)*
5. **Restart scenario**: `Ctrl+C` the backend, show the queue is dead, `npm run dev` again, show the remaining emails still going out at their original times. Say out loud: "delayed jobs live in Redis, and on boot the reconciler replays anything still pending from Postgres." *(60s)*
6. **Bonus — load**: `npm run demo:load -- 1000`, show the capacity bars fill, emails flip to *Waiting on limit*, and the Slack message arrive. *(60s)*

## 3. Form
Fill https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST with the repo link and the video link.

---

# 90-second interview explanation

> I built an email scheduler with an Express + TypeScript API, a BullMQ worker on Redis, Postgres as the source of truth, and a Next.js dashboard.
>
> When you schedule a campaign, I write one row per recipient in a single transaction, then add one BullMQ **delayed job** per email with `delay = sendTime - now`. There's no cron anywhere — Redis holds the delayed set and promotes each job when it's due. The spacing between emails is baked into the schedule itself rather than a sleep in the worker, so a restart never collapses it.
>
> Persistence has three layers. Delayed jobs live in Redis, not process memory, so killing the server changes nothing. Redis runs with append-only on, so a Redis restart is fine too. And on every boot a reconciler reads every email still pending in Postgres and re-adds its job — that covers Redis being wiped entirely.
>
> Nothing can send twice, for two independent reasons. Job IDs are derived from the email ID, so BullMQ refuses a duplicate. And the worker's first statement is a conditional update — `set status = processing where status in (scheduled, rate_limited)` — which only one worker can win. If it returns zero rows, someone else already has it, and the job exits.
>
> Rate limiting is hourly Redis counters, per sender and global. Both checks plus the rollback happen in one Lua script, because if they weren't atomic two workers could both see one slot left and both take it. When a sender runs out, I try the user's other senders first; if they're all exhausted I don't drop or fail the job — I move it into the next hour window with `moveToDelayed`, offset by its position so campaign order survives. That's also the moment a Slack message fires, deduped per sender per hour so a thousand-email burst sends one alert, not a thousand.
>
> Concurrency is configurable, and the minimum gap between sends uses BullMQ's limiter, which is stored in Redis — so the throttle is shared across every worker, not per process.
>
> With more time I'd add a sliding-window limiter, sender warm-up ramps, and tests around the Lua script and the idempotency claim.

## Questions they'll probably ask
- **"Why not cron?"** Cron fires on a schedule, not per job. You'd still need a queue for retries, ordering, rate limits and restart safety — and cron can't tell you whether a specific email already went out.
- **"What happens with 1000 emails at once?"** Multi-row insert plus `addBulk` in chunks of 500 — a few round trips, not a thousand. All 1000 sit in Redis' delayed set. The shared limiter releases one every 2 seconds, at most `WORKER_CONCURRENCY` run in parallel, and anything over the hourly limit rolls into later windows in order.
- **"How do you know it doesn't double-send?"** Two guards, either sufficient on its own — deterministic job ID and the conditional claim. I verified it by re-queueing everything from Postgres mid-run and counting deliveries at the SMTP server: still one per recipient.
- **"Why Elasticsearch and not just SQL?"** Fuzzy multi-field matching across subject and body. It's also strictly an enhancement — if ES is down, indexing is skipped and search falls back to Postgres. Sending is never affected.
