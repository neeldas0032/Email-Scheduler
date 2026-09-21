import { initSchema } from '../db/schema';
import { pool } from '../db/pool';

initSchema()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
