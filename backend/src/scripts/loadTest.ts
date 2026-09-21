/**
 * Schedules N emails for the same moment so you can demo throttling,
 * concurrency and rate-limit rescheduling.
 *   npm run demo:load -- 1000
 */
import { query, pool } from '../db/pool';
import { scheduleCampaign } from '../services/emails';

async function main() {
  const count = Number(process.argv[2] ?? 1000);
  const user = await query<{ id: string; email: string }>(`SELECT id, email FROM users LIMIT 1`);
  if (user.length === 0) {
    console.error('Sign in through the dashboard once so a user exists, then re-run.');
    process.exit(1);
  }

  const recipients = Array.from({ length: count }, (_, i) => `load-test-${i}@example.com`);
  const result = await scheduleCampaign({
    userId: user[0].id,
    subject: `Load test burst (${count} recipients)`,
    body: 'This message exists to demonstrate throttling and hourly rate limiting.',
    recipients,
    startAt: new Date(),
    delayMs: 0,
    hourlyLimit: 50,
  });

  console.log(`Queued ${result.count} emails for user ${user[0].email}. Watch /admin/queues.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
