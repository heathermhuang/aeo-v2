import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { db } from '../../src/lib/aeo/db';
import { signup, recover, completeIdentity } from '../../src/lib/aeo/auth';
import { legacyReports, legacyReport } from '../../src/lib/aeo/legacy';
import type { IdentityMessage } from '../../src/lib/aeo/mail';
const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/aeo_v2_candidate')
  throw new Error('Owned local candidate required');
let checks = 0;
const check = (value: unknown, label: string) => {
  assert.ok(value, label);
  checks++;
  console.log('PASS ' + label);
};
const sourceId = randomUUID(),
  legacyId = 'user_' + randomUUID().replaceAll('-', ''),
  email = `legacy-${randomUUID()}@example.com`;
const reportId = 'check_' + randomUUID().replaceAll('-', '');
const password = randomBytes(20).toString('hex');
async function prove(address: string, fromV1 = false) {
  let proof: IdentityMessage | undefined;
  const capture = async (mail: IdentityMessage) => {
    proof = mail;
  };
  if (fromV1) await recover({ email: address }, capture);
  else await signup({ email: address }, capture);
  assert.ok(proof);
  const token = await completeIdentity({ token: proof.token, purpose: proof.purpose, password });
  const user = (
    await db.query(
      "SELECT user_id FROM aeo_session WHERE token_hash=encode(sha256($1::bytea),'hex')",
      [Buffer.from(token)],
    )
  ).rows[0];
  return user.user_id;
}
try {
  const metrics = (
    await db.query(
      'SELECT (SELECT count(*)::int FROM aeo_answer_run) AS answers,(SELECT count(*)::int FROM website_event) AS receipts',
    )
  ).rows[0];
  await db.query(
    `INSERT INTO aeo_legacy_source(id,snapshot_sha256,archive_sha256,release_id,source_database,exported_at) VALUES($1,$2,$3,'synthetic-v1-release','synthetic-v1-db',now())`,
    [sourceId, randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
  );
  await db.query(
    'INSERT INTO aeo_legacy_account(source_id,legacy_id,email,eligible) VALUES($1,$2,$3,true)',
    [sourceId, legacyId, email],
  );
  const raw = JSON.stringify({
    id: reportId,
    report_json: JSON.stringify({
      domain: 'legacy.invalid',
      answer: 'original historical answer',
      apiKey: 'synthetic-sensitive',
      shareUrl: 'https://aeo.io/s/private',
      source: 'https://public.example/a?token=private&useful=yes',
    }),
  });
  await db.query(
    `INSERT INTO aeo_legacy_record(source_id,kind,legacy_id,owner_id,raw,sha256) VALUES($1,'checks',$2,$3,$4,encode(sha256($5::bytea),'hex'))`,
    [sourceId, reportId, legacyId, raw, Buffer.from(raw)],
  );
  const unrelated = await prove(`unrelated-${randomUUID()}@example.com`);
  check(
    (await legacyReports(unrelated)).length === 0,
    'other verified identity cannot see archived records',
  );
  await assert.rejects(legacyReport(unrelated, sourceId, reportId), { status: 404 });
  checks++;
  const userId = await prove(email, true);
  check(
    (await legacyReports(userId)).length === 1,
    'v1 recovery creates verified account and claims eligible historical identity',
  );
  const report = await legacyReport(userId, sourceId, reportId);
  check(
    report.sourceKind === 'v1_historical_archive' && report.redacted,
    'download labels historical provenance and redaction',
  );
  check(
    JSON.stringify(report).includes('original historical answer') &&
      !JSON.stringify(report).includes('synthetic-sensitive') &&
      !JSON.stringify(report).includes('/s/private') &&
      !JSON.stringify(report).includes('token=private'),
    'archive download preserves answer while removing access material',
  );
  check(
    (
      await db.query('SELECT raw FROM aeo_legacy_record WHERE source_id=$1 AND legacy_id=$2', [
        sourceId,
        reportId,
      ])
    ).rows[0].raw === raw,
    'original raw evidence is immutable during private download',
  );
  const heldId = 'user_' + randomUUID().replaceAll('-', ''),
    heldEmail = `held-${randomUUID()}@example.com`;
  await db.query(
    'INSERT INTO aeo_legacy_account(source_id,legacy_id,email,eligible) VALUES($1,$2,$3,false)',
    [sourceId, heldId, heldEmail],
  );
  const heldUser = await prove(heldEmail);
  check(
    !(
      await db.query('SELECT 1 FROM aeo_legacy_account WHERE legacy_id=$1 AND claimed_by=$2', [
        heldId,
        heldUser,
      ])
    ).rowCount,
    'fresh email alone cannot claim quarantined/unverified legacy identity',
  );
  const after = (
    await db.query(
      'SELECT (SELECT count(*)::int FROM aeo_answer_run) AS answers,(SELECT count(*)::int FROM website_event) AS receipts',
    )
  ).rows[0];
  check(
    JSON.stringify(after) === JSON.stringify(metrics),
    'historical access never creates live answers or traffic',
  );
  const archiveFile = '.local/legacy-corrupt-fixture.json';
  await writeFile(
    archiveFile,
    JSON.stringify({
      format: 'aeo-v1-archive/1',
      source: {
        snapshotSha256: 'a'.repeat(64),
        releaseId: 'synthetic',
        databaseId: 'synthetic',
        exportedAt: new Date().toISOString(),
      },
      accounts: [],
      records: [
        {
          kind: 'checks',
          legacyId: 'corrupt',
          ownerId: null,
          brandId: null,
          createdAt: null,
          raw: '{"id":"corrupt"}',
          sha256: 'b'.repeat(64),
        },
      ],
    }),
    { mode: 0o600 },
  );
  const attempt = spawnSync(
    process.execPath,
    ['scripts/aeo/import-v1.mjs', archiveFile, 'aeo_v2_candidate', 'a'.repeat(64)],
    { env: process.env, encoding: 'utf8' },
  );
  check(attempt.status !== 0, 'corrupt archive fails closed before import');
  check(
    !(await db.query('SELECT 1 FROM aeo_legacy_source WHERE snapshot_sha256=$1', ['a'.repeat(64)]))
      .rowCount,
    'failed import leaves no partial source',
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      checks,
      evidence: 'synthetic claim fixtures; no mail sent',
    }),
  );
} finally {
  await db.end();
}
