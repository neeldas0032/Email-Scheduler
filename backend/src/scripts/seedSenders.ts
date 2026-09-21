/**
 * Creates fresh Ethereal inboxes for every user (or prints credentials if no
 * user exists yet). Useful if the auto-provisioned senders expire.
 *   npm run seed:senders
 */
import { query } from '../db/pool';
import { pool } from '../db/pool';
import { createEtherealAccount } from '../services/mailer';
import { env } from '../config/env';

async function main() {
  const users = await query<{ id: string; email: string }>(`SELECT id, email FROM users`);

  if (users.length === 0) {
    const creds = await createEtherealAccount();
    console.log('No users yet. Here is a fresh Ethereal account you can put in .env:');
    console.log(`ETHEREAL_HOST=${creds.smtp_host}`);
    console.log(`ETHEREAL_PORT=${creds.smtp_port}`);
    console.log(`ETHEREAL_USER=${creds.smtp_user}`);
    console.log(`ETHEREAL_PASS=${creds.smtp_pass}`);
    return;
  }

  for (const user of users) {
    await query(`UPDATE senders SET is_active = FALSE WHERE user_id = $1`, [user.id]);
    for (let i = 0; i < env.ethereal.senderCount; i++) {
      const creds = await createEtherealAccount();
      await query(
        `INSERT INTO senders (user_id, label, from_email, smtp_host, smtp_port, smtp_user, smtp_pass, hourly_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          user.id,
          `Sender ${i + 1}`,
          creds.from_email,
          creds.smtp_host,
          creds.smtp_port,
          creds.smtp_user,
          creds.smtp_pass,
          env.limits.perSenderPerHour,
        ]
      );
      console.log(`${user.email}: new sender ${creds.from_email}`);
    }
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
