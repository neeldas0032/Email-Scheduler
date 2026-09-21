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

  /**
   * Idempotency guard: claim the row with a conditional UPDATE. Only one worker
   * can move a row out of 'scheduled'/'rate_limited', so a duplicated delivery
   * (retry storm, requeue after crash, two workers racing) can never send the
   * same email twice.
   */
  const email = await queryOne<EmailRow>(
    `UPDATE emails SET status = 'processing', attempts = attempts + 1, updated_at = now()
     WHERE id = $1 AND status IN ('scheduled','rate_limited')
     RETURNING *`,
    [emailId]
  );

  if (!email) {
    logger.info('worker', `skip ${emailId}: already sent, cancelled or in flight`);
    return 'skipped';
  }

  const slot = await acquireSendSlot(email.user_id, email.sender_id);

  if (!slot.ok && slot.reason === 'no_senders') {
    await queryOne(
      `UPDATE emails SET status='failed', error=$2, updated_at=now() WHERE id=$1`,
      [emailId, 'No active sender configured']
    );
    throw new UnrecoverableError('No active sender configured');
  }

  if (!slot.ok) {
    // Hourly budget is gone. Never drop the job: push it into the next window,
    // keeping campaign order via the position offset.
    const retryAt = rescheduleTimestamp(email.position, senderLimit(slot.sender));
    await queryOne(
      `UPDATE emails SET status='rate_limited', scheduled_at=$2, attempts = attempts - 1, updated_at=now() WHERE id=$1`,
      [emailId, new Date(retryAt)]
    );

    void notifyRateLimitHit({
      userId: email.user_id,
      senderId: slot.sender.id,
      senderEmail: slot.sender.from_email,
      scope: slot.blockedBy,
      limit: slot.blockedBy === 'global' ? env.limits.globalPerHour : senderLimit(slot.sender),
      retryAt,
    });

    if (token) {
      await job.moveToDelayed(retryAt, token);
      throw new DelayedError();
    }
    throw new Error('rate limited, retrying');
  }

  try {
    const result = await sendEmail({
      sender: slot.sender,
      to: email.to_email,
      subject: email.subject,
      body: email.body,
    });

    const updated = await queryOne<EmailRow>(
      `UPDATE emails SET status='sent', sent_at=now(), sender_id=$2, message_id=$3, preview_url=$4,
       error=NULL, updated_at=now() WHERE id=$1 RETURNING *`,
      [emailId, slot.sender.id, result.messageId, result.previewUrl]
    );
    if (updated) void indexEmail(updated);

    return result.messageId;
  } catch (err) {
    // The slot was reserved but nothing was delivered: give it back.
    await releaseSlot(slot.sender.id);
    const message = err instanceof Error ? err.message : String(err);
    // Hand the row back to 'scheduled' so the retry (or the boot reconciler)
    // can claim it again. The 'failed' listener below decides when retries are
    // actually exhausted - that is the only place with the real job state.
    await queryOne(`UPDATE emails SET status='scheduled', error=$2, updated_at=now() WHERE id=$1`, [
      emailId,
      message,
    ]);
    throw err;
  }
}

export function startWorker(): Worker<EmailJobData> {
  if (worker) return worker;

  worker = new Worker<EmailJobData>(QUEUE_NAME, processJob, {
    connection: bullConnection,
    concurrency: env.queue.concurrency,
    // Queue-wide throttle shared across every worker instance via Redis:
    // at most one send per MIN_DELAY_BETWEEN_EMAILS_MS.
    limiter: { max: 1, duration: env.queue.minDelayMs },
  });

  worker.on('completed', (job, result) => {
    logger.info('worker', `job ${job.id} -> ${result}`);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    if (err instanceof DelayedError || err.name === 'DelayedError') return;
    logger.warn('worker', `job ${job.id} failed (attempt ${job.attemptsMade})`, err.message);
    // getState() is the authoritative answer: 'failed' means BullMQ has given
    // up, anything else means a retry is still queued.
    const state = await job.getState().catch(() => 'failed');
    if (state === 'failed') {
      const row = await queryOne<EmailRow>(
        `UPDATE emails SET status='failed', error=$2, updated_at=now()
         WHERE id=$1 AND status <> 'sent' RETURNING *`,
        [job.data.emailId, err.message]
      );
      if (row) void indexEmail(row);
    }
  });

  worker.on('error', (err) => logger.error('worker', 'worker error', err.message));

  logger.info(
    'worker',
    `started: concurrency=${env.queue.concurrency}, min delay=${env.queue.minDelayMs}ms, ` +
      `per-sender limit=${env.limits.perSenderPerHour}/h, global limit=${env.limits.globalPerHour}/h`
  );
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) await worker.close();
  worker = null;
}
