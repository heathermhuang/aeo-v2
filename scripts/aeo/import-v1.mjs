import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
const sha = value => createHash('sha256').update(value).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const schema = z.strictObject({
  format: z.literal('aeo-v1-archive/1'),
  source: z.strictObject({
    snapshotSha256: hash,
    releaseId: z.string().min(1).max(300),
    databaseId: z.string().min(1).max(150),
    exportedAt: z.iso.datetime({ offset: true }),
  }),
  accounts: z
    .array(z.strictObject({ legacyId: id, email: z.email().max(254), eligible: z.boolean() }))
    .max(100000),
  records: z
    .array(
      z.strictObject({
        kind: z.enum([
          'brands',
          'checks',
          'answers',
          'prompts',
          'prompt_universe_items',
          'content_assets',
          'evidence_atoms',
          'source_ledger_entries',
          'citations',
          'competitors',
          'tasks',
          'engines',
          'content_versions',
          'distribution_sources',
          'geo_experiments',
          'page_briefs',
          'citation_selection_events',
          'citation_absorption_events',
          'geo_correction_tasks',
          'confirmed_profile_snapshots',
        ]),
        legacyId: id,
        ownerId: id.nullable(),
        brandId: id.nullable(),
        createdAt: z.string().nullable(),
        raw: z.string().max(12 * 1024 * 1024),
        sha256: hash,
      }),
    )
    .max(1000000),
});
const [file, expectedDatabase, expectedSnapshot] = process.argv.slice(2);
if (!file || !expectedDatabase || !expectedSnapshot)
  throw new Error(
    'Usage: import-v1.mjs archive.json expected-database-name expected-snapshot-sha256',
  );
const url = new URL(process.env.DATABASE_URL);
if (
  url.pathname !== '/' + expectedDatabase ||
  !/^aeo_v2_(candidate|migration_rehearsal|staging)$/.test(expectedDatabase)
)
  throw new Error(
    'Explicit candidate/rehearsal/staging database required; production import is not enabled',
  );
const bytes = await readFile(file);
if (bytes.length > 150 * 1024 * 1024) throw new Error('Archive exceeds 150 MiB');
const archive = schema.parse(JSON.parse(bytes));
if (archive.source.snapshotSha256 !== expectedSnapshot)
  throw new Error('Source snapshot identity mismatch');
for (const record of archive.records) {
  if (sha(record.raw) !== record.sha256) throw new Error('Evidence checksum mismatch');
  const raw = JSON.parse(record.raw);
  if (raw.id !== record.legacyId) throw new Error('Evidence identity mismatch');
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(12800006)');
  const old = (
    await client.query('SELECT id,archive_sha256 FROM aeo_legacy_source WHERE snapshot_sha256=$1', [
      expectedSnapshot,
    ])
  ).rows[0];
  if (old) {
    if (old.archive_sha256 !== sha(bytes))
      throw new Error('Snapshot already imported with a different archive');
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'already_imported', sourceId: old.id }));
  } else {
    const sourceId = randomUUID(),
      source = archive.source;
    await client.query(
      `INSERT INTO aeo_legacy_source(id,snapshot_sha256,archive_sha256,release_id,source_database,exported_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        sourceId,
        source.snapshotSha256,
        sha(bytes),
        source.releaseId,
        source.databaseId,
        source.exportedAt,
      ],
    );
    for (const account of archive.accounts) {
      if (account.email !== account.email.trim().toLowerCase())
        throw new Error('Noncanonical legacy email');
      await client.query(
        'INSERT INTO aeo_legacy_account(source_id,legacy_id,email,eligible) VALUES($1,$2,$3,$4)',
        [sourceId, account.legacyId, account.email, account.eligible],
      );
    }
    for (const record of archive.records)
      await client.query(
        `INSERT INTO aeo_legacy_record(source_id,kind,legacy_id,owner_id,brand_id,source_created_at,raw,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          sourceId,
          record.kind,
          record.legacyId,
          record.ownerId,
          record.brandId,
          record.createdAt,
          record.raw,
          record.sha256,
        ],
      );
    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        status: 'imported',
        sourceId,
        accounts: archive.accounts.length,
        records: archive.records.length,
      }),
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  // Do not print database details or row data from private archives.
  console.error(
    'Legacy archive import failed: validation or database conflict. No partial import committed.',
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
