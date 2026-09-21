import { query, queryOne, pool } from '../db/pool';
import { env } from '../config/env';
import { EmailRow, EmailJobData } from '../types';
import { enqueueEmailsBulk, enqueueEmail, removeEmailJob } from '../queue/emailQueue';
import { listSenders, ensureSendersForUser } from './senders';
import { indexEmailsBulk, indexEmail, searchEmailIds } from './search';
import { logger } from '../config/logger';

export interface ScheduleInput {
  userId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
}

/**
 * Creates the campaign + one email row per recipient, then one BullMQ delayed
 * job per email. Send time for recipient i = startAt + i * delayMs, so the
 * "minimum delay between sends" is baked into the schedule itself and not left
 * to a sleep inside the worker.
 */
export async function scheduleCampaign(input: ScheduleInput) {
  let senders = await listSenders(input.userId);
  if (senders.length === 0) senders = await ensureSendersForUser(input.userId);

  if (senders.length === 0) {
    throw Object.assign(new Error('No active sender is configured for this account'), { status: 400 });
  }

  const client = await pool.connect();
  let emails: EmailRow[] = [];
  let campaignId = '';

  try {
    await client.query('BEGIN');

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (user_id, subject, body, start_at, delay_ms, hourly_limit, total_recipients)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        input.userId,
        input.subject,
        input.body,
        input.startAt,
        input.delayMs,
        input.hourlyLimit,
        input.recipients.length,
      ]
    );
    campaignId = campaign.rows[0].id;

    // Apply the per-sender hourly limit chosen in the compose form.
    await client.query(`UPDATE senders SET hourly_limit = $1 WHERE user_id = $2`, [
      input.hourlyLimit,
      input.userId,
    ]);

    // Postgres caps a statement at 65535 bind parameters, so insert in chunks
    // (8 params per row => 2000 rows is comfortably under the limit).
    const ROWS_PER_INSERT = 2000;
    for (let start = 0; start < input.recipients.length; start += ROWS_PER_INSERT) {
      const slice = input.recipients.slice(start, start + ROWS_PER_INSERT);
      const values: unknown[] = [];
      const tuples = slice.map((to, j) => {
        const i = start + j;
        const sender = senders[i % senders.length]; // round-robin across senders
        const scheduledAt = new Date(input.startAt.getTime() + i * input.delayMs);
        const base = j * 8;
        values.push(campaignId, input.userId, sender.id, i, to, input.subject, input.body, scheduledAt);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
      });

      const inserted = await client.query<EmailRow>(
        `INSERT INTO emails (campaign_id, user_id, sender_id, position, to_email, subject, body, scheduled_at)
         VALUES ${tuples.join(',')} RETURNING *`,
        values as never[]
      );
      emails = emails.concat(inserted.rows);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Queue after the DB commit: if this process dies here, the boot-time
  // reconciler re-queues anything still marked 'scheduled'.
  await enqueueEmailsBulk(
    emails.map((email) => ({
      data: {
        emailId: email.id,
        userId: email.user_id,
        campaignId: email.campaign_id,
        position: email.position,
      } satisfies EmailJobData,
      sendAt: new Date(email.scheduled_at),
    }))
  );

  void indexEmailsBulk(emails);
  logger.info('emails', `scheduled ${emails.length} email(s) for campaign ${campaignId}`);

  return { campaignId, count: emails.length, firstSendAt: emails[0]?.scheduled_at };
}

const SCHEDULED_STATUSES = ['scheduled', 'rate_limited', 'processing'];
const SENT_STATUSES = ['sent', 'failed'];

export async function listEmails(params: {
  userId: string;
  tab: 'scheduled' | 'sent';
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const statuses = params.tab === 'scheduled' ? SCHEDULED_STATUSES : SENT_STATUSES;
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const q = params.q?.trim();

  if (q) {
    const hit = await searchEmailIds({ userId: params.userId, q, statuses, size: limit });
    if (hit) {
      if (hit.ids.length === 0) return { rows: [], total: 0, source: 'elasticsearch' as const };
      const rows = await query<EmailRow>(
        `SELECT e.*, s.from_email AS sender_email FROM emails e
         LEFT JOIN senders s ON s.id = e.sender_id
         WHERE e.id = ANY($1::uuid[])
         ORDER BY e.scheduled_at DESC`,
        [hit.ids]
      );
      return { rows, total: hit.total, source: 'elasticsearch' as const };
    }
  }

  const filters = [`e.user_id = $1`, `e.status = ANY($2)`];
  const values: unknown[] = [params.userId, statuses];
  if (q) {
    values.push(`%${q}%`);
    filters.push(`(e.to_email ILIKE $${values.length} OR e.subject ILIKE $${values.length})`);
  }

  const where = filters.join(' AND ');
  const order = params.tab === 'sent' ? 'COALESCE(e.sent_at, e.scheduled_at) DESC' : 'e.scheduled_at ASC';

  const rows = await query<EmailRow>(
    `SELECT e.*, s.from_email AS sender_email FROM emails e
     LEFT JOIN senders s ON s.id = e.sender_id
     WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM emails e WHERE ${where}`,
    values
  );

  return { rows, total: Number(totalRow?.count ?? 0), source: 'postgres' as const };
}

export async function emailStats(userId: string) {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM emails WHERE user_id = $1 GROUP BY status`,
    [userId]
  );
  const base = { scheduled: 0, rate_limited: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 };
  rows.forEach((r) => {
    base[r.status as keyof typeof base] = Number(r.count);
  });
  return base;
}

export async function cancelEmail(userId: string, emailId: string) {
  const row = await queryOne<EmailRow>(
    `UPDATE emails SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status IN ('scheduled','rate_limited')
     RETURNING *`,
    [emailId, userId]
  );
  if (!row) return null;
  await removeEmailJob(emailId);
  void indexEmail(row);
  return row;
}

/**
 * Restart safety net. BullMQ keeps delayed jobs in Redis, so a plain API/worker
 * restart loses nothing. This covers the harder case: Redis itself was flushed
 * or lost. Any email still 'scheduled'/'rate_limited' in Postgres gets its job
 * re-added; the deterministic jobId makes re-adding an existing job a no-op, so
 * nothing is ever duplicated.
 */
export async function reconcilePendingJobs(): Promise<number> {
  const pending = await query<EmailRow>(
    `SELECT id, user_id, campaign_id, position, scheduled_at FROM emails
     WHERE status IN ('scheduled','rate_limited')
     ORDER BY scheduled_at ASC LIMIT 50000`
  );
  if (pending.length === 0) {
    logger.info('reconcile', 'no pending emails to restore');
    return 0;
  }

  let restored = 0;
  const now = Date.now();
  for (const email of pending) {
    // Overdue emails (server was down past their slot) go out immediately,
    // spaced by the configured minimum delay so we do not burst.
    const target = new Date(email.scheduled_at).getTime();
    const sendAt = target > now ? target : now + restored * env.queue.minDelayMs;
    await enqueueEmail(
      {
        emailId: email.id,
        userId: email.user_id,
        campaignId: email.campaign_id,
        position: email.position,
      },
      sendAt
    );
    restored += 1;
  }

  logger.info('reconcile', `restored ${restored} pending email job(s) after boot`);
  return restored;
}
