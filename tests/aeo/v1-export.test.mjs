import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('v1 exporter preserves citations/source-ledger chains and holds unverified ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeo-v1-export-'));
  const sql = `CREATE TABLE users(id TEXT,email TEXT); INSERT INTO users VALUES('owner','synthetic@example.com');
CREATE TABLE auth_credentials(user_id TEXT,disabled_at TEXT);INSERT INTO auth_credentials VALUES('owner',NULL);
CREATE TABLE auth_email_verifications(user_id TEXT,verified_at TEXT);INSERT INTO auth_email_verifications VALUES('owner','2026-10-29');
CREATE TABLE brands(id TEXT,user_id TEXT);INSERT INTO brands VALUES('brand','owner');
CREATE TABLE checks(id TEXT,brand_id TEXT,report_json TEXT,created_at TEXT);INSERT INTO checks VALUES('check','brand','{"answer":"original"}','2026-10-29 03:00:00');
CREATE TABLE answers(id TEXT,check_id TEXT);INSERT INTO answers VALUES('answer','check');
CREATE TABLE citations(id TEXT,answer_id TEXT,url TEXT);INSERT INTO citations VALUES('citation','answer','https://public.example');
CREATE TABLE source_ledger_entries(id TEXT,brand_id TEXT);INSERT INTO source_ledger_entries VALUES('ledger','brand');
CREATE TABLE legacy_account_quarantine(user_id TEXT);INSERT INTO legacy_account_quarantine VALUES('owner');`;
  const input = join(dir, 'v1.sql'),
    output = join(dir, 'archive.json');
  await writeFile(input, sql);
  const run = spawnSync(
    'python3',
    [
      'scripts/aeo/export-v1.py',
      '--sql',
      input,
      '--release',
      'synthetic',
      '--database-id',
      'synthetic',
      '--output',
      output,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, 'synthetic source exports');
  const archive = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(archive.accounts[0].eligible, false, 'quarantined identity remains held');
  for (const kind of ['checks', 'answers', 'citations', 'source_ledger_entries']) {
    const record = archive.records.find(r => r.kind === kind);
    assert.equal(record.ownerId, 'owner');
    assert.equal(JSON.parse(record.raw).id, record.legacyId);
  }
  assert.equal(archive.records.find(r => r.kind === 'citations').brandId, 'brand');
  assert.equal(archive.records.find(r => r.kind === 'checks').createdAt, '2026-10-29T03:00:00Z');
  assert.equal(
    JSON.parse(archive.records.find(r => r.kind === 'checks').raw).created_at,
    '2026-10-29 03:00:00',
  );
  assert.ok(!JSON.stringify(archive.records).includes('auth_credentials'));
});
test('v1 SQL import cannot attach a filesystem database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeo-v1-guard-'));
  const input = join(dir, 'v1.sql');
  await writeFile(input, "ATTACH DATABASE '/private/tmp/unapproved-aeo-db.sqlite' AS outside;");
  const run = spawnSync(
    'python3',
    [
      'scripts/aeo/export-v1.py',
      '--sql',
      input,
      '--release',
      'synthetic',
      '--database-id',
      'synthetic',
      '--output',
      join(dir, 'out.json'),
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(run.status, 0, 'filesystem attach refused');
});
