# V1 account and report migration

V1 production remains Worker version `39ad6c27-19ee-4e77-88e8-5512a183bfcd`,
deployment `7f4a3bfa-3562-43b2-81cb-fe9d39ed8cb2` at 100%, observed on 2026-10-29.
The current local legacy checkout is dirty and is not the production release identity.

The user explicitly approved a private full D1 snapshot at
`/private/tmp/aeo-v2-execution-20261029/.local/v1-production-20261029.sql`, mode 0600.
It contains 36,813,070 bytes with SHA-256
`d03928e4872988a7e129b0fd5c6704c60c419249a2cf36e97d007d50bc898832`.
Never commit, display, attach, upload to an artifact service or log the snapshot.
It contains private customer and authentication data. This approval covers the
specified private local backup and migration rehearsal; it is not permission to
publish customer evidence or send account mail to customers.

## Rehearsed path

1. Export D1 at an exact production version; retain the original raw SQL and hash.
2. Run `python3 scripts/aeo/export-v1.py --sql <private-snapshot> --release <version>
   --database-id <database-id> --output <new-private-archive.json>`. This restores
   to in-memory SQLite, checks database/foreign-key integrity and emits an archive.
   SQL cannot attach local files or load extensions. Retain the original snapshot
   independently: the portable archive intentionally excludes credentials, sessions,
   billing and private share tokens.
3. Run `node scripts/aeo/import-v1.mjs <archive> aeo_v2_candidate <snapshot-sha256>`
   with the isolated database environment. The command refuses a production database,
   validates source/record identity and hashes and imports in one transaction.
   Replaying the exact archive is idempotent; conflicts/corruption do not partially commit.
4. Retain every historical record in separate `aeo_legacy_*` tables. Never insert a
   legacy report into v2 traffic, crawler, answer-run or provider-attempt tables.
5. A fresh email proof can claim only an eligible account with that same email.
   Disabled, unverified, quarantined, conflicting or already claimed records remain
   held. No password, session or verification flag is transferred to a v2 identity.
   Existing passwordless users choose a new v2 password after receiving proof.
6. The auxiliary V1 reports view lists records belonging to the freshly verified
   account. Private downloads state historical/unvalidated provenance and remove
   credentials, network identifiers and access-bearing links. Stored originals and
   raw hashes remain unchanged. No historical score becomes a current v2 claim.

The real local rehearsal imported 18 accounts (9 eligible) and 1,093 evidence
records. Every stored raw record and hash matched the portable source. Exact replay
passed. No real account was claimed and no live metrics or paid provider calls were
created. Synthetic fixtures separately verify cross-account denial, eligible recovery,
held identities, unchanged raw evidence and failed-import rollback.

## Cutover and rollback

Before cutover, take a fresh snapshot after accounting for new v1 writes. Compare
release and source hashes with this rehearsal. Freeze writes or explicitly reconcile
the final delta; this rehearsal alone does not migrate subsequent customer changes.
Copy the accepted archive only to the approved target, verify hashes and claims,
and retain v1 read-only access and its exact release. Old session cookies remain
host-only and are not accepted by v2. Existing private v1 links need a deliberate
read-only route before cutover; there is no silent public-link migration.

Stage schema/image rollback against a separate restored backup. Record the exact
old/new image identities and backup path in the release record. If a schema update
is incompatible, route the old image to the restored database; never overwrite the
live volume or use `compose down -v`. Production route replacement remains blocked
on real-site/provider evidence, independent task acceptance and final migration/delta
and route rehearsal. No production route was changed by this local rehearsal.
