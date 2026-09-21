import { Worker, Job, DelayedError, UnrecoverableError } from 'bullmq';
import { bullConnection } from '../db/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { QUEUE_NAME } from './emailQueue';
import { EmailJobData, EmailRow } from '../types';
import { queryOne } from '../db/pool';
import { acquireSendSlot, senderLimit } from '../services/senders';
import { releaseSlot, rescheduleTimestamp } from '../services/rateLimiter';
import { sendEmail } from '../services/mailer';
import { indexEmail } from '../services/search';
import { notifyRateLimitHit } from '../services/slack';

let worker: Worker<EmailJobData> | null = null;

async function processJob(job: Job<EmailJobData>, token?: string): Promise<string> {
  const { emailId } = job.data;
  const email = await queryOne<EmailRow>(
    `UPDATE emails SET status = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = $1 AND status IN ('scheduled','rate_limited') RETURNING *`,
    [emailId]
  );
  if (!email) { logger.info('worker', `skip ${emailId}`); return 'skipped'; }

  const slotRaw = await acquireSendSlot(email.user_id, email.sender_id);
  const slot = slotRaw as any;

  if (!slot.ok) {
    if (slot.reason === 'no_senders') {
      await queryOne(`UPDATE emails SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [emailId, 'No active sender']);
      throw new UnrecoverableError('No active sender configured');
    }
    if (slot.reason === 'rate_limited') {
      const retryAt = rescheduleTimestamp(email.position, senderLimit(slot.sender));
      await queryOne(`UPDATE emails SET status='rate_limited', scheduled_at=$2, attempts=attempts-1, updated_at=now() WHERE id=$1`, [emailId, new Date(retryAt)]);
      void notifyRateLimitHit({ userId: email.user_id, senderId: slot.sender.id, senderEmail: slot.sender.from_email, scope: slot.blockedBy, limit: slot.blockedBy === 'global' ? env.limits.globalPerHour : senderLimit(slot.sender), retryAt });
      if (token) { await job.moveToDelayed(retryAt, token); throw new DelayedError(); }
      throw new Error('rate limited');
    }
    throw new UnrecoverableError('Unknown slot error');
  }

  try {
    const result = await sendEmail({ sender: slot.sender, to: email.to_email, subject: email.subject, body: email.body });
    const updated = await queryOne<EmailRow>(`UPDATE emails SET status='sent', sent_at=now(), sender_id=$2, message_id=$3, preview_url=$4, error=NULL, updated_at=now() WHERE id=$1 RETURNING *`, [emailId, slot.sender.id, result.messageId, result.previewUrl]);
    if (updated) void indexEmail(updated);
    return result.messageId;
  } catch (err) {
    await releaseSlot(slot.sender.id);
    const message = err instanceof Error ? err.message : String(err);
    await queryOne(`UPDATE emails SET status='scheduled', error=$2, updated_at=now() WHERE id=$1`, [emailId, message]);
    throw err;
  }
}

export function startWorker(): Worker<EmailJobData> {
  if (worker) return worker;
  worker = new Worker<EmailJobData>(QUEUE_NAME, processJob, { connection: bullConnection, concurrency: env.queue.concurrency, limiter: { max: 1, duration: env.queue.minDelayMs } });
  worker.on('completed', (job, result) => logger.info('worker', `job ${job.id} -> ${result}`));
  worker.on('failed', async (job, err) => {
    if (!job || err instanceof DelayedError || err.name === 'DelayedError') return;
    logger.warn('worker', `job ${job.id} failed`, err.message);
    const state = await job.getState().catch(() => 'failed');
    if (state === 'failed') {
      const row = await queryOne<EmailRow>(`UPDATE emails SET status='failed', error=$2, updated_at=now() WHERE id=$1 AND status <> 'sent' RETURNING *`, [job.data.emailId, err.message]);
      if (row) void indexEmail(row);
    }
  });
  worker.on('error', (err) => logger.error('worker', 'error', err.message));
  logger.info('worker', `started: concurrency=${env.queue.concurrency}`);
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) await worker.close();
  worker = null;
}
