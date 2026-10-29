# AEO v2 ordered execution — 2026-10-29

## Review baseline

Fork PR #1 remains draft at `8b6051d93bdf28f3c0598725efad11b497d2caff`.
Acceptance/container run 40813757843 and secret scan passed; duplicate runs were cancelled.
Staging HTTPS health is OK and its containers remain healthy on executable source
`906f5889f8744d1369235cde23a8339add113e58`, host image
`sha256:43247292e48b9090a6f549bede723a03d64681cd3d2c419d39193982f8c43edd`.
Staging has 41 GB free disk, about 1.3 GB available RAM, and no swap used during this read-only check.
The legacy primary checkout contains unrelated dirty work and is preserved.

### Findings and acceptance gaps, in severity order

1. **P1 — account ownership and recovery:** `src/lib/aeo/auth.ts` signup creates an
   active session for an unverified email; login has no ownership check, recovery
   or safe claim of v1 passwordless identities. Implement single-use, expiring
   email proof before access, password recovery with session revocation, and
   conflict-safe legacy ownership mapping. No production replacement before this passes.
2. **P1 — migration is unqualified:** no v1 account/report import rehearsal exists.
   Preserve source identities, immutable raw records, provenance and an exact backup;
   do not import legacy reports as v2 collection or trust an imported email as proof.
3. **P1 — actual results and customer task acceptance remain unqualified:** existing
   receipts/operator browser tests are synthetic. Dedicated provider access and an
   explicit bounded allowance, authorized site inputs, and independent user evidence
   remain external prerequisites. Provider collection remains disabled.
4. **P2 — upstream lag:** main is `5d66c239670689f83c52d8b7f30c4020d9a02ea2`,
   11 commits beyond the original base. Review and integrate applicable retention,
   dashboard and Cloudflare probe work; keep independent-fork publication policy,
   AEO route boundaries, UTC database connections and four-view UI.

No additional proven tenancy/ingestion bypass was found in this bounded source recheck.
Earlier unchanged full-suite results are reused until runtime changes require fresh checks.

## Executable order and completion criteria

1. Integrate reviewed upstream application/migration changes. Keep original migration
   checksums and notices; exclude upstream-specific publication/push policy. Before a
   staging schema update, back up, restore to an isolated database, then exercise
   upgrade/idempotence and protected evidence. Build off-host and pass regressions.
2. Add verified ownership, recovery and a safe v1 claim path. Use AEO-scoped delivery,
   no cross-project credentials. Verify expired/replayed/wrong-purpose tokens,
   unauthorized claims, password reset/session revocation, tenancy and browser UX.
3. With explicit site authorization and bounded provider allowance, connect actual
   inventory/logs/conversions, record acquisition and identity limits, run bounded
   provider checks and inspect failure/replay/recheck evidence.
4. Verify hosted desktop/mobile task usability, targeted security/reliability and
   independent user tasks. Operator emulation cannot satisfy independent acceptance.
5. Rehearse v1 export/import and rollback with exact source/release identities and raw
   hashes; restore backup to a separate target. Replace aeo.io only after every gate
   passes, verify released behavior, retain v1 and rollback. Otherwise document the
   precise external blocker while finishing independent implementation/verification.

The pending user questions concern real-site scope, dedicated provider access/spend,
and independent tester evidence. They do not block upstream or identity preparation.

## Execution checkpoint

- Upstream storage/queue/runtime/probe tests: 220 passed, including isolated PostgreSQL.
  Upgrade applied migrations 057–065 twice; pre-existing evidence counts were preserved.
- Identity: 32 synthetic checks; archive claims/access: 10 synthetic checks; unit/container/
  relay regressions passed. The first native CI found a missing private scratch directory
  in the new archive fixture; setup was corrected and rerun. No acceptance gate was relaxed.
- The approved complete v1 export restored into SQLite with integrity/foreign-key checks.
  The portable archive preserves 18 accounts and 1,515 evidence records; 9 accounts are
  eligible for fresh proof. No real customer identity was claimed or mailed.
- The user authorized the AEO-only mail relay and the exact private production backup.
  The relay is deployed with a dedicated secret generated on the AEO host; Node transport
  reaches it. Unauthorized and invalid-template calls are rejected without sending mail.
- Real-site scope, dedicated answer-provider credential/spend and independent tester
  evidence remain pending. Production replacement remains held; provider limits are zero.

The completed operator qualification, approved live inbox/provider work, final migration evidence and exact remaining cutover boundaries are consolidated in [final qualification](FINAL_QUALIFICATION_20261029.md). Production replacement has not occurred.
