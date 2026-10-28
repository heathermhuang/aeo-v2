import pg from 'pg';
const state = globalThis as typeof globalThis & { aeoPool?: pg.Pool };
export const db: pg.Pool = (state.aeoPool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  options: '-c timezone=UTC',
  statement_timeout: 10000,
  idle_in_transaction_session_timeout: 10000,
}));
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
