import { Queue } from 'bullmq';
import { bullConnection } from '../db/redis';
import { env } from '../config/env';
import { EmailJobData } from '../types';

export const QUEUE_NAME = env.queue.name;

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: env.queue.attempts,
    backoff: { type: 'exponential', delay: env.queue.backoffMs },
    // Keep a window of finished jobs so the Bull Board dashboard stays useful
    // without letting Redis grow without bound.
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Deterministic job id => BullMQ refuses to add a second job with the same id.
 * This is the first of our two idempotency guards (the second is the DB status
 * claim inside the worker).
 */
export const jobIdFor = (emailId: string) => `email-${emailId}`; // BullMQ rejects ':' in custom ids

export function delayFor(sendAt: Date | number): number {
  const ts = sendAt instanceof Date ? sendAt.getTime() : sendAt;
  return Math.max(0, ts - Date.now());
}

export async function enqueueEmail(data: EmailJobData, sendAt: Date | number) {
  return emailQueue.add('send-email', data, {
    jobId: jobIdFor(data.emailId),
    delay: delayFor(sendAt),
  });
}

export async function enqueueEmailsBulk(items: Array<{ data: EmailJobData; sendAt: Date }>) {
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK).map(({ data, sendAt }) => ({
      name: 'send-email',
      data,
      opts: { jobId: jobIdFor(data.emailId), delay: delayFor(sendAt) },
    }));
    await emailQueue.addBulk(chunk);
  }
}

export async function removeEmailJob(emailId: string) {
  const job = await emailQueue.getJob(jobIdFor(emailId));
  if (job) await job.remove().catch(() => undefined);
}
