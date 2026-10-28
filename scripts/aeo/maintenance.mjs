import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('DELETE FROM aeo_session WHERE expires_at<now()');
  await client.query('DELETE FROM aeo_rate_limit WHERE expires_at<now()');
  console.log('Expired AEO sessions and rate-limit buckets removed.');
} finally {
  await client.end();
}
