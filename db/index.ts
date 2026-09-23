import 'server-only';
import { Pool, types } from 'pg';
import { createDatabase, type Executor } from './query';
// Stored epoch milliseconds and counts fit in safe JavaScript integers.
types.setTypeParser(20, value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds the safe range.');
  return number;
});
const shared = globalThis as typeof globalThis & { scimentorPool?: Pool };
export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  const connection = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)) connection.searchParams.set('sslmode', 'verify-full');
  const pool = shared.scimentorPool ??= new Pool({
    connectionString: connection.toString(),
    max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
  });
  const execute: Executor = async (sql, values) => pool.query(sql, values);
  return createDatabase(execute, async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, values) => client.query(sql, values));
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
}
