/**
 * Standalone worker process. Run one or many of these to scale sending
 * horizontally: rate limits and idempotency are enforced in Redis/Postgres,
 * so extra workers are safe.
 *   START_WORKER_INLINE=false npm run start   (API only)
 *   npm run start:worker                      (worker only, as many as needed)
 */
import { env } from './config/env';
import { logger } from './config/logger';
import { initSchema } from './db/schema';
import { initSearchIndex } from './services/search';
import { reconcilePendingJobs } from './services/emails';
import { startWorker, stopWorker } from './queue/worker';
import { pool } from './db/pool';

async function main() {
  await initSchema();
  await initSearchIndex();
  await reconcilePendingJobs();
  startWorker();
  logger.info('worker', `standalone worker up (queue: ${env.queue.name})`);

  const shutdown = async () => {
    await stopWorker();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.error('worker', 'fatal boot error', err);
  process.exit(1);
});
