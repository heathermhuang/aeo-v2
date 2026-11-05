import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (process.env.AEO_HOSTED_SYNTHETIC_TEST !== '1')
  throw new Error('Explicit synthetic staging exercise required');
const access = JSON.parse(await readFile('.local/hosted-staging-access.json', 'utf8'));
if (access.origin !== 'https://staging.aeo.io') throw new Error('Exact staging origin required');
const source = `
import pg from 'pg';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
if (process.env.AEO_PUBLIC_URL !== 'https://staging.aeo.io') throw new Error('Exact staging environment required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
 await client.query('BEGIN');
 const stamp = randomUUID().slice(0,8), accounts = {};
 for (const label of ['alpha','beta','reader']) {
  const token = randomBytes(32).toString('base64url');
  const email = 'hosted-'+label+'-'+stamp+'@example.test';
  const workspace = 'Synthetic hosted '+label+' '+stamp;
  await client.query("INSERT INTO aeo_identity_token(token_hash,email,purpose,workspace) VALUES($1,$2,'verify',$3)",
   [createHash('sha256').update(token).digest('hex'),email,workspace]);
  accounts[label] = { token, email, workspace, purpose: 'verify' };
 }
 await client.query('COMMIT');
 console.log(JSON.stringify({origin:process.env.AEO_PUBLIC_URL,synthetic:true,createdAt:new Date().toISOString(),stamp,accounts}));
} catch {await client.query('ROLLBACK');process.exitCode=1;} finally {await client.end();}
`;
const result = spawnSync(
  'ssh',
  [
    '-i',
    '.local/access/aeo_staging_ed25519',
    '-o',
    'UserKnownHostsFile=.local/access/known_hosts',
    '-o',
    'StrictHostKeyChecking=yes',
    'root@168.144.246.183',
    'cd /opt/aeo-v2 && docker compose exec -T app node --input-type=module',
  ],
  { input: source, encoding: 'utf8', timeout: 30000 },
);
if (result.status !== 0) throw new Error('Synthetic staging fixture preparation failed');
const fixture = JSON.parse(result.stdout);
await mkdir('.local', { recursive: true });
await writeFile('.local/hosted-identity-fixture.json', JSON.stringify(fixture), { mode: 0o600 });
console.log(
  'Three synthetic email-proof fixtures prepared privately. No mail was sent; this does not qualify live ownership.',
);
