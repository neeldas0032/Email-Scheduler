import { createApp } from './app';
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

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('server', `API on http://localhost:${env.port}`);
    logger.info('server', `Queue dashboard on http://localhost:${env.port}/admin/queues`);
  });

  // Restore anything Redis may have lost, then start consuming.
  await reconcilePendingJobs();
  if (env.queue.startWorkerInline) startWorker();

  const shutdown = async (signal: string) => {
    logger.info('server', `${signal} received, shutting down`);
    server.close();
    await stopWorker();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('server', 'fatal boot error', err);
  process.exit(1);
});
