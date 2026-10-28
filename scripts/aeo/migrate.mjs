import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(12800003)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS aeo_migration(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of ['001_saas.sql', '002_disable_factory_admin.sql', '003_rate_expiry.sql']) {
    const sql = await readFile(new URL('../../db/aeo/' + name, import.meta.url), 'utf8'),
      checksum = createHash('sha256').update(sql).digest('hex');
    const { rows } = await client.query('SELECT checksum FROM aeo_migration WHERE name=$1', [name]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO aeo_migration(name,checksum) VALUES($1,$2)', [name, checksum]);
    console.log('Applied AEO migration ' + name);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
